import assert from 'node:assert/strict'
import test from 'node:test'
import { hashPassword, PASSWORD_PBKDF2_ITERATIONS, verifyPassword } from '../src/lib/crypto.js'

const pepper = 'p'.repeat(64)

test('Worker password hashes use the Cloudflare-supported PBKDF2 ceiling', async () => {
  const hash = await hashPassword('correct horse battery staple', pepper)
  assert.equal(PASSWORD_PBKDF2_ITERATIONS, 100_000)
  assert.equal(hash.split('$')[2], String(PASSWORD_PBKDF2_ITERATIONS))
  assert.equal(await verifyPassword(hash, 'correct horse battery staple', pepper), true)
  assert.equal(await verifyPassword(hash, 'wrong password', pepper), false)
})

test('unsupported PBKDF2 iteration counts fail closed instead of throwing', async () => {
  const unsupported = 'pbkdf2$sha256$310000$YWJjZA$' + '00'.repeat(32)
  assert.equal(await verifyPassword(unsupported, 'password', pepper), false)
})
