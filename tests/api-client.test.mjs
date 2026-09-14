import test from 'node:test'
import assert from 'node:assert/strict'
import { api, ApiError, idempotencyKey } from '../apps/web/src/api/client.js'

test('API 请求取消保留 AbortError，不误报为网络故障', async () => {
  const originalFetch = globalThis.fetch
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } })
  globalThis.fetch = async () => { throw new DOMException('aborted', 'AbortError') }

  try {
    await assert.rejects(api('/api/v1/bootstrap'), (error) => error?.name === 'AbortError' && !(error instanceof ApiError))
  } finally {
    globalThis.fetch = originalFetch
    if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor)
    else delete globalThis.navigator
  }
})


test('旧版或非安全上下文没有 crypto.randomUUID 时仍生成 UUID v4 幂等键', () => {
  const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto')
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: {
      getRandomValues(bytes) {
        bytes.fill(0x11)
        return bytes
      }
    }
  })

  try {
    assert.match(idempotencyKey(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u)
  } finally {
    if (cryptoDescriptor) Object.defineProperty(globalThis, 'crypto', cryptoDescriptor)
    else delete globalThis.crypto
  }
})

// CSRF 自愈（2026-09-15 三站 SSO 的配套）。
//
// 会话里的 csrf_hash 每会话一份、每次 /auth/me 轮换，所以「另一个标签页/另一个子站
// 打开」会让手里的令牌作废。此前只能让用户刷新（安全令牌已失效）；现在遇到
// INVALID_CSRF 就地补票并重放一次，且**重放沿用同一个幂等键**——这是关键，
// 否则重放可能被服务端当成一次新请求而重复执行。
test('CSRF 失效时自动补票并重放，且重放沿用同一幂等键', async () => {
  const originalFetch = globalThis.fetch
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } })
  const calls = []
  globalThis.fetch = async (url, init = {}) => {
    const target = String(url)
    calls.push({ url: target, method: init.method || 'GET', idempotency: new Headers(init.headers || {}).get('idempotency-key') })
    if (target.includes('/api/v1/auth/me')) {
      return new Response(JSON.stringify({ csrfToken: 'fresh-csrf' }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    if (calls.filter((call) => call.url.includes('/api/v1/work-items')).length === 1) {
      return new Response(JSON.stringify({ error: 'INVALID_CSRF', message: '安全令牌已失效' }), { status: 403, headers: { 'content-type': 'application/json' } })
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  try {
    // 先建立会话（拿到初始 CSRF）
    const { setApiSession } = await import('../apps/web/src/api/client.js')
    setApiSession({ csrf: 'stale-csrf', store: 'store-1' })
    const result = await api('/api/v1/work-items', { method: 'POST', body: { title: 'x' } })
    assert.deepEqual(result, { ok: true }, '补票后必须重放并成功')

    const writes = calls.filter((call) => call.url.includes('/api/v1/work-items'))
    assert.equal(writes.length, 2, '写请求必须恰好重放一次')
    assert.ok(calls.some((call) => call.url.includes('/api/v1/auth/me')), '必须补拉一次会话换取新令牌')
    assert.ok(writes[0].idempotency, '首次写必须带幂等键')
    assert.equal(writes[0].idempotency, writes[1].idempotency, '重放必须沿用同一幂等键（否则可能重复执行）')
  } finally {
    globalThis.fetch = originalFetch
    if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor)
    else delete globalThis.navigator
  }
})

test('CSRF 补票失败时按原错误抛出，且不无限重试', async () => {
  const originalFetch = globalThis.fetch
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } })
  let writes = 0
  globalThis.fetch = async (url) => {
    const target = String(url)
    if (target.includes('/api/v1/auth/me')) return new Response('{}', { status: 401, headers: { 'content-type': 'application/json' } })
    writes += 1
    return new Response(JSON.stringify({ error: 'INVALID_CSRF', message: '安全令牌已失效' }), { status: 403, headers: { 'content-type': 'application/json' } })
  }
  try {
    const { setApiSession } = await import('../apps/web/src/api/client.js')
    setApiSession({ csrf: 'stale-csrf', store: 'store-1' })
    await assert.rejects(
      api('/api/v1/work-items', { method: 'POST', body: { title: 'x' } }),
      (error) => error?.code === 'INVALID_CSRF' && error?.status === 403
    )
    assert.equal(writes, 1, '补票失败不得继续重放（避免打转）')
  } finally {
    globalThis.fetch = originalFetch
    if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor)
    else delete globalThis.navigator
  }
})
