const API_BASE = String(import.meta.env?.VITE_API_BASE_URL || '').replace(/\/$/u, '')
let csrfToken = ''
let storeId = ''
let serverVersionListener = null

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

// 服务端版本快通道：任意业务 API 响应头的 X-App-Version 都会推给监听者
// （更新弹窗），让门店端在下一个业务请求上就发现新版本，不必等轮询。
export function onServerVersion(listener) {
  serverVersionListener = listener
}

function emitServerVersion(version) {
  if (typeof serverVersionListener !== 'function') return
  if (typeof version !== 'string' || !version) return
  try {
    serverVersionListener(version)
  } catch {
    // 监听者异常绝不能打断业务请求。
  }
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

// CSRF 令牌换新（2026-09-15 三站 SSO 的配套）。
//
// 会话里的 csrf_hash 是**每会话一份**、每次 /auth/me 轮换一次。因此：
//   · 同一站点开第二个标签页 → 新标签页的 /me 让旧标签页手里的令牌作废；
//   · 三站共用一个会话后 → 从 Ops 打开食品台账/门店设计，也会让 Ops 标签页作废。
// 旧行为是让用户自己刷新（「安全令牌已失效，请刷新页面后重试」），在跨站跳转成为
// 常态后过于唠叨。现在遇到 INVALID_CSRF 就地补一次令牌并重放请求：
//   ① 只补一次（retriedCsrf 标记），补不到令牌就照旧抛错，不会打转；
//   ② 重放沿用**同一个幂等键** —— 即使首次请求其实已被执行过，服务端也只会认一次；
//   ③ 并发失败共享同一次补票（refreshPromise），避免 N 个请求各拉一次 /me。
let refreshPromise = null

async function refreshCsrfToken() {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE}/api/v1/auth/me?_=${Date.now()}`, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: { accept: 'application/json' }
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (payload?.csrfToken) {
          csrfToken = payload.csrfToken
          return true
        }
        return false
      })
      .catch(() => false)
      .finally(() => { refreshPromise = null })
  }
  return refreshPromise
}

export async function api(path, options = {}) {
  const method = options.method || 'GET'
  const headers = new Headers(options.headers || {})
  if (options.body !== undefined && !(options.body instanceof FormData)) headers.set('content-type', 'application/json')
  if (storeId) headers.set('x-store-id', storeId)
  // 幂等键在重试之间保持一致：CSRF 自愈的重放必须被服务端认成同一次请求。
  const key = ['GET', 'HEAD', 'OPTIONS'].includes(method)
    ? null
    : (options.idempotencyKey || idempotencyKey())
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    if (csrfToken) headers.set('x-csrf-token', csrfToken)
    headers.set('idempotency-key', key)
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
  const serverVersion = response.headers.get('x-app-version')
  if (serverVersion) emitServerVersion(serverVersion)
  const payload = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new CustomEvent('bike-ops:session-expired'))
    // 令牌被其他标签页/其他子站轮换掉了：补一次令牌后原样重放（只此一次）。
    if (response.status === 403 && payload?.error === 'INVALID_CSRF' && !options.retriedCsrf) {
      const refreshed = await refreshCsrfToken()
      if (refreshed) return api(path, { ...options, retriedCsrf: true, idempotencyKey: key || undefined })
    }
    throw new ApiError(payload?.message || `请求失败（${response.status}）`, { status: response.status, code: payload?.error || 'REQUEST_FAILED', details: payload?.details })
  }
  return payload
}

// 拉取本次发布的公告内容（版本、标题、摘要、逐条更新）。内容在构建期烘焙进
// Worker，旧版本页面也能正确渲染新公告。
export async function fetchReleaseInfo({ signal } = {}) {
  try {
    const response = await fetch(`${API_BASE}/api/release/info?_=${Date.now()}`, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: { accept: 'application/json' },
      signal
    })
    if (!response.ok) return null
    const payload = await response.json().catch(() => null)
    if (!payload || typeof payload.version !== 'string' || !Array.isArray(payload.changes)) return null
    return payload
  } catch (error) {
    if (error?.name === 'AbortError') return null
    return null
  }
}
