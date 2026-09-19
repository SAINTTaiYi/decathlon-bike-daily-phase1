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
//   ⑥ 多门店铺开后，一次 tick 顺序执行全部门店的重活，CPU 随门店数线性叠加
//      → tick 级重活预算 + 分钟级门店轮换（2026-09-19）：每次调用最多一个重活，
//      另一家完全静默顺延（零探测、零记录；计数差异保持未消费）。
//   ⑦ 被平台中断的尝试留下僵尸 running 记录，同一重活每分钟原样重跑再被终止
//      （「每分钟自杀一次」死循环，2026-09-19 11:48 起 1299 全部分类卡死）
//      → 僵尸守卫：到期分类发现窗口内 scheduled running 记录时标记为
//      INVOCATION_TERMINATED 并让出本轮。
//   ⑧ 上游持续失败（1670 pick 的 5xx）每分钟重试持续吃预算、饿死其它分类
//      → 连续失败 >= 3 次按指数退避（封顶 10 分钟）。
//   ⑨ 深度 CPU 优化（2026-09-19 晚，用户要求「极致的降低 ms」）：
//      · tick 批量预取：自愈候选/门店/僵尸 + 状态/连接 合并为两次 db.batch，
//        语句 14+ → 5，往返 14+ → 2；僵尸扫描由每分类一次降为每 tick 一次；
//      · 轻量轮次（计数未变化）：不建租约、不建 running 行，仅 2 条语句
//        （状态心跳 + 终态 run），常态每 tick 语句数 8/分类 → 2/分类；
//      · 窗口外（每天 12 小时）：函数入口直接返回，零 D1 操作；
//      · 干态连接不再每分类提交 no-op 的降级清理 UPDATE；
//      · 租约释放并入 success/failure batch（省一条独立往返）。
//
// 测试用真实本地 HTTP 服务模拟 Shiphub 上游（非 mock 错误码），
// 计数 detail 请求以验证「跳过」确实发生。

const STORE = '30000000-0000-4000-8000-000000001299'
const TOKEN_KEY = Buffer.from('t'.repeat(32)).toString('base64url')

let server: Server | null = null
let baseUrl = ''
let rows: Array<Record<string, unknown>> = []
const hits = { detail: 0, list: 0, receiver: 0, count: 0, countsAgg: 0 }
/** 聚合计数端点强制失败（验证单类回退路径）。 */
let aggregateFailure = false
/** 分类计数覆盖（默认取 rows.length；满载测试用它让计数按轮变化）。 */
let countOverrides: Record<string, number> = {}
function countFor(category: string): number {
  return typeof countOverrides[category] === 'number' ? countOverrides[category] : rows.length
}
/** 记录全部上游请求 URL（含 query）：验证 location_num 等参数（2026-09-19 诊断）。 */
const urls: string[] = []

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
/** 指定分类的 list 端点返回 5xx（模拟上游持续失败，验证失败退避）。 */
let listFailureCategory: string | null = null

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
    urls.push(`${url.pathname}${url.search}`)
    const send = (body: string): void => {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(body)
    }
    if (path.endsWith('/orders/count')) {
      // 聚合计数（2026-09-19 第二轮优化）：一次返回全部分类计数
      hits.countsAgg += 1
      if (aggregateFailure) {
        response.writeHead(500, { 'content-type': 'application/json' })
        response.end('{"error":"aggregate unavailable"}')
        return
      }
      send(JSON.stringify({ to_hand_count: countFor('hand'), to_pick_count: countFor('pick'), to_receive_count: countFor('receive'), to_ship_count: countFor('ship') }))
      return
    }
    if (path.includes('/count/')) {
      hits.count += 1
      send(String(countFor(path.split('/count/')[1] ?? '')))
      return
    }
    if (path.endsWith('/list')) {
      hits.list += 1
      if (listFailureCategory && path.includes(`/orders/${listFailureCategory}/list`)) {
        response.writeHead(500, { 'content-type': 'application/json' })
        response.end('{"error":"synthetic upstream failure"}')
        return
      }
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
  hits.countsAgg = 0
  urls.length = 0
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

    // 包装 DB：计数连接行读取（2026-09-19 两轮优化后，连接行来自单批次预取的
    // 全量读取 `FROM shiphub_connections c`——用特征列 access_token_ciphertext
    // 与门店列表查询区分）。语义不变：一次 tick 内连接只解析一次。
    let connectionSelects = 0
    const countingDb = {
      prepare: (sql: string) => {
        if (sql.includes('FROM shiphub_connections c') && sql.includes('access_token_ciphertext')) connectionSelects += 1
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

const STORE_B = '30000000-0000-4000-8000-000000001670'

async function insertLiveConnection(db: TestD1Database, storeId: string, fingerprint: string, token: string): Promise<void> {
  const encrypted = await encryptShipHubSecret(token, TOKEN_KEY)
  const now = '2026-09-12T03:00:00.000Z'
  db.exec(`INSERT INTO shiphub_connections (
      store_id, enabled, mode, refresh_token_ciphertext, refresh_token_nonce, refresh_token_key_version,
      token_expires_at, token_updated_at, authorization_status,
      access_token_ciphertext, access_token_nonce, access_token_key_version,
      location_num, identity_fingerprint, created_at, updated_at)
    VALUES ('${storeId}', 1, 'live', 'r.c', 'r.n', 'v1',
      '${new Date(Date.now() + 2 * 3600_000).toISOString()}', '${now}', 'connected',
      '${encrypted.ciphertext}', '${encrypted.nonce}', 'v1', '${storeId.slice(-4)}', '${fingerprint}', '${now}', '${now}')`)
}

test('多门店 tick：重活预算一次调用只服务一家门店；预算耗尽后其余分类完全静默；按分钟轮换不饿死', async () => {
  await startServer()
  const db = await migratedTestDatabase()
  try {
    const env = await makeEnv(db, 'A'.repeat(760), new Date(Date.now() + 2 * 3600_000).toISOString())
    await insertLiveConnection(db, STORE_B, 'fp-store-b', 'B'.repeat(760))
    rows = [orderRow('order-shared', 'pending')]

    // 轮换契约：rotation = floor(now/60s) % stores.length，排序按 store_id（1299 < 1670）。
    const base = Date.parse('2026-09-12T03:00:00.000Z')
    const tEven = (Math.floor(base / 60_000) % 2 === 0) ? base : base + 60_000
    const T_A = new Date(tEven)
    const T_B = new Date(tEven + 60_000)
    const T_C = new Date(tEven + 120_000)
    const stampA = T_A.toISOString()
    const stampB = T_B.toISOString()
    const stampC = T_C.toISOString()
    const runsAt = (storeId: string, stamp: string): number => {
      const row = db.one<{ n: number }>(`SELECT COUNT(*) AS n FROM shiphub_sync_runs WHERE store_id = ? AND started_at = ?`, storeId, stamp)
      return row?.n ?? 0
    }

    // ── P1（1299 优先）：预算被 1299 的 hand 消费；1670 完全静默（零探测、零记录、零状态） ──
    resetHits()
    await runScheduledShipHubSync(env, T_A)
    assert.equal(hits.countsAgg, 1, `P1：预算耗尽后其余分类不得再探测上游（实际聚合 ${hits.countsAgg} 次；旧实现会为每个分类探测并写「顺延」记录）`)
    assert.equal(hits.count, 0, 'P1：聚合可用时不得再发单类计数请求')
    assert.equal(hits.list, 1, 'P1：本 tick 只允许一次列表重活')
    assert.equal(runsAt(STORE_B, stampA), 0, 'P1：非优先门店必须完全静默——不得产生任何 run 记录（含 skipped）')
    assert.equal(db.one<{ n: number }>(`SELECT COUNT(*) AS n FROM shiphub_orders WHERE store_id = ?`, STORE_B)?.n, 0, 'P1：非优先门店不得写入订单')
    const bState = db.one<{ c: number | null; a: string | null }>(`SELECT last_count AS c, last_attempt_at AS a FROM shiphub_category_state WHERE store_id = ? AND category = 'hand'`, STORE_B)
    assert.equal(bState?.c ?? null, null, 'P1：静默顺延不得消费计数差异（last_count 保持未写）')
    assert.equal(bState?.a ?? null, null, 'P1：静默顺延不得写 last_attempt_at')
    assert.equal(db.one<{ n: number }>(`SELECT COUNT(*) AS n FROM shiphub_sync_runs WHERE store_id = ? AND error_code = 'HEAVY_BUDGET_DEFERRED'`, STORE_B)?.n ?? 0, 0, 'P1：静默顺延不写任何记录（新语义：完全静默）')
    assert.equal(runsAt(STORE, stampA), 1, 'P1：优先门店本轮只执行 1 个重活（hand）')

    // ── P2（1670 优先）：上一轮被完全让出的门店下一分钟即被服务 ──
    resetHits()
    await runScheduledShipHubSync(env, T_B)
    assert.equal(hits.countsAgg, 1, `P2：轮到优先位后只探测一次（聚合）并消费预算（实际 ${hits.countsAgg}）`)
    assert.equal(hits.count, 0, 'P2：聚合可用时不得再发单类计数请求')
    assert.equal(db.one<{ n: number }>(`SELECT COUNT(*) AS n FROM shiphub_sync_runs WHERE store_id = ? AND category = 'hand' AND status = 'succeeded' AND started_at = ?`, STORE_B, stampB)?.n, 1, 'P2：被让出的门店本轮应完成 hand 同步（不得饿死）')
    assert.ok((db.one<{ n: number }>(`SELECT COUNT(*) AS n FROM shiphub_orders WHERE store_id = ?`, STORE_B)?.n ?? 0) >= 1, 'P2：被让出门店的订单必须已写入')
    assert.equal(runsAt(STORE, stampB), 0, 'P2：本轮 1299 必须完全静默（预算被 1670 用掉）')

    // ── P3（1299 又优先）：上轮被让出的分类（pick）在回到优先位时被补上 ──
    resetHits()
    await runScheduledShipHubSync(env, T_C)
    assert.equal(hits.countsAgg, 1, 'P3：hand/pick 共用同一份聚合快照——本店本 tick 只发 1 次计数请求（旧实现 2 次）')
    assert.equal(hits.count, 0, 'P3：聚合可用时不得再发单类计数请求')
    assert.equal(db.one<{ n: number }>(`SELECT COUNT(*) AS n FROM shiphub_sync_runs WHERE store_id = ? AND category = 'pick' AND status = 'succeeded' AND started_at = ?`, STORE, stampC)?.n, 1, 'P3：上轮被让出的分类在回到优先位时必须被服务')
  } finally {
    db.close()
    await stopServer()
  }
})

test('被平台中断的尝试（僵尸 running）被识别并让出本轮，恢复成功自动清零', async () => {
  await startServer()
  const db = await migratedTestDatabase()
  try {
    const env = await makeEnv(db, 'Z'.repeat(760), new Date(Date.now() + 2 * 3600_000).toISOString())
    rows = [orderRow('order-zombie', 'pending')]
    const T_A = new Date('2026-09-12T03:00:00.000Z')
    const T_B = new Date(T_A.getTime() + 60_000)
    const stampA = T_A.toISOString()
    const stampB = T_B.toISOString()

    // 复刻一次「被平台中断」的现场：run 停在 running、状态从未更新（免费层超预算
    // 调用被直接终止时 catch/finally 都来不及执行）。同时植入一条 manual running
    // 记录：守卫只处理 scheduled（manual 可能来自并发中的真实请求，不得误伤）。
    db.exec(`INSERT INTO shiphub_sync_runs (id, store_id, category, trigger_source, started_at, status) VALUES ('zombie-1', '${STORE}', 'hand', 'scheduled', '${new Date(T_A.getTime() - 120_000).toISOString()}', 'running')`)
    db.exec(`INSERT INTO shiphub_sync_runs (id, store_id, category, trigger_source, started_at, status) VALUES ('zombie-manual', '${STORE}', 'hand', 'manual', '${new Date(T_A.getTime() - 120_000).toISOString()}', 'running')`)

    await runScheduledShipHubSync(env, T_A)
    const zombie = db.one<{ status: string; code: string | null; finished: string | null }>(`SELECT status, error_code AS code, finished_at AS finished FROM shiphub_sync_runs WHERE id = 'zombie-1'`)
    assert.equal(zombie?.status, 'skipped', '僵尸记录必须被标记（否则监控永远显示 running）')
    assert.equal(zombie?.code, 'INVOCATION_TERMINATED', '僵尸记录必须使用专用原因码（不是 failed，不触发失败告警）')
    assert.ok(zombie?.finished, '僵尸记录必须补上 finished_at')
    assert.equal(db.one<{ status: string }>(`SELECT status FROM shiphub_sync_runs WHERE id = 'zombie-manual'`)?.status, 'running', 'manual 记录不得被守卫误伤（可能是并发中的真实请求）')
    assert.equal(db.one<{ n: number }>(`SELECT COUNT(*) AS n FROM shiphub_sync_runs WHERE store_id = ? AND category = 'hand' AND started_at = ?`, STORE, stampA)?.n, 0, '本轮 hand 必须让出（不得在僵尸后立刻重跑同一个重活）')
    const stateA = db.one<{ a: string | null; f: number }>(`SELECT last_attempt_at AS a, consecutive_failures AS f FROM shiphub_category_state WHERE store_id = ? AND category = 'hand'`, STORE)
    assert.equal(stateA?.a ?? null, stampA, '让出时必须推进 last_attempt_at（下一轮再试，不形成每分钟自杀循环）')
    assert.ok((stateA?.f ?? 0) >= 1, '让出时必须累计 consecutive_failures（作为反复被中断的观测证据）')
    assert.equal(db.one<{ n: number }>(`SELECT COUNT(*) AS n FROM shiphub_sync_runs WHERE store_id = ? AND category = 'pick' AND started_at = ? AND status = 'succeeded'`, STORE, stampA)?.n, 1, 'hand 让出后 pick 应照常获得预算（不得整体停摆）')

    // 下一分钟：僵尸已标记、无新 running → hand 正常重试并成功；失败计数清零
    await runScheduledShipHubSync(env, T_B)
    assert.equal(db.one<{ n: number }>(`SELECT COUNT(*) AS n FROM shiphub_sync_runs WHERE store_id = ? AND category = 'hand' AND started_at = ? AND status = 'succeeded'`, STORE, stampB)?.n, 1, '下一轮恢复正常重试并成功')
    assert.equal(db.one<{ consecutive_failures: number }>(`SELECT consecutive_failures FROM shiphub_category_state WHERE store_id = ? AND category = 'hand'`, STORE)?.consecutive_failures, 0, '恢复成功后失败计数必须清零')
  } finally {
    db.close()
    await stopServer()
  }
})

test('持续失败的分类按指数退避，不再每分钟吃掉 tick 预算', async () => {
  await startServer()
  const db = await migratedTestDatabase()
  try {
    const env = await makeEnv(db, 'E'.repeat(760), new Date(Date.now() + 2 * 3600_000).toISOString())
    rows = [orderRow('order-bf', 'pending')]
    listFailureCategory = 'pick'

    const T0 = new Date('2026-09-12T03:00:00.000Z')
    for (let i = 0; i < 3; i += 1) {
      const r = await syncStoreCategory(db as unknown as D1Database, loadConfig(env), STORE, 'pick', { trigger: 'scheduled', now: new Date(T0.getTime() + i * 60_000) })
      assert.equal(r.status, 'failed', `第 ${i + 1} 次应失败（上游 5xx）`)
    }
    const state = db.one<{ f: number; a: string }>(`SELECT consecutive_failures AS f, last_attempt_at AS a FROM shiphub_category_state WHERE store_id = ? AND category = 'pick'`, STORE)
    assert.equal(state?.f, 3, '连续失败计数必须累计')
    assert.ok(Date.parse(state!.a) > T0.getTime() + 2 * 60_000, '第 3 次失败后 last_attempt_at 必须被推后（退避生效）')

    const before = db.one<{ n: number }>(`SELECT COUNT(*) AS n FROM shiphub_sync_runs WHERE store_id = ? AND category = 'pick'`, STORE)?.n ?? 0
    resetHits()
    const skip = await syncStoreCategory(db as unknown as D1Database, loadConfig(env), STORE, 'pick', { trigger: 'scheduled', now: new Date(T0.getTime() + 150_000) })
    assert.equal(skip.status, 'skipped', '退避期内必须跳过')
    assert.equal(skip.reason, 'FAILURE_BACKOFF', '退避期内必须是 FAILURE_BACKOFF（显式退避门禁）')
    assert.equal(hits.count, 0, '退避期内不得探测上游')
    assert.equal(db.one<{ n: number }>(`SELECT COUNT(*) AS n FROM shiphub_sync_runs WHERE store_id = ? AND category = 'pick'`, STORE)?.n ?? 0, before, '退避期内不得产生新 run 记录')
  } finally {
    listFailureCategory = null
    db.close()
    await stopServer()
  }
})

test('上游错误持久化 HTTP 状态与响应片段（诊断：error_detail）', async () => {
  await startServer()
  const db = await migratedTestDatabase()
  try {
    const env = await makeEnv(db, 'D'.repeat(760), new Date(Date.now() + 2 * 3600_000).toISOString())
    rows = []
    listFailureCategory = 'pick'
    const T0 = new Date('2026-09-12T03:00:00.000Z')
    const result = await syncStoreCategory(db as unknown as D1Database, loadConfig(env), STORE, 'pick', { trigger: 'scheduled', now: T0 })
    assert.equal(result.status, 'failed', '上游 500 必须失败')
    const run = db.one<{ error_code: string | null; error_detail: string | null }>(
      `SELECT error_code, error_detail FROM shiphub_sync_runs WHERE store_id = ? AND category = 'pick' ORDER BY started_at DESC LIMIT 1`, STORE)
    assert.equal(run?.error_code, 'UPSTREAM_ERROR_500', '错误码必须并入上游 HTTP 状态（从 D1 直接可读）')
    assert.match(run?.error_detail ?? '', /HTTP 500/u, '详情必须记录 HTTP 状态')
    assert.match(run?.error_detail ?? '', /\/orders\/pick\/list/u, '详情必须记录失败的上游路径（区分 count 与 list）')
    assert.match(run?.error_detail ?? '', /synthetic upstream failure/u, '详情必须记录响应片段（上游给出的理由）')
  } finally {
    listFailureCategory = null
    db.close()
    await stopServer()
  }
})

test('短码 location_num 在请求上游前自动展开为 partyNumber（1670 事故回归）', async () => {
  await startServer()
  const db = await migratedTestDatabase()
  try {
    const env = await makeEnv(db, 'F'.repeat(760), new Date(Date.now() + 2 * 3600_000).toISOString())
    // 复刻 2026-09-19 事故现场：门店连接里存的是 4 位短码（上游 pick/ship
    // 的门店解析会因此失败——500/417；规范化后读取路径必须自动展开）。
    db.exec(`UPDATE shiphub_connections SET location_num = '1670' WHERE store_id = '${STORE}'`)
    rows = []
    resetHits()
    await runScheduledShipHubSync(env, T0)
    assert.ok(urls.length > 0, '必须实际发起上游请求')
    const locationParams = urls.map((u) => new URL(`http://x${u}`).searchParams.get('location_num'))
    assert.ok(locationParams.length > 0 && locationParams.every((v) => v !== null), '每个上游请求都必须带 location_num')
    const distinct = [...new Set(locationParams)]
    assert.deepEqual(distinct, ['0070167001670'], `上游请求必须使用展开后的 partyNumber（实际：${distinct.join(', ')}）`)
  } finally {
    db.close()
    await stopServer()
  }
})

test('轻量轮次（计数未变）不建租约与 running 行：全 tick 仅两次批量往返、每分类 2 条语句', async () => {
  await startServer()
  const db = await migratedTestDatabase()
  try {
    const env = await makeEnv(db, 'L'.repeat(760), new Date(Date.now() + 2 * 3600_000).toISOString())
    rows = []
    const T0 = new Date('2026-09-12T03:00:00.000Z')
    // 预热四轮：重活预算每 tick 只服务一个分类，hand/pick/receive/ship 各需一轮
    // 完成首次全量同步（轻量轮次不消费预算，因此首次同步在连续四轮内完成；
    // count 端点的值 = rows.length 恒为 0，预热后全部分类 last_count 均为 0）。
    await runScheduledShipHubSync(env, T0)
    await runScheduledShipHubSync(env, new Date(T0.getTime() + 60_000))
    await runScheduledShipHubSync(env, new Date(T0.getTime() + 2 * 60_000))
    await runScheduledShipHubSync(env, new Date(T0.getTime() + 3 * 60_000))

    // 语句记录代理（第二轮稳态：全部为轻量轮次）
    const prepared: string[] = []
    const batchSizes: number[] = []
    const countingDb = {
      prepare: (sql: string) => { prepared.push(sql); return db.prepare(sql) },
      batch: (statements: D1PreparedStatement[]) => { batchSizes.push(statements.length); return db.batch(statements) }
    } as unknown as D1Database
    resetHits()
    // +4 分钟：hand/pick 到点（55 秒）→ 轻量轮次；receive/ship 未到点（10 分钟）→ 零操作
    await runScheduledShipHubSync({ ...env, DB: countingDb } as WorkerEnv, new Date(T0.getTime() + 4 * 60_000))

    const sql = prepared.join('\n')
    assert.ok(!sql.includes('INSERT INTO shiphub_sync_leases'), '轻量轮次不得建租约')
    assert.ok(!sql.includes("'running')"), '轻量轮次不得建 running 行')
    const zombieSelects = prepared.filter((q) => q.includes("status = 'running' AND trigger_source = 'scheduled'")).length
    assert.equal(zombieSelects, 1, '僵尸扫描每 tick 只做一次（旧实现每分类一次 = 8 次）')
    const stateSelects = prepared.filter((q) => q.includes('FROM shiphub_category_state')).length
    assert.equal(stateSelects, 1, '分类状态必须批量预取（一次查询）')
    const connSelects = prepared.filter((q) => q.includes('FROM shiphub_connections c') && q.includes('access_token_ciphertext')).length
    assert.equal(connSelects, 1, '连接行必须批量预取（一次查询）')
    // 单批次预取（2026-09-19 第二轮）：tick 首个 batch 必须同时携带 5 条预取语句
    // （自愈候选 / 门店列表 / 僵尸扫描 / 分类状态 / 连接行）——两次往返合为一次。
    assert.equal(batchSizes[0], 5, `首个批量调用必须合并全部 5 条预取语句（实际 ${batchSizes[0]}）`)
    // 轻量心跳写延迟到 tick 末尾一次 flush：常态每分钟批量调用 3 → 2
    assert.equal(batchSizes.length, 2, `批量调用总数必须为 2（预取 1 + 末尾 flush 1；实际 ${batchSizes.length}）`)
    assert.equal(batchSizes[1], 4, `flush 必须携带 hand/pick 两分类的心跳语句（2 + 2 = 4；实际 ${batchSizes[1]}）`)
    const terminalRuns = prepared.filter((q) => q.includes("'succeeded', 0, 0, 0")).length
    assert.equal(terminalRuns, 2, '到点的 hand/pick 各落一条终态 succeeded run（监控契约不变）')
    assert.ok(prepared.length <= 12, `轻量 tick 语句总数必须 <= 12（实际 ${prepared.length}；改造前同口径约 20）`)
    // 上游探测不受影响：hand/pick 照常每分钟探测（实时性不变），且共用聚合快照
    assert.equal(hits.countsAgg, 1, '轻量轮次仍须完成计数探测（保 1 分钟级时效），且每店每 tick 只发 1 次聚合请求')
    assert.equal(hits.count, 0, '聚合可用时不得再发单类计数请求')
    const running = db.one<{ n: number }>(`SELECT COUNT(*) AS n FROM shiphub_sync_runs WHERE status = 'running'`)?.n
    assert.equal(running, 0, '轻量轮次不得留下 running 行')
    const leases = db.one<{ n: number }>(`SELECT COUNT(*) AS n FROM shiphub_sync_leases`)?.n
    assert.equal(leases, 0, '轻量轮次不得留下租约')
  } finally {
    db.close()
    await stopServer()
  }
})

test('营业窗口外（每天 12 小时）函数入口直接返回：零 D1 操作、零上游调用', async () => {
  await startServer()
  const db = await migratedTestDatabase()
  try {
    const env = await makeEnv(db, 'O'.repeat(760), new Date(Date.now() + 2 * 3600_000).toISOString())
    const outside = { ...env, SHIPHUB_ACTIVE_START_HOUR: '10', SHIPHUB_ACTIVE_END_HOUR: '22' } as WorkerEnv
    const prepared: string[] = []
    const countingDb = {
      prepare: (sql: string) => { prepared.push(sql); return db.prepare(sql) },
      batch: (statements: D1PreparedStatement[]) => db.batch(statements)
    } as unknown as D1Database
    resetHits()
    // 北京 23:00（UTC 15:00）——窗口外
    await runScheduledShipHubSync({ ...outside, DB: countingDb } as WorkerEnv, new Date('2026-09-12T15:00:00.000Z'))
    assert.equal(prepared.length, 0, `窗口外必须零 D1 语句（实际 ${prepared.length}；改造前每 tick 仍有预取/建行回退等多条空转查询）`)
    assert.equal(hits.count + hits.countsAgg + hits.list, 0, '窗口外不得调用上游')
  } finally {
    db.close()
    await stopServer()
  }
})

test('聚合计数：稳态每店每 tick 一次请求覆盖四分类；聚合失败自动回退单类且结果一致', async () => {
  await startServer()
  const db = await migratedTestDatabase()
  try {
    const env = await makeEnv(db, 'G'.repeat(760), new Date(Date.now() + 2 * 3600_000).toISOString())
    await insertLiveConnection(db, STORE_B, 'fp-store-g', 'G'.repeat(760))
    rows = [orderRow('o-agg', 'pending')]
    const T = Date.parse('2026-09-12T03:00:00.000Z')
    // 预热 8 轮：重活预算 1/tick + 分钟轮换下，两店 × 四分类的首次同步恰好
    // 在 T+0..T+7 完成（A: hand T+0 / pick T+2 / receive T+4 / ship T+6；
    // B: hand T+1 / pick T+3 / receive T+5 / ship T+7）。
    for (let i = 0; i < 8; i += 1) await runScheduledShipHubSync(env, new Date(T + i * 60_000))

    // 阶段一：稳态（T+8：仅 hand/pick 到点且计数无变化）——两店各 1 次聚合、单类 0 次
    resetHits()
    await runScheduledShipHubSync(env, new Date(T + 8 * 60_000))
    assert.equal(hits.countsAgg, 2, `稳态两家店各发 1 次聚合（实际 ${hits.countsAgg}；旧实现 4 次单类请求）`)
    assert.equal(hits.count, 0, '聚合可用时不得再发单类计数请求')

    // 阶段二：聚合强制失败——回退单类请求，且计数结果照常落库（正确性不依赖聚合）
    aggregateFailure = true
    resetHits()
    await runScheduledShipHubSync(env, new Date(T + 9 * 60_000))
    assert.ok(hits.countsAgg >= 1, '聚合失败仍须被尝试（失败即回退）')
    assert.ok(hits.count >= 4, `聚合失败后两店 hand/pick 各回退一次单类请求（实际 ${hits.count}）`)
    const handA = db.one<{ last_count: number }>(`SELECT last_count FROM shiphub_category_state WHERE store_id = ? AND category = 'hand'`, STORE)
    const handB = db.one<{ last_count: number }>(`SELECT last_count FROM shiphub_category_state WHERE store_id = ? AND category = 'hand'`, STORE_B)
    assert.equal(handA?.last_count, 1, '回退路径的计数结果必须照常落库（店 A）')
    assert.equal(handB?.last_count, 1, '回退路径的计数结果必须照常落库（店 B）')
  } finally {
    aggregateFailure = false
    db.close()
    await stopServer()
  }
})

test('双店满载有界性：每分钟语句/批量/上游请求均有硬上限（不为门店数失控）', async () => {
  await startServer()
  const db = await migratedTestDatabase()
  try {
    const env = await makeEnv(db, 'H'.repeat(760), new Date(Date.now() + 2 * 3600_000).toISOString())
    await insertLiveConnection(db, STORE_B, 'fp-store-h', 'H'.repeat(760))
    // 两店共 6 个订单；hand 计数每轮都变化（最忙的真实形态）
    rows = Array.from({ length: 6 }, (_, i) => orderRow(`busy-${i}`))
    const T = Date.parse('2026-09-12T03:00:00.000Z')

    // 采集 12 个连续 tick（含首轮建表 + 稳态 + 变化轮），逐 tick 统计上限
    const perTick: Array<{ stmts: number; batches: number; agg: number; lists: number }> = []
    for (let i = 0; i < 12; i += 1) {
      countOverrides = { hand: 3 + (i % 4) } // 每轮变化 → 每分钟至少一个重活
      const prepared: string[] = []
      let batchCount = 0
      const countingDb = {
        prepare: (sql: string) => { prepared.push(sql); return db.prepare(sql) },
        batch: (statements: D1PreparedStatement[]) => { batchCount += 1; return db.batch(statements) }
      } as unknown as D1Database
      resetHits()
      await runScheduledShipHubSync({ ...env, DB: countingDb } as WorkerEnv, new Date(T + i * 60_000))
      perTick.push({ stmts: prepared.length, batches: batchCount, agg: hits.countsAgg, lists: hits.list })
    }

    const maxStmts = Math.max(...perTick.map((t) => t.stmts))
    const maxBatches = Math.max(...perTick.map((t) => t.batches))
    const maxAgg = Math.max(...perTick.map((t) => t.agg))
    const maxLists = Math.max(...perTick.map((t) => t.lists))
    // 硬上限（2026-09-19 满载有界性契约）：双店最忙单 tick 也必须落在这些界内，
    // 这是「免费层 10ms 预算不被击穿」的结构性保证。
    assert.ok(maxStmts <= 60, `单 tick 语句数上限 60（实测 ${maxStmts}）`)
    assert.ok(maxBatches <= 4, `单 tick 批量调用上限 4（实测 ${maxBatches}）`)
    assert.ok(maxAgg <= 2, `单 tick 聚合计数请求上限 2（两店各一；实测 ${maxAgg}）`)
    assert.ok(maxLists <= 1, `单 tick 重活预算 = 1：列表拉取上限 1（实测 ${maxLists}）`)
  } finally {
    countOverrides = {}
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
