import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeCorporateEmail, randomOtp } from '../src/services/registration.js'

test('注册邮箱规范化保持地址语义并让 OTP 固定为六位数字', () => {
  assert.equal(normalizeCorporateEmail('  TEAM.Member@DECATHLON.COM  '), 'team.member@decathlon.com')
  for (let index = 0; index < 100; index += 1) assert.match(randomOtp(), /^\d{6}$/u)
})

test('注册实现先条件化消费 OTP grant，再创建账号、成员关系和会话', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../src/routes/registration.ts', import.meta.url), 'utf8')
  assert.match(source, /WHERE id = \? AND status = 'verified' AND completion_token_hash = \? AND expires_at > \?/u)
  assert.match(source, /WHERE EXISTS \(SELECT 1 FROM registration_challenges WHERE id = \? AND status = 'completed' AND completion_token_hash = \? AND completed_at = \?\)/u)
  assert.match(source, /const consumptionMarker = await keyedHash\(`/u)
  assert.match(source, /SET status = 'completed', completed_at = \?, completion_token_hash = \?, updated_at = \?/u)
  assert.match(source, /REGISTRATION_GRANT_INVALID/u)
  assert.doesNotMatch(source, /after:\s*\{[^}]*password/u)
})


test('错误 OTP 使用条件原子增量并在第五次尝试时收敛为过期', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../src/routes/registration.ts', import.meta.url), 'utf8')
  assert.match(source, /SET attempts = attempts \+ 1,/u)
  assert.match(source, /CASE WHEN attempts \+ 1 >= 5 THEN 'expired'/u)
  assert.match(source, /WHERE id = \? AND status = 'pending' AND attempts < 5 AND expires_at > \?/u)
  assert.match(source, /ApiProblem\(429, 'OTP_LOCKED'/u)
})

test('OTP 锁定后显式返回 429 OTP_LOCKED，不存在的 challengeId 仍为通用错误', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../src/routes/registration.ts', import.meta.url), 'utf8')
  assert.match(source, /if \(!challenge\) \{[\s\S]{0,140}OTP_INVALID_OR_EXPIRED/u)
  assert.match(source, /if \(challenge\.attempts >= 5\) \{[\s\S]{0,140}429[\s\S]{0,60}OTP_LOCKED/u)
  assert.match(source, /updated\.meta\.changes === 1 && challenge\.attempts \+ 1 >= 5[\s\S]{0,120}OTP_LOCKED/u)
})


test('OTP 请求对有效、已注册、限速与不可用门店统一返回 challengeId 形态', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../src/routes/registration.ts', import.meta.url), 'utf8')
  assert.match(source, /function registrationOtpResponse\(challengeId: string/u)
  assert.match(source, /registrationOtpResponse\(reusableChallengeId/u)
  assert.match(source, /registrationOtpResponse\(syntheticChallengeId\)/u)
  assert.match(source, /registrationOtpResponse\(id\)/u)
})


test('门店注册已切换为平面门店编码，首位注册人管理员规则由服务端执行', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../src/routes/registration.ts', import.meta.url), 'utf8')
  assert.match(source, /storeCode/u)
  assert.match(source, /storeName/u)
  assert.match(source, /self_registration_pending/u)
  assert.match(source, /'admin' as const/u)
  assert.match(source, /role: assignedRole/u)
  assert.doesNotMatch(source, /JOIN cities|JOIN regions|activeDirectoryStore/u)
})

test('重复门店编号在 OTP 请求阶段返回 409 STORE_ALREADY_EXISTS', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../src/routes/registration.ts', import.meta.url), 'utf8')
  assert.match(source, /STORE_ALREADY_EXISTS/u)
  assert.match(source, /input.storeCode.toLocaleUpperCase\('en-US'\)/u)
})

test('注册双路径：intent=join 必须命中有效门店，intent=create 建店进平台审核', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../src/routes/registration.ts', import.meta.url), 'utf8')
  assert.match(source, /const intent = input\.intent \?\? 'create'/u)
  assert.match(source, /ApiProblem\(409, 'STORE_NOT_JOINABLE'/u)
  // 公开门门店目录端点（注册下拉数据源）
  assert.match(source, /app\.get\('\/api\/v1\/registration\/stores'/u)
  assert.match(source, /SELECT code, name FROM stores WHERE status = 'active' ORDER BY code/u)
})

test('新店注册不再自动开通：门店保持待审（pending_review=1），账号与店长成员关系先行创建但不发会话', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../src/routes/registration.ts', import.meta.url), 'utf8')
  // 门店保持 disabled + pending_review=1（不再激活）
  assert.match(source, /SET self_registration_pending = 0, pending_review = 1, updated_at = \?/u)
  assert.doesNotMatch(source, /SET status = 'active', self_registration_pending = 0, pending_review = 1/u)
  // 成员关系条件化：门店待审且无成员
  assert.match(source, /EXISTS \(SELECT 1 FROM stores WHERE id = \? AND status = 'disabled' AND self_registration_pending = 0 AND pending_review = 1\)/u)
  // 不下发会话：注册链路不得再触碰 auth_sessions / setSessionCookie
  assert.doesNotMatch(source, /INSERT INTO auth_sessions|setSessionCookie|createSessionSecrets/u)
  // 审核等待响应
  assert.match(source, /storeReviewPending: true/u)
  assert.match(source, /等待平台管理员审核/u)
})
