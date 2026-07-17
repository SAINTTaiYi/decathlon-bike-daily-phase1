const textEncoder = new TextEncoder()

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function randomToken(bytes = 32): string {
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  let binary = ''
  for (const value of arr) binary += String.fromCharCode(value)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '')
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(value))
  return toHex(digest)
}

export async function keyedHash(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, textEncoder.encode(value))
  return toHex(signature)
}

export function safeEqualHex(left: string | undefined, right: string | undefined): boolean {
  if (!left || !right || left.length !== right.length || !/^[a-f0-9]+$/iu.test(left) || !/^[a-f0-9]+$/iu.test(right)) return false
  let diff = 0
  for (let i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i)
  return diff === 0
}

export async function hashPassword(password: string, pepper: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const keyMaterial = await crypto.subtle.importKey('raw', textEncoder.encode(`${password}\u0000${pepper}`), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 310_000, hash: 'SHA-256' }, keyMaterial, 256)
  const saltB64 = btoa(String.fromCharCode(...salt)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '')
  return `pbkdf2$sha256$310000$${saltB64}$${toHex(bits)}`
}

export async function verifyPassword(passwordHash: string, password: string, pepper: string): Promise<boolean> {
  const [algo, hashName, iterText, saltB64, expected] = passwordHash.split('$')
  if (algo !== 'pbkdf2' || hashName !== 'sha256' || !iterText || !saltB64 || !expected) return false
  const iterations = Number(iterText)
  if (!Number.isFinite(iterations) || iterations < 100_000) return false
  const padded = saltB64.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded + '==='.slice((padded.length + 3) % 4))
  const salt = Uint8Array.from(binary, (c) => c.charCodeAt(0))
  const keyMaterial = await crypto.subtle.importKey('raw', textEncoder.encode(`${password}\u0000${pepper}`), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, keyMaterial, 256)
  return safeEqualHex(toHex(bits), expected)
}
