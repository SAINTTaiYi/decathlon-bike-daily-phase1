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
