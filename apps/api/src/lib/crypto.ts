import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function keyedHash(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('hex')
}

export function safeEqualHex(left: string | undefined, right: string | undefined): boolean {
  if (!left || !right || !/^[a-f0-9]+$/u.test(left) || !/^[a-f0-9]+$/u.test(right) || left.length !== right.length) return false
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'))
}
