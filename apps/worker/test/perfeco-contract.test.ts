import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import type { AppConfig, WorkerEnv } from '../src/env.js'
import { encryptShipHubSecret } from '../src/lib/shiphub-crypto.js'
import { perfecoDate, syncBikeDay, getStoreWeek } from '../src/services/bi-bikes.js'
import { migratedTestDatabase, type TestD1Database } from '../security/d1-test-adapter.js'

// perfeco v2 契约回归（2026-09-09 CubeInStore 26.09.01.01 变更）：
// 上游把 from/to 从 yyyy-MM-dd 改成 yyyyMMdd（LocalDateTime 解析），
// 传旧格式返回 400「Invalid date value '2026-09-08'. Expected yyyyMMdd or yyyyMMddHHmmss」。
// 本测试锁死两件事：①日期转换函数行为；②实际请求 URL 里必须是 yyyyMMdd。
// 同时锁死 SPD 仍用 yyyy-MM-dd（两者独立，误改会让折扣数据静默变 0）。

const NOW = new Date('2026-09-09T03:00:00.000Z')
// 密钥必须是 32 字节的 base64（loadConfig 会校验解码长度）。
const TOKEN_KEY = Buffer.from('t'.repeat(32)).toString('base64')
const LOGIN_KEY = Buffer.from('b'.repeat(32)).toString('base64')

async function encrypted(value: string): Promise<string> {
  const { ciphertext, nonce } = await encryptShipHubSecret(value, LOGIN_KEY)
  return `${ciphertext}.${nonce}`
}

async function environment(): Promise<WorkerEnv> {
  const db = await migratedTestDatabase()
  return {
    DB: db,
    ASSETS: {} as Fetcher,
    APP_ENV: 'staging',
    APP_VERSION: '6.7.6-1',
    GIT_SHA: 'perfeco-contract-test',
    COOKIE_SECURE: 'true',
    SESSION_TTL_HOURS: '12',
    CORS_ALLOWED_ORIGINS: 'https://workshop.skin',
    SESSION_SECRET: 's'.repeat(32),
    CSRF_SECRET: 'c'.repeat(32),
    PASSWORD_PEPPER: 'p'.repeat(32),
    SHIPHUB_MODE: 'fixture',
    SHIPHUB_ENABLED: 'false',
    SHIPHUB_TOKEN_ENCRYPTION_KEY: TOKEN_KEY,
    SHIPHUB_LOGIN_KEY: LOGIN_KEY,
    BI_MASTERDATA_CLIENT_ID: 'client-id',
    BI_MASTERDATA_CLIENT_SECRET: 'client-secret',
    BI_MASTERDATA_API_KEY: 'api-key-masterdata',
    BI_MASTERDATA_LOGIN_KEY: LOGIN_KEY,
    BI_MASTERDATA_LOGIN_USERNAME_ENC: await encrypted('CHU13'),
    BI_MASTERDATA_LOGIN_PASSWORD_ENC: await encrypted('secret'),
    BI_PERFECO_API_KEY: 'api-key-perfeco',
    BI_SPD_API_KEY: 'api-key-spd'
  } as unknown as WorkerEnv
}

// 捕获所有出站请求 URL，返回最小可用的 perfeco/SPD 响应。
function captureFetch() {
  const urls: string[] = []
  const original = globalThis.fetch
  globalThis.fetch = (async (url: any) => {
    const target = String(url)
    urls.push(target)
    if (target.includes('/perfeco/')) {
      return new Response(JSON.stringify({ date_list: [{ agg_level_list: [] }] }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    if (target.includes('/consolidated_spd/')) {
      return new Response('', { status: 200 })
    }
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof globalThis.fetch
  return { urls, restore: () => { globalThis.fetch = original } }
}

test('perfecoDate 把 ISO 日期转成上游要求的 yyyyMMdd', () => {
  assert.equal(perfecoDate('2026-09-08'), '20260908')
  assert.equal(perfecoDate('2026-01-01'), '20260101')
  // 已经是紧凑格式时幂等（防重复转换）
  assert.equal(perfecoDate('20260908'), '20260908')
})

test('syncBikeDay 请求 perfeco 时 from/to 必须是 yyyyMMdd（不再是 yyyy-MM-dd）', async () => {
  const env = await environment()
  const captured = captureFetch()
  try {
    await syncBikeDay(env, {
      storeId: 'store-1',
      storeCode: '1299',
      businessDate: '2026-09-08',
      now: NOW,
      jwtProvider: async () => 'jwt-token'
    })
  } finally {
    captured.restore()
  }
  const perfecoUrl = captured.urls.find((url) => url.includes('/perfeco/'))
  assert.ok(perfecoUrl, '必须发起过 perfeco 请求')
  assert.match(perfecoUrl!, /from=20260908/u, 'from 必须是 yyyyMMdd')
  assert.match(perfecoUrl!, /to=20260908/u, 'to 必须是 yyyyMMdd')
  assert.doesNotMatch(perfecoUrl!, /from=2026-09-08/u, '禁止再发带横线的旧格式')
})

test('getStoreWeek 请求 perfeco 用 yyyyMMdd，但 SPD 仍用 yyyy-MM-dd', async () => {
  const env = await environment()
  const captured = captureFetch()
  try {
    await getStoreWeek(env, {
      storeId: 'store-1',
      storeCode: '1299',
      from: '2026-08-30',
      to: '2026-09-05',
      now: NOW,
      jwtProvider: async () => 'jwt-token'
    })
  } finally {
    captured.restore()
  }
  const perfecoUrl = captured.urls.find((url) => url.includes('/perfeco/'))
  assert.ok(perfecoUrl, '必须发起过 perfeco 请求')
  assert.match(perfecoUrl!, /from=20260830/u)
  assert.match(perfecoUrl!, /to=20260905/u)

  const spdUrl = captured.urls.find((url) => url.includes('/consolidated_spd/'))
  assert.ok(spdUrl, '必须发起过 SPD 请求')
  assert.match(spdUrl!, /from\/2026-08-30\/to\/2026-09-05/u, 'SPD 路径参数保持 yyyy-MM-dd')
  assert.doesNotMatch(spdUrl!, /from\/20260830/u, 'SPD 禁止改成紧凑格式')
})

test('源码层锁死：perfeco 日期转换只在请求层做，内部缓存键仍是 ISO', async () => {
  const source = await readFile(new URL('../src/services/bi-bikes.ts', import.meta.url), 'utf8')
  assert.match(source, /export function perfecoDate/u)
  assert.match(source, /key === 'from' \|\| key === 'to'/u, '日期转换必须只作用于 from/to 参数')
  assert.match(source, /replaceAll\('-', ''\)/u)
  // 缓存键仍用 ISO，避免历史缓存全部失效
  assert.match(source, /store:\$\{options\.from\}:\$\{options\.to\}/u)
})

test('loadConfig 读到两个独立 key（perfeco 与 spd 不可混用）', async () => {
  const env = await environment()
  const { loadConfig } = await import('../src/env.js')
  const config: AppConfig = loadConfig(env)
  assert.equal(config.MASTERDATA.perfecoApiKey, 'api-key-perfeco')
  assert.equal(config.MASTERDATA.spdApiKey, 'api-key-spd')
  assert.notEqual(config.MASTERDATA.perfecoApiKey, config.MASTERDATA.spdApiKey)
})
