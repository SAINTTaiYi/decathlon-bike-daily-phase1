const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

function decodeKey(encoded: string): Uint8Array {
  const padded = encoded.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded + '==='.slice((padded.length + 3) % 4))
  const key = Uint8Array.from(binary, (c) => c.charCodeAt(0))
  if (key.length !== 32) throw new Error('CONTACT_ENCRYPTION_KEY must decode to exactly 32 bytes')
  return key
}

function b64url(bytes: Uint8Array): string {
  let binary = ''
  for (const value of bytes) binary += String.fromCharCode(value)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '')
}

function fromB64url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded + '==='.slice((padded.length + 3) % 4))
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

export async function encryptContact(value: string, encodedKey: string): Promise<string> {
  const keyBytes = decodeKey(encodedKey)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt'])
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, textEncoder.encode(value)))
  const ciphertext = encrypted.slice(0, encrypted.length - 16)
  const tag = encrypted.slice(encrypted.length - 16)
  return ['v1', b64url(iv), b64url(ciphertext), b64url(tag)].join('.')
}

export async function decryptContact(payload: string, encodedKey: string): Promise<string> {
  const [version, ivPart, encryptedPart, tagPart] = payload.split('.')
  if (version !== 'v1' || !ivPart || !encryptedPart || !tagPart) throw new Error('INVALID_CONTACT_CIPHERTEXT')
  const keyBytes = decodeKey(encodedKey)
  const iv = fromB64url(ivPart)
  const ciphertext = fromB64url(encryptedPart)
  const tag = fromB64url(tagPart)
  const combined = new Uint8Array(ciphertext.length + tag.length)
  combined.set(ciphertext)
  combined.set(tag, ciphertext.length)
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt'])
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, combined)
  return textDecoder.decode(plain)
}

export async function contactFingerprint(value: string, encodedKey: string): Promise<string> {
  const keyBytes = decodeKey(encodedKey)
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, textEncoder.encode(value.normalize('NFKC').trim()))
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
