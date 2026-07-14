import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { contactFingerprint, decryptContact, encryptContact } from '../src/lib/contact-crypto.js'

const key = randomBytes(32).toString('base64url')

test('联系方式使用 AES-256-GCM 加密且密文随机化', () => {
  const first = encryptContact('13800000000', key)
  const second = encryptContact('13800000000', key)
  assert.notEqual(first, second)
  assert.equal(decryptContact(first, key), '13800000000')
  assert.equal(contactFingerprint('13800000000', key), contactFingerprint('13800000000', key))
})

test('篡改联系方式密文会导致认证失败', () => {
  const parts = encryptContact('0', key).split('.')
  const tag = parts[3]
  assert.ok(tag)
  parts[3] = `${tag.slice(0, 5)}${tag[5] === 'A' ? 'B' : 'A'}${tag.slice(6)}`
  assert.throws(() => decryptContact(parts.join('.'), key))
})
