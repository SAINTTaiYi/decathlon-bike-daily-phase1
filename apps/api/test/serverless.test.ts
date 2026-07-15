import test from 'node:test'
import assert from 'node:assert/strict'
import { createFetchHandler, type InjectableApp } from '../src/serverless.js'

function fakeApp(reply: {
  statusCode?: number
  headers?: Record<string, string | string[] | undefined>
  payload?: string
}, capture: Array<Record<string, unknown>>): InjectableApp {
  return {
    async inject(options) {
      capture.push(options)
      return {
        statusCode: reply.statusCode ?? 200,
        headers: reply.headers ?? { 'content-type': 'application/json; charset=utf-8' },
        rawPayload: Buffer.from(reply.payload ?? '{"ok":true}')
      }
    }
  }
}

test('EdgeOne Fetch adapter 将完整同源路径、查询、Header、Body 和 clientIp 注入 Fastify', async () => {
  const captured: Array<Record<string, unknown>> = []
  const handler = createFetchHandler(async () => fakeApp({ headers: { 'content-type': 'application/json', connection: 'close' } }, captured))
  const response = await handler({
    request: new Request('https://bike-ops.example/api/v1/work-items?scene=repair', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-request-id': 'request-1' },
      body: JSON.stringify({ title: '维修车辆' })
    }),
    env: { APP_ENV: 'staging' },
    clientIp: '203.0.113.7'
  })

  assert.equal(response.status, 200)
  assert.equal(response.headers.get('connection'), null)
  assert.deepEqual(await response.json(), { ok: true })
  assert.equal(captured.length, 1)
  const request = captured[0]!
  assert.equal(request.method, 'POST')
  assert.equal(request.url, '/api/v1/work-items?scene=repair')
  assert.equal(request.remoteAddress, '203.0.113.7')
  assert.equal((request.headers as Record<string, string>)['x-request-id'], 'request-1')
  assert.deepEqual(JSON.parse((request.payload as Buffer).toString('utf8')), { title: '维修车辆' })
})

test('EdgeOne Fetch adapter 保留多值响应 Header，并对 204 与 HEAD 移除 Body', async () => {
  const headers = { 'set-cookie': ['a=1; Path=/', 'b=2; Path=/'], 'x-frame-options': 'DENY' }
  const noContent = createFetchHandler(async () => fakeApp({ statusCode: 204, headers, payload: 'must-not-leak' }, []))
  const noContentResponse = await noContent({ request: new Request('https://bike-ops.example/api/v1/auth/logout', { method: 'POST' }) })
  assert.equal(noContentResponse.status, 204)
  assert.equal(await noContentResponse.text(), '')
  assert.equal(noContentResponse.headers.get('x-frame-options'), 'DENY')

  const head = createFetchHandler(async () => fakeApp({ headers, payload: 'must-not-leak' }, []))
  const headResponse = await head({ request: new Request('https://bike-ops.example/health/live', { method: 'HEAD' }) })
  assert.equal(await headResponse.text(), '')
})
