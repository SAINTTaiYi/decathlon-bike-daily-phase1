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

import { isAllowedOrigin } from '../src/env.js'

test('生产域名仅允许精确 apex 与 www 来源，不放宽到通配来源', () => {
  const origins = ['https://workshop.skin', 'https://www.workshop.skin']
  assert.equal(isAllowedOrigin('https://workshop.skin', origins), true)
  assert.equal(isAllowedOrigin('https://www.workshop.skin', origins), true)
  assert.equal(isAllowedOrigin('https://evil.workshop.skin', origins), false)
  assert.equal(isAllowedOrigin('http://workshop.skin', origins), false)
  assert.equal(isAllowedOrigin(undefined, origins), false)
})

test('Hono patched parser 与 WHATWG URL 对畸形 absolute-form 路径保持一致', async () => {
  const { getPath } = await import('hono/utils/url')
  for (const rawUrl of ['https://a:/foo/api/v1/work-items', 'https://a:/api/v1/work-items']) {
    assert.equal(getPath({ url: rawUrl } as Request), new URL(rawUrl).pathname)
  }
})


test('API 响应禁止缓存并带防嗅探头，HTML 响应禁止嵌套并带 CSP', async () => {
  const api = await routeIncomingRequest(
    new Request('https://workshop.skin/api/v1/meta/version'),
    assets,
    async () => Response.json({ ok: true })
  )
  assert.match(api.headers.get('cache-control') ?? '', /no-store/u)
  assert.equal(api.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(api.headers.get('x-frame-options'), 'DENY')

  const html = await routeIncomingRequest(
    new Request('https://workshop.skin/'),
    { fetch: async () => new Response('<!doctype html>', { headers: { 'content-type': 'text/html; charset=utf-8' } }) },
    apiFetch
  )
  assert.match(html.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/u)
  assert.equal(html.headers.get('x-frame-options'), 'DENY')
  assert.equal(html.headers.get('strict-transport-security'), 'max-age=31536000')
})

// 门店设计渲染（2026-09-15）：工具页要被**同源**宿主以 iframe 嵌入，单独放行
// 同源嵌套；其余页面（含相邻路径、API）必须继续默认拒绝。
test('门店设计工具页允许同源嵌套，其余页面继续默认拒绝', async () => {
  const htmlAssets = {
    fetch: async () => new Response('<!doctype html>', { headers: { 'content-type': 'text/html; charset=utf-8' } })
  } satisfies Pick<Fetcher, 'fetch'>

  const tool = await routeIncomingRequest(
    new Request('https://mass.workshop.skin/store-design/index.html'),
    htmlAssets,
    apiFetch
  )
  assert.match(tool.headers.get('content-security-policy') ?? '', /frame-ancestors 'self'/u)
  assert.equal(tool.headers.get('x-frame-options'), 'SAMEORIGIN')

  const shell = await routeIncomingRequest(new Request('https://mass.workshop.skin/'), htmlAssets, apiFetch)
  assert.match(shell.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/u)
  assert.equal(shell.headers.get('x-frame-options'), 'DENY')

  // 前缀必须带斜杠：/store-design-… 这类相邻路径不得被误放行
  const near = await routeIncomingRequest(new Request('https://mass.workshop.skin/store-design-notes'), htmlAssets, apiFetch)
  assert.equal(near.headers.get('x-frame-options'), 'DENY')

  // API 永不放开嵌套，也不套用页面 CSP
  const api = await routeIncomingRequest(
    new Request('https://mass.workshop.skin/api/v1/store-design/x'),
    htmlAssets,
    async () => Response.json({ ok: true })
  )
  assert.equal(api.headers.get('x-frame-options'), 'DENY')
  assert.match(api.headers.get('content-security-policy') ?? '', /default-src 'none'/u)
})
