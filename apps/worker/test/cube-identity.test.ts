import assert from 'node:assert/strict'
import test from 'node:test'
import { encryptShipHubSecret } from '../src/lib/shiphub-crypto.js'
import { ensureStoreCubeJwt, getCubeIdentityInfo, probeStoreCubeIdentity } from '../src/services/cube-identity.js'
import { runScheduledBiSync } from '../src/services/bi-weekly.js'
import { migratedTestDatabase } from '../security/d1-test-adapter.js'
import type { WorkerEnv } from '../src/env.js'

const LOGIN_KEY = Buffer.from('a'.repeat(32)).toString('base64')
const TOKEN_KEY = Buffer.from('b'.repeat(32)).toString('base64')
function blob(plain: string): Promise<string> {
  return encryptShipHubSecret(plain, LOGIN_KEY).then(({ ciphertext, nonce }) => `${ciphertext}.${nonce}`)
}

const STORE_1299 = '30000000-0000-4000-8000-000000001299'
const STORE_OTHER = '30000000-0000-4000-8000-000000004444'

async function makeEnv(): Promise<WorkerEnv> {
  const db = await migratedTestDatabase()
  await db.prepare(`INSERT INTO stores (id, code, name, timezone, status, created_at, updated_at) VALUES (?, '4444', '门店 4444', 'Asia/Shanghai', 'active', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`).bind(STORE_OTHER).run()
  return {
    DB: db,
    ASSETS: {} as Fetcher,
    APP_ENV: 'staging',
    APP_VERSION: '6.7.1',
    COOKIE_SECURE: 'true',
    SESSION_TTL_HOURS: '12',
    SESSION_SECRET: 'x'.repeat(32),
    CSRF_SECRET: 'y'.repeat(32),
    PASSWORD_PEPPER: 'z'.repeat(32),
    SHIPHUB_LOGIN_KEY: LOGIN_KEY,
    SHIPHUB_TOKEN_ENCRYPTION_KEY: TOKEN_KEY,
    BI_MASTERDATA_CLIENT_ID: 'cid',
    BI_MASTERDATA_CLIENT_SECRET: 'sec',
    BI_MASTERDATA_API_KEY: 'api-key-md',
    BI_MASTERDATA_LOGIN_KEY: LOGIN_KEY,
    BI_MASTERDATA_LOGIN_USERNAME_ENC: await blob('CHU13'),
    BI_MASTERDATA_LOGIN_PASSWORD_ENC: await blob('Pass/123'),
    BI_PERFECO_API_KEY: 'api-key-perfeco',
    BI_SPD_API_KEY: 'api-key-spd',
    BI_SYNC_STORE_CODES: '1299'
  } as unknown as WorkerEnv
}

async function seedConnection(db: D1Database, storeId: string, withLogin: boolean): Promise<void> {
  const [userEnc, passEnc] = withLogin ? await Promise.all([blob('STORE4444'), blob('Secret/9')]) : [null, null]
  await db.prepare(`
    INSERT INTO shiphub_connections (store_id, enabled, mode, authorization_status, login_username_enc, login_password_enc, login_key_version, created_at, updated_at)
    VALUES (?, 1, 'live', 'connected', ?, ?, 'v1', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')
  `).bind(storeId, userEnc, passEnc).run()
}

// Cube 登录三段 mock：授权页表单 → 302 自定义 scheme → token 兑换。
function mockLogin(tokenResponse: () => unknown) {
  const calls: string[] = []
  let lastAuthorizeUrl = ''
  const original = globalThis.fetch
  globalThis.fetch = (async (url: any, init?: any) => {
    const u = String(url)
    calls.push(u)
    if (u.includes('/as/authorization.oauth2')) {
      lastAuthorizeUrl = u
      const html = '<html><body><form method="post" action="/as/r/resume/as/authorization.ping"><input name="pf.username"><input name="pf.pass"></form></body></html>'
      return { url: u, ok: true, status: 200, text: async () => html, json: async () => ({}), headers: new Headers({ 'set-cookie': 'PF=s' }) } as unknown as Response
    }
    if (u.includes('/resume/as/authorization.ping')) {
      const state = new URL(lastAuthorizeUrl).searchParams.get('state') ?? ''
      return { url: u, ok: false, status: 302, text: async () => '', json: async () => ({}), headers: new Headers({ location: `com.decathlon.authentication://app?code=CD&state=${state}` }) } as unknown as Response
    }
    if (u.includes('/as/token.oauth2')) {
      const body = tokenResponse()
      const ok = body !== 'FAIL'
      return { url: u, ok, status: ok ? 200 : 500, text: async () => '', json: async () => (ok ? body : { error: 'x' }), headers: new Headers() } as unknown as Response
    }
    if (u.includes('/perfeco/')) {
      return { url: u, ok: true, status: 200, text: async () => '', json: async () => ({}), headers: new Headers() } as unknown as Response
    }
    if (u.includes('/consolidated_spd/')) {
      return { url: u, ok: true, status: 200, text: async () => '', json: async () => ({}), headers: new Headers() } as unknown as Response
    }
    throw new Error(`unexpected fetch: ${u}`)
  }) as typeof fetch
  const loginCalls = () => calls.filter((u) => u.includes('/as/token.oauth2'))
  return { restore: () => { globalThis.fetch = original }, calls, loginCalls }
}

test('ensureStoreCubeJwt：无连接行/无凭据 → null + 不打上游', async () => {
  const env = await makeEnv()
  const mocked = mockLogin(() => ({ access_token: 'jwt-1' }))
  try {
    assert.equal(await ensureStoreCubeJwt(env, STORE_OTHER), null)
    const info = await getCubeIdentityInfo(env.DB, STORE_OTHER)
    assert.equal(info.hasCredentials, false)
    assert.equal(info.status, 'unavailable')
    // 未写 CUBE_CREDENTIALS_MISSING（无连接行时只读不写）
    assert.equal(mocked.loginCalls().length, 0, '绝不能打 IdP')
    // 有连接行但无本店凭据 → 状态写入 unavailable
    await seedConnection(env.DB, STORE_OTHER, false)
    assert.equal(await ensureStoreCubeJwt(env, STORE_OTHER), null)
    const info2 = await getCubeIdentityInfo(env.DB, STORE_OTHER)
    assert.equal(info2.hasCredentials, false)
    assert.equal(mocked.loginCalls().length, 0, '无凭据绝不能打 IdP')
  } finally {
    mocked.restore()
  }
})

test('ensureStoreCubeJwt：本店凭据登录成功 → token 落库 + 缓存命中零重登', async () => {
  const env = await makeEnv()
  await seedConnection(env.DB, STORE_OTHER, true)
  const mocked = mockLogin(() => ({ access_token: 'jwt-store-4444', expires_in: 7200 }))
  try {
    const jwt1 = await ensureStoreCubeJwt(env, STORE_OTHER)
    assert.equal(jwt1, 'jwt-store-4444')
    assert.equal(mocked.loginCalls().length, 1, '首次必须登录一次')
    const info = await getCubeIdentityInfo(env.DB, STORE_OTHER)
    assert.equal(info.status, 'available')
    assert.equal(info.hasCredentials, true)
    assert.equal(info.errorCode, null)
    // 第二次调用：90 分钟窗口内命中缓存，零登录
    const jwt2 = await ensureStoreCubeJwt(env, STORE_OTHER)
    assert.equal(jwt2, 'jwt-store-4444')
    assert.equal(mocked.loginCalls().length, 1, '缓存命中不得重登')
    // token 密文必须用 tokenEncryptionKey 加密（与 refresh token 同纪律）
    const row = await env.DB.prepare('SELECT cube_token_ciphertext, cube_token_nonce FROM shiphub_connections WHERE store_id = ?').bind(STORE_OTHER).first() as any
    assert.ok(row?.cube_token_ciphertext && row?.cube_token_nonce, 'token 必须落库加密存储')
  } finally {
    mocked.restore()
  }
})

test('ensureStoreCubeJwt：登录失败 → unavailable + 10 分钟冷却不再打 IdP', async () => {
  const env = await makeEnv()
  await seedConnection(env.DB, STORE_OTHER, true)
  let fail = true
  const mocked = mockLogin(() => (fail ? 'FAIL' : { access_token: 'jwt-recovered' }))
  try {
    assert.equal(await ensureStoreCubeJwt(env, STORE_OTHER), null)
    const info = await getCubeIdentityInfo(env.DB, STORE_OTHER)
    assert.equal(info.status, 'unavailable')
    assert.match(info.errorCode ?? '', /OAUTH_TOKEN_HTTP_500/u)
    // 冷却期内重试：绝不打 IdP
    assert.equal(await ensureStoreCubeJwt(env, STORE_OTHER), null)
    assert.equal(mocked.loginCalls().length, 1, '冷却期内不得重试登录')
    // probe（skipFailureCooldown）：跳过冷却立即重试，凭据恢复后探测成功
    fail = false
    const probed = await probeStoreCubeIdentity(env, STORE_OTHER)
    assert.equal(probed.status, 'available', 'probe 恢复后状态必须回 available')
    assert.equal(mocked.loginCalls().length, 2, 'probe 必须绕过冷却重试')
  } finally {
    mocked.restore()
  }
})

test('cron：白名单外但有本店凭据的店被纳入同步（凭据属于谁就只拉谁）', async () => {
  const env = await makeEnv()
  await seedConnection(env.DB, STORE_OTHER, true)
  // 2026-09-06 周日 10:05 北京 = 窗口内；4444 缺 W36 → 应拉取
  let perfecoHitFor4444 = 0
  const mocked = mockLogin(() => ({ access_token: 'jwt-store-4444', expires_in: 7200 }))
  const original = globalThis.fetch
  globalThis.fetch = (async (url: any, init?: any) => {
    const u = String(url)
    if (u.includes('/perfeco/')) {
      if (new URL(u).searchParams.get('stores') === '4444') perfecoHitFor4444 += 1
      const body = { date_list: [{ agg_level_list: [{ id: '4444', quantity: { amount_physical_store: 3 }, turnover: { amount_physical_store: 500 } }] }] }
      return { url: u, ok: true, status: 200, text: async () => JSON.stringify(body), json: async () => body, headers: new Headers() } as unknown as Response
    }
    return original(url, init)
  }) as typeof fetch
  try {
    await runScheduledBiSync(env, new Date('2026-09-06T02:05:00Z'))
    assert.ok(perfecoHitFor4444 > 0, '4444 的 perfeco 查询必须携带本店 storeCode')
  } finally {
    globalThis.fetch = original
    mocked.restore()
  }
})

test('cron：白名单外且无凭据的店绝不拉取（fail-closed 不回归）', async () => {
  const env = await makeEnv()
  await seedConnection(env.DB, STORE_OTHER, false)
  let anyUpstream = 0
  const mocked = mockLogin(() => { anyUpstream += 1; return { access_token: 'jwt-x' } })
  try {
    await runScheduledBiSync(env, new Date('2026-09-06T02:05:00Z'))
    // 1299（白名单）会拉，但任何查询都不得携带 4444
    const hit4444 = mocked.calls.filter((u) => u.includes('4444'))
    assert.equal(hit4444.length, 0, '无凭据门店不得出现在任何上游调用')
  } finally {
    mocked.restore()
  }
})
