import assert from 'node:assert/strict'
import test from 'node:test'
import type { AppConfig, WorkerEnv } from '../src/env.js'
import { encryptShipHubSecret } from '../src/lib/shiphub-crypto.js'
import { readCachedAccessToken } from '../src/lib/shiphub-oauth.js'
import { syncStoreCategory } from '../src/services/shiphub-sync.js'
import { migratedTestDatabase, type TestD1Database } from '../security/d1-test-adapter.js'

// ── OAUTH_TOKEN_HTTP_400 根因修复（2026-09-09）──────────────────────────
// 事故：Shiphub 同步偶发 400 invalid_grant，136 次（最早 2026-08-19）。
// 根因（实测报告 /workspace/oauth-400-rootcause-20260909.md）：
//   同一员工账号有两条独立登录链路——Shiphub 同步与 BI/Cube 身份。上游 refresh
//   token 是**族级**的，重新登录会作废该账号所有旧 RT；BI 重登打废了 Shiphub
//   持有的 RT。放大器是 connectionForSync 每个分类都刷新一次 RT（4 次/分钟），
//   把撞车窗口放大 4 倍。
//
// 三项修复：
//   ① access token 复用——剩余寿命充足时直接复用，不碰 RT 族（撞车概率 -480×）
//   ② scheduled 路径失败后内联重登 + 重试一轮（恢复 60s → 2s）
//   ③ token 4xx 不再立即标 reauth_required，连续失败达阈值才升级

const STORE = 'token-reuse-store'
const LOCATION = '0070129901299'
const FINGERPRINT = 'b'.repeat(64)
const KEY = 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE'

// 上游 token 端点用本地 HTTP 服务模拟：返回 400 invalid_grant，
// 复刻生产真实的 OAUTH_TOKEN_HTTP_400（不是 mock 掉错误码）。
let tokenServer: import('node:http').Server | null = null
let tokenServerUrl = ''
let tokenHits = 0

async function startTokenServer(): Promise<void> {
  const { createServer } = await import('node:http')
  tokenServer = createServer((request, response) => {
    tokenHits += 1
    response.writeHead(400, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ error: 'invalid_grant', error_description: 'unknown, invalid, or expired refresh token' }))
  })
  await new Promise<void>((resolve) => tokenServer!.listen(0, '127.0.0.1', resolve))
  const address = tokenServer!.address()
  if (address && typeof address === 'object') tokenServerUrl = `http://127.0.0.1:${address.port}/token`
}

async function stopTokenServer(): Promise<void> {
  if (!tokenServer) return
  await new Promise<void>((resolve) => tokenServer!.close(() => resolve()))
  tokenServer = null
}

// 上游数据端点模拟服务：count 返回 0（与本地 state 一致 → 不需要拉列表），
// 这样一条同步只需一次 count 请求即可跑完整条 connectionForSync 链路。
let dataServer: import('node:http').Server | null = null
let dataServerUrl = ''
let dataHits = 0

async function startDataServer(): Promise<void> {
  const { createServer } = await import('node:http')
  dataServer = createServer((request, response) => {
    dataHits += 1
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end('0')
  })
  await new Promise<void>((resolve) => dataServer!.listen(0, '127.0.0.1', resolve))
  const address = dataServer!.address()
  if (address && typeof address === 'object') dataServerUrl = `http://127.0.0.1:${address.port}`
}

async function stopDataServer(): Promise<void> {
  if (!dataServer) return
  await new Promise<void>((resolve) => dataServer!.close(() => resolve()))
  dataServer = null
}

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
    tokenEncryptionKey: KEY,
    locationNum: LOCATION,
    oauthTokenUrl: 'about:blank', // 运行时覆盖为本地模拟服务
    oauthBasicToken: 'Basic dGVzdDp0ZXN0'
  }
} as unknown as AppConfig

// 每个用例开始时把 token 端点指向本地模拟服务（返回 400 invalid_grant）
function configWithTokenServer(): AppConfig {
  return { ...base, SHIPHUB: { ...base.SHIPHUB, oauthTokenUrl: tokenServerUrl } } as unknown as AppConfig
}

// 数据端点指向本地模拟服务（token 端点仍指向返回 400 的服务，用于验证「没有调用它」）
function configWithDataServer(): AppConfig {
  return { ...base, SHIPHUB: { ...base.SHIPHUB, baseUrl: dataServerUrl, oauthTokenUrl: tokenServerUrl } } as unknown as AppConfig
}

async function database(): Promise<TestD1Database> {
  const db = await migratedTestDatabase()
  db.exec(`INSERT INTO stores (id, code, name, timezone, status, created_at, updated_at) VALUES ('${STORE}', 'REUSE', 'Reuse Store', 'Asia/Shanghai', 'active', '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z')`)
  return db
}

async function seedConnection(db: TestD1Database, options: { accessToken?: string; accessExpiresAt?: string | null; refreshToken?: string } = {}): Promise<void> {
  const refresh = await encryptShipHubSecret(options.refreshToken ?? 'refresh-token-v1', KEY)
  let accessCols = 'NULL, NULL, NULL'
  if (options.accessToken) {
    const access = await encryptShipHubSecret(options.accessToken, KEY)
    accessCols = `'${access.ciphertext}', '${access.nonce}', 'v1'`
  }
  const expires = options.accessExpiresAt === undefined ? null : options.accessExpiresAt
  db.exec(`INSERT INTO shiphub_connections (store_id, enabled, mode, refresh_token_ciphertext, refresh_token_nonce, refresh_token_key_version, access_token_ciphertext, access_token_nonce, access_token_key_version, token_expires_at, location_num, identity_fingerprint, authorization_status, created_at, updated_at)
           VALUES ('${STORE}', 1, 'live', '${refresh.ciphertext}', '${refresh.nonce}', 'v1', ${accessCols}, ${expires ? `'${expires}'` : 'NULL'}, '${LOCATION}', '${FINGERPRINT}', 'connected', '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z')`)
}

function envFor(db: TestD1Database): WorkerEnv {
  return { DB: db as unknown as D1Database } as unknown as WorkerEnv
}

// ── ① access token 复用 ────────────────────────────────────────────────

test('readCachedAccessToken：剩余寿命充足时返回缓存 token', async () => {
  const now = new Date('2026-09-09T04:00:00.000Z')
  const encrypted = await encryptShipHubSecret('access-token-abc', KEY)
  const cached = await readCachedAccessToken(base, {
    access_token_ciphertext: encrypted.ciphertext,
    access_token_nonce: encrypted.nonce,
    token_expires_at: new Date(now.getTime() + 60 * 60_000).toISOString() // 还剩 1 小时
  }, now)
  assert.equal(cached?.accessToken, 'access-token-abc', '必须能解出缓存的 access token')
})

test('readCachedAccessToken：进入刷新窗口（剩余 <10 分钟）时返回 null，强制走刷新路径', async () => {
  const now = new Date('2026-09-09T04:00:00.000Z')
  const encrypted = await encryptShipHubSecret('access-token-abc', KEY)
  const cached = await readCachedAccessToken(base, {
    access_token_ciphertext: encrypted.ciphertext,
    access_token_nonce: encrypted.nonce,
    token_expires_at: new Date(now.getTime() + 5 * 60_000).toISOString() // 只剩 5 分钟
  }, now)
  assert.equal(cached, null, '剩余寿命低于阈值必须刷新，不能拿即将过期的 token 去打上游')
})

test('readCachedAccessToken：无缓存 / 已过期 / 密文损坏都安全返回 null（不得抛错）', async () => {
  const now = new Date('2026-09-09T04:00:00.000Z')
  assert.equal(await readCachedAccessToken(base, { access_token_ciphertext: null, access_token_nonce: null, token_expires_at: null }, now), null, '无缓存列（旧行）必须返回 null')
  const encrypted = await encryptShipHubSecret('x', KEY)
  assert.equal(await readCachedAccessToken(base, { access_token_ciphertext: encrypted.ciphertext, access_token_nonce: encrypted.nonce, token_expires_at: new Date(now.getTime() - 1000).toISOString() }, now), null, '已过期必须返回 null')
  assert.equal(await readCachedAccessToken(base, { access_token_ciphertext: 'corrupt', access_token_nonce: 'bad', token_expires_at: new Date(now.getTime() + 3600_000).toISOString() }, now), null, '解密失败必须降级为 null（交给刷新路径处理），不能抛错拖垮同步')
})

test('同步复用缓存 access token：不打上游 token 端点，直接进入数据拉取', async () => {
  const db = await database()
  await startTokenServer()
  await startDataServer()
  const hitsBefore = tokenHits
  try {
    // 预置一个有效期充足的 access token
    const future = new Date(Date.now() + 90 * 60_000).toISOString()
    await seedConnection(db, { accessToken: 'cached-access-token', accessExpiresAt: future })
    const result = await syncStoreCategory(db as unknown as D1Database, configWithDataServer(), STORE, 'hand', {
      now: new Date('2026-09-09T04:00:00.000Z')
    })
    assert.equal(result.status, 'succeeded', '复用缓存 token 的同步必须成功')
    // ★核心断言：有可用缓存时绝不调用 token 端点（不消耗 refresh token 族）
    assert.equal(tokenHits, hitsBefore, '★有可用缓存时绝不调用 token 端点——这是修复的全部意义')
    assert.ok(dataHits > 0, '必须真的打到上游数据端点（证明走了完整链路而非短路）')
    // token_updated_at 未变 = 没有刷新 refresh token
    const row = db.one<{ token_updated_at: string | null }>('SELECT token_updated_at FROM shiphub_connections WHERE store_id = ?', STORE)
    assert.equal(row?.token_updated_at, null, '复用路径不得写 token_updated_at（没刷新 RT）')
  } finally {
    db.close()
    await stopDataServer()
    await stopTokenServer()
  }
})

// ── ② scheduled 路径内联重登 + 重试 ────────────────────────────────────

test('scheduled 失败遇 token 4xx 时会尝试内联重登（受 heal 冷却控频）', async () => {
  const db = await database()
  await startTokenServer()
  try {
    // 只给 refresh token，不给 access token → 会走刷新 → 本地服务返回 400
    await seedConnection(db, { accessToken: undefined, accessExpiresAt: null })
    const result = await syncStoreCategory(db as unknown as D1Database, configWithTokenServer(), STORE, 'hand', {
      trigger: 'scheduled',
      now: new Date('2026-09-09T04:00:00.000Z')
    })
    // 无 loginKey → reloginWithStoredCredentials 直接返回 false，因此最终仍是 failed；
    // 但关键断言是：scheduled 路径**尝试过**重登（heal_last_attempted_at 被写）。
    assert.equal(result.status, 'failed')
    assert.equal(result.reason, 'OAUTH_TOKEN_HTTP_400', '必须透传真实的上游错误码')
    const row = db.one<{ heal_last_attempted_at: string | null }>('SELECT heal_last_attempted_at FROM shiphub_connections WHERE store_id = ?', STORE)
    assert.ok(row?.heal_last_attempted_at, 'scheduled 遇 token 4xx 必须尝试内联重登并记录尝试时间（控频依据）')
  } finally {
    db.close()
    await stopTokenServer()
  }
})

test('内联重登受冷却约束：短时间内不重复尝试', async () => {
  const db = await database()
  await startTokenServer()
  try {
    await seedConnection(db)
    const t1 = new Date('2026-09-09T04:00:00.000Z')
    await syncStoreCategory(db as unknown as D1Database, configWithTokenServer(), STORE, 'hand', { trigger: 'scheduled', now: t1 })
    const first = db.one<{ heal_last_attempted_at: string }>('SELECT heal_last_attempted_at FROM shiphub_connections WHERE store_id = ?', STORE)?.heal_last_attempted_at
    assert.ok(first, '首次失败应记录尝试时间')
    // 1 分钟后再次失败：不应更新 heal_last_attempted_at（冷却 5 分钟）
    await syncStoreCategory(db as unknown as D1Database, configWithTokenServer(), STORE, 'pick', { trigger: 'scheduled', now: new Date(t1.getTime() + 60_000) })
    const second = db.one<{ heal_last_attempted_at: string }>('SELECT heal_last_attempted_at FROM shiphub_connections WHERE store_id = ?', STORE)?.heal_last_attempted_at
    assert.equal(second, first, '冷却期内不得重复打上游登录接口（上游有风控）')
  } finally {
    db.close()
    await stopTokenServer()
  }
})

// ── ③ reauth_required 触发收窄 ─────────────────────────────────────────

test('单次 token 4xx 不立即标 reauth_required（瞬时撞车，内联重登即可恢复）', async () => {
  const db = await database()
  await startTokenServer()
  try {
    await seedConnection(db)
    await syncStoreCategory(db as unknown as D1Database, configWithTokenServer(), STORE, 'hand', {
      trigger: 'scheduled',
      now: new Date('2026-09-09T04:00:00.000Z')
    })
    const status = db.one<{ authorization_status: string }>('SELECT authorization_status FROM shiphub_connections WHERE store_id = ?', STORE)?.authorization_status
    assert.notEqual(status, 'reauth_required', '单次 4xx 是瞬时撞车，不该要求门店人工重连（旧实现会误标）')
  } finally {
    db.close()
    await stopTokenServer()
  }
})

test('连续失败达阈值（3 次）才升级为 reauth_required', async () => {
  const db = await database()
  await startTokenServer()
  try {
    await seedConnection(db)
    const t = new Date('2026-09-09T04:00:00.000Z')
    for (let i = 0; i < 3; i += 1) {
      await syncStoreCategory(db as unknown as D1Database, configWithTokenServer(), STORE, 'hand', {
        trigger: 'scheduled',
        now: new Date(t.getTime() + i * 10 * 60_000)
      })
    }
    const status = db.one<{ authorization_status: string }>('SELECT authorization_status FROM shiphub_connections WHERE store_id = ?', STORE)?.authorization_status
    assert.equal(status, 'reauth_required', '反复失败说明自愈也没救回来，此时才该让门店人工重连')
  } finally {
    db.close()
    await stopTokenServer()
  }
})

// ── 源码约束 ───────────────────────────────────────────────────────────

test('源码必须优先复用缓存，且迁移包含 access token 三列', async () => {
  const fs = await import('node:fs')
  const read = (p: string) => fs.promises.readFile(new URL(p, import.meta.url), 'utf8')
  const sync = await read('../src/services/shiphub-sync.ts')
  // 缓存检查必须在 refresh_token 检查之前（否则 RT 缺失时明明有可用 token 也同步不了）
  const cacheIdx = sync.indexOf('await readCachedAccessToken(config, row)')
  const refreshIdx = sync.indexOf("throw new ShipHubUpstreamError('REFRESH_TOKEN_MISSING')")
  assert.ok(cacheIdx > 0 && refreshIdx > 0 && cacheIdx < refreshIdx, '缓存复用必须排在 refresh_token 校验之前')
  assert.match(sync, /const TOKEN_REAUTH_THRESHOLD = 3/u, 'reauth 升级阈值必须显式为 3')
  assert.match(sync, /async function claimHealAttempt/u, '必须有原子抢占式冷却（多分类并发失败时只允许一次重登）')
  const migration = await read('../../../migrations/d1/0030_shiphub_access_token_cache.sql')
  for (const col of ['access_token_ciphertext', 'access_token_nonce', 'access_token_key_version']) {
    assert.match(migration, new RegExp(`ADD COLUMN ${col}`, 'u'), `迁移必须包含 ${col}`)
  }
  const oauth = await read('../src/lib/shiphub-oauth.ts')
  assert.match(oauth, /export async function readCachedAccessToken/u)
  assert.match(oauth, /const ACCESS_TOKEN_REFRESH_MARGIN_MS = 10 \* 60_000/u, '刷新阈值必须是 10 分钟')
})
