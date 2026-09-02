import assert from 'node:assert/strict'
import test from 'node:test'
import { encryptShipHubSecret } from '../src/lib/shiphub-crypto.js'
import { BI_SEED_CODES, listBiSkuNames, syncBiSkuNames, latestSyncedAt } from '../src/services/bi-sku-sync.js'
import { isMasterDataConfigured, loadConfig, type WorkerEnv } from '../src/env.js'
import { migratedTestDatabase, type TestD1Database } from '../security/d1-test-adapter.js'

const LOGIN_KEY = Buffer.from('b'.repeat(32)).toString('base64')
function blob(plain: string): Promise<string> {
  return encryptShipHubSecret(plain, LOGIN_KEY).then(({ ciphertext, nonce }) => `${ciphertext}.${nonce}`)
}

const MASTERDATA_ITEM = {
  label: '26"EXPL 900 HD CN RED',
  production_label: '26"EXPL 900 HD CN RED',
  conception_code: '00375023',
  r3code: '8984793',
  product_type: 'Z001',
  store_treeview: { universe_id: 2 },
  specifications: { is_repairable: '1' }
}

async function makeEnv(): Promise<WorkerEnv> {
  const db = await migratedTestDatabase()
  return {
    DB: db,
    ASSETS: {} as Fetcher,
    APP_ENV: 'staging',
    APP_VERSION: '6.4.3',
    COOKIE_SECURE: 'true',
    SESSION_TTL_HOURS: '12',
    SESSION_SECRET: 'x'.repeat(32),
    CSRF_SECRET: 'y'.repeat(32),
    PASSWORD_PEPPER: 'z'.repeat(32),
    BI_MASTERDATA_CLIENT_ID: 'cid',
    BI_MASTERDATA_CLIENT_SECRET: 'sec',
    BI_MASTERDATA_API_KEY: 'api-key-md',
    BI_MASTERDATA_LOGIN_KEY: LOGIN_KEY,
    BI_MASTERDATA_LOGIN_USERNAME_ENC: await blob('CHU13'),
    BI_MASTERDATA_LOGIN_PASSWORD_ENC: await blob('Pass/123')
  } as unknown as WorkerEnv
}

test('BI_SEED_CODES 与 2026-09-02 masterdata 官方确认的 33 码一致', () => {
  assert.equal(BI_SEED_CODES.length, 33)
  assert.ok(BI_SEED_CODES.includes('8984793'))
  assert.ok(BI_SEED_CODES.includes('9002783'))
  assert.ok(BI_SEED_CODES.includes('8733846'))
  assert.ok(BI_SEED_CODES.includes('8987064'))
})

test('isMasterDataConfigured：凭据齐全才放行', async () => {
  const env = await makeEnv()
  assert.ok(isMasterDataConfigured(loadConfig(env).MASTERDATA))
  const partial = { ...env, BI_MASTERDATA_API_KEY: undefined } as WorkerEnv
  assert.equal(isMasterDataConfigured(loadConfig(partial as WorkerEnv).MASTERDATA), false)
})

test('syncBiSkuNames：登录 + 批量拉取 + 落库 upsert，陈旧度守卫生效', async () => {
  const env = await makeEnv()
  const originalFetch = globalThis.fetch
  const fetchUrls: string[] = []
  let authHeaders = ''
  globalThis.fetch = (async (url: any, init?: any) => {
    const u = String(url)
    fetchUrls.push(u)
    if (u.includes('/as/authorization.oauth2')) {
      const html = `<html><body><form method="post" action="/as/r/resume/as/authorization.ping">
      <input type="hidden" name="pf.adapterId" value="DataHtmlForm"><input type="text" name="pf.username"><input type="password" name="pf.pass"></form></body></html>`
      return { url: u, ok: true, status: 200, text: async () => html, json: async () => ({}), headers: new Headers({ 'set-cookie': 'PF=s' }) } as unknown as Response
    }
    if (u.includes('/resume/as/authorization.ping')) {
      const state = new URL(fetchUrls[0]).searchParams.get('state') ?? ''
      return { url: u, ok: false, status: 302, text: async () => '', json: async () => ({}), headers: new Headers({ location: `com.decathlon.authentication://com.oxylane.android.cubeinstore?code=CD&state=${state}` }) } as unknown as Response
    }
    if (u.includes('/as/token.oauth2')) {
      return { url: u, ok: true, status: 200, text: async () => '', json: async () => ({ access_token: 'jwt-md' }), headers: new Headers() } as unknown as Response
    }
    if (u.includes('/masterdata/v2/modelslist/')) {
      authHeaders = String(init?.headers?.authorization ?? '') + '|' + String(init?.headers?.['x-api-key'] ?? '') + '|' + String(init?.headers?.['target-country'] ?? '')
      // 两块（33 码 / 20）都回同一确认项
      return { url: u, ok: true, status: 200, text: async () => '', json: async () => [MASTERDATA_ITEM], headers: new Headers() } as unknown as Response
    }
    throw new Error(`unexpected ${u}`)
  }) as typeof fetch
  try {
    const result = await syncBiSkuNames(env, { trigger: 'manual', force: true })
    assert.equal(result.status, 'succeeded')
    // 33 码 → 2 块批量
    const batchCalls = fetchUrls.filter((u) => u.includes('/masterdata/v2/modelslist/'))
    assert.equal(batchCalls.length, 2)
    assert.match(batchCalls[0], /modelslist\/[\d,]+\/infos/u)
    assert.equal(authHeaders, 'Bearer jwt-md|api-key-md|CN', 'masterdata 头：JWT + key + target-country')
    const rows = await listBiSkuNames(env.DB as unknown as D1Database)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].code, '8984793')
    assert.equal(rows[0].label, '26"EXPL 900 HD CN RED')
    assert.equal(rows[0].conception_code, '00375023')
    assert.ok(latestSyncedAt(rows))
    // 陈旧度守卫：非 force 直接 skip
    const skipped = await syncBiSkuNames(env, { trigger: 'scheduled' })
    assert.deepEqual(skipped, { status: 'skipped', reason: 'FRESH' })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('syncBiSkuNames：未配置凭据时优雅跳过', async () => {
  const env = await makeEnv()
  const bare = { ...env, BI_MASTERDATA_CLIENT_ID: undefined, BI_MASTERDATA_CLIENT_SECRET: undefined } as WorkerEnv
  const result = await syncBiSkuNames(bare, { trigger: 'scheduled' })
  assert.deepEqual(result, { status: 'skipped', reason: 'MASTERDATA_NOT_CONFIGURED' })
})

test('syncBiSkuNames：extraCodes 纳入同步且非法码被拒', async () => {
  const env = await makeEnv()
  const originalFetch = globalThis.fetch
  const fetchedCodes: string[] = []
  const fetchUrls: string[] = []
  globalThis.fetch = (async (url: any, init?: any) => {
    const u = String(url)
    fetchUrls.push(u)
    if (u.includes('/as/authorization.oauth2')) {
      const html = `<html><body><form method="post" action="/as/r2/resume/as/authorization.ping">
      <input type="hidden" name="pf.adapterId" value="DataHtmlForm"><input type="text" name="pf.username"><input type="password" name="pf.pass"></form></body></html>`
      return { url: u, ok: true, status: 200, text: async () => html, json: async () => ({}), headers: new Headers({ 'set-cookie': 'PF=s' }) } as unknown as Response
    }
    if (u.includes('/resume/as/authorization.ping')) {
      const state = new URL(fetchUrls[0]).searchParams.get('state') ?? ''
      return { url: u, ok: false, status: 302, text: async () => '', json: async () => ({}), headers: new Headers({ location: `com.decathlon.authentication://com.oxylane.android.cubeinstore?code=CD&state=${state}` }) } as unknown as Response
    }
    if (u.includes('/as/token.oauth2')) {
      return { url: u, ok: true, status: 200, text: async () => '', json: async () => ({ access_token: 'jwt-md' }), headers: new Headers() } as unknown as Response
    }
    const match = /modelslist\/([\d,]+)\/infos/u.exec(u)
    if (match) {
      fetchedCodes.push(...match[1].split(','))
      const items = match[1].split(',').map((code) => ({ ...MASTERDATA_ITEM, r3code: code, label: `LABEL-${code}` }))
      return { url: u, ok: true, status: 200, text: async () => '', json: async () => items, headers: new Headers() } as unknown as Response
    }
    throw new Error(`unexpected ${u}`)
  }) as typeof fetch
  try {
    await syncBiSkuNames(env, { trigger: 'manual', force: true, extraCodes: ['8123456', 'not-a-code'] })
    assert.ok(fetchedCodes.includes('8123456'), 'extraCodes 合法码必须被同步')
    assert.ok(!fetchedCodes.some((code) => code === 'not-a-code' || code === 'NaN'), '非法码不得进入上游')
    const rows = await listBiSkuNames(env.DB as unknown as D1Database)
    assert.ok(rows.some((row) => row.code === '8123456' && row.label === 'LABEL-8123456'))
  } finally {
    globalThis.fetch = originalFetch
  }
})
