import assert from 'node:assert/strict'
import test from 'node:test'
import { routeIncomingRequest } from '../src/request-routing.js'

const assets = {
  fetch: async (request: Request) => new Response(`asset:${new URL(request.url).pathname}`)
} satisfies Pick<Fetcher, 'fetch'>

const apiFetch = async () => new Response('api')

test('HTTP 页面请求永久跳转至等价 HTTPS 地址，保留路径与查询参数', async () => {
  const response = await routeIncomingRequest(
    new Request('http://workshop.skin/login?source=colleague'),
    assets,
    apiFetch
  )

  assert.equal(response.status, 308)
  assert.equal(response.headers.get('location'), 'https://workshop.skin/login?source=colleague')
})

test('HTTPS 静态页面继续由 ASSETS 提供，不进入 API 路由', async () => {
  const response = await routeIncomingRequest(new Request('https://workshop.skin/'), assets, apiFetch)

  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'asset:/')
})
