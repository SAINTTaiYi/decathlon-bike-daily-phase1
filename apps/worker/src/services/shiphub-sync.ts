import { loadConfig, type AppConfig, type WorkerEnv } from '../env.js'
import { all, first, nowIso, run, uuid } from '../db.js'
import { ShipHubUpstreamError, createShipHubClient, type ShipHubCategory, type ShipHubClient, type ShipHubOrder } from '../lib/shiphub-client.js'
import { readRefreshToken, rotateRefreshToken } from '../lib/shiphub-oauth.js'
import { refreshShipHubAccessToken } from '../lib/shiphub-token.js'
import { ApiProblem } from './problems.js'

const CATEGORIES: readonly ShipHubCategory[] = ['hand', 'receive', 'ship']
const COUNT_INTERVAL_MS: Record<ShipHubCategory, number> = { hand: 5 * 60_000, receive: 10 * 60_000, ship: 10 * 60_000 }
const FULL_INTERVAL_MS: Record<ShipHubCategory, number> = { hand: 15 * 60_000, receive: 30 * 60_000, ship: 30 * 60_000 }
const MANUAL_FRESH_MS = 2 * 60_000
const LEASE_MS = 90_000

export type ShipHubConnection = {
  storeId: string
  enabled: boolean
  mode: 'fixture' | 'live'
  authorizationStatus: string
  lastAuthErrorCode: string | null
  lastSuccessAt: string | null
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
    lastSuccessAt: row.last_success_at ?? null
  }
}

export async function getShipHubConnection(db: D1Database, storeId: string): Promise<ShipHubConnection | null> {
  const row = await first(db.prepare(`
    SELECT c.store_id, c.enabled, c.mode, c.authorization_status, c.last_auth_error_code,
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
    const hourText = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: '2-digit', hour12: false }).format(now)
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
      lastAuthErrorCode: connection.lastAuthErrorCode
    } : null,
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
      productLabel: item.product_label,
      vehicleInfo: item.vehicle_info,
      quantity: item.quantity,
      serialNumberMasked: item.serial_number_masked,
      imageUrl: item.image_url
    })),
    localActionState: row.local_action_state ?? null
  }
}

async function connectionForSync(db: D1Database, config: AppConfig, storeId: string): Promise<{ client: ShipHubClient; refresh?: { ciphertext: string; nonce: string } }> {
  if (config.SHIPHUB.mode === 'fixture') return { client: createShipHubClient(config.SHIPHUB) }
  const row = await first<any>(db.prepare(`
    SELECT enabled, mode, refresh_token_ciphertext, refresh_token_nonce
    FROM shiphub_connections WHERE store_id = ?
  `).bind(storeId))
  if (!row || !(row.enabled === 1 || row.enabled === true)) throw new ShipHubUpstreamError('CONNECTION_DISABLED')
  if (row.mode === 'fixture') return { client: createShipHubClient({ ...config.SHIPHUB, mode: 'fixture' }) }
  if (!row.refresh_token_ciphertext || !row.refresh_token_nonce) throw new ShipHubUpstreamError('REFRESH_TOKEN_MISSING')
  const refreshToken = await readRefreshToken(config, row)
  const token = await refreshShipHubAccessToken(config.SHIPHUB, refreshToken)
  await rotateRefreshToken(db, config, storeId, row.refresh_token_ciphertext, row.refresh_token_nonce, token)
  return { client: createShipHubClient(config.SHIPHUB, token.accessToken), refresh: { ciphertext: row.refresh_token_ciphertext, nonce: row.refresh_token_nonce } }
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
  await db.prepare(`INSERT OR IGNORE INTO shiphub_category_state (store_id, category, updated_at) VALUES (?, ?, ?)`).bind(storeId, category, stamp).run()
  const row = await first<CategoryState>(db.prepare('SELECT * FROM shiphub_category_state WHERE store_id = ? AND category = ?').bind(storeId, category))
  if (!row) throw new Error('SHIPHUB_CATEGORY_STATE_MISSING')
  return row
}

function errorCode(error: unknown): string {
  if (error instanceof ShipHubUpstreamError) return error.code
  return 'SYNC_FAILED'
}

function normalizeOrderForWrite(order: ShipHubOrder, category: ShipHubCategory): ShipHubOrder {
  if (order.category !== category) throw new ShipHubUpstreamError('CATEGORY_MISMATCH')
  return order
}

export async function syncStoreCategory(
  db: D1Database,
  config: AppConfig,
  storeId: string,
  category: ShipHubCategory,
  options: { trigger?: 'scheduled' | 'manual' | 'authorization'; batchId?: string; client?: ShipHubClient; now?: Date } = {}
): Promise<{ status: 'succeeded' | 'skipped' | 'failed'; reason?: string; runId?: string }> {
  requireEnabled(config)
  const trigger = options.trigger ?? 'scheduled'
  const now = options.now ?? new Date()
  const stamp = now.toISOString()
  if (trigger === 'manual' && !options.batchId) {
    const recent = await first<{ id: string }>(db.prepare(`
      SELECT id FROM shiphub_sync_runs
      WHERE store_id = ? AND trigger_source = 'manual' AND started_at > ?
      ORDER BY started_at DESC LIMIT 1
    `).bind(storeId, new Date(now.getTime() - MANUAL_FRESH_MS).toISOString()))
    if (recent) return { status: 'skipped', reason: 'MANUAL_COOLDOWN' }
  }
  const state = await ensureState(db, storeId, category)
  const lastSuccess = state.last_success_at ? Date.parse(state.last_success_at) : 0
  if (trigger === 'manual' && lastSuccess && now.getTime() - lastSuccess < MANUAL_FRESH_MS) return { status: 'skipped', reason: 'CACHE_FRESH' }
  const fullReconcile = trigger === 'manual' || isDue(state.last_full_reconcile_at, FULL_INTERVAL_MS[category], now.getTime())
  const countDue = fullReconcile || isDue(state.last_attempt_at, COUNT_INTERVAL_MS[category], now.getTime())
  if (!countDue) return { status: 'skipped', reason: 'NOT_DUE' }

  const owner = uuid()
  if (!(await acquireLease(db, storeId, owner, stamp))) return { status: 'skipped', reason: 'LEASE_BUSY' }
  const runId = uuid()
  await db.prepare(`INSERT INTO shiphub_sync_runs (id, store_id, category, trigger_source, batch_id, started_at, status) VALUES (?, ?, ?, ?, ?, ?, 'running')`).bind(runId, storeId, category, trigger, options.batchId ?? null, stamp).run()
  try {
    const { client } = options.client ? { client: options.client } : await connectionForSync(db, config, storeId)
    const count = await client.count(category)
    const countChanged = state.last_count === null || state.last_count !== count
    const shouldList = fullReconcile || countChanged
    let pages = 0
    let detailCount = 0
    let orders: ShipHubOrder[] = []
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
      for (const order of orders) {
        const existing = await first<{ upstream_updated_at: string | null }>(db.prepare(`
          SELECT upstream_updated_at FROM shiphub_orders WHERE store_id = ? AND category = ? AND upstream_order_id = ?
        `).bind(storeId, category, order.id))
        if (!existing || existing.upstream_updated_at !== order.updatedAt) {
          detailed.push(await client.detail(category, order.id))
          detailCount += 1
        } else {
          detailed.push(order)
        }
      }
      orders = detailed.map((order) => normalizeOrderForWrite(order, category))
    }

    const statements: D1PreparedStatement[] = []
    const writeStamp = stamp
    for (const order of orders) {
      statements.push(db.prepare(`
        INSERT INTO shiphub_orders (
          store_id, category, upstream_order_id, display_label, source_label, order_status, order_number, customer_phone, vehicle_info,
          scheduled_at, upstream_updated_at, first_seen_at, last_seen_at, last_seen_run_id,
          upstream_absent_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
        ON CONFLICT(store_id, category, upstream_order_id) DO UPDATE SET
          display_label = excluded.display_label, source_label = excluded.source_label, order_status = excluded.order_status, order_number = excluded.order_number, customer_phone = excluded.customer_phone, vehicle_info = excluded.vehicle_info,
          scheduled_at = excluded.scheduled_at, upstream_updated_at = excluded.upstream_updated_at,
          last_seen_at = excluded.last_seen_at, last_seen_run_id = excluded.last_seen_run_id,
          upstream_absent_at = NULL, updated_at = excluded.updated_at
      `).bind(storeId, category, order.id, order.displayLabel, order.sourceLabel, order.status, order.orderNumber ?? null, order.customerPhone ?? null, order.vehicleInfo ?? null, order.scheduledAt ?? null, order.updatedAt ?? null, writeStamp, writeStamp, runId, writeStamp, writeStamp))
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
    if (fullReconcile) {
      if (orders.length) {
        const placeholders = orders.map(() => '?').join(',')
        statements.push(db.prepare(`
          UPDATE shiphub_orders SET upstream_absent_at = ?, updated_at = ?
          WHERE store_id = ? AND category = ? AND upstream_order_id NOT IN (${placeholders}) AND upstream_absent_at IS NULL
        `).bind(writeStamp, writeStamp, storeId, category, ...orders.map((order) => order.id)))
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
    await db.batch(statements)
    return { status: 'succeeded', runId }
  } catch (error) {
    const code = errorCode(error)
    const failedAt = stamp
    await db.batch([
      db.prepare(`UPDATE shiphub_category_state SET last_attempt_at = ?, last_error_code = ?, consecutive_failures = consecutive_failures + 1, updated_at = ? WHERE store_id = ? AND category = ?`).bind(stamp, code, failedAt, storeId, category),
      db.prepare(`UPDATE shiphub_sync_runs SET finished_at = ?, status = 'failed', error_code = ? WHERE id = ?`).bind(failedAt, code, runId),
      db.prepare(`UPDATE shiphub_connections SET authorization_status = CASE WHEN ? = 'REFRESH_TOKEN_MISSING' OR ? LIKE 'OAUTH_%' THEN 'reauth_required' ELSE authorization_status END, last_auth_error_code = ?, updated_at = ? WHERE store_id = ?`).bind(code, code, code, failedAt, storeId)
    ])
    return { status: 'failed', reason: code, runId }
  } finally {
    await releaseLease(db, storeId, owner)
  }
}

export async function runScheduledShipHubSync(env: WorkerEnv, now = new Date()): Promise<void> {
  const config = loadConfig(env)
  if (!config.SHIPHUB.enabled) return
  const stores = await all<{ id: string; timezone: string }>(env.DB.prepare(`
    SELECT s.id, s.timezone
    FROM stores s JOIN shiphub_connections c ON c.store_id = s.id
    WHERE s.status = 'active' AND c.enabled = 1
  `))
  for (const store of stores) {
    if (!activeInStoreTimezone(store.timezone, now, config.SHIPHUB.activeStartHour, config.SHIPHUB.activeEndHour)) continue
    for (const category of CATEGORIES) await syncStoreCategory(env.DB, config, store.id, category, { trigger: 'scheduled', now })
  }
}
