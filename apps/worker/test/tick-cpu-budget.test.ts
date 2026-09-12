import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer, type Server } from 'node:http'
import type { AppConfig, WorkerEnv } from '../src/env.js'
import { loadConfig } from '../src/env.js'
import { encryptShipHubSecret } from '../src/lib/shiphub-crypto.js'
import { syncStoreCategory, runScheduledShipHubSync, listShipHubOrders } from '../src/services/shiphub-sync.js'
import { ensureStoreCubeJwt } from '../src/services/cube-identity.js'
import { hourFormatter, isoDayFormatter, resetTimeFormatterCacheForTest } from '../src/lib/time-format.js'
import { migratedTestDatabase, type TestD1Database } from '../security/d1-test-adapter.js'

// ── cron tick CPU 预算回归（2026-09-12）────────────────────────────────
//
// 背景：免费层 Workers 的 Cron CPU 上限是每次 10ms，而实测 tick CPU 常态
// 12–50ms，2026-09-10/11 多次被平台以 exceededCpu 终止（同步停摆 1h45m）。
// 优化五项（全部要有回归断言，防退回）：
//   ① Intl.DateTimeFormat 构造是 tick 最大单项（~235µs/次 × 每 tick ~10 次）
//      → 模块级 formatter 缓存。
//   ② 完整对账对全部订单重拉 detail（list 不返回 updatedAt，比较恒真）
//      → 列表指纹：指纹不变且订单状态已知时跳过 detail。
//   ③ 明细无自行车的订单（detail 返回 null）每次对账都被重拉
//      → 记录「已检查」结论（detail_filtered），保持不可见但不再重拉。
//   ④ cube 身份检查在 token 可用时仍先解密本店账密（2 次 AES-GCM 白烧）
//      → token 可用时不再解密凭据。
//   ⑤ 同一 tick 内每个分类独立解析连接（重复 AES-GCM 解密 access token）
//      → tick 级连接缓存。
//
// 测试用真实本地 HTTP 服务模拟 Shiphub 上游（非 mock 错误码），
// 计数 detail 请求以验证「跳过」确实发生。

const STORE = '30000000-0000-4000-8000-000000001299'
const TOKEN_KEY = Buffer.from('t'.repeat(32)).toString('base64url')

let server: Server | null = null
let baseUrl = ''
let rows: Array<Record<string, unknown>> = []
const hits = { detail: 0, list: 0, receiver: 0, count: 0 }

function orderRow(id: string, status: string, latestStatus = '1000'): Record<string, unknown> {
  return {
    b2c_order_id: id,
    ship_group_id: `group-${id}`,
    mail_no: `MAIL-${id}`,
    order_type: status,
    order_platform: 'mini_program',
    order_latest_status: latestStatus,
    is_encrypted_order: '1',
    carrier_arrive_time: '2026-09-12T08:00:00.000Z'
  }
}

/** 明细里全是非自行车（universe_id 非 2）→ normalizeDetailOrder 返回 null。 */
let detailIsBike = true

function detailBody(id: string): string {
  const item = detailIsBike
    ? { item_id: 'A1', model_id: 'M1', universe_id: '2', sku_id: `SKU-${id}`, sku_name: '测试自行车', sku_color: '黑', sku_size: 'M' }
    : { item_id: 'A2', model_id: 'M2', universe_id: '16', sku_label: '人字拖', sku_id: `SKU-${id}`, sku_name: '人字拖鞋', sku_color: '蓝', sku_size: '42' }
  return JSON.stringify({ order_item_list: [item] })
}

async function startServer(): Promise<void> {
  server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    const path = url.pathname
    const send = (body: string): void => {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(body)
    }
    if (path.includes('/count/')) {
      hits.count += 1
      send(String(rows.length))
      return
    }
    if (path.endsWith('/list')) {
      hits.list += 1
      send(JSON.stringify({ total_page_num: 1, order_list: rows }))
      return
    }
    if (path.includes('/detail')) {
      hits.detail += 1
      send(detailBody(new URL(request.url ?? '/', 'http://127.0.0.1').searchParams.get('b2c_order_id') ?? 'x'))
      return
    }
    if (path.includes('/receiver')) {
      hits.receiver += 1
      send(JSON.stringify({ data: { mobile: '13800138000' } }))
      return
    }
    response.writeHead(404, { 'content-type': 'application/json' })
    response.end('{}')
  })
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
  const address = server!.address()
  if (address && typeof address === 'object') baseUrl = `http://127.0.0.1:${address.port}`
}

async function stopServer(): Promise<void> {
  if (!server) return
  await new Promise<void>((resolve) => server!.close(() => resolve()))
  server = null
}

async function makeEnv(db: TestD1Database, accessToken: string, expiresAt: string): Promise<WorkerEnv> {
  const encrypted = await encryptShipHubSecret(accessToken, TOKEN_KEY)
  const now = '2026-09-12T03:00:00.000Z'
  db.exec(`INSERT INTO shiphub_connections (
      store_id, enabled, mode, refresh_token_ciphertext, refresh_token_nonce, refresh_token_key_version,
      token_expires_at, token_updated_at, authorization_status,
      access_token_ciphertext, access_token_nonce, access_token_key_version,
      location_num, identity_fingerprint, created_at, updated_at)
    VALUES ('${STORE}', 1, 'live', 'r.c', 'r.n', 'v1',
      '${expiresAt}', '${now}', 'connected',
      '${encrypted.ciphertext}', '${encrypted.nonce}', 'v1', '1299', 'fp-tick', '${now}', '${now}')`)
  return {
    DB: db as unknown as D1Database,
    ASSETS: {} as Fetcher,
    APP_ENV: 'staging',
    APP_VERSION: '6.7.8',
    COOKIE_SECURE: 'true',
    SESSION_TTL_HOURS: '12',
    SESSION_SECRET: 'x'.repeat(32),
    CSRF_SECRET: 'y'.repeat(32),
    PASSWORD_PEPPER: 'z'.repeat(32),
    SHIPHUB_ENABLED: 'true',
    SHIPHUB_MODE: 'live',
    SHIPHUB_BASE_URL: baseUrl,
    SHIPHUB_LIVE_CONFIRMED: 'true',
    SHIPHUB_TOKEN_ENCRYPTION_KEY: TOKEN_KEY,
    SHIPHUB_REQUEST_TIMEOUT_MS: '5000',
    SHIPHUB_ACTIVE_START_HOUR: '0',
    SHIPHUB_ACTIVE_END_HOUR: '24',
    SHIPHUB_LOCATION_NUM: '1299'
  } as WorkerEnv
}

function resetHits(): void {
  hits.detail = 0
  hits.list = 0
  hits.receiver = 0
  hits.count = 0
}

const T0 = new Date('2026-09-12T03:00:00.000Z')
const T1 = new Date(T0.getTime() + 16 * 60_000)
const T2 = new Date(T0.getTime() + 32 * 60_000)
// token 有效期（makeEnv 的 expiresAt）必须相对「真实时钟」生成：readCachedAccessToken
// 用真实 now 判定缓存可用性；写死 T0+2h 会在挂钟时间走过该时刻后误判过期，把测试变成
// 时间炸弹（2026-09-12 修复：真实时间 > 05:00Z 后 main 上必红）。

test('完整对账在列表指纹不变时跳过 detail 重拉，指纹变化/订单回归才重拉', async () => {
  await startServer()
  const db = await migratedTestDatabase()
  try {
    const env = await makeEnv(db, 'A'.repeat(760), new Date(Date.now() + 2 * 3600_000).toISOString())
    const config = loadConfig(env)
    rows = [orderRow('order-1', 'pending'), orderRow('order-2', 'pending')]

    // ① 首次同步：两个新订单都要拉 detail（detail + receiver 各一次）
    resetHits()
    assert.equal((await syncStoreCategory(db as unknown as D1Database, config, STORE, 'hand', { trigger: 'scheduled', now: T0 })).status, 'succeeded')
    assert.equal(hits.detail, 2, '新订单必须拉 detail')
    assert.equal(hits.receiver, 2, '新订单必须拉 receiver（手机号）')
    const first = db.one<{ display_label: string; list_fingerprint: string | null }>(
      `SELECT display_label, list_fingerprint FROM shiphub_orders WHERE store_id = ? AND category = 'hand' AND upstream_order_id = ?`, STORE, 'order-1')
    assert.equal(first?.display_label, '测试自行车', 'detail 后 display_label 应为商品名')
    assert.ok(first?.list_fingerprint, '列表指纹必须落库')

    // ② 16 分钟后完整对账（同数据）：指纹不变 → 跳过 detail 与 receiver
    resetHits()
    assert.equal((await syncStoreCategory(db as unknown as D1Database, config, STORE, 'hand', { trigger: 'scheduled', now: T1 })).status, 'succeeded')
    assert.equal(hits.list, 1, '完整对账仍要拉列表')
    assert.equal(hits.detail, 0, '指纹不变时不得重拉 detail（2026-09-12 优化：旧实现每单必拉）')
    assert.equal(hits.receiver, 0, '指纹不变时不得重拉 receiver')
    const afterSecond = db.one<{ display_label: string; absent: string | null }>(
      `SELECT display_label, upstream_absent_at AS absent FROM shiphub_orders WHERE store_id = ? AND category = 'hand' AND upstream_order_id = ?`, STORE, 'order-1')
    assert.equal(afterSecond?.display_label, '测试自行车', '跳过 detail 不得用 list 值覆盖商品名')
    assert.equal(afterSecond?.absent, null, '跳过的订单必须仍被视为活跃（不得误标 absent）')

    // ③ 只有 order-1 状态变化：仅该订单重拉 detail
    rows = [orderRow('order-1', 'picked'), orderRow('order-2', 'pending')]
    resetHits()
    assert.equal((await syncStoreCategory(db as unknown as D1Database, config, STORE, 'hand', { trigger: 'scheduled', now: T2 })).status, 'succeeded')
    assert.equal(hits.detail, 1, '指纹变化的订单必须重拉 detail，未变化的不重拉')

    // ④ 订单从上游消失 → 标记 absent；重新出现 → 必须重拉 detail
    rows = [orderRow('order-1', 'picked')]
    await syncStoreCategory(db as unknown as D1Database, config, STORE, 'hand', { trigger: 'scheduled', now: new Date(T2.getTime() + 16 * 60_000) })
    const absent = db.one<{ absent: string | null }>(
      `SELECT upstream_absent_at AS absent FROM shiphub_orders WHERE store_id = ? AND category = 'hand' AND upstream_order_id = ?`, STORE, 'order-2')
    assert.ok(absent?.absent, '上游消失的订单必须被标记 absent')
    rows = [orderRow('order-1', 'picked'), orderRow('order-2', 'pending')]
    resetHits()
    await syncStoreCategory(db as unknown as D1Database, config, STORE, 'hand', { trigger: 'scheduled', now: new Date(T2.getTime() + 32 * 60_000) })
    assert.equal(hits.detail, 1, 'absent 后回归的订单必须重拉 detail（恢复活跃）')
  } finally {
    db.close()
    await stopServer()
  }
})

test('明细被过滤的订单（无自行车）只检查一次，之后跳过 detail 且始终保持不可见', async () => {
  await startServer()
  const db = await migratedTestDatabase()
  try {
    const env = await makeEnv(db, 'D'.repeat(760), new Date(Date.now() + 2 * 3600_000).toISOString())
    const config = loadConfig(env)
    // 上游订单明细全是非自行车（memory 65 记录的真实现象：1299 hand 单有人字拖/袜子等）
    detailIsBike = false
    rows = [orderRow('nonbike-1', 'pending'), orderRow('nonbike-2', 'pending')]

    // ① 首次对账：两单都检查明细（detail 返回 null = 明细无自行车）
    resetHits()
    assert.equal((await syncStoreCategory(db as unknown as D1Database, config, STORE, 'hand', { trigger: 'scheduled', now: T0 })).status, 'succeeded')
    assert.equal(hits.detail, 2, '首次必须检查明细')

    // ② 检查结论必须落库：detail_filtered=1 + 指纹 + 不可见（absent）
    const filtered = db.query<{ upstream_order_id: string; detail_filtered: number; list_fingerprint: string | null; absent: string | null }>(
      `SELECT upstream_order_id, detail_filtered, list_fingerprint, upstream_absent_at AS absent FROM shiphub_orders
       WHERE store_id = ? AND category = 'hand' ORDER BY upstream_order_id`, STORE)
    assert.equal(filtered.length, 2, '被过滤的订单也要落库（否则每轮重拉）')
    assert.ok(filtered.every((row) => row.detail_filtered === 1), 'detail_filtered 必须置 1')
    assert.ok(filtered.every((row) => row.list_fingerprint), '指纹必须落库')
    assert.ok(filtered.every((row) => row.absent !== null), '被过滤的订单必须保持不可见（absent）')

    // ③ 不应出现在待取车看板查询里
    const visible = await listShipHubOrders(db as unknown as D1Database, STORE, 'hand', null, 50)
    assert.equal(visible.orders.length, 0, '明细无自行车的订单不得显示在待取车看板')

    // ④ 16 分钟后对账（同数据）：指纹不变 → 跳过 detail（这是本轮修复的核心）
    resetHits()
    assert.equal((await syncStoreCategory(db as unknown as D1Database, config, STORE, 'hand', { trigger: 'scheduled', now: T1 })).status, 'succeeded')
    assert.equal(hits.list, 1, '完整对账仍要拉列表')
    assert.equal(hits.detail, 0, '已确认无自行车的订单不得重复检查（2026-09-12 修复：旧实现每轮重拉）')
    const stillHidden = await listShipHubOrders(db as unknown as D1Database, STORE, 'hand', null, 50)
    assert.equal(stillHidden.orders.length, 0, '跳过 detail 后仍必须不可见')

    // ⑤ 上游状态码推进（order_latest_status 变化，order_type 不变）→ 指纹变化
    //    → 必须重新检查明细（这正是 listStatusRaw 存在的原因：只看 status 字段
    //    会因 order_type 非空而忽略状态码，导致状态推进不被检测）
    detailIsBike = true
    rows = [orderRow('nonbike-1', 'pending', '1040'), orderRow('nonbike-2', 'pending')]
    resetHits()
    assert.equal((await syncStoreCategory(db as unknown as D1Database, config, STORE, 'hand', { trigger: 'scheduled', now: T2 })).status, 'succeeded')
    assert.equal(hits.detail, 1, '状态码推进的订单必须重新检查明细（其余跳过）')
    const nowVisible = await listShipHubOrders(db as unknown as D1Database, STORE, 'hand', null, 50)
    assert.equal(nowVisible.orders.length, 1, '明细含自行车后必须转为可见')
    const row = db.one<{ detail_filtered: number; absent: string | null }>(
      `SELECT detail_filtered, upstream_absent_at AS absent FROM shiphub_orders WHERE store_id = ? AND category = 'hand' AND upstream_order_id = 'nonbike-1'`, STORE)
    assert.equal(row?.detail_filtered, 0, '转为可见后 detail_filtered 必须重置为 0')
    assert.equal(row?.absent, null, '转为可见后必须清除 absent')
  } finally {
    detailIsBike = true
    db.close()
    await stopServer()
  }
})

test('scheduled tick 内同一门店的连接只解析一次（tick 级连接缓存）', async () => {
  await startServer()
  const db = await migratedTestDatabase()
  try {
    const env = await makeEnv(db, 'B'.repeat(760), new Date(Date.now() + 2 * 3600_000).toISOString())
    rows = [orderRow('order-cache', 'pending')]

    // 包装 DB：计数 connectionForSync 的连接查询（JOIN stores 的形态是它独有）
    let connectionSelects = 0
    const countingDb = {
      prepare: (sql: string) => {
        if (sql.includes('FROM shiphub_connections c JOIN stores')) connectionSelects += 1
        return db.prepare(sql)
      },
      batch: (statements: D1PreparedStatement[]) => db.batch(statements)
    } as unknown as D1Database
    const countingEnv = { ...env, DB: countingDb } as WorkerEnv

    await runScheduledShipHubSync(countingEnv, T0)
    // 一次 tick 内 hand + pick 两个分类都要同步；连接解析必须只发生一次
    // （旧实现每个分类各解析一次，重复 AES-GCM 解密 access token）。
    assert.equal(connectionSelects, 1, `同一 tick 内连接解析必须复用（实际 ${connectionSelects} 次）`)
  } finally {
    db.close()
    await stopServer()
  }
})

test('cube token 可用时不再解密本店凭据（且凭据密文损坏不阻塞 token 复用）', async () => {
  const db = await migratedTestDatabase()
  try {
    const tokenPlain = `eyJ${'C'.repeat(60)}`
    const cubeEnc = await encryptShipHubSecret(tokenPlain, TOKEN_KEY)
    const now = '2026-09-12T03:00:00.000Z'
    // 凭据密文故意损坏：旧实现先解密凭据（失败 → CUBE_CREDENTIALS_MISSING + null），
    // 新实现 token 可用时直接复用、根本不解密凭据 → 必须返回 token。
    db.exec(`UPDATE shiphub_connections SET enabled = 0`)
    db.exec(`INSERT INTO shiphub_connections (
        store_id, enabled, mode, authorization_status, created_at, updated_at,
        login_username_enc, login_password_enc, login_key_version,
        cube_token_ciphertext, cube_token_nonce, cube_token_key_version, cube_token_expires_at,
        cube_auth_status, cube_auth_checked_at)
      VALUES ('${STORE}', 1, 'live', 'connected', '${now}', '${now}',
        'broken.not-a-valid-blob', 'broken.not-a-valid-blob', 'v1',
        '${cubeEnc.ciphertext}', '${cubeEnc.nonce}', 'v1', '${new Date(Date.parse(now) + 3600_000).toISOString()}',
        'available', '${now}')`)
    const env = {
      DB: db as unknown as D1Database,
      APP_ENV: 'staging',
      APP_VERSION: '6.7.8',
      COOKIE_SECURE: 'true',
      SESSION_TTL_HOURS: '12',
      SESSION_SECRET: 'x'.repeat(32),
      CSRF_SECRET: 'y'.repeat(32),
      PASSWORD_PEPPER: 'z'.repeat(32),
      SHIPHUB_ENABLED: 'true',
      SHIPHUB_TOKEN_ENCRYPTION_KEY: TOKEN_KEY,
      SHIPHUB_LOGIN_KEY: TOKEN_KEY,
      BI_MASTERDATA_CLIENT_ID: 'cid',
      BI_MASTERDATA_CLIENT_SECRET: 'sec',
      BI_MASTERDATA_API_KEY: 'k',
      BI_MASTERDATA_LOGIN_KEY: TOKEN_KEY,
      SHIPHUB_LOCATION_NUM: '1299'
    } as WorkerEnv
    assert.equal(await ensureStoreCubeJwt(env, STORE, { now: new Date('2026-09-12T03:00:00.000Z') }), tokenPlain, 'token 可用时必须直接复用，不因凭据密文状态阻塞')
  } finally {
    db.close()
  }
})

test('时区 formatter 走模块级缓存（Intl 构造不得出现在热路径）', () => {
  resetTimeFormatterCacheForTest()
  const hourA = hourFormatter('Asia/Shanghai')
  const hourB = hourFormatter('Asia/Shanghai')
  assert.equal(hourA, hourB, '同一时区必须复用同一 formatter 实例')
  const dayA = isoDayFormatter('Asia/Shanghai')
  assert.notEqual(hourA, dayA, '小时与日期 formatter 分离缓存')
  const dayOther = isoDayFormatter('Europe/Paris')
  assert.notEqual(dayA, dayOther, '不同时区各自缓存')
  resetTimeFormatterCacheForTest()
  assert.notEqual(hourFormatter('Asia/Shanghai'), hourA, 'reset 后重新构建（测试辅助）')

  // 行为等价：格式化结果与原实现一致（en-CA → YYYY-MM-DD；en-US 两位数小时）
  assert.equal(isoDayFormatter('Asia/Shanghai').format(new Date('2026-09-12T03:00:00Z')), '2026-09-12')
  assert.equal(hourFormatter('Asia/Shanghai').format(new Date('2026-09-12T03:00:00Z')), '11')
})
