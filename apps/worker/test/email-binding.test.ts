import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const routeSource = await readFile(new URL('../src/routes/account.ts', import.meta.url), 'utf8')
const middlewareSource = await readFile(new URL('../src/auth/middleware.ts', import.meta.url), 'utf8')
const authSource = await readFile(new URL('../src/routes/auth.ts', import.meta.url), 'utf8')
const indexSource = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8')

test('绑定路由已挂载且两个端点齐备（登录态 + CSRF，不挂 requirePasswordChanged）', () => {
  assert.match(indexSource, /import \{ accountRoutes \} from '\.\/routes\/account\.js'/u)
  assert.match(indexSource, /app\.route\('\/', accountRoutes\(\)\)/u)
  assert.match(routeSource, /'\/api\/v1\/account\/binding\/otp', auth\.loadSession, auth\.requireCsrf, requireJsonBody/u)
  assert.match(routeSource, /'\/api\/v1\/account\/binding\/verify', auth\.loadSession, auth\.requireCsrf, requireJsonBody/u)
  // 引导端点是解锁通道本身，绝不能挂 requirePasswordChanged（否则死锁）。
  // 端点注册行已精确断言为 loadSession + requireCsrf + requireJsonBody 的完整序列，
  // 再排除任何把 requirePasswordChanged 挂进注册行的写法。
  assert.doesNotMatch(routeSource, /', auth\.requirePasswordChanged/u)
})

test('发码侧：邮箱占用必须排除本人后拒绝，旧挑战作废，任一时刻至多一个可用验证码', () => {
  // 占用检查必须是"其它账号"维度（id <> 本人），否则本人重绑被误拒。
  assert.match(routeSource, /SELECT id FROM users WHERE email_key = \? AND id <> \? LIMIT 1/u)
  assert.match(routeSource, /EMAIL_ALREADY_BOUND/u)
  assert.match(routeSource, /UPDATE email_binding_challenges SET status = 'expired', updated_at = \? WHERE user_id = \? AND status = 'pending'/u)
  assert.match(routeSource, /INSERT INTO email_binding_challenges \(id, user_id, email_key, otp_hash, client_hash, status, attempts, resend_count, expires_at, created_at, updated_at\)/u)
  // 冷却响应只允许引用 pending 挑战，不得回传已作废的 challengeId。
  assert.match(routeSource, /recent\.status === 'pending' && now - Date\.parse\(recent\.created_at\) < RESEND_COOLDOWN_MS/u, '冷却响应必须限定 pending 挑战')
})

test('发码侧：跨挑战预算闸门必须在铸造新挑战之前，换码不得重置总猜测上限', () => {
  assert.match(routeSource, /MAX_VERIFY_FAILURES_PER_HOUR = 10/u)
  const gate = routeSource.indexOf('verifyFailuresLastHour(c.env.DB, context.userId) >= MAX_VERIFY_FAILURES_PER_HOUR')
  const insert = routeSource.indexOf('INSERT INTO email_binding_challenges')
  assert.ok(gate > -1 && gate < insert, '发码侧预算闸门必须在 INSERT 之前')
})

test('验证侧：挑战属主校验、单挑战锁定、跨挑战预算在比对之前', () => {
  // 挑战必须属于当前登录用户，串号挑战与不存在共用同一错误。
  assert.match(routeSource, /if \(!challenge \|\| challenge\.user_id !== context\.userId\)/u)
  assert.match(routeSource, /SET attempts = attempts \+ 1,/u)
  assert.match(routeSource, /CASE WHEN attempts \+ 1 >= \$\{MAX_ATTEMPTS\} THEN 'expired'/u)
  assert.match(routeSource, /ApiProblem\(429, 'OTP_LOCKED'/u)
  const gate = routeSource.indexOf('verifyFailuresLastHour(c.env.DB, context.userId) >= MAX_VERIFY_FAILURES_PER_HOUR', routeSource.indexOf("'/api/v1/account/binding/verify'"))
  const compare = routeSource.indexOf('safeEqualHex(expected, challenge.otp_hash)')
  assert.ok(gate > -1 && gate < compare, '验证侧预算闸门必须在比对之前')
})

test('验证成功：绑定与改密同事务条件化，密码允许与旧密码一致', () => {
  // 消费语句：必须仍是 pending 且未过期。
  assert.match(routeSource, /UPDATE email_binding_challenges[\s\S]{0,160}WHERE id = \? AND status = 'pending' AND expires_at > \?/u)
  // 绑定语句依赖挑战消费成功，must_change_password 同步清零。
  assert.match(routeSource, /SET email_key = \?, password_hash = \?, must_change_password = 0, failed_login_count = 0, updated_at = \?/u)
  assert.match(routeSource, /EXISTS \(SELECT 1 FROM email_binding_challenges WHERE id = \? AND status = 'completed' AND completed_at = \?\)/u)
  // 允许与旧密码一致：绑定链路不得复用 change-password 的新旧一致性校验。
  assert.doesNotMatch(routeSource, /PASSWORD_REUSE/u)
  // 绑定即改密：撤销其它会话，保留当前会话。
  assert.match(routeSource, /UPDATE auth_sessions SET revoked_at = \?[\s\S]{0,200}WHERE user_id = \? AND token_hash <> \? AND revoked_at IS NULL/u)
  // 落库失败必须显式冲突。
  assert.match(routeSource, /EMAIL_BINDING_CONFLICT/u)
})

test('审计只写脱敏邮箱，验证码与密码绝不入审计', () => {
  assert.match(routeSource, /after: \{ email: redactEmail\(challenge\.email_key\), method: 'email-otp' \}/u)
  const auditAfter = routeSource.match(/after: \{[^}]*\}/u)?.[0] ?? ''
  assert.doesNotMatch(auditAfter, /\binput\.password\b|\bpasswordHash\b|\botpHash\b/u)
})

test('中间件：无邮箱未豁免账号被拦截，豁免名单为平台管理员与 admin', () => {
  assert.match(middlewareSource, /EMAIL_BINDING_EXEMPT_USERNAMES = \['admin'\]/u)
  assert.match(middlewareSource, /if \(user\.isPlatformAdmin\) return true/u)
  // loadSession 必须实时取 email_key / username_key，不能依赖会话缓存。
  assert.match(middlewareSource, /u\.email_key, u\.username_key,/u)
  // 拦截顺序：先改密要求，后绑定要求，两者错误码独立。
  assert.match(middlewareSource, /ApiProblem\(428, 'PASSWORD_CHANGE_REQUIRED'/u)
  assert.match(middlewareSource, /ApiProblem\(428, 'EMAIL_BINDING_REQUIRED'/u)
})

test('登录与 me 响应透传 emailBindingRequired，豁免账号恒为 false', () => {
  const loginBlock = authSource.slice(authSource.indexOf("app.post('/api/v1/auth/login'"), authSource.indexOf("app.get('/api/v1/auth/me'"))
  assert.match(loginBlock, /email_key, username_key[\s\S]{0,200}FROM users WHERE username_key = \?/u)
  assert.match(loginBlock, /emailBindingRequired: !user\.email_key && !isEmailBindingExempt\(\{ isPlatformAdmin: user\.is_platform_admin === 1, usernameKey: user\.username_key \}\)/u)
  const meBlock = authSource.slice(authSource.indexOf("app.get('/api/v1/auth/me'"), authSource.indexOf("app.post('/api/v1/auth/logout'"))
  assert.match(meBlock, /emailBindingRequired: isEmailBindingRequired\(context\)/u)
})

test('迁移 0024 纯新增，schema 版本与测试适配器同步', async () => {
  const migration = await readFile(new URL('../../../migrations/d1/0024_email_binding_challenges.sql', import.meta.url), 'utf8')
  assert.match(migration, /CREATE TABLE email_binding_challenges/u)
  assert.match(migration, /CREATE INDEX email_binding_user_created_idx ON email_binding_challenges\(user_id, created_at DESC\)/u)
  // 非破坏性：不得触碰既有表。
  assert.doesNotMatch(migration, /ALTER TABLE|DROP TABLE|DROP INDEX/u)
  const schemaVersion = await readFile(new URL('../src/schema-version.ts', import.meta.url), 'utf8')
  assert.match(schemaVersion, /'0024_email_binding_challenges'/u)
  const adapter = await readFile(new URL('../security/d1-test-adapter.ts', import.meta.url), 'utf8')
  assert.match(adapter, /'0024_email_binding_challenges\.sql'/u)
})
