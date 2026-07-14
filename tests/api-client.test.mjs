import test from 'node:test'
import assert from 'node:assert/strict'
import { api, ApiError } from '../apps/web/src/api/client.js'

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
