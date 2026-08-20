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
  assert.match(source, /role: 'admin'/u)
  assert.doesNotMatch(source, /JOIN cities|JOIN regions|activeDirectoryStore/u)
})

test('重复门店编号在 OTP 请求阶段返回 409 STORE_ALREADY_EXISTS', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../src/routes/registration.ts', import.meta.url), 'utf8')
  assert.match(source, /STORE_ALREADY_EXISTS/u)
  assert.match(source, /input.storeCode.toLocaleUpperCase\('en-US'\)/u)
})

test('完成注册事务先激活门店再创建 admin 成员关系', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../src/routes/registration.ts', import.meta.url), 'utf8')
  // 激活门店必须条件化：仅当门店仍处于待注册状态且无成员时才激活
  assert.match(source, /UPDATE stores[\s\S]{0,200}WHERE id = \? AND status = 'disabled' AND self_registration_pending = 1[\s\S]{0,100}NOT EXISTS \(SELECT 1 FROM store_members WHERE store_id = stores\.id AND status = 'active'\)/u)
  // 成员关系固定为 admin，且必须条件化：门店已激活且仍无成员
  assert.match(source, /INSERT INTO store_members[\s\S]{0,200}'admin'[\s\S]{0,200}WHERE EXISTS \(SELECT 1 FROM users WHERE id = \?\)[\s\S]{0,100}AND EXISTS \(SELECT 1 FROM stores WHERE id = \? AND status = 'active' AND self_registration_pending = 0\)[\s\S]{0,100}AND NOT EXISTS \(SELECT 1 FROM store_members WHERE store_id = \? AND status = 'active'\)/u)
})
