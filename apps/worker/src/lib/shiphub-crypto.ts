const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

function decodeKey(encoded: string): Uint8Array {
  const padded = encoded.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded + '==='.slice((padded.length + 3) % 4))
  const key = Uint8Array.from(binary, (c) => c.charCodeAt(0))
  if (key.length !== 32) throw new Error('SHIPHUB_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes')
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

export async function encryptShipHubSecret(value: string, encodedKey: string): Promise<{ ciphertext: string; nonce: string }> {
  const keyBytes = decodeKey(encodedKey)
  const nonce = crypto.getRandomValues(new Uint8Array(12))
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt'])
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, textEncoder.encode(value))
  return { ciphertext: b64url(new Uint8Array(encrypted)), nonce: b64url(nonce) }
}

export async function decryptShipHubSecret(ciphertext: string, nonce: string, encodedKey: string): Promise<string> {
  const keyBytes = decodeKey(encodedKey)
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt'])
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64url(nonce) }, key, fromB64url(ciphertext))
  return textDecoder.decode(plain)
}
