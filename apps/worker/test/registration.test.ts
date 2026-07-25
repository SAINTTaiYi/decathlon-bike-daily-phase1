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
