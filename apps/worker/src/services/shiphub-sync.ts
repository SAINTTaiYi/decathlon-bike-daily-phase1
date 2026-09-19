import { loadConfig, type AppConfig, type WorkerEnv } from '../env.js'
import { all, first, nowIso, run, uuid } from '../db.js'
import { ShipHubUpstreamError, createShipHubClient, type ShipHubCategory, type ShipHubClient, type ShipHubOrder } from '../lib/shiphub-client.js'
import { readCachedAccessToken, readRefreshToken, rotateRefreshToken, shipHubIdentityFingerprint } from '../lib/shiphub-oauth.js'
import { performShipHubProgrammaticLogin, splitEncryptedBlob } from '../lib/shiphub-login.js'
import { decryptShipHubSecret, encryptShipHubSecret } from '../lib/shiphub-crypto.js'
import { normalizeShipHubLocationNum } from '../lib/shiphub-location.js'
import { getCubeIdentityInfo } from './cube-identity.js'
import { refreshShipHubAccessToken } from '../lib/shiphub-token.js'
import { ApiProblem } from './problems.js'
import { sendShipHubFailureAlert, shouldAlertOnShipHubFailure } from './shiphub-alert.js'
import { bumpStoreVersion } from './store-changes.js'
import { hourFormatter } from '../lib/time-format.js'

// 硬规则：门店营业时间（北京时间 10:00–22:00）内才允许调用 Shiphub 上游获取自提数据。
// 固定使用 Asia/Shanghai，不随门店 timezone 字段或部署环境变化。
export const SHIPHUB_SYNC_TIMEZONE = 'Asia/Shanghai'
export const SHIPHUB_BUSINESS_START_HOUR = 10
export const SHIPHUB_BUSINESS_END_HOUR = 22

const CATEGORIES: readonly ShipHubCategory[] = ['hand', 'pick', 'receive', 'ship']
// 计数轮询间隔（2026-09-09 实时化）：hand/pick 是「待取车」看板的核心分类，
// 从 5 分钟压到 55 秒——count 端点只返回一个整数，是最便宜的上游调用；
// 只有计数变化时才会拉列表（见 syncStoreCategory 的 countChanged → shouldList），
// 因此把间隔压到分钟级不会带来成比例的负载增长。
// receive/ship 保持 10 分钟：不是实时看板的核心，且调用成本不必要。
// cron 为每分钟一次（见 wrangler.jsonc triggers.crons），55 秒保证每个 tick 都能命中。
const COUNT_INTERVAL_MS: Record<ShipHubCategory, number> = { hand: 55_000, pick: 55_000, receive: 10 * 60_000, ship: 10 * 60_000 }
const FULL_INTERVAL_MS: Record<ShipHubCategory, number> = { hand: 15 * 60_000, pick: 15 * 60_000, receive: 30 * 60_000, ship: 30 * 60_000 }
// 多门店重活预算（2026-09-19）：免费层 CPU 上限 10ms/调用，一次 tick 顺序执行
// 全部门店的全部重活会让 CPU 随门店数线性增长（1670 接入前只有一家店，量增即
// 重新逼近被平台 exceededCpu 终止的阈值——2026-09-10/11 停摆的同型风险）。
// 现在：每分钟 tick 仍对全部门店做计数探测（便宜，保 1 分钟级时效），但
// 「拉列表 / 明细 / 写库」这类重活每次调用最多执行 MAX_HEAVY_SYNCS_PER_TICK 个，
// 由 runScheduledShipHubSync 按分钟轮换门店优先序后注入预算；被顺延的分类
// 不更新 last_count / last_attempt_at，下一分钟自动重试（最坏多等 1 分钟）。
// 门店数继续增长时按需提高（每次调用 CPU 峰值随该常量线性增长，需重新评估）。
export const MAX_HEAVY_SYNCS_PER_TICK = 1
// 被平台中断的尝试判定窗口（2026-09-19 事故修复）：免费层超 CPU 预算的调用会被
// 直接终止，来不及执行 catch/finally；有窗口内 scheduled 'running' 记录 = 上一次
// 尝试被中断，本轮让出（见 syncStoreCategory 的守卫段）。
const ZOMBIE_WINDOW_MS = 15 * 60_000
// 连续失败退避阈值：>= 3 次后按指数推后重试（封顶 10 分钟），避免一个持续失败的
// 上游每分钟吃掉 tick 预算、饿死同门店其它分类。
const FAILURE_BACKOFF_THRESHOLD = 3
const MANUAL_FRESH_MS = 2 * 60_000
// 页面打开时的「确保新鲜」门禁（2026-09-09）：前端在挂载/回到前台时调用
// POST /api/v1/shiphub/ensure-fresh，服务端只在数据确实过期时才打上游。
// 60 秒是「用户感知实时」与「上游调用量」的平衡点：有人在看页面时，
// 数据最多滞后 60 秒 + 一次同步耗时（通常 1-3 秒）。
export const ENSURE_FRESH_MS = 60_000
// 自愈重试节流（2026-09-08 事故重设计）：冷却改用专用列 heal_last_attempted_at，
// 不再复用 updated_at——cube token 每小时刷新、手动同步失败、token 轮换都写那列，
// 曾把 30 分钟冷却实际推成 40-45 分钟（token 死亡期间看板整段停摆）。
// 常规（未经历自愈失败）下一 tick 即重试（5 分钟）：上游 token 轮换竞态是 400 主因，
// 一次程序化重登通常即恢复；自愈失败（SELF_HEAL_FAILED）后退避 30 分钟——
// 上游登录有风控，坏凭据不能每 5 分钟打一次。
const HEAL_RETRY_MS = 5 * 60_000
const SELF_HEAL_BACKOFF_MS = 30 * 60_000
// 连续多少次 token 4xx 才把连接升级为 reauth_required（2026-09-09 修复 · 第 3 项）。
// 单次 4xx 多为「BI/Cube 重登作废 RT 族」的瞬时撞车，内联重登即可恢复；
// 只有反复失败（自愈也没救回来）才说明凭据真失效，需要门店人工重连。
const TOKEN_REAUTH_THRESHOLD = 3
// 同步租约（2026-09-15 调整 90s → 50s）：租约只在同步进行期间生效，50 秒足以覆盖
// 常态最长同步（<10 秒）并留 5 倍余量；一旦 tick 被平台终止（CPU 超限），残留租约
// 最多挡住下一轮一次——下一分钟 tick 即可接管重试，而不是被挡两轮（自愈从 ~2 分钟
// 缩短到 ~1 分钟）。极端情况下真实同步若超过 50 秒，下一轮接管只会重复一轮上游拉取
// （幂等 upsert），不会写坏数据。
const LEASE_MS = 50_000

export type ShipHubConnection = {
  storeId: string
  enabled: boolean
  mode: 'fixture' | 'live'
  authorizationStatus: string
  lastAuthErrorCode: string | null
  lastSuccessAt: string | null
  locationNum: string | null
  hasPerStoreLogin: boolean
}

type CategoryState = {
  store_id: string
  category: ShipHubCategory
  last_count: number | null
  last_attempt_at: string | null
  last_success_at: string | null
  last_full_reconcile_at: string | null
  next_reconcile_at: string | null
  last_error_code: string | null
  consecutive_failures: number
}

type OrderRow = {
  store_id: string
  category: ShipHubCategory
  upstream_order_id: string
  display_label: string
  source_label: string
  order_status: string
  order_number?: string | null
  customer_phone?: string | null
  vehicle_info?: string | null
  channel?: string | null
  scheduled_at: string | null
  upstream_updated_at: string | null
  first_seen_at: string
  last_seen_at: string
  upstream_absent_at: string | null
  updated_at: string
  local_action_state?: string | null
}

export type ShipHubPublicOrder = OrderRow & {
  items: Array<{
    id: string
    productLabel: string
    sku: string
    quantity: number
    serialNumberMasked: string | null
    imageUrl: string | null
  }>
  localActionState: string | null
}

function mapConnection(row: any): ShipHubConnection {
  return {
    storeId: row.store_id,
    enabled: row.enabled === 1 || row.enabled === true,
    mode: row.mode === 'live' ? 'live' : 'fixture',
    authorizationStatus: row.authorization_status,
    lastAuthErrorCode: row.last_auth_error_code ?? null,
    lastSuccessAt: row.last_success_at ?? null,
    locationNum: row.location_num ?? null,
    hasPerStoreLogin: Boolean(row.login_username_enc)
  }
}

export async function getShipHubConnection(db: D1Database, storeId: string): Promise<ShipHubConnection | null> {
  const row = await first(db.prepare(`
    SELECT c.store_id, c.enabled, c.mode, c.authorization_status, c.last_auth_error_code,
           c.location_num, c.login_username_enc,
           MAX(s.last_success_at) AS last_success_at
    FROM shiphub_connections c
    LEFT JOIN shiphub_category_state s ON s.store_id = c.store_id
    WHERE c.store_id = ?
    GROUP BY c.store_id, c.enabled, c.mode, c.authorization_status, c.last_auth_error_code
  `).bind(storeId))
  return row ? mapConnection(row) : null
}

function requireEnabled(config: AppConfig): void {
  if (!config.SHIPHUB.enabled) throw new ApiProblem(404, 'SHIPHUB_DISABLED', 'Shiphub 接入尚未启用。')
}

function ensureCategory(category: string): asserts category is ShipHubCategory {
  if (!CATEGORIES.includes(category as ShipHubCategory)) throw new ApiProblem(400, 'INVALID_SHIPHUB_CATEGORY', 'Shiphub 分类无效。')
}

export function activeInStoreTimezone(timezone: string, now = new Date(), startHour = 6, endHour = 23): boolean {
  try {
    // formatter 走模块级缓存（2026-09-12 CPU 优化）：tick 每分钟要判定多次，
    // 每次 new Intl.DateTimeFormat 是毫秒级成本，是 tick CPU 的最大单项。
    const hourText = hourFormatter(timezone).format(now)
    const hour = Number(hourText)
    if (!Number.isInteger(hour)) return false
    if (startHour === endHour) return true
    return startHour < endHour ? hour >= startHour && hour < endHour : hour >= startHour || hour < endHour
  } catch {
    return false
  }
}

function isDue(value: string | null, intervalMs: number, nowMs: number): boolean {
  return !value || nowMs - Date.parse(value) >= intervalMs
}

function nextAt(now: Date, intervalMs: number): string {
  return new Date(now.getTime() + intervalMs).toISOString()
}

export async function getShipHubSummary(db: D1Database, config: AppConfig, storeId: string) {
  const connection = await getShipHubConnection(db, storeId)
  const states = await all<CategoryState>(db.prepare('SELECT * FROM shiphub_category_state WHERE store_id = ?').bind(storeId))
  const counts = await all<{ category: ShipHubCategory; count: number }>(db.prepare(`
    SELECT category, COUNT(*) AS count
    FROM shiphub_orders
    WHERE store_id = ? AND upstream_absent_at IS NULL
    GROUP BY category
  `).bind(storeId))
  const countMap = new Map(counts.map((row) => [row.category, Number(row.count)]))
  const stateMap = new Map(states.map((row) => [row.category, row]))
  return {
    enabled: config.SHIPHUB.enabled,
    mode: config.SHIPHUB.mode,
    connection: connection ? {
      enabled: connection.enabled,
      mode: connection.mode,
      authorizationStatus: connection.authorizationStatus,
      lastAuthErrorCode: connection.lastAuthErrorCode,
      // 本店账号是否已配置（2026-09-18）：连接对话框据此把账号表单折叠成
      // 「更改账号密码」按钮——已配置的门店每次打开都被三个空输入框挡住主要动作，
      // 还容易被误读成「要重填一遍」。只下发布尔值，凭据本身永不出库（连接行是
      // 加密列，公共视图一贯只暴露 hasPerStoreLogin）。
      hasPerStoreLogin: connection.hasPerStoreLogin
    } : null,
    // cubeAuth：本店账密派生的 Cube 身份（BI/perfeco 链路）公开状态。
    cubeAuth: await getCubeIdentityInfo(db, storeId),
    categories: CATEGORIES.map((category) => {
      const state = stateMap.get(category)
      const count = countMap.get(category) ?? 0
      const staleAfter = FULL_INTERVAL_MS[category]
      const stale = !state?.last_full_reconcile_at || Date.now() - Date.parse(state.last_full_reconcile_at) > staleAfter
      return {
        category,
        count,
        lastCount: state?.last_count ?? null,
        lastAttemptAt: state?.last_attempt_at ?? null,
        lastSuccessAt: state?.last_success_at ?? null,
        lastFullReconcileAt: state?.last_full_reconcile_at ?? null,
        nextReconcileAt: state?.next_reconcile_at ?? null,
        lastErrorCode: state?.last_error_code ?? null,
        consecutiveFailures: state?.consecutive_failures ?? 0,
        stale
      }
    })
  }
}

function cursorEncode(updatedAt: string, id: string): string {
  return btoa(`${updatedAt}|${id}`).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '')
}

function cursorDecode(cursor: string): [string, string] {
  try {
    const padded = cursor.replace(/-/g, '+').replace(/_/g, '/')
    const value = atob(padded + '==='.slice((padded.length + 3) % 4))
    const [updatedAt, id] = value.split('|')
    if (!updatedAt || !id) throw new Error('invalid')
    return [updatedAt, id]
  } catch {
    throw new ApiProblem(400, 'INVALID_SHIPHUB_CURSOR', 'Shiphub 列表翻页标识无效。')
  }
}

export async function listShipHubOrders(db: D1Database, storeId: string, category: ShipHubCategory, cursor: string | null, limit: number): Promise<{ orders: ShipHubPublicOrder[]; nextCursor: string | null }> {
  ensureCategory(category)
  const safeLimit = Math.min(Math.max(limit, 1), 100)
  const clauses = ['o.store_id = ?', 'o.category = ?', 'o.upstream_absent_at IS NULL']
  const values: Array<string | number> = [storeId, category]
  if (cursor) {
    const [updatedAt, id] = cursorDecode(cursor)
    clauses.push('(o.updated_at < ? OR (o.updated_at = ? AND o.upstream_order_id < ?))')
    values.push(updatedAt, updatedAt, id)
  }
  const rows = await all<OrderRow>(db.prepare(`
    SELECT o.*,
      (SELECT a.local_state FROM shiphub_order_actions a
       WHERE a.store_id = o.store_id AND a.category = o.category AND a.upstream_order_id = o.upstream_order_id
       ORDER BY a.acted_at DESC, a.created_at DESC LIMIT 1) AS local_action_state
    FROM shiphub_orders o
    WHERE ${clauses.join(' AND ')}
    ORDER BY o.updated_at DESC, o.upstream_order_id DESC
    LIMIT ?
  `).bind(...values, safeLimit + 1))
  const pageRows = rows.slice(0, safeLimit)
  const orders = await Promise.all(pageRows.map((row) => getShipHubOrder(db, row.store_id, row.category, row.upstream_order_id)))
  const last = pageRows.at(-1)
  return { orders: orders.filter((order): order is ShipHubPublicOrder => Boolean(order)), nextCursor: rows.length > safeLimit && last ? cursorEncode(last.updated_at ?? last.last_seen_at, last.upstream_order_id) : null }
}

export async function getShipHubOrder(db: D1Database, storeId: string, category: ShipHubCategory, id: string): Promise<ShipHubPublicOrder | null> {
  const row = await first<OrderRow>(db.prepare(`
    SELECT o.*,
      (SELECT a.local_state FROM shiphub_order_actions a
       WHERE a.store_id = o.store_id AND a.category = o.category AND a.upstream_order_id = o.upstream_order_id
       ORDER BY a.acted_at DESC, a.created_at DESC LIMIT 1) AS local_action_state
    FROM shiphub_orders o
    WHERE o.store_id = ? AND o.category = ? AND o.upstream_order_id = ?
  `).bind(storeId, category, id))
  if (!row) return null
  const items = await all<any>(db.prepare(`
    SELECT upstream_item_id AS id, product_label, sku, quantity, vehicle_info, serial_number_masked, image_url
    FROM shiphub_order_items
    WHERE store_id = ? AND category = ? AND upstream_order_id = ?
    ORDER BY upstream_item_id ASC
  `).bind(storeId, category, id))
  return {
    ...row,
    items: items.map((item) => ({
      id: item.id,
      productLabel: item.product_label,
      vehicleInfo: item.vehicle_info,
      sku: item.sku,
      quantity: item.quantity,
      serialNumberMasked: item.serial_number_masked,
      imageUrl: item.image_url
    })),
    localActionState: row.local_action_state ?? null
  }
}

async function connectionForSync(
  db: D1Database,
  config: AppConfig,
  storeId: string,
  prefetchedRow?: Record<string, unknown> | null
): Promise<{ client: ShipHubClient; refresh?: { ciphertext: string; nonce: string }; needsCleanup: boolean }> {
  if (config.SHIPHUB.mode === 'fixture') return { client: createShipHubClient(config.SHIPHUB), needsCleanup: false }
  // 2026-09-19 深度 CPU 优化：定时 tick 由 runScheduledShipHubSync 批量预取连接行
  // （prefetchedRow）注入，免去每店一次 D1 往返；独立调用（手动/授权/ensure-fresh）
  // 未提供时回退单条查询。原查询里的 JOIN stores（取 code/name 作错误上下文）从未
  // 被使用，一并删除——每次少一行读取、少一次 JOIN。
  const row = prefetchedRow !== undefined && prefetchedRow !== null
    ? prefetchedRow
    : await first<any>(db.prepare(`
        SELECT c.enabled, c.mode, c.refresh_token_ciphertext, c.refresh_token_nonce,
               c.access_token_ciphertext, c.access_token_nonce, c.token_expires_at,
               c.location_num, c.identity_fingerprint,
               c.authorization_status, c.last_auth_error_code
        FROM shiphub_connections c
        WHERE c.store_id = ?
      `).bind(storeId))
  if (!row || !(row.enabled === 1 || row.enabled === true)) throw new ShipHubUpstreamError('CONNECTION_DISABLED')
  // 成功同步时的连接降级清理只在确需时才提交（2026-09-19 深度 CPU 优化：
  // 常态连接无降级状态，省去每分类一条 no-op UPDATE）。
  const needsCleanup = row.authorization_status !== 'connected' || row.last_auth_error_code != null
  if (row.mode === 'fixture') return { client: createShipHubClient({ ...config.SHIPHUB, mode: 'fixture' }), needsCleanup: false }
  // 位置标识规范化（2026-09-19）：读取路径同样规范化——历史遗留的短码行
  // 无需人工修数即可恢复（1670 曾以短码入库导致 pick/ship 全面失败）。
  const locationNum = normalizeShipHubLocationNum(row.location_num) ?? normalizeShipHubLocationNum(config.SHIPHUB.locationNum) ?? undefined
  // ── access token 复用优先（2026-09-09 OAUTH_TOKEN_HTTP_400 修复）─────────
  // 剩余寿命充足时直接用缓存 token，完全不碰 refresh token 族。
  // 这是修复的核心：上游 RT 是族级的，重新登录（BI/Cube 链路）会作废它，
  // 所以「少刷新」直接等于「少撞车」。缓存不依赖 refresh token 是否存在，
  // 因此这里刻意放在 refresh_token 检查之前——即便 RT 暂时缺失，
  // 只要 access token 还有效，本轮同步照常进行。
  const cached = await readCachedAccessToken(config, row)
  if (cached) return { client: createShipHubClient(config.SHIPHUB, cached.accessToken, locationNum), needsCleanup }
  if (!row.refresh_token_ciphertext || !row.refresh_token_nonce) throw new ShipHubUpstreamError('REFRESH_TOKEN_MISSING')
  const fingerprint = row.identity_fingerprint ?? await shipHubIdentityFingerprint(locationNum)
  // 同一上游身份全局互斥：轮换前必须拿到 fingerprint 租约，防止共享身份的多店并发
  // 刷新触发上游轮换竞态（2026-08-19 事故机制）。拿不到租约 = 其他门店正在用同一身份，
  // 直接跳过本轮，不轮换、不误标 reauth_required。
  const owner = uuid()
  if (!fingerprint || !(await acquireIdentityLease(db, fingerprint, owner, nowIso()))) {
    throw new ShipHubUpstreamError('IDENTITY_LEASE_BUSY')
  }
  try {
    // 拿到租约后二次检查缓存：并发请求可能在等租约期间刚刷新过，
    // 直接复用可避免「拿到租约又刷新一次」的浪费。
    // 必须连 refresh_token 列一起取——CAS 的 WHERE 条件依赖它，只取 access token
    // 会让 latest.refresh_token_* 为 undefined 而回落到陈旧值，导致轮换结果静默丢失。
    const fresh = await first<any>(db.prepare(`
      SELECT access_token_ciphertext, access_token_nonce, token_expires_at,
             refresh_token_ciphertext, refresh_token_nonce
      FROM shiphub_connections WHERE store_id = ?
    `).bind(storeId))
    const afterLease = await readCachedAccessToken(config, fresh ?? row)
    if (afterLease) return { client: createShipHubClient(config.SHIPHUB, afterLease.accessToken, locationNum), needsCleanup }
    const latest = fresh ?? row
    const latestCiphertext = latest.refresh_token_ciphertext ?? row.refresh_token_ciphertext
    const latestNonce = latest.refresh_token_nonce ?? row.refresh_token_nonce
    const refreshToken = await readRefreshToken(config, { refresh_token_ciphertext: latestCiphertext, refresh_token_nonce: latestNonce })
    const token = await refreshShipHubAccessToken(config.SHIPHUB, refreshToken)
    await rotateRefreshToken(db, config, storeId, latestCiphertext, latestNonce, token)
    return { client: createShipHubClient(config.SHIPHUB, token.accessToken, locationNum), refresh: { ciphertext: latestCiphertext, nonce: latestNonce }, needsCleanup }
  } finally {
    await releaseIdentityLease(db, fingerprint, owner)
  }
}

// 同一上游身份（location_num + 登录账号）的 token 轮换互斥租约
const IDENTITY_LEASE_MS = 60_000

async function acquireIdentityLease(db: D1Database, fingerprint: string, owner: string, now: string): Promise<boolean> {
  const expires = new Date(Date.parse(now) + IDENTITY_LEASE_MS).toISOString()
  const result = await run(db.prepare(`
    INSERT INTO shiphub_identity_leases (fingerprint, lease_owner, lease_expires_at, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(fingerprint) DO UPDATE SET lease_owner = excluded.lease_owner,
      lease_expires_at = excluded.lease_expires_at, updated_at = excluded.updated_at
    WHERE shiphub_identity_leases.lease_expires_at <= ? OR shiphub_identity_leases.lease_owner = ?
  `).bind(fingerprint, owner, expires, now, now, owner))
  return Number(result.meta.changes) > 0
}

async function releaseIdentityLease(db: D1Database, fingerprint: string, owner: string): Promise<void> {
  await db.prepare('DELETE FROM shiphub_identity_leases WHERE fingerprint = ? AND lease_owner = ?').bind(fingerprint, owner).run()
}

async function acquireLease(db: D1Database, storeId: string, owner: string, now: string): Promise<boolean> {
  const expires = new Date(Date.parse(now) + LEASE_MS).toISOString()
  const result = await run(db.prepare(`
    INSERT INTO shiphub_sync_leases (store_id, lease_owner, lease_expires_at, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(store_id) DO UPDATE SET lease_owner = excluded.lease_owner,
      lease_expires_at = excluded.lease_expires_at, updated_at = excluded.updated_at
    WHERE shiphub_sync_leases.lease_expires_at <= ? OR shiphub_sync_leases.lease_owner = ?
  `).bind(storeId, owner, expires, now, now, owner))
  return Number(result.meta.changes) > 0
}

async function releaseLease(db: D1Database, storeId: string, owner: string): Promise<void> {
  await db.prepare('DELETE FROM shiphub_sync_leases WHERE store_id = ? AND lease_owner = ?').bind(storeId, owner).run()
}

async function ensureState(db: D1Database, storeId: string, category: ShipHubCategory): Promise<CategoryState> {
  const stamp = nowIso()
  // 2026-09-12 CPU/D1 预算优化：旧实现每 tick 无条件「INSERT OR IGNORE + SELECT」
  // （每分类 2 次 D1），但行建立后 INSERT 永远是无用写。改为先读，缺行才建——
  // 常态 1 次 D1，只有历史上第一次同步某个分类才走建行路径。
  const existing = await first<CategoryState>(db.prepare('SELECT * FROM shiphub_category_state WHERE store_id = ? AND category = ?').bind(storeId, category))
  if (existing) return existing
  await db.prepare(`INSERT OR IGNORE INTO shiphub_category_state (store_id, category, updated_at) VALUES (?, ?, ?)`).bind(storeId, category, stamp).run()
  const row = await first<CategoryState>(db.prepare('SELECT * FROM shiphub_category_state WHERE store_id = ? AND category = ?').bind(storeId, category))
  if (!row) throw new Error('SHIPHUB_CATEGORY_STATE_MISSING')
  return row
}

/**
 * 分类计数解析（2026-09-19 第二轮深度 CPU 优化）：优先用 tick 级聚合快照
 * （一次请求覆盖四分类），快照不可用时逐类单查——两条路径结果语义一致，
 * 差异只在请求次数。快照的加载失败（网络/字段异常）被吞掉并标记为 null，
 * 后续分类走单查路径，不影响同步正确性。
 */
async function resolveCategoryCount(
  client: ShipHubClient,
  category: ShipHubCategory,
  snapshot?: { loaded: boolean; values: Partial<Record<ShipHubCategory, number>> | null }
): Promise<number> {
  if (!snapshot) return client.count(category)
  if (!snapshot.loaded) {
    try {
      snapshot.values = await client.counts()
    } catch {
      snapshot.values = null
    }
    snapshot.loaded = true
  }
  const fromSnapshot = snapshot.values?.[category]
  if (typeof fromSnapshot === 'number') return fromSnapshot
  return client.count(category)
}

function errorCode(error: unknown): string {
  if (error instanceof ShipHubUpstreamError) {
    // 诊断增强（2026-09-19）：上游 4xx/5xx 的 HTTP 状态并入错误码（如
    // UPSTREAM_ERROR_500），从 D1 即可区分上游故障形态；无状态的传输类错误
    // （超时/网络）保持原码不变。
    if (error.code === 'UPSTREAM_ERROR' && typeof error.status === 'number') return `UPSTREAM_ERROR_${error.status}`
    return error.code
  }
  return 'SYNC_FAILED'
}

function normalizeOrderForWrite(order: ShipHubOrder, category: ShipHubCategory): ShipHubOrder {
  if (order.category !== category) throw new ShipHubUpstreamError('CATEGORY_MISMATCH')
  return order
}

/**
 * 找出窗口内被平台中断的 scheduled run（僵尸守卫的查询半边，2026-09-19）。
 * 定时 tick 通过批量预取注入（prefetched.zombieIds）不调用本函数；独立调用
 * （手动/授权/ensure-fresh）用本函数自查，保持相同语义。
 */
async function findTerminatedRunIds(db: D1Database, storeId: string, category: ShipHubCategory, now: Date): Promise<string[]> {
  const cutoff = new Date(now.getTime() - ZOMBIE_WINDOW_MS).toISOString()
  const rows = await all<{ id: string }>(db.prepare(`
    SELECT id FROM shiphub_sync_runs
    WHERE store_id = ? AND category = ? AND status = 'running' AND trigger_source = 'scheduled' AND started_at >= ?
  `).bind(storeId, category, cutoff))
  return rows.map((row) => row.id)
}

export async function syncStoreCategory(
  db: D1Database,
  config: AppConfig,
  storeId: string,
  category: ShipHubCategory,
  options: {
    trigger?: 'scheduled' | 'manual' | 'authorization'
    batchId?: string
    client?: ShipHubClient
    now?: Date
    retriedAfterRelogin?: boolean
    /**
     * tick 内连接解析缓存（2026-09-12 CPU 优化）：一次 cron tick 会对同一门店
     * 连续同步多个分类，每个分类原本都要独立解析连接（每条链路含一次 AES-GCM
     * 解密，约几百微秒）。同一 tick 内连接配置不会变化，解析结果可安全复用。
     * 仅由 runScheduledShipHubSync 注入；其它调用方不传 = 行为不变。
     */
    connectionCache?: Map<string, { client: ShipHubClient; needsCleanup: boolean }>
    /**
     * tick 级批量预取（2026-09-19 深度 CPU 优化）：把「分类状态 / 僵尸运行记录 /
     * 连接行」由 runScheduledShipHubSync 用两次 db.batch 预取后注入，免去每分类
     * 2 次独立 D1 往返（ensureState + 僵尸查询）与每店 1 次连接查询。
     * 未提供时（手动/授权/ensure-fresh 等独立调用）自动回退到各自的单条查询。
     */
    prefetched?: {
      state?: CategoryState | null
      zombieIds?: string[]
      connectionRow?: Record<string, unknown> | null
    }
    /**
     * tick 级聚合计数快照（2026-09-19 第二轮深度 CPU 优化）：本店本 tick 内
     * 首次需要计数时用一次聚合请求取回全部分类计数（上游
     * `/stores/orders/count`），其余分类复用——把每分钟的 4 次计数请求压成 1 次。
     * 聚合失败或字段缺失时自动回退单类请求（正确性不依赖聚合端点）。
     */
    countsSnapshot?: { loaded: boolean; values: Partial<Record<ShipHubCategory, number>> | null }
    /**
     * tick 级延迟写入队列（2026-09-19 第二轮深度 CPU 优化）：轻量轮次的心跳写入
     * （状态 UPDATE + 终态 run INSERT）不各自发一次 db.batch，而是推进本队列，
     * 由 runScheduledShipHubSync 在 tick 末尾一次性 flush——把常态每分钟的
     * 4 个分类批量调用合并为 1 个。仅 scheduled 路径注入；独立调用（手动/授权/
     * ensure-fresh）不传 = 立即执行（行为不变）。flush 失败只丢失心跳行，
     * 下一轮自动重算，不影响业务数据。
     */
    pendingWrites?: D1PreparedStatement[]
    /**
     * tick 级重活预算（2026-09-19 多门店铺开）：{ remaining } 由
     * runScheduledShipHubSync 每 tick 注入一次、本 tick 全部门店共享。预算耗尽后
     * 其余分类**完全静默**（不探测、不建 run、不写状态，见函数顶部的短路），
     * 计数差异保持未消费，下一分钟重试。
     * 手动/授权触发不传 = 不受限（用户显式操作不能等预算）。
     */
    heavyBudget?: { remaining: number }
  } = {}
): Promise<{ status: 'succeeded' | 'skipped' | 'failed'; reason?: string; runId?: string }> {
  requireEnabled(config)
  const trigger = options.trigger ?? 'scheduled'
  const now = options.now ?? new Date()
  const stamp = now.toISOString()
  // ── tick 预算短路（2026-09-19 深夜事故修复）───────────────────────────────
  // 预算被本 tick 里排位更靠前的分类/门店用掉后，其余分类完全静默：不探测、
  // 不建 run 记录、不写任何状态、零 D1 操作直接返回。旧实现先做一次计数探测、
  // 建 run、再标记「顺延」——两店轮流执行时等于每分钟多出 6-7 次无意义的
  // 探测与记账，是免费层 10ms/次 CPU 预算被击穿（平台终止同步）的放大器。
  if (options.heavyBudget && options.heavyBudget.remaining <= 0) {
    return { status: 'skipped', reason: 'HEAVY_BUDGET_DEFERRED' }
  }
  if (trigger === 'manual' && !options.batchId) {
    const recent = await first<{ id: string }>(db.prepare(`
      SELECT id FROM shiphub_sync_runs
      WHERE store_id = ? AND trigger_source = 'manual' AND started_at > ?
      ORDER BY started_at DESC LIMIT 1
    `).bind(storeId, new Date(now.getTime() - MANUAL_FRESH_MS).toISOString()))
    if (recent) return { status: 'skipped', reason: 'MANUAL_COOLDOWN' }
  }
  // 分类状态优先用 tick 级批量预取（2026-09-19 深度 CPU 优化）；未命中时回退单查。
  const state = options.prefetched?.state ?? await ensureState(db, storeId, category)
  // 硬规则兜底：live 模式在建立任何上游连接（token 刷新/数据拉取）前校验营业时间，
  // 防止未来新增调用路径绕过路由层与调度层的门禁。
  if (!options.client && config.SHIPHUB.mode === 'live' && !activeInStoreTimezone(SHIPHUB_SYNC_TIMEZONE, now, config.SHIPHUB.activeStartHour, config.SHIPHUB.activeEndHour)) {
    return { status: 'skipped', reason: 'OUTSIDE_BUSINESS_HOURS' }
  }
  const lastSuccess = state.last_success_at ? Date.parse(state.last_success_at) : 0
  if (trigger === 'manual' && lastSuccess && now.getTime() - lastSuccess < MANUAL_FRESH_MS) return { status: 'skipped', reason: 'CACHE_FRESH' }
  // 显式退避保持（2026-09-19 事故修复）：last_attempt_at 被写为未来时刻 = 连续
  // 失败退避中（见 catch 路径的失败退避段）。退避期内 scheduled 一律不尝试，
  // 手动/授权触发不受限（用户显式操作不能等退避）。
  // 注意必须放在 countDue 之前：从未成功过的分类 fullReconcile 恒为真，只靠
  // last_attempt 的常规间隔无法拦住它每分钟重试。
  if (trigger === 'scheduled' && state.last_attempt_at && Date.parse(state.last_attempt_at) > now.getTime()) {
    return { status: 'skipped', reason: 'FAILURE_BACKOFF' }
  }
  const fullReconcile = trigger === 'manual' || isDue(state.last_full_reconcile_at, FULL_INTERVAL_MS[category], now.getTime())
  const countDue = fullReconcile || isDue(state.last_attempt_at, COUNT_INTERVAL_MS[category], now.getTime())
  if (!countDue) return { status: 'skipped', reason: 'NOT_DUE' }

  // ── 被平台中断的尝试守卫（2026-09-19 深夜事故修复）─────────────────────────
  // 免费层超预算调用会被平台直接终止：被终止的尝试来不及走 catch/finally，
  // run 记录永远停在 running、状态与租约都不更新——同一重活于是下个 tick 原样
  // 重跑、再被终止，形成「每分钟自杀一次」的死循环（2026-09-19 11:48 起 1299
  // 门店所有分类卡死即此机制；2026-09-10/11 停摆同源）。
  // 判定：存在窗口内 scheduled 'running' 记录 = 上一次尝试被中断并被抛弃。
  // 处置：标记为 skipped/INVOCATION_TERMINATED（专用原因码，不是 failed、不触发
  // 失败告警），推后本分类重试节奏（last_attempt_at = now），本轮让出。
  // 2026-09-19 深度 CPU 优化：定时 tick 由批量预取注入 zombieIds（tick 内一次
  // 全表扫描替代每分类一次查询）；独立调用回退到 findTerminatedRunIds 自查。
  const zombieIds = options.prefetched?.zombieIds ?? await findTerminatedRunIds(db, storeId, category, now)
  if (zombieIds.length > 0) {
    await db.batch([
      ...zombieIds.map((id) => db.prepare(`UPDATE shiphub_sync_runs SET finished_at = ?, status = 'skipped', error_code = 'INVOCATION_TERMINATED' WHERE id = ?`).bind(stamp, id)),
      db.prepare(`UPDATE shiphub_category_state SET last_attempt_at = ?, consecutive_failures = consecutive_failures + 1, updated_at = ? WHERE store_id = ? AND category = ?`).bind(stamp, stamp, storeId, category)
    ])
    return { status: 'skipped', reason: 'INVOCATION_TERMINATED' }
  }

  // ── 客户端解析（2026-09-19 深度 CPU 优化）────────────────────────────────
  // 提前到 count 之前：轻量轮次（计数未变化）不再创建 run 记录与租约。
  let owner: string | null = null
  let leaseReleased = false
  let runId: string | null = null
  try {
    let client: ShipHubClient
    let needsCleanup = true
    if (options.client) {
      client = options.client
    } else {
      const cached = options.connectionCache?.get(storeId)
      if (cached) {
        // 同一 tick 内已解析过本店连接（含 access token 解密）：直接复用。
        client = cached.client
        needsCleanup = cached.needsCleanup
      } else {
        try {
          const resolved = await connectionForSync(db, config, storeId, options.prefetched?.connectionRow ?? undefined)
          client = resolved.client
          needsCleanup = resolved.needsCleanup
          options.connectionCache?.set(storeId, { client, needsCleanup })
        } catch (error) {
          if (error instanceof ShipHubUpstreamError && error.code === 'IDENTITY_LEASE_BUSY') {
            // 可观测性契约（2026-09-19 优化调整）：租约竞争记录一条终态 skipped
            // run（旧实现先建 running 行再改 skipped；语义等价、少一次写）。
            await db.prepare(`INSERT INTO shiphub_sync_runs (id, store_id, category, trigger_source, batch_id, started_at, finished_at, status, error_code) VALUES (?, ?, ?, ?, ?, ?, ?, 'skipped', 'IDENTITY_LEASE_BUSY')`)
              .bind(uuid(), storeId, category, trigger, options.batchId ?? null, stamp, stamp).run()
            return { status: 'skipped', reason: 'IDENTITY_LEASE_BUSY' }
          }
          throw error
        }
      }
    }
    const count = await resolveCategoryCount(client, category, options.countsSnapshot)
    const countChanged = state.last_count === null || state.last_count !== count
    const shouldList = fullReconcile || countChanged
    // ── 轻量轮次（2026-09-19 深度 CPU 优化）──────────────────────────────
    // 计数未变化且未到完整对账：不拉列表、不写订单、无并发写竞争——因此不建租约、
    // 不建 running 行。仅一次 batch 落两条：分类状态心跳 + 终态 run 记录
    // （监控契约与重活轮次一致：status=succeeded、时间戳完整）。
    // 这是常态（每分钟每店 hand/pick 各一轮）的 CPU 主路径：语句数 8 → 2。
    if (!shouldList) {
      const lightStatements = [
        db.prepare(`UPDATE shiphub_category_state SET last_count = ?, last_attempt_at = ?, last_success_at = ?, next_reconcile_at = ?, last_error_code = NULL, consecutive_failures = 0, updated_at = ? WHERE store_id = ? AND category = ?`)
          .bind(count, stamp, stamp, nextAt(now, COUNT_INTERVAL_MS[category]), stamp, storeId, category),
        db.prepare(`INSERT INTO shiphub_sync_runs (id, store_id, category, trigger_source, batch_id, started_at, finished_at, status, pages, orders, detail_count) VALUES (?, ?, ?, ?, ?, ?, ?, 'succeeded', 0, 0, 0)`)
          .bind(uuid(), storeId, category, trigger, options.batchId ?? null, stamp, stamp)
      ]
      if (options.pendingWrites) {
        // tick 级延迟（见 pendingWrites 文档）：由调度器在末尾一次 flush。
        options.pendingWrites.push(...lightStatements)
      } else {
        await db.batch(lightStatements)
      }
      return { status: 'succeeded' }
    }
    if (options.heavyBudget) {
      // 到达这里说明本 tick 预算尚有空位（耗尽的情形已在函数顶部短路返回）：
      // 消费一个；此后本 tick 内其余门店/分类将完全静默顺延。
      options.heavyBudget.remaining -= 1
    }
    // ── 重活轮次：租约 + running 行（并发互斥 + 中断可观测性）───────────────
    owner = uuid()
    if (!(await acquireLease(db, storeId, owner, stamp))) return { status: 'skipped', reason: 'LEASE_BUSY' }
    runId = uuid()
    await db.prepare(`INSERT INTO shiphub_sync_runs (id, store_id, category, trigger_source, batch_id, started_at, status) VALUES (?, ?, ?, ?, ?, ?, 'running')`).bind(runId, storeId, category, trigger, options.batchId ?? null, stamp).run()
    let pages = 0
    let detailCount = 0
    let orders: ShipHubOrder[] = []
    // 无变化订单（2026-09-12，migration 0031）：list 层指纹与库中一致且订单状态已知，
    // 跳过 detail 重拉，只做轻量 last_seen 更新（详见下方循环内注释）。
    let unchangedOrders: ShipHubOrder[] = []
    // 明细被过滤的订单（migration 0032）：明细里全是非自行车 → detail() 返回
    // null → 不显示，但必须把「已检查」结论落库，否则每轮对账都重拉。
    let filteredOrders: ShipHubOrder[] = []
    if (shouldList) {
      let cursor: string | null = null
      do {
        const page = await client.list(category, cursor, 500)
        pages += 1
        orders.push(...page.orders.map((order) => normalizeOrderForWrite(order, category)))
        cursor = page.nextCursor
        if (pages > 1000) throw new ShipHubUpstreamError('PAGINATION_LIMIT')
      } while (cursor)
      const detailed: ShipHubOrder[] = []
      // 2026-09-19 性能（CPU 预算事故配套）：此前逐单 SELECT 现有行，10 单就是
      // 10 次 D1 往返、全部计入重活那一次调用的 CPU；改为按 ≤90 一批的 IN 查询
      // 预取（D1 单查询绑定参数上限 100），结果按 upstream_order_id 建索引。
      const existingById = new Map<string, { upstream_updated_at: string | null; list_fingerprint: string | null; upstream_absent_at: string | null; detail_filtered: number | null }>()
      for (let offset = 0; offset < orders.length; offset += 90) {
        const chunk = orders.slice(offset, offset + 90)
        const chunkRows = await all<{ upstream_order_id: string; upstream_updated_at: string | null; list_fingerprint: string | null; upstream_absent_at: string | null; detail_filtered: number | null }>(db.prepare(`
          SELECT upstream_order_id, upstream_updated_at, list_fingerprint, upstream_absent_at, detail_filtered FROM shiphub_orders
          WHERE store_id = ? AND category = ? AND upstream_order_id IN (${chunk.map(() => '?').join(',')})
        `).bind(storeId, category, ...chunk.map((order) => order.id)))
        for (const row of chunkRows) existingById.set(row.upstream_order_id, row)
      }
      for (const order of orders) {
        const existing = existingById.get(order.id) ?? null
        // 2026-09-12（migration 0031 + 0032）：list 层指纹不变、且订单处于已知状态
        // （活跃，或已确认明细无自行车）→ 数据无变化，跳过 detail 重拉。
        // 旧实现的判断 `upstream_updated_at !== order.updatedAt` 因 list 不返回
        // updatedAt（恒为 null）而永远为真，每次完整对账对全部订单重拉 detail
        // （每单 detail + receiver 两个 HTTP + 解析 + 重写 items），是 tick CPU
        // 峰值与被平台 exceededCpu 终止的主因。
        // 走完整路径的情形：新订单（existing 为空）、指纹变化、确无自行车的订单
        // 被再次观察到（detail_filtered=1 但指纹变了）、以及从上游消失后回归
        // （absent 且非 detail_filtered）。
        if (
          existing
          && existing.list_fingerprint
          && order.listFingerprint
          && existing.list_fingerprint === order.listFingerprint
          && (existing.upstream_absent_at === null || Boolean(existing.detail_filtered))
        ) {
          unchangedOrders.push(order)
          continue
        }
        // 走到这里即「未跳过」：新订单 / 指纹变化 / 指纹缺失待回填（升级前的旧行）
        // → 必须重拉 detail。
        // 2026-09-12 修正：这里原本还有一层 `existing.upstream_updated_at !== order.updatedAt`
        // 比较，但 list 订单的 updatedAt 恒为 null，而明细被过滤的订单（0032）
        // 入库时的 upstream_updated_at 也是 null —— 两边相等使判断恒为假，
        // 这类订单即使指纹变化也永远不会重拉（测试已锁定该行为）。
        const detailOrder = await client.detail(category, order.id, order.detailKey)
        if (detailOrder) {
          detailOrder.scheduledAt = detailOrder.scheduledAt ?? order.scheduledAt
          detailOrder.channel = detailOrder.channel ?? order.channel
          detailOrder.isEncryptedOrder = detailOrder.isEncryptedOrder ?? order.isEncryptedOrder ?? null
          // 列表指纹必须随详情订单一并写库（2026-09-12）：detail() 内部重建的
          // 订单对象不含 list 层字段，若不在此附加，指纹列永远为 NULL、
          // 「指纹不变跳过 detail」的优化永不生效（测试已锁定该行为）。
          detailOrder.listFingerprint = order.listFingerprint ?? null
          detailed.push(detailOrder)
        } else if (category !== 'ship') {
          // 明细里没有自行车（detail() 的 isBikeItem 过滤）→ 订单不显示，
          // 但必须把「已检查」结论落库（migration 0032），否则每轮对账重拉。
          // 生产实测（2026-09-12）：1299 店上游 hand 7 单全为非自行车，
          // 每 15 分钟一轮对账固定产生 7 次 detail 拉取。
          filteredOrders.push(order)
        }
        detailCount += 1
      }
      orders = detailed.map((order) => normalizeOrderForWrite(order, category))
    }

    const statements: D1PreparedStatement[] = []
    const writeStamp = stamp
    for (const order of orders) {
      statements.push(db.prepare(`
        INSERT INTO shiphub_orders (
          store_id, category, upstream_order_id, display_label, source_label, order_status, order_number, customer_phone, is_encrypted_order, vehicle_info, channel,
          scheduled_at, upstream_updated_at, first_seen_at, last_seen_at, last_seen_run_id,
          upstream_absent_at, created_at, updated_at, list_fingerprint, detail_filtered
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, 0)
        ON CONFLICT(store_id, category, upstream_order_id) DO UPDATE SET
          display_label = excluded.display_label, source_label = excluded.source_label, order_status = excluded.order_status, order_number = excluded.order_number, customer_phone = excluded.customer_phone, is_encrypted_order = excluded.is_encrypted_order, vehicle_info = excluded.vehicle_info, channel = excluded.channel,
          scheduled_at = excluded.scheduled_at, upstream_updated_at = excluded.upstream_updated_at,
          last_seen_at = excluded.last_seen_at, last_seen_run_id = excluded.last_seen_run_id,
          upstream_absent_at = NULL, updated_at = excluded.updated_at, list_fingerprint = excluded.list_fingerprint,
          detail_filtered = 0
      `).bind(storeId, category, order.id, order.displayLabel, order.sourceLabel, order.status, order.orderNumber ?? null, order.customerPhone ?? null, order.isEncryptedOrder ? 1 : 0, order.vehicleInfo ?? null, order.channel ?? null, order.scheduledAt ?? null, order.updatedAt ?? null, writeStamp, writeStamp, runId, writeStamp, writeStamp, order.listFingerprint ?? null))
      statements.push(db.prepare('DELETE FROM shiphub_order_items WHERE store_id = ? AND category = ? AND upstream_order_id = ?').bind(storeId, category, order.id))
      for (const item of order.items) {
        statements.push(db.prepare(`
          INSERT INTO shiphub_order_items (
            store_id, category, upstream_order_id, upstream_item_id, product_label, sku, quantity, vehicle_info,
            serial_number_masked, image_url, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(storeId, category, order.id, item.id, item.productLabel, item.sku, item.quantity, item.vehicleInfo ?? null, item.serialNumberMasked ?? null, item.imageUrl ?? null, writeStamp, writeStamp))
      }
    }
    // 明细被过滤的订单（migration 0032）：把「已检查、明细无自行车」结论落库。
    // 订单保持不可见（upstream_absent_at 非空 → 看板与计数查询天然过滤），
    // 同时写入 list 指纹：下一轮对账指纹不变即可跳过 detail 重拉。
    // 不写 customer_phone / items（明细不可用，且订单不展示）；保留既有 items。
    for (const order of filteredOrders) {
      statements.push(db.prepare(`
        INSERT INTO shiphub_orders (
          store_id, category, upstream_order_id, display_label, source_label, order_status, order_number, customer_phone, is_encrypted_order, vehicle_info, channel,
          scheduled_at, upstream_updated_at, first_seen_at, last_seen_at, last_seen_run_id,
          upstream_absent_at, created_at, updated_at, list_fingerprint, detail_filtered
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(store_id, category, upstream_order_id) DO UPDATE SET
          display_label = excluded.display_label, source_label = excluded.source_label, order_status = excluded.order_status, order_number = excluded.order_number,
          is_encrypted_order = excluded.is_encrypted_order, channel = excluded.channel,
          scheduled_at = excluded.scheduled_at, last_seen_at = excluded.last_seen_at, last_seen_run_id = excluded.last_seen_run_id,
          updated_at = excluded.updated_at, list_fingerprint = excluded.list_fingerprint, detail_filtered = 1
      `).bind(storeId, category, order.id, order.displayLabel, order.sourceLabel, order.status, order.orderNumber ?? null, order.isEncryptedOrder ? 1 : 0, order.channel ?? null, order.scheduledAt ?? null, order.updatedAt ?? null, writeStamp, writeStamp, runId, writeStamp, writeStamp, writeStamp, order.listFingerprint ?? null))
    }
    // 无变化订单的轻量更新（2026-09-12，migration 0031）：只刷新 last_seen，
    // 不重写 detail 字段与 items——数据本就与上游一致，重写是纯浪费（旧实现的
    // 「每单全部重写」是 tick CPU 峰值主因）。指纹列保持原值（没变）。
    // 刻意不动 upstream_absent_at：活跃订单本就非空、明细被过滤的订单（0032）
    // 必须保持不可见——若在此清空 absent 会让非自行车订单错误出现在待取车看板。
    for (const order of unchangedOrders) {
      statements.push(db.prepare(`
        UPDATE shiphub_orders SET last_seen_at = ?, last_seen_run_id = ?, updated_at = ?
        WHERE store_id = ? AND category = ? AND upstream_order_id = ?
      `).bind(writeStamp, runId, writeStamp, storeId, category, order.id))
    }
    // 对账标记必须计入全部「本轮在上游看到的订单」——包含跳过详情拉取的
    // 无变化订单与明细被过滤的订单，否则它们会被错误标记为已不在上游
    // （旧实现只有完整写入的订单参与标记）。
    const allSeenIds = [...orders.map((order) => order.id), ...unchangedOrders.map((order) => order.id), ...filteredOrders.map((order) => order.id)]
    if (fullReconcile) {
      if (allSeenIds.length) {
        const placeholders = allSeenIds.map(() => '?').join(',')
        statements.push(db.prepare(`
          UPDATE shiphub_orders SET upstream_absent_at = ?, updated_at = ?
          WHERE store_id = ? AND category = ? AND upstream_order_id NOT IN (${placeholders}) AND upstream_absent_at IS NULL
        `).bind(writeStamp, writeStamp, storeId, category, ...allSeenIds))
      } else {
        statements.push(db.prepare(`UPDATE shiphub_orders SET upstream_absent_at = ?, updated_at = ? WHERE store_id = ? AND category = ? AND upstream_absent_at IS NULL`).bind(writeStamp, writeStamp, storeId, category))
      }
    }
    const successAt = stamp
    statements.push(db.prepare(`
      UPDATE shiphub_category_state SET last_count = ?, last_attempt_at = ?, last_success_at = ?,
        last_full_reconcile_at = CASE WHEN ? = 1 THEN ? ELSE last_full_reconcile_at END,
        next_reconcile_at = ?, last_error_code = NULL, consecutive_failures = 0, updated_at = ?
      WHERE store_id = ? AND category = ?
    `).bind(count, stamp, successAt, fullReconcile ? 1 : 0, successAt, nextAt(now, fullReconcile ? FULL_INTERVAL_MS[category] : COUNT_INTERVAL_MS[category]), successAt, storeId, category))
    statements.push(db.prepare(`UPDATE shiphub_sync_runs SET finished_at = ?, status = 'succeeded', pages = ?, orders = ?, detail_count = ? WHERE id = ?`).bind(successAt, pages, orders.length, detailCount, runId))
    // 同步成功即证明凭据可用 → 清除连接级的 reauth_required 与错误码
    // （2026-09-09 修复 · 第 3 项配套）。2026-09-19 深度 CPU 优化：仅当连接确
    // 有降级状态（或清除条件可能命中）时才追加这条语句——常态每分类省 1 条。
    if (needsCleanup) {
      statements.push(db.prepare(`
        UPDATE shiphub_connections SET authorization_status = 'connected', last_auth_error_code = NULL, updated_at = ?
        WHERE store_id = ? AND (authorization_status = 'reauth_required' OR last_auth_error_code IS NOT NULL)
      `).bind(successAt, storeId))
    }
    // 租约释放并入同一批（2026-09-19 深度 CPU 优化）：写库成功即原子释放，
    // 成功路径不再单独发一条 DELETE 往返；batch 抛错时由 finally 兜底释放。
    statements.push(db.prepare('DELETE FROM shiphub_sync_leases WHERE store_id = ? AND lease_owner = ?').bind(storeId, owner))
    await db.batch(statements)
    leaseReleased = true
    // 后台同步成功 → 标记门店变更（2026-09-09 实时推送）：前端长轮询据此
    // 自动重新拉取，页面无需手动刷新。仅在本轮确实写入了订单数据时 bump，
    // 避免空轮次（上游无变化）无意义地打断前端挂起。
    if (orders.length > 0) await bumpStoreVersion(db, storeId)
    return { status: 'succeeded', runId }
  } catch (error) {
    const code = errorCode(error)
    const failedAt = stamp
    // 诊断详情（2026-09-19）：上游状态/路径/响应片段落库（列 error_detail），
    // 并写一条 console.error 留痕（部署若开启 Workers Logs 即可检索）。
    const errorDetail = error instanceof ShipHubUpstreamError && error.detail
      ? error.detail.slice(0, 320)
      : error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 320) : null
    console.error(`[shiphub-sync] ${storeId} ${category} ${code}${errorDetail ? ` — ${errorDetail}` : ''}`)
    // ── 失败分类（2026-09-09 OAUTH_TOKEN_HTTP_400 修复 · 第 3 项）───────────
    // 旧实现：任何 OAUTH_TOKEN_HTTP_4xx 都把连接标成 reauth_required（要门店
    // 手动重连）。但实测这类失败绝大多数是「BI/Cube 链路重新登录作废了 RT 族」
    // 造成的瞬时撞车——下一轮自愈就能恢复（实测 11:36:52 自愈成功）。把它标成
    // 需人工介入，会让门店看到不必要的告警。
    //
    // 新规则：token 4xx 先**不**标 reauth_required，交给下一轮的失败计数与自愈
    // 判定；只有真正的凭据失效（REFRESH_TOKEN_MISSING / UNDECRYPTABLE）立即标记。
    // 连续失败达到阈值（TOKEN_REAUTH_THRESHOLD）时才升级为 reauth_required——
    // 那时说明自愈也没救回来，确实需要人工。
    const isToken4xx = /^OAUTH_TOKEN_HTTP_4/u.test(code)
    const isCredentialGone = code === 'REFRESH_TOKEN_MISSING' || code === 'REFRESH_TOKEN_UNDECRYPTABLE'
    await db.prepare(`
      UPDATE shiphub_category_state SET last_attempt_at = ?, last_error_code = ?, consecutive_failures = consecutive_failures + 1, updated_at = ?
      WHERE store_id = ? AND category = ?
    `).bind(stamp, code, failedAt, storeId, category).run()
    const stateAfter = await first<{ consecutive_failures: number }>(db.prepare(`
      SELECT consecutive_failures FROM shiphub_category_state WHERE store_id = ? AND category = ?
    `).bind(storeId, category))
    const failures = Number(stateAfter?.consecutive_failures ?? 1)
    // ── 连续失败退避（2026-09-19 事故修复）─────────────────────────────────
    // 上游持续失败（如 1670 pick 的 5xx）时，每分钟重试会持续吃掉 tick 预算、
    // 饿死同门店其它分类。>= 阈值后按指数推后重试（封顶 10 分钟）：
    // 2^0→2min、2^1→4min、2^2→8min…；token 类失败有自己的重登/自愈链路，不在此退避。
    if (!isToken4xx && failures >= FAILURE_BACKOFF_THRESHOLD) {
      const backoffMs = Math.min(120_000 * 2 ** (failures - FAILURE_BACKOFF_THRESHOLD), 10 * 60_000)
      await db.prepare(`UPDATE shiphub_category_state SET last_attempt_at = ? WHERE store_id = ? AND category = ?`)
        .bind(new Date(now.getTime() + backoffMs).toISOString(), storeId, category).run()
    }
    const shouldMarkReauth = isCredentialGone || (isToken4xx && failures >= TOKEN_REAUTH_THRESHOLD)
    const failureStatements: D1PreparedStatement[] = []
    if (runId) {
      failureStatements.push(db.prepare(`UPDATE shiphub_sync_runs SET finished_at = ?, status = 'failed', error_code = ?, error_detail = ? WHERE id = ?`).bind(failedAt, code, errorDetail, runId))
    } else {
      // run 行未及创建（例如客户端解析阶段失败，2026-09-19 优化后该路径提前）：
      // 补一条终态 failed 记录，保持「每次尝试都有记录」的可观测性契约。
      failureStatements.push(db.prepare(`INSERT INTO shiphub_sync_runs (id, store_id, category, trigger_source, batch_id, started_at, finished_at, status, error_code, error_detail) VALUES (?, ?, ?, ?, ?, ?, ?, 'failed', ?, ?)`)
        .bind(uuid(), storeId, category, trigger, options.batchId ?? null, failedAt, failedAt, code, errorDetail))
    }
    failureStatements.push(db.prepare(`UPDATE shiphub_connections SET authorization_status = CASE WHEN ? = 1 THEN 'reauth_required' ELSE authorization_status END, last_auth_error_code = ?, updated_at = ? WHERE store_id = ?`).bind(shouldMarkReauth ? 1 : 0, code, failedAt, storeId))
    // 租约释放并入失败批次（2026-09-19 优化）：与失败状态原子落库；
    // batch 抛错时由 finally 兜底释放。
    if (owner) failureStatements.push(db.prepare('DELETE FROM shiphub_sync_leases WHERE store_id = ? AND lease_owner = ?').bind(storeId, owner))
    await db.batch(failureStatements)
    if (owner) leaseReleased = true
    // 连续失败告警：连接级错误（token/授权）在三类分类上同步出现，只在 hand 类触发避免三连发；
    // 首次跨过 3 次 + 每再失败 10 次各补一封（邮件可选，未配置时仅状态可见）。
    if (category === 'hand') {
      if (shouldAlertOnShipHubFailure(failures)) {
        const storeRow = await first<{ code: string; name: string }>(db.prepare(`SELECT code, name FROM stores WHERE id = ?`).bind(storeId))
        if (storeRow) {
          await sendShipHubFailureAlert(config, { storeCode: storeRow.code, storeName: storeRow.name, errorCode: code, consecutiveFailures: failures })
        }
      }
    }
    // ── 失败后内联重登 + 重试（2026-09-09 修复 · 第 2 项）────────────────────
    // 旧实现只对 manual 触发内联重登，scheduled 要干等下一 tick（最长 60 秒）
    // 或自愈冷却（最长 5 分钟）。实测撞车是瞬时的，重登一次即可恢复，因此
    // scheduled 也走这条路径——但用 heal_last_attempted_at 控频（上游登录有
    // 风控，不能让每分钟的 cron 反复打登录）。
    if (/^OAUTH_TOKEN_HTTP_4/u.test(code) && !options.retriedAfterRelogin && config.SHIPHUB.mode !== 'fixture') {
      const canRelogin = trigger === 'manual' || await claimHealAttempt(db, storeId, HEAL_RETRY_MS)
      if (canRelogin) {
        const relogged = await reloginWithStoredCredentials(db, config, storeId)
        if (relogged) {
          return syncStoreCategory(db, config, storeId, category, {
            ...options,
            // 重登重试是恢复路径：不受 tick 预算限制（单次、且由 retriedAfterRelogin
            // 与 HEAL_RETRY_MS 双重控频），否则恢复会被顺延成「假失败」。
            heavyBudget: undefined,
            batchId: options.batchId ?? uuid(),
            // 沿用调用方注入的时间基准（测试/回放可确定）；未注入才取真实时钟。
            now: options.now ?? new Date(),
            retriedAfterRelogin: true
          })
        }
      }
    }
    return { status: 'failed', reason: code, runId: runId ?? undefined }
  } finally {
    // 兜底释放（2026-09-19 优化）：正常路径已把 DELETE 并入 success/failure batch，
    // 只有 batch 自身抛错等异常路径才会走到这里（leaseReleased 仍为 false）。
    if (owner && !leaseReleased) await releaseLease(db, storeId, owner)
  }
}

// 程序化重登并落库（自愈与手动同步内联重试共用）：只用本店凭据（门店边界铁律
// 2026-09-08），成功回 true；任何失败回 false 不抛错，由调用方决定退避策略。
// 两把密钥职责不同，绝不可混用：
//   loginKey            解密门店登录凭据（用户名/密码）
//   tokenEncryptionKey  加解密 refresh token（授权回调与轮换均用它）
// 2026-08-30 事故根因：自愈曾用 loginKey 加密 refresh token 写库，
// 同步侧 readRefreshToken 用 tokenEncryptionKey 解密 -> AES-GCM 抛错，
// 连接却已被置为 connected，148 次同步静默失败且无法自我恢复。
async function reloginWithStoredCredentials(db: D1Database, config: AppConfig, storeId: string): Promise<boolean> {
  const loginKey = config.SHIPHUB.loginKey
  const tokenKey = config.SHIPHUB.tokenEncryptionKey
  if (!loginKey || !tokenKey) return false
  const row = await first<{ login_username_enc: string | null; login_password_enc: string | null }>(db.prepare(`
    SELECT login_username_enc, login_password_enc FROM shiphub_connections WHERE store_id = ?
  `).bind(storeId))
  if (!row?.login_username_enc || !row?.login_password_enc) return false
  try {
    const usernameBlob = splitEncryptedBlob(row.login_username_enc)
    const passwordBlob = splitEncryptedBlob(row.login_password_enc)
    const credentials = {
      username: await decryptShipHubSecret(usernameBlob.ciphertext, usernameBlob.nonce, loginKey),
      password: await decryptShipHubSecret(passwordBlob.ciphertext, passwordBlob.nonce, loginKey)
    }
    const token = await performShipHubProgrammaticLogin(config.SHIPHUB, credentials)
    if (!token.refreshToken) return false
    const encrypted = await encryptShipHubSecret(token.refreshToken, tokenKey)
    // 写库前先按同步侧的读取路径回验一次：确认密文能用 tokenEncryptionKey 解出原值。
    // 只有「同步真能用这份 token」才允许把状态置为 connected，
    // 否则宁可留在 reauth_required 让门店手动重连，也不制造假 connected。
    const verified = await decryptShipHubSecret(encrypted.ciphertext, encrypted.nonce, tokenKey)
    if (verified !== token.refreshToken) return false
    // 同时缓存 access token（2026-09-09）：重登后若不写缓存，下一轮又会为了
    // 取 token 而刷新 RT，白费一次轮换并重新暴露在撞车窗口里。
    const access = await encryptShipHubSecret(token.accessToken, tokenKey)
    const stamp = nowIso()
    await run(db.prepare(`
      UPDATE shiphub_connections
      SET refresh_token_ciphertext = ?, refresh_token_nonce = ?, refresh_token_key_version = 'v1',
          access_token_ciphertext = ?, access_token_nonce = ?, access_token_key_version = 'v1',
          token_expires_at = ?, token_updated_at = ?, authorization_status = 'connected',
          last_auth_error_code = NULL, heal_last_attempted_at = ?, updated_at = ?
      WHERE store_id = ?
    `).bind(encrypted.ciphertext, encrypted.nonce, access.ciphertext, access.nonce, token.expiresAt, stamp, stamp, stamp, storeId))
    return true
  } catch {
    return false
  }
}

/**
 * 申请一次自愈重登名额（2026-09-09 修复 · 第 2 项）。
 *
 * scheduled 路径失败后也要内联重登，但上游登录有风控，不能让每分钟的 cron
 * 反复打登录接口。用 heal_last_attempted_at 做原子抢占：只有距离上次尝试
 * 超过 minIntervalMs 才允许本次重登。
 *
 * 原子性：条件 UPDATE 的 changes 计数即「是否抢到」，避免读-判断-写竞态
 * （多分类并发失败时只有一个能拿到名额，其余等下一轮）。
 */
async function claimHealAttempt(db: D1Database, storeId: string, minIntervalMs: number, now = new Date()): Promise<boolean> {
  const stamp = now.toISOString()
  const cutoff = new Date(now.getTime() - minIntervalMs).toISOString()
  const result = await run(db.prepare(`
    UPDATE shiphub_connections SET heal_last_attempted_at = ?
    WHERE store_id = ? AND (heal_last_attempted_at IS NULL OR heal_last_attempted_at <= ?)
  `).bind(stamp, storeId, cutoff))
  return Number(result.meta.changes) > 0
}

// 自愈：对 reauth_required 且持有可用登录凭据的连接，尝试程序化重登恢复。
// 只处理能静默恢复的情形；无凭据（仅浏览器 SSO 授权）的连接保持 reauth_required，
// 由前端提示门店手动重连。失败不抛出，不能拖坠整轮 cron。
async function healShipHubConnections(
  env: WorkerEnv,
  config: AppConfig,
  now: Date,
  prefetchedCandidates?: Array<{ store_id: string; login_username_enc: string | null; login_password_enc: string | null }>
): Promise<void> {
  if (!config.SHIPHUB.loginKey || !config.SHIPHUB.tokenEncryptionKey) return
  // 冷却判定只用专用列 heal_last_attempted_at（2026-09-08 事故根因：旧实现复用
  // updated_at，而 cube token 每小时刷新、手动同步失败、token 轮换都写同一列，
  // 把 30 分钟冷却实际推成 40-45 分钟，token 死亡期间看板整段停摆）。
  const retryCutoff = new Date(now.getTime() - HEAL_RETRY_MS).toISOString()
  const backoffCutoff = new Date(now.getTime() - SELF_HEAL_BACKOFF_MS).toISOString()
  // 2026-09-19 深度 CPU 优化：候选由 runScheduledShipHubSync 的批量预取注入
  // （与门店列表/僵尸扫描同一次 db.batch）；独立调用（无预取）时回退单查。
  const candidates = prefetchedCandidates ?? await all<{ store_id: string; login_username_enc: string | null; login_password_enc: string | null }>(env.DB.prepare(`
    SELECT store_id, login_username_enc, login_password_enc
    FROM shiphub_connections
    WHERE enabled = 1 AND authorization_status = 'reauth_required'
      AND (
        heal_last_attempted_at IS NULL
        OR (last_auth_error_code = 'SELF_HEAL_FAILED' AND heal_last_attempted_at <= ?)
        OR (last_auth_error_code IS NOT 'SELF_HEAL_FAILED' AND heal_last_attempted_at <= ?)
      )
  `).bind(backoffCutoff, retryCutoff))
  for (const candidate of candidates) {
    // 门店边界铁律（2026-09-08）：自愈只用本店凭据；无本店凭据的连接
    // 保持 reauth_required 等门店手动重连，绝不借用部署级共享账密。
    if (!candidate.login_username_enc || !candidate.login_password_enc) continue
    const healed = await reloginWithStoredCredentials(env.DB, config, candidate.store_id)
    if (!healed) {
      // 退避计时只写专用列与错误码，绝不碰 updated_at——冷却判定与业务时间戳
      // 彻底解耦（不记录凭据内容）。
      await run(env.DB.prepare(`
        UPDATE shiphub_connections SET last_auth_error_code = 'SELF_HEAL_FAILED', heal_last_attempted_at = ? WHERE store_id = ?
      `).bind(nowIso(), candidate.store_id))
    }
  }
}

/**
 * 页面打开时的「确保新鲜」（2026-09-09 实时化第二批）。
 *
 * 语义：有人在看页面 → 数据不该是几分钟前的。前端在挂载与回到前台时调用，
 * 服务端按分类检查 last_success_at，只在**确实过期**时才打上游。
 *
 * 与手动同步（POST /shiphub/sync）的区别：
 *   手动同步 = 用户显式点按钮，四个分类全量 + 强制 reconcile，受 2 分钟冷却；
 *   ensure-fresh = 隐式后台行为，只碰指定的实时分类，受 60 秒门禁，
 *                  且多标签页/多设备并发时由 syncStoreCategory 内部的
 *                  lease 与 COUNT_INTERVAL_MS 去重，不会重复打上游。
 *
 * 为什么阻塞等结果：前端需要「打开就能看到最新」的语义。单个分类同步
 * 通常 1-3 秒（一次 count + 必要时一次 list），可接受；失败不抛错，
 * 前端继续用已有数据渲染，绝不因为同步失败而白屏。
 */
export async function ensureFreshStoreCategories(
  env: WorkerEnv,
  storeId: string,
  categories: readonly ShipHubCategory[] = ['hand', 'pick'],
  now = new Date()
): Promise<{ synced: ShipHubCategory[]; skipped: ShipHubCategory[]; stale: boolean }> {
  const config = loadConfig(env)
  if (!config.SHIPHUB.enabled) return { synced: [], skipped: [...categories], stale: false }
  // 营业时间硬规则同样适用：窗口外不碰上游（前端调用会拿到 stale:false 直接放行）。
  if (config.SHIPHUB.mode === 'live'
    && !activeInStoreTimezone(SHIPHUB_SYNC_TIMEZONE, now, config.SHIPHUB.activeStartHour, config.SHIPHUB.activeEndHour)) {
    return { synced: [], skipped: [...categories], stale: false }
  }
  const states = await all<CategoryState>(
    env.DB.prepare('SELECT * FROM shiphub_category_state WHERE store_id = ?').bind(storeId)
  )
  const stateMap = new Map(states.map((row) => [row.category, row]))
  const synced: ShipHubCategory[] = []
  const skipped: ShipHubCategory[] = []
  let stale = false
  for (const category of categories) {
    const state = stateMap.get(category)
    const lastSuccess = state?.last_success_at ? Date.parse(state.last_success_at) : 0
    const age = lastSuccess ? now.getTime() - lastSuccess : Number.POSITIVE_INFINITY
    if (age < ENSURE_FRESH_MS) { skipped.push(category); continue }
    stale = true
    try {
      // trigger 'scheduled'：ensure-fresh 是后台行为，不该占用 manual 冷却、
      // 也不该在审计里伪装成用户手动操作；它走与 cron 相同的节流与 lease。
      const outcome = await syncStoreCategory(env.DB, config, storeId, category, { trigger: 'scheduled', now })
      if (outcome.status === 'succeeded') synced.push(category)
      else skipped.push(category)
    } catch (error) {
      // 上游故障绝不冒泡成 5xx：页面照常渲染已有数据，下一次长轮询/挂载再试。
      console.error(`[shiphub] ensure-fresh failed store=${storeId} category=${category} err=${error instanceof Error ? error.message : String(error)}`)
      skipped.push(category)
    }
  }
  return { synced, skipped, stale }
}

export async function runScheduledShipHubSync(env: WorkerEnv, now = new Date()): Promise<void> {
  const config = loadConfig(env)
  if (!config.SHIPHUB.enabled) return
  // ── 2026-09-12 修复（D1 写配额事故）：定时同步只服务「已配置本店 Shiphub 账号」的门店 ──
  // 旧实现（2026-08-19 起）：fixture 模式遍历 stores 表，对全部 active 门店每分钟写入
  // 合成数据。preview 上 12 家「门店创建测试」占位店从未配置任何账号，却被 cron 驱动，
  // 单日烧掉 9 万+ D1 写入行，占满账号级每日写配额（100k，与 staging 共享），导致
  // staging 真实门店同步自 2026-09-12 17:49（北京）起被平台拒绝（7500）而冻结。
  // 现在 fixture 模式不再由 cron 驱动任何门店；演示数据如需刷新，走页面上的手动同步
  // （per-store、用户显式触发）。cron 只做一件事：同步「已授权且持有有效 token 的连接」。
  if (config.SHIPHUB.mode === 'fixture') return
  // live 模式只同步「已授权且持有有效 token 的连接」：不再对每个 active store 自动
  // bootstrap——多个门店共享同一 bootstrap refresh token 并发刷新会被上游轮换机制
  // 立即作废（OAUTH_TOKEN_HTTP_400，全部门店翻成 reauth_required）。
  //
  // 营业时间硬规则（2026-09-19 深度 CPU 优化补强）：窗口外直接返回、零 D1 操作。
  // 旧实现在窗口外仍会做「自愈候选 + 门店列表」两次查询后才逐店 continue——
  // 每天一半的 tick（12 小时）为必然空转的查询付出 CPU。
  const inWindow = activeInStoreTimezone(SHIPHUB_SYNC_TIMEZONE, now, config.SHIPHUB.activeStartHour, config.SHIPHUB.activeEndHour)
  if (!inWindow) return

  // ── 批量预取（2026-09-19 两轮深度 CPU 优化）───────────────────────────────
  // 旧路径一次 tick：自愈候选 + 门店列表 + 每分类(ensureState + 僵尸) + 每店连接
  // ≈ 14 次独立 D1 往返（每次往返都有序列化与调度开销，是免费层 CPU 的主要成本）。
  // 第一轮合并为两次 db.batch；第二轮（本版）进一步合成单次往返、5 条语句：
  //   自愈候选 / 门店列表 / 僵尸扫描 / 全部分类状态 / 全部连接行。
  // 状态与连接行不再按门店过滤（两张表都是「每店几行」的小表，全量读取的行数
  // 随门店数线性且极小），从而消除「拿门店列表 → 再查其状态」的批次依赖，
  // 两次往返合为一次。
  // 取舍：自愈恢复的门店从「本轮即参与」变为「下一轮参与」（≤60 秒）——自愈本身
  // 走 5 分钟冷却，不影响恢复节奏；僵尸扫描由每分类一次（8 次）降为全 tick 一次。
  const zombieCutoff = new Date(now.getTime() - ZOMBIE_WINDOW_MS).toISOString()
  const healCandidatesStatement = env.DB.prepare(`
    SELECT store_id, login_username_enc, login_password_enc
    FROM shiphub_connections
    WHERE enabled = 1 AND authorization_status = 'reauth_required'
      AND (
        heal_last_attempted_at IS NULL
        OR (last_auth_error_code = 'SELF_HEAL_FAILED' AND heal_last_attempted_at <= ?)
        OR (last_auth_error_code IS NOT 'SELF_HEAL_FAILED' AND heal_last_attempted_at <= ?)
      )
  `).bind(new Date(now.getTime() - SELF_HEAL_BACKOFF_MS).toISOString(), new Date(now.getTime() - HEAL_RETRY_MS).toISOString())
  const headResults = await env.DB.batch([
    healCandidatesStatement,
    env.DB.prepare(`
      SELECT c.store_id AS id
      FROM shiphub_connections c
      WHERE c.enabled = 1 AND c.refresh_token_ciphertext IS NOT NULL AND c.refresh_token_nonce IS NOT NULL
        AND c.authorization_status != 'reauth_required'
      ORDER BY c.store_id
    `),
    env.DB.prepare(`
      SELECT id, store_id, category FROM shiphub_sync_runs
      WHERE status = 'running' AND trigger_source = 'scheduled' AND started_at >= ?
    `).bind(zombieCutoff),
    env.DB.prepare('SELECT * FROM shiphub_category_state'),
    env.DB.prepare(`
      SELECT c.store_id, c.enabled, c.mode, c.refresh_token_ciphertext, c.refresh_token_nonce,
             c.access_token_ciphertext, c.access_token_nonce, c.token_expires_at,
             c.location_num, c.identity_fingerprint, c.authorization_status, c.last_auth_error_code
      FROM shiphub_connections c
    `)
  ])
  const healCandidates = (headResults[0]?.results ?? []) as Array<{ store_id: string; login_username_enc: string | null; login_password_enc: string | null }>
  const stores = (headResults[1]?.results ?? []) as Array<{ id: string }>
  const zombieRows = (headResults[2]?.results ?? []) as Array<{ id: string; store_id: string; category: string }>
  const stateRows = (headResults[3]?.results ?? []) as Array<CategoryState & { store_id: string }>
  const connectionRows = (headResults[4]?.results ?? []) as Array<Record<string, unknown> & { store_id: string }>

  // 自愈（候选来自同一批量预取；恢复成功的门店下一轮参与同步）。
  await healShipHubConnections(env, config, now, healCandidates)

  // 僵尸记录按「店|分类」索引（供 syncStoreCategory 免查询判定）。
  const zombieIdsByKey = new Map<string, string[]>()
  for (const row of zombieRows) {
    const key = `${row.store_id}|${row.category}`
    const existing = zombieIdsByKey.get(key)
    if (existing) existing.push(row.id)
    else zombieIdsByKey.set(key, [row.id])
  }

  // 分类状态 + 连接行索引（来自同一次批量预取；两张小表全量读取）。
  const statesByKey = new Map<string, CategoryState>()
  for (const row of stateRows) statesByKey.set(`${row.store_id}|${row.category}`, row)
  const connectionsById = new Map<string, Record<string, unknown>>()
  for (const row of connectionRows) connectionsById.set(row.store_id, row)

  // ── 门店轮换 + 重活预算（2026-09-19：多门店 CPU 错峰）────────────────────
  // 重活一次调用最多 MAX_HEAVY_SYNCS_PER_TICK 个，优先给本轮排位靠前的门店；
  // 排位按分钟轮换（偶数分钟 1299 在前、奇数分钟 1670 在前），任何一家都不会被
  // 长期饿死；被顺延的门店下一分钟自动重试（最坏多等 1 分钟）。排序取 store_id
  // 保证轮换可预期（也是测试的确定性前提）。
  const minuteIndex = Math.floor(now.getTime() / 60_000)
  const rotation = stores.length > 0 ? ((minuteIndex % stores.length) + stores.length) % stores.length : 0
  const orderedStores = [...stores.slice(rotation), ...stores.slice(0, rotation)]
  const heavyBudget = { remaining: MAX_HEAVY_SYNCS_PER_TICK }
  // tick 级延迟写入队列（2026-09-19 第二轮深度 CPU 优化）：所有轻量心跳写汇聚为
  // 一次 flush（见 pendingWrites 文档），常态每分钟的批量调用 3 → 2。
  const pendingWrites: D1PreparedStatement[] = []
  for (const store of orderedStores) {
    // tick 级连接缓存（2026-09-12 CPU 优化）：本店 4 个分类共享一次连接解析
    // （含 access token 解密）；2026-09-19 起同时携带「是否需要降级清理」标记，
    // 免去常态每分类一次的 no-op conn UPDATE。
    const connectionCache = new Map<string, { client: ShipHubClient; needsCleanup: boolean }>()
    // 本店本 tick 的聚合计数快照（一次请求覆盖四分类；见 resolveCategoryCount）。
    const countsSnapshot: { loaded: boolean; values: Partial<Record<ShipHubCategory, number>> | null } = { loaded: false, values: null }
    for (const category of CATEGORIES) {
      await syncStoreCategory(env.DB, config, store.id, category, {
        trigger: 'scheduled',
        now,
        connectionCache,
        heavyBudget,
        countsSnapshot,
        pendingWrites,
        prefetched: {
          state: statesByKey.get(`${store.id}|${category}`),
          zombieIds: zombieIdsByKey.get(`${store.id}|${category}`) ?? [],
          connectionRow: connectionsById.get(store.id) ?? null
        }
      })
    }
  }
  // tick 末尾一次性 flush 心跳写入（失败只丢心跳行，下一轮重算，不影响业务数据）。
  if (pendingWrites.length > 0) {
    try {
      await env.DB.batch(pendingWrites)
    } catch (error) {
      console.error(`[shiphub-sync] tick flush failed count=${pendingWrites.length} err=${error instanceof Error ? error.message : String(error)}`)
    }
  }
}
