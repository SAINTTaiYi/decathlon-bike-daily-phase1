const API_BASE = String(import.meta.env?.VITE_API_BASE_URL || '').replace(/\/$/u, '')
let csrfToken = ''
let storeId = ''

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'NETWORK_ERROR', details = null } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export function setApiSession({ csrf = '', store = '' } = {}) {
  csrfToken = csrf
  storeId = store
}

export function clearApiSession() {
  csrfToken = ''
  storeId = ''
}

function uuidV4FromBytes(bytes) {
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function idempotencyKey() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  const bytes = new Uint8Array(16)
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes)
  } else {
    // Idempotency keys are not credentials. This last-resort path prevents unsupported legacy browsers from blocking writes.
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256)
  }
  return uuidV4FromBytes(bytes)
}

export async function api(path, options = {}) {
  const method = options.method || 'GET'
  const headers = new Headers(options.headers || {})
  if (options.body !== undefined && !(options.body instanceof FormData)) headers.set('content-type', 'application/json')
  if (storeId) headers.set('x-store-id', storeId)
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    if (csrfToken) headers.set('x-csrf-token', csrfToken)
    headers.set('idempotency-key', options.idempotencyKey || idempotencyKey())
  }
  let response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      credentials: 'include',
      signal: options.signal,
      body: options.body === undefined ? undefined : options.body instanceof FormData ? options.body : JSON.stringify(options.body)
    })
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    throw new ApiError(navigator.onLine ? '无法连接服务器，请稍后重试。' : '当前离线，只能查看最近加载的数据。', { code: 'NETWORK_ERROR', details: error })
  }
  const payload = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new CustomEvent('bike-ops:session-expired'))
    throw new ApiError(payload?.message || `请求失败（${response.status}）`, { status: response.status, code: payload?.error || 'REQUEST_FAILED', details: payload?.details })
  }
  return payload
}
