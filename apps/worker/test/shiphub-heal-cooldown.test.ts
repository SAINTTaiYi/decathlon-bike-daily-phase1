import assert from 'node:assert/strict'
import test from 'node:test'
import type { AppConfig } from '../src/env.js'
import { encryptShipHubSecret } from '../src/lib/shiphub-crypto.js'
import { syncStoreCategory, runScheduledShipHubSync } from '../src/services/shiphub-sync.js'
import { ensureStoreCubeJwt, probeStoreCubeIdentity } from '../src/services/cube-identity.js'
import type { WorkerEnv } from '../src/env.js'
import { migratedTestDatabase, type TestD1Database } from '../security/d1-test-adapter.js'

// ── 自愈冷却专用列（2026-09-08 三功能失效事故回归）──
// 事故：heal 冷却复用 shiphub_connections.updated_at，而 cube token 每小时刷新、
// 手动同步失败、token 轮换都写同一列，把 30 分钟冷却实际推成 40-45 分钟；
// 门店 token 死亡期间待取车看板与 BI 拉取整段停摆，用户手动同步 4 连 400
// 只能干等冷却。迁移 0028 引入专用列 heal_last_attempted_at 彻底解耦。

const STORE = 'heal-cooldown-store'
const NOW = new Date('2026-08-19T04:00:00.000Z') // 北京 12:00 营业时间内

const HEAL_LOGIN_KEY = Buffer.from('h'.repeat(32)).toString('base64')
const HEAL_TOKEN_KEY = Buffer.from('t'.repeat(32)).toString('base64')
const healBlob = (plain: string) => encryptShipHubSecret(plain, HEAL_LOGIN_KEY).then(({ ciphertext, nonce }) => `${ciphertext}.${nonce}`)

const base: AppConfig = {
  APP_ENV: 'staging',
  APP_VERSION: '6.7.7',
  GIT_SHA: 'test',
  COOKIE_SECURE: true,
  SESSION_TTL_HOURS: 12,
  allowedOrigins: ['https://example.test'],
  SESSION_SECRET: 'x'.repeat(32),
  CSRF_SECRET: 'y'.repeat(32),
  PASSWORD_PEPPER: 'z'.repeat(32),
  SHIPHUB: {
    enabled: true,
    mode: 'live',
    liveConfirmed: true,
    requestTimeoutMs: 1000,
    activeStartHour: 10,
    activeEndHour: 22,
    tokenEncryptionKey: HEAL_TOKEN_KEY,
    loginKey: HEAL_LOGIN_KEY,
    oauthAuthorizeUrl: 'https://shiphub-idp.test/as/authorization.oauth2',
    oauthTokenUrl: 'https://shiphub-idp.test/as/token.oauth2',
    oauthClientId: 'cid',
    oauthBasicToken: 'dGVzdDp0ZXN0',
    oauthRedirectUri: 'https://app.test/cb'
  }
}

async function database(): Promise<TestD1Database> {
  const db = await migratedTestDatabase()
  db.exec(`INSERT INTO stores (id, code, name, timezone, status, created_at, updated_at) VALUES ('${STORE}', 'HEAL', 'Heal Store', 'Asia/Shanghai', 'active', '2026-08-18T00:00:00.000Z', '2026-08-18T00:00:00.000Z')`)
  return db
}

async function healEnv(db: TestD1Database): Promise<WorkerEnv> {
  return {
    DB: db as unknown as D1Database,
    SHIPHUB_ENABLED: 'true',
    SHIPHUB_MODE: 'live',
    SHIPHUB_OAUTH_AUTHORIZE_URL: 'https://shiphub-idp.test/as/authorization.oauth2',
    SHIPHUB_OAUTH_TOKEN_URL: 'https://shiphub-idp.test/as/token.oauth2',
    SHIPHUB_OAUTH_CLIENT_ID: 'cid',
    SHIPHUB_OAUTH_BASIC_TOKEN: 'dGVzdDp0ZXN0',
    SHIPHUB_OAUTH_REDIRECT_URI: 'https://app.test/cb',
    SHIPHUB_OAUTH_SCOPE: 'openid profile',
    SHIPHUB_LOGIN_KEY: HEAL_LOGIN_KEY,
    SHIPHUB_TOKEN_ENCRYPTION_KEY: HEAL_TOKEN_KEY,
    SESSION_SECRET: 'x'.repeat(32),
    CSRF_SECRET: 'y'.repeat(32),
    PASSWORD_PEPPER: 'z'.repeat(32)
  } as unknown as WorkerEnv
}

// 登录链路 mock：授权页表单 → code 捕获 → PKCE 交换；refresh 授权可配置前 N 次 400；
// 数据面（count/list/detail）一律抛错——本组测试只关心身份链路。
function mockShipHubUpstream(refreshFailures = 0) {
  let logins = 0
  let refreshes = 0
  let lastAuthorizeUrl = ''
  const original = globalThis.fetch
  const respond = (url: string, payload: unknown, status = 200) => ({
    url, ok: status >= 200 && status < 300, status,
    text: async () => JSON.stringify(payload),
    json: async () => payload,
    headers: new Headers()
  }) as unknown as Response
  globalThis.fetch = (async (url: any, init?: any) => {
    const u = String(url)
    const body = String(init?.body ?? '')
    if (u.includes('/authorization.oauth2')) {
      lastAuthorizeUrl = u
      const html = '<html><body><form method="post" action="/as/tok/resume/as/authorization.ping"><input name="pf.ok" value="1"><input name="pf.username" value=""><input name="pf.pass" value=""></form></body></html>'
      return { url: u, ok: true, status: 200, text: async () => html, json: async () => ({}), headers: new Headers() } as unknown as Response
    }
    if (u.includes('/resume/as/authorization.ping')) {
      const state = new URL(lastAuthorizeUrl).searchParams.get('state') ?? ''
      return { url: `https://app.test/cb?code=CD&state=${encodeURIComponent(state)}`, ok: true, status: 200, text: async () => '', json: async () => ({}), headers: new Headers() } as unknown as Response
    }
    if (u.includes('/token.oauth2')) {
      if (body.includes('grant_type=refresh_token')) {
        refreshes += 1
        if (refreshes <= refreshFailures) return respond(u, { error: 'invalid_grant' }, 400)
        return respond(u, { access_token: 'at-ok', refresh_token: 'rt-rotated', expires_in: 3600 })
      }
      logins += 1
      return respond(u, { access_token: 'at-login', refresh_token: 'rt-healed', expires_in: 3600 })
    }
    throw new Error('synthetic data-plane failure')
  }) as typeof fetch
  return { restore: () => { globalThis.fetch = original }, logins: () => logins, refreshes: () => refreshes }
}

test('自愈冷却用专用列：updated_at 刚被写过（cube 刷新/手动失败）也不得阻塞自愈', async () => {
  const db = await database()
  const [userEnc, passEnc] = await Promise.all([healBlob('store-user'), healBlob('store-pass')])
  // updated_at = 一分钟前（旧实现会因此把自愈再推迟 30 分钟——事故根因）
  db.exec(`INSERT INTO shiphub_connections (store_id, enabled, mode, refresh_token_ciphertext, refresh_token_nonce, refresh_token_key_version, login_username_enc, login_password_enc, login_key_version, location_num, identity_fingerprint, authorization_status, created_at, updated_at)
           VALUES ('${STORE}', 1, 'live', '${'A'.repeat(78)}', '${'B'.repeat(16)}', 'v1', '${userEnc}', '${passEnc}', 'v1', '1299', 'fp-heal-1', 'reauth_required', '2026-08-18T00:00:00.000Z', '2026-08-19T03:59:00.000Z')`)
  const mocked = mockShipHubUpstream()
  try {
    await runScheduledShipHubSync(await healEnv(db), NOW)
    const conn = db.one<{ status: string; healed: string | null }>(`SELECT authorization_status AS status, heal_last_attempted_at AS healed FROM shiphub_connections WHERE store_id = '${STORE}'`)
    assert.equal(conn?.status, 'connected', 'updated_at 一分钟前不得阻塞自愈（2026-09-08 事故根因：cube 刷新把冷却推后）')
    assert.ok(conn?.healed, '自愈时间戳必须落专用列 heal_last_attempted_at')
    assert.equal(mocked.logins(), 1, '恰好一次程序化重登')
  } finally {
    mocked.restore()
    db.close()
  }
})

test('自愈失败退避：SELF_HEAL_FAILED 且专用列未满 30 分钟不得再打登录', async () => {
  const db = await database()
  const [userEnc, passEnc] = await Promise.all([healBlob('store-user'), healBlob('store-pass')])
  // 10 分钟前自愈失败过：退避期内（30 分钟）不得重试
  db.exec(`INSERT INTO shiphub_connections (store_id, enabled, mode, refresh_token_ciphertext, refresh_token_nonce, refresh_token_key_version, login_username_enc, login_password_enc, login_key_version, location_num, identity_fingerprint, authorization_status, last_auth_error_code, heal_last_attempted_at, created_at, updated_at)
           VALUES ('${STORE}', 1, 'live', '${'A'.repeat(78)}', '${'B'.repeat(16)}', 'v1', '${userEnc}', '${passEnc}', 'v1', '1299', 'fp-heal-2', 'reauth_required', 'SELF_HEAL_FAILED', '2026-08-19T03:50:00.000Z', '2026-08-18T00:00:00.000Z', '2026-08-18T00:00:00.000Z')`)
  const mocked = mockShipHubUpstream()
  try {
    await runScheduledShipHubSync(await healEnv(db), NOW)
    assert.equal(mocked.logins(), 0, '退避期内绝不能打上游登录（上游登录有风控）')
    const conn = db.one<{ status: string }>(`SELECT authorization_status AS status FROM shiphub_connections WHERE store_id = '${STORE}'`)
    assert.equal(conn?.status, 'reauth_required', '退避期保持 reauth_required')
  } finally {
    mocked.restore()
    db.close()
  }
})

test('手动同步遇 OAUTH_TOKEN_HTTP_400：内联程序化重登后重试，不再干等自愈冷却', async () => {
  const db = await database()
  const [userEnc, passEnc] = await Promise.all([healBlob('store-user'), healBlob('store-pass')])
  // 有效密文的死 token：解密成功但 refresh 400（复刻线上 4 连 400 现场）
  const dead = await encryptShipHubSecret('rt-dead', HEAL_TOKEN_KEY)
  db.exec(`INSERT INTO shiphub_connections (store_id, enabled, mode, refresh_token_ciphertext, refresh_token_nonce, refresh_token_key_version, login_username_enc, login_password_enc, login_key_version, location_num, identity_fingerprint, authorization_status, created_at, updated_at)
           VALUES ('${STORE}', 1, 'live', '${dead.ciphertext}', '${dead.nonce}', 'v1', '${userEnc}', '${passEnc}', 'v1', '1299', 'fp-heal-3', 'connected', '2026-08-18T00:00:00.000Z', '2026-08-18T00:00:00.000Z')`)
  const mocked = mockShipHubUpstream(1) // 首次 refresh 400；重登后重试的 refresh 成功
  try {
    const result = await syncStoreCategory(db as unknown as D1Database, base, STORE, 'hand', {
      trigger: 'manual', batchId: 'inline-relogin-batch', now: NOW
    })
    // 数据面 mock 抛错 → 最终 failed，但 reason 必须不再是 400（证明重登+重试已发生）
    assert.equal(result.status, 'failed')
    assert.equal(result.reason, 'SYNC_FAILED', '400 后必须内联重登并重试（重试失败于数据面而非身份）')
    assert.equal(mocked.logins(), 1, '恰好一次程序化重登')
    const conn = db.one<{ status: string }>(`SELECT authorization_status AS status FROM shiphub_connections WHERE store_id = '${STORE}'`)
    assert.equal(conn?.status, 'connected', '内联重登必须当场恢复 connected')
    const runs = db.query(`SELECT error_code FROM shiphub_sync_runs WHERE store_id = '${STORE}' AND category = 'hand' ORDER BY started_at ASC`) as Array<{ error_code: string | null }>
    assert.equal(runs.length, 2, '必须留下两条运行记录（首次 400 + 重登后重试）')
    assert.equal(runs[0]?.error_code, 'OAUTH_TOKEN_HTTP_400')
    assert.equal(runs[1]?.error_code, 'SYNC_FAILED')
  } finally {
    mocked.restore()
    db.close()
  }
})

// ── cube 写库与 updated_at 解耦（同一事故的 BI 侧根因）──
const STORE_CUBE = '30000000-0000-4000-8000-000000004444'

async function cubeEnv(db: TestD1Database): Promise<WorkerEnv> {
  return {
    DB: db as unknown as D1Database,
    APP_ENV: 'staging',
    APP_VERSION: '6.7.7',
    COOKIE_SECURE: 'true',
    SESSION_TTL_HOURS: '12',
    SESSION_SECRET: 'x'.repeat(32),
    CSRF_SECRET: 'y'.repeat(32),
    PASSWORD_PEPPER: 'z'.repeat(32),
    SHIPHUB_LOGIN_KEY: HEAL_LOGIN_KEY,
    SHIPHUB_TOKEN_ENCRYPTION_KEY: HEAL_TOKEN_KEY,
    BI_MASTERDATA_CLIENT_ID: 'cid',
    BI_MASTERDATA_CLIENT_SECRET: 'sec'
  } as unknown as WorkerEnv
}

function mockCubeLogin(tokenResponse: () => unknown) {
  let lastAuthorizeUrl = ''
  const original = globalThis.fetch
  globalThis.fetch = (async (url: any) => {
    const u = String(url)
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
    throw new Error(`unexpected fetch: ${u}`)
  }) as typeof fetch
  return { restore: () => { globalThis.fetch = original } }
}

test('cube 写库不碰 updated_at（自愈冷却解耦回归，2026-09-08 事故）', async () => {
  const db = await database()
  const [userEnc, passEnc] = await Promise.all([healBlob('cube-user'), healBlob('cube-pass')])
  db.exec(`INSERT INTO stores (id, code, name, timezone, status, created_at, updated_at) VALUES ('${STORE_CUBE}', '4444', 'Cube Store', 'Asia/Shanghai', 'active', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`)
  db.exec(`INSERT INTO shiphub_connections (store_id, enabled, mode, authorization_status, login_username_enc, login_password_enc, login_key_version, created_at, updated_at)
           VALUES ('${STORE_CUBE}', 1, 'live', 'connected', '${userEnc}', '${passEnc}', 'v1', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`)
  const env = await cubeEnv(db)
  let fail = true
  const mocked = mockCubeLogin(() => (fail ? 'FAIL' : { access_token: 'jwt-recovered', expires_in: 7200 }))
  try {
    // 失败路径：cube_auth_checked_at 前进，updated_at 不动
    assert.equal(await ensureStoreCubeJwt(env, STORE_CUBE), null)
    let row = db.one<{ updated_at: string; checked: string | null }>(`SELECT updated_at, cube_auth_checked_at AS checked FROM shiphub_connections WHERE store_id = '${STORE_CUBE}'`)
    assert.equal(row?.updated_at, '2026-01-01T00:00:00Z', '失败写库不得碰 updated_at（该列曾被自愈冷却复用）')
    assert.ok(row?.checked && row.checked !== '2026-01-01T00:00:00Z', '失败时间戳必须写专用列')
    // 成功路径：token 落库同样不碰 updated_at
    fail = false
    const probed = await probeStoreCubeIdentity(env, STORE_CUBE)
    assert.equal(probed.status, 'available')
    row = db.one<{ updated_at: string; token: string | null }>(`SELECT updated_at, cube_token_ciphertext AS token FROM shiphub_connections WHERE store_id = '${STORE_CUBE}'`)
    assert.equal(row?.updated_at, '2026-01-01T00:00:00Z', 'token 落库不得碰 updated_at')
    assert.ok(row?.token, 'token 密文必须落库')
  } finally {
    mocked.restore()
    db.close()
  }
})
