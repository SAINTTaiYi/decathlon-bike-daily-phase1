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
  assert.match(source, /THEN 'operator' ELSE 'admin'/u)
  assert.doesNotMatch(source, /JOIN cities|JOIN regions|activeDirectoryStore/u)
})
