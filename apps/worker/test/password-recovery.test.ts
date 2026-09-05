import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const routeSource = await readFile(new URL('../src/routes/recovery.ts', import.meta.url), 'utf8')
const contractSource = await readFile(new URL('../../../packages/contracts/src/index.ts', import.meta.url), 'utf8')
const indexSource = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8')
const serviceSource = await readFile(new URL('../src/services/registration.ts', import.meta.url), 'utf8')

test('改密路由已挂载且三个端点齐备', () => {
  assert.match(indexSource, /import \{ recoveryRoutes \} from '\.\/routes\/recovery\.js'/u)
  assert.match(indexSource, /app\.route\('\/', recoveryRoutes\(\)\)/u)
  assert.match(routeSource, /'\/api\/v1\/recovery\/otp'/u)
  assert.match(routeSource, /'\/api\/v1\/recovery\/verify-otp'/u)
  assert.match(routeSource, /'\/api\/v1\/recovery\/complete'/u)
})

test('发码要求用户名与邮箱同时命中同一账号，禁止仅凭用户名向他人邮箱投递', () => {
  // 必须按 username_key 查账号，再把请求邮箱与账号邮箱做比对
  assert.match(routeSource, /SELECT id, display_name, status, email_key FROM users WHERE username_key = \? LIMIT 1/u)
  assert.match(routeSource, /const eligible = Boolean\([\s\S]{0,400}user\.email_key[\s\S]{0,300}safeEqualHex\(/u)
  // 邮箱比对必须走恒定时间哈希比较，不能用 === 直接比明文
  assert.match(routeSource, /safeEqualHex\(\s*await keyedHash\(user\.email_key,[\s\S]{0,160}await keyedHash\(emailKey,/u)
})

test('账号不存在、被停用或邮箱不匹配时响应与成功分支完全同形，且有时序对齐延迟', () => {
  assert.match(routeSource, /function resetOtpResponse\(challengeId: string/u)
  // 三种不可发信情形都走 resetOtpResponse，且带随机延迟
  assert.match(routeSource, /if \(!user \|\| !eligible\) \{[\s\S]{0,400}await delay\(300 \+ Math\.floor\(Math\.random\(\) \* 400\)\)[\s\S]{0,200}return c\.json\(resetOtpResponse\(syntheticChallengeId\)\)/u)
  // 限流分支同样返回同形响应，不暴露"该账号存在但被限流"
  assert.match(routeSource, /recentByClient\?\.count \?\? 0\) >= MAX_PER_CLIENT_HOUR[\s\S]{0,300}return c\.json\(resetOtpResponse\(syntheticChallengeId\)\)/u)
  // 不存在的账号也要返回合法形状的 challengeId，否则响应可区分
  assert.match(routeSource, /const syntheticChallengeId = uuid\(\)/u)
  assert.doesNotMatch(routeSource, /USER_NOT_FOUND|EMAIL_NOT_FOUND|ACCOUNT_NOT_FOUND/u)
})

test('OTP 以 keyedHash 存储，绝不落明文，且同邮箱旧挑战立即作废', () => {
  assert.match(routeSource, /const otpHash = await keyedHash\(`\$\{id\}:\$\{otp\}`, config\.REGISTRATION_SECRET\)/u)
  // 插入绑定的是派生哈希变量，明文 otp 只用于发信，不入库
  assert.match(routeSource, /INSERT INTO password_reset_challenges \(id, user_id, email_key, otp_hash, client_hash, status, attempts, resend_count, expires_at, created_at, updated_at\)/u)
  assert.match(routeSource, /\)\.bind\(id, user\.id, emailKey, otpHash, clientHash,/u)
  assert.match(routeSource, /sendPasswordResetOtp\(config, \{ email: emailKey, displayName: user\.display_name, otp, expiresAt \}\)/u)
  assert.match(routeSource, /UPDATE password_reset_challenges SET status = 'expired', updated_at = \? WHERE email_key = \? AND status IN \('pending', 'verified'\)/u)
})

test('错误验证码走条件原子增量，第五次失败作废挑战并显式 429', () => {
  assert.match(routeSource, /SET attempts = attempts \+ 1,/u)
  assert.match(routeSource, /CASE WHEN attempts \+ 1 >= \$\{MAX_ATTEMPTS\} THEN 'expired'/u)
  assert.match(routeSource, /WHERE id = \? AND status = 'pending' AND attempts < \$\{MAX_ATTEMPTS\} AND expires_at > \?/u)
  assert.match(routeSource, /ApiProblem\(429, 'OTP_LOCKED'/u)
  // 不存在的 challengeId 与错误验证码共用同一错误码
  assert.match(routeSource, /if \(!challenge\) \{[\s\S]{0,200}OTP_INVALID_OR_EXPIRED/u)
})

test('跨挑战滚动预算：换新验证码不得重置总猜测上限（渗透复测 2026-09-05）', () => {
  // 单挑战 5 次锁定可被"重新申请新验证码"整体重置，按账号的滚动窗口预算才是总闸。
  assert.match(routeSource, /MAX_VERIFY_FAILURES_PER_HOUR = 10/u)
  assert.match(routeSource, /MAX_VERIFY_FAILURES_PER_DAY = 15/u)
  // 发码与验证两侧都必须有按账号的预算查询
  const gates = [...routeSource.matchAll(/COALESCE\(SUM\(CASE WHEN created_at > \? THEN attempts ELSE 0 END\), 0\) AS failures_hour/gu)]
  assert.equal(gates.length, 2, '发码与验证两侧都必须有预算闸门')
  const [mintGate, verifyGate] = gates.map((g) => g.index ?? 0)
  // 发码侧：预算耗尽时不得再铸造新挑战（闸门必须在 INSERT 之前），响应保持同形
  const mintInsert = routeSource.indexOf('INSERT INTO password_reset_challenges')
  assert.ok(mintGate < mintInsert, '发码侧预算闸门必须在铸造新挑战之前')
  const mintGateBlock = routeSource.slice(mintGate, mintGate + 900)
  assert.match(mintGateBlock, />= MAX_VERIFY_FAILURES_PER_HOUR[\s\S]{0,300}return c\.json\(resetOtpResponse\(syntheticChallengeId\)\)/u)
  assert.match(mintGateBlock, /MAX_VERIFY_FAILURES_PER_DAY/u, '小时与日预算必须同时判定')
  // 验证侧：闸门必须在验证码比对之前执行，否则等于没设
  const otpCompare = routeSource.indexOf('safeEqualHex(expected, challenge.otp_hash)')
  assert.ok(verifyGate < otpCompare, '验证侧预算闸门必须在比对之前')
  const verifyGateBlock = routeSource.slice(verifyGate, verifyGate + 900)
  assert.match(verifyGateBlock, />= MAX_VERIFY_FAILURES_PER_HOUR[\s\S]{0,400}throw new ApiProblem\(429, 'OTP_LOCKED'/u)
  // 预算必须按账号维度统计（user_id 维度聚合），而不是只看单个挑战
  assert.match(routeSource, /FROM password_reset_challenges\s+WHERE user_id = \? AND created_at > \?/u)
})

test('验证码比对使用恒定时间比较', () => {
  assert.match(routeSource, /const expected = await keyedHash\(`\$\{challenge\.id\}:\$\{input\.otp\}`, config\.REGISTRATION_SECRET\)/u)
  assert.match(routeSource, /if \(!safeEqualHex\(expected, challenge\.otp_hash\)\)/u)
})

test('完成令牌绑定发起端 client_hash，换出口无法兑现被截获的凭据', () => {
  // 签发时把 client_hash 混入令牌哈希
  assert.match(routeSource, /const completionHash = await keyedHash\(`\$\{challenge\.id\}:\$\{challenge\.client_hash \?\? 'no-client'\}:\$\{completionToken\}`/u)
  // 兑现时重新计算当前请求的 client_hash，并让它参与令牌哈希推导
  assert.match(routeSource, /const clientHash = await requestClientHash\(c\.req\.raw, config\.REGISTRATION_SECRET\)/u)
  assert.match(routeSource, /const providedHash = await keyedHash\(`\$\{input\.challengeId\}:\$\{clientHash \?\? 'no-client'\}:\$\{input\.completionToken\}`/u)
  assert.match(routeSource, /safeEqualHex\(providedHash, challenge\.completion_token_hash \?\? undefined\)/u)
})

test('改密事务先条件化消费一次性凭据，再写新密码，重放无法二次改密', () => {
  assert.match(routeSource, /const consumptionMarker = await keyedHash\(`\$\{challenge\.id\}:\$\{randomToken\(\)\}`/u)
  // 消费语句：必须仍是 verified、令牌哈希一致、未过期
  assert.match(routeSource, /UPDATE password_reset_challenges[\s\S]{0,200}WHERE id = \? AND status = 'verified' AND completion_token_hash = \? AND expires_at > \?/u)
  // 改密语句：必须依赖上一句消费成功留下的 marker
  assert.match(routeSource, /UPDATE users[\s\S]{0,300}EXISTS \(SELECT 1 FROM password_reset_challenges WHERE id = \? AND status = 'completed' AND completion_token_hash = \? AND completed_at = \?\)/u)
  // 改密未生效必须显式冲突，不能静默成功
  assert.match(routeSource, /result\[1\]\?\.meta\.changes \?\? 0\) !== 1[\s\S]{0,160}PASSWORD_RESET_CONFLICT/u)
})

test('改密后撤销该用户全部会话并清空登录失败与锁定状态', () => {
  assert.match(routeSource, /SET password_hash = \?, must_change_password = 0, failed_login_count = 0, locked_until = NULL, updated_at = \?/u)
  assert.match(routeSource, /UPDATE auth_sessions SET revoked_at = \?[\s\S]{0,240}WHERE user_id = \? AND revoked_at IS NULL[\s\S]{0,240}EXISTS \(SELECT 1 FROM users WHERE id = \? AND updated_at = \? AND password_hash = \?\)/u)
  // 同账号其余未完成挑战一并作废
  assert.match(routeSource, /UPDATE password_reset_challenges SET status = 'expired', updated_at = \?[\s\S]{0,200}WHERE user_id = \? AND id <> \? AND status IN \('pending', 'verified'\)/u)
})

test('密码使用 pepper 哈希存储，明文密码与验证码绝不进入审计或日志', () => {
  assert.match(routeSource, /const passwordHash = await hashPassword\(input\.password, config\.PASSWORD_PEPPER\)/u)
  // 审计 after 只允许脱敏邮箱、用户名与方法标记这三项，不得夹带任何凭据值。
  // 'email-otp' 是方法名常量而非验证码，因此按变量名精确排除，不做大小写模糊匹配。
  const auditAfter = routeSource.match(/after: \{[^}]*\}/u)?.[0] ?? ''
  assert.ok(auditAfter.length > 0, '未找到审计 after 负载')
  assert.doesNotMatch(auditAfter, /\binput\.password\b|\bpasswordHash\b|\bcompletionToken\b|\botpHash\b|\bchallenge\.otp_hash\b|\bcompletion_token_hash\b/u)
  // 邮箱只以脱敏形式出现，原始 email_key 不得直接写入
  assert.doesNotMatch(auditAfter, /email: challenge\.email_key/u)
  // 邮箱进审计必须脱敏
  assert.match(routeSource, /after: \{ email: redactEmail\(challenge\.email_key\)/u)
  // 日志只记失败事实
  assert.match(routeSource, /console\.error\('password reset email delivery failed', error instanceof Error \? error\.message : 'unknown'\)/u)
  // 逐条检查 console 调用：字面消息文本可以含 "password" 这种词，
  // 但传入的表达式不得是凭据变量。
  const consoleCalls = routeSource.match(/console\.(?:log|info|warn|error)\([\s\S]*?\)\n/gu) ?? []
  for (const call of consoleCalls) {
    assert.doesNotMatch(call, /\b(?:otp|otpHash|passwordHash|completionToken|completionHash|emailKey)\b/u, `console 调用泄露凭据: ${call}`)
    assert.doesNotMatch(call, /input\.(?:password|otp|completionToken)/u, `console 调用泄露入参: ${call}`)
  }
  assert.ok(consoleCalls.length >= 1, '预期至少有一处发信失败日志')
})

test('未配置邮件时改密整体降级为 503，不伪装成功', () => {
  assert.match(routeSource, /function requireRecoveryConfig\(config: AppConfig\)/u)
  assert.match(routeSource, /ApiProblem\(503, 'PASSWORD_RESET_UNAVAILABLE'/u)
  // 三个端点都必须先做配置校验
  const guards = routeSource.match(/requireRecoveryConfig\(config\)/gu) ?? []
  assert.equal(guards.length, 3)
})

test('改密契约复用既有密码强度与 OTP 校验，不放宽规则', () => {
  assert.match(contractSource, /export const passwordResetOtpSchema = z\.object\(\{[\s\S]{0,300}username: usernameSchema[\s\S]{0,200}email: corporateEmailSchema/u)
  assert.match(contractSource, /export const passwordResetVerifyOtpSchema = z\.object\(\{[\s\S]{0,200}otp: otpCodeSchema/u)
  assert.match(contractSource, /export const passwordResetCompleteSchema = z\.object\(\{[\s\S]{0,300}password: passwordSchema/u)
})

test('改密邮件模板对用户可控字段做 HTML 转义，且不回显验证码到日志', () => {
  assert.match(serviceSource, /export async function sendPasswordResetOtp/u)
  assert.match(serviceSource, /escapeHtml\(input\.displayName\)/u)
  assert.match(serviceSource, /subject: 'Workshop Bike Ops 改密验证码'/u)
})
