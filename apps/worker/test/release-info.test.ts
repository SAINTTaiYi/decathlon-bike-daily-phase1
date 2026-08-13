import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { handleRequest } from '../src/index.js'
import { RELEASE_INFO } from '../src/generated/release-info.js'
import type { WorkerEnv } from '../src/env.js'

const ORIGIN = 'https://bike-ops-preview.geeklightonefish.workers.dev'

function environment(): WorkerEnv {
  return {
    DB: { prepare: () => { throw new Error('DB unused in release-info tests') } } as unknown as D1Database,
    ASSETS: { fetch: async () => new Response('asset') } as Fetcher,
    APP_ENV: 'preview',
    APP_VERSION: '5.9.4',
    GIT_SHA: 'release-info-test-sha',
    COOKIE_SECURE: 'true',
    SESSION_TTL_HOURS: '12',
    CORS_ALLOWED_ORIGINS: ORIGIN,
    SESSION_SECRET: '',
    CSRF_SECRET: '',
    PASSWORD_PEPPER: ''
  }
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers ?? {})
  const pending: Promise<unknown>[] = []
  const executionContext = {
    waitUntil(promise: Promise<unknown>) { pending.push(promise) },
    passThroughOnException() {},
    props: {}
  } as ExecutionContext
  const response = await handleRequest(new Request(`${ORIGIN}${path}`, { ...init, headers }), environment(), executionContext)
  await Promise.allSettled(pending)
  return response
}

test('GET /api/release/info 返回构建期烘焙的发布公告：版本、标题、摘要与逐条更新', async () => {
  const response = await request('/api/release/info')
  assert.equal(response.status, 200)
  const body = await response.json() as Record<string, unknown>
  assert.equal(body.version, RELEASE_INFO.version)
  assert.equal(typeof body.title, 'string')
  assert.ok((body.title as string).length > 0)
  assert.equal(typeof body.summary, 'string')
  assert.ok(Array.isArray(body.changes))
  assert.ok((body.changes as unknown[]).length > 0)
  assert.equal(body.gitSha, 'release-info-test-sha')
  assert.equal(body.environment, 'preview')
})

test('发布公告端点是公共端点：不依赖 Secret 也能响应（与 /health 同级）', async () => {
  const source = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8')
  assert.match(source, /path === '\/api\/release\/info'/u)
  assert.match(source, /return false/u)
})

test('所有 /api/* 响应携带 X-App-Version，公共 /health/* 不携带', async () => {
  const apiResponse = await request('/api/v1/meta/version')
  assert.equal(apiResponse.status, 200)
  assert.equal(apiResponse.headers.get('x-app-version'), '5.9.4')

  const healthResponse = await request('/health/live')
  assert.equal(healthResponse.status, 200)
  assert.equal(healthResponse.headers.get('x-app-version'), null)
})

test('烘焙的 release-info 与 web releaseNotes.js 单一事实源版本一致', async () => {
  const source = await readFile(new URL('../../../apps/web/src/data/releaseNotes.js', import.meta.url), 'utf8')
  const match = source.match(/export const APP_VERSION = "([^"]+)"/u)
  assert.ok(match, 'releaseNotes.js 必须声明 APP_VERSION')
  assert.equal(RELEASE_INFO.version, match?.[1])
})
