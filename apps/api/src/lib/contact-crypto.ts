import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto'

function decodeKey(encoded: string): Buffer {
  const key = Buffer.from(encoded, 'base64url')
  if (key.length !== 32) throw new Error('CONTACT_ENCRYPTION_KEY must decode to exactly 32 bytes')
  return key
}

export function encryptContact(value: string, encodedKey: string): string {
  const key = decodeKey(encodedKey)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64url'), encrypted.toString('base64url'), cipher.getAuthTag().toString('base64url')].join('.')
}

export function decryptContact(payload: string, encodedKey: string): string {
  const [version, ivPart, encryptedPart, tagPart] = payload.split('.')
  if (version !== 'v1' || !ivPart || !encryptedPart || !tagPart) throw new Error('INVALID_CONTACT_CIPHERTEXT')
  const decipher = createDecipheriv('aes-256-gcm', decodeKey(encodedKey), Buffer.from(ivPart, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(encryptedPart, 'base64url')), decipher.final()]).toString('utf8')
}

export function contactFingerprint(value: string, encodedKey: string): string {
  return createHmac('sha256', decodeKey(encodedKey)).update(value.normalize('NFKC').trim()).digest('hex')
}
