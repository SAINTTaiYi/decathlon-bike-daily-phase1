import type { FoodBatchActionInput, FoodBatchCreateInput, FoodShelfLifeUpsertInput } from '@bike-ops/contracts'
import { addDays, computeFoodDates, foodReceiptWarning } from '@bike-ops/domain'
import { all, first, nowIso, run, uuid } from '../db.js'
import { ApiProblem } from './problems.js'

// 食品保质期台账服务层（2026-09-13）。
//
// 数据边界：food_shelf_life 是全局商品字典（同 BI SKU 名，无门店经营数据）；
// food_batches 是门店数据，每条读写都带 store_id 过滤，绝不跨店。
//
// 本模块刻意不写 audit_events：audit_module 的 CHECK 约束只允许 8 个既有模块，
// 扩列需要重建目前最大的核心表（D1 写行预算敏感期不值得），而批次表自带
// checked_at / checked_by / receiver / created_at，检查记录已完整可追溯。
// 若日后需要统一审计，按 expand-contract 单独排期。

export interface FoodShelfLifeDto {
  itemCode: string
  name: string
  shelfLifeMonths: number
  category: string
  packSize: number | null
}

export interface FoodBatchDto {
  id: string
  itemCode: string
  itemName: string
  kind: string
  dateType: string
  productionDate: string | null
  restrictedDate: string | null
  receivedDate: string
  quantity: number
  receiver: string
  warnOn: string
  expiresOn: string
  status: string
  checkedAt: string | null
  checkedBy: string | null
  revision: number
  createdAt: string
  updatedAt: string
}

export interface FoodOverview {
  today: string
  counts: { total: number; open: number; flagged: number; expired: number; soon: number }
}

type BatchRow = Record<string, unknown>

export function mapFoodBatchRow(row: BatchRow): FoodBatchDto {
  return {
    id: String(row.id),
    itemCode: String(row.item_code),
    itemName: String(row.item_name),
    kind: String(row.kind),
    dateType: String(row.date_type),
    productionDate: row.production_date === null || row.production_date === undefined ? null : String(row.production_date),
    restrictedDate: row.restricted_date === null || row.restricted_date === undefined ? null : String(row.restricted_date),
    receivedDate: String(row.received_date),
    quantity: Number(row.quantity),
    receiver: String(row.receiver ?? ''),
    warnOn: String(row.warn_on),
    expiresOn: String(row.expires_on),
    status: String(row.status),
    checkedAt: row.checked_at === null || row.checked_at === undefined ? null : String(row.checked_at),
    checkedBy: row.checked_by === null || row.checked_by === undefined ? null : String(row.checked_by),
    revision: Number(row.revision),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }
}

const BATCH_COLUMNS = `id, item_code, item_name, kind, date_type, production_date, restricted_date,
  received_date, quantity, receiver, warn_on, expires_on, status, checked_at, checked_by, revision, created_at, updated_at`

export async function listShelfLife(db: D1Database): Promise<FoodShelfLifeDto[]> {
  const rows = await all<Record<string, unknown>>(db.prepare(`
    SELECT item_code, name, shelf_life_months, category, pack_size
    FROM food_shelf_life
    ORDER BY category ASC, item_code ASC
  `))
  return rows.map((row) => ({
    itemCode: String(row.item_code),
    name: String(row.name),
    shelfLifeMonths: Number(row.shelf_life_months),
    category: String(row.category ?? ''),
    packSize: row.pack_size === null || row.pack_size === undefined ? null : Number(row.pack_size)
  }))
}

export async function upsertShelfLife(db: D1Database, input: FoodShelfLifeUpsertInput): Promise<FoodShelfLifeDto> {
  await run(db.prepare(`
    INSERT INTO food_shelf_life (item_code, name, shelf_life_months, category, pack_size, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(item_code) DO UPDATE SET
      name = excluded.name,
      shelf_life_months = excluded.shelf_life_months,
      category = excluded.category,
      pack_size = excluded.pack_size,
      updated_at = excluded.updated_at
  `).bind(input.itemCode, input.name, input.shelfLifeMonths, input.category, input.packSize ?? null, nowIso()))
  return {
    itemCode: input.itemCode,
    name: input.name,
    shelfLifeMonths: input.shelfLifeMonths,
    category: input.category,
    packSize: input.packSize ?? null
  }
}

export async function foodOverview(db: D1Database, storeId: string, today: string): Promise<FoodOverview> {
  const row = await first<{ total: number | null; open_total: number | null; flagged: number | null; expired: number | null; soon: number | null }>(
    db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open_total,
        SUM(CASE WHEN status = 'open' AND warn_on <= ? THEN 1 ELSE 0 END) AS flagged,
        SUM(CASE WHEN status = 'open' AND expires_on < ? THEN 1 ELSE 0 END) AS expired,
        SUM(CASE WHEN status = 'open' AND warn_on > ? AND expires_on <= ? THEN 1 ELSE 0 END) AS soon
      FROM food_batches
      WHERE store_id = ?
    `).bind(today, today, today, addDays(today, 45), storeId)
  )
  return {
    today,
    counts: {
      total: Number(row?.total ?? 0),
      open: Number(row?.open_total ?? 0),
      flagged: Number(row?.flagged ?? 0),
      expired: Number(row?.expired ?? 0),
      soon: Number(row?.soon ?? 0)
    }
  }
}

export interface ListFoodBatchesOptions {
  storeId: string
  today: string
  filter: 'flagged' | 'open' | 'all'
  kind?: string
  query?: string
  limit?: number
  offset?: number
}

export async function listFoodBatches(
  db: D1Database,
  options: ListFoodBatchesOptions
): Promise<{ batches: FoodBatchDto[]; hasMore: boolean; offset: number }> {
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? 100), 1), 200)
  const offset = Math.max(Math.trunc(options.offset ?? 0), 0)
  const conditions = ['store_id = ?']
  const values: Array<string | number> = [options.storeId]
  if (options.filter === 'flagged') {
    conditions.push("status = 'open'", 'warn_on <= ?')
    values.push(options.today)
  } else if (options.filter === 'open') {
    conditions.push("status = 'open'")
  }
  if (options.kind === 'food' || options.kind === 'nonfood') {
    conditions.push('kind = ?')
    values.push(options.kind)
  }
  const query = (options.query ?? '').trim()
  if (query) {
    conditions.push('(item_code LIKE ? OR item_name LIKE ?)')
    values.push(`%${query}%`, `%${query}%`)
  }
  // 单次取 limit+1 条判断 hasMore，避免额外 COUNT 扫描；总数由 overview 提供。
  const rows = await all(db.prepare(`
    SELECT ${BATCH_COLUMNS}
    FROM food_batches
    WHERE ${conditions.join(' AND ')}
    ORDER BY warn_on ASC, received_date ASC, id ASC
    LIMIT ? OFFSET ?
  `).bind(...values, limit + 1, offset))
  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  return { batches: page.map(mapFoodBatchRow), hasMore, offset }
}

export interface FoodActorContext {
  storeId: string
  displayName: string
}

export async function createFoodBatch(
  db: D1Database,
  context: FoodActorContext,
  input: FoodBatchCreateInput
): Promise<{ batch: FoodBatchDto; receiptWarningDays: number | null }> {
  const shelf = await first<{ name: string; shelf_life_months: number }>(
    db.prepare('SELECT name, shelf_life_months FROM food_shelf_life WHERE item_code = ?').bind(input.itemCode)
  )
  if (!shelf) throw new ApiProblem(400, 'FOOD_ITEM_NOT_IN_SHELF_LIFE', '该商品不在保质期清单里，请先在清单中补录保质期。')
  const dates = computeFoodDates({
    kind: input.kind,
    dateType: input.dateType,
    productionDate: input.productionDate,
    restrictedDate: input.restrictedDate,
    shelfLifeMonths: shelf.shelf_life_months
  })
  if (!dates.ok) {
    throw new ApiProblem(
      400,
      dates.error === 'SHELF_LIFE_INVALID' ? 'FOOD_SHELF_LIFE_INVALID' : 'FOOD_DATE_INVALID',
      '日期或保质期无效，请检查后重试。'
    )
  }
  const id = uuid()
  const stamp = nowIso()
  const receiver = input.receiver || context.displayName
  // 显式列清单：BATCH_COLUMNS 是查询投影（不含 store_id），写入必须自己带上门店列。
  await run(db.prepare(`
    INSERT INTO food_batches (
      id, store_id, item_code, item_name, kind, date_type, production_date, restricted_date,
      received_date, quantity, receiver, warn_on, expires_on, status, checked_at, checked_by,
      revision, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', NULL, NULL, 1, ?, ?)
  `).bind(
    id, context.storeId, input.itemCode, shelf.name, input.kind, input.dateType,
    input.productionDate ?? null, input.restrictedDate ?? null, input.receivedDate,
    input.quantity, receiver, dates.warnOn, dates.expiresOn, stamp, stamp
  ))
  return {
    batch: {
      id,
      itemCode: input.itemCode,
      itemName: shelf.name,
      kind: input.kind,
      dateType: input.dateType,
      productionDate: input.productionDate ?? null,
      restrictedDate: input.restrictedDate ?? null,
      receivedDate: input.receivedDate,
      quantity: input.quantity,
      receiver,
      warnOn: dates.warnOn,
      expiresOn: dates.expiresOn,
      status: 'open',
      checkedAt: null,
      checkedBy: null,
      revision: 1,
      createdAt: stamp,
      updatedAt: stamp
    },
    receiptWarningDays: foodReceiptWarning(dates.expiresOn, input.receivedDate)
  }
}

export async function setFoodBatchStatus(
  db: D1Database,
  context: FoodActorContext,
  id: string,
  input: FoodBatchActionInput
): Promise<FoodBatchDto> {
  const existing = await first<BatchRow>(
    db.prepare(`SELECT ${BATCH_COLUMNS} FROM food_batches WHERE id = ? AND store_id = ?`).bind(id, context.storeId)
  )
  if (!existing) throw new ApiProblem(404, 'FOOD_BATCH_NOT_FOUND', '批次不存在或不属于本门店。')
  if (Number(existing.revision) !== input.expectedRevision) {
    throw new ApiProblem(409, 'FOOD_BATCH_STALE', '该批次已被他人更新，请刷新后重试。')
  }
  const stamp = nowIso()
  const reopen = input.status === 'open'
  const updated = await run(db.prepare(`
    UPDATE food_batches
    SET status = ?, checked_at = ?, checked_by = ?, revision = revision + 1, updated_at = ?
    WHERE id = ? AND store_id = ? AND revision = ?
  `).bind(
    input.status,
    reopen ? null : stamp,
    reopen ? null : context.displayName,
    stamp, id, context.storeId, input.expectedRevision
  ))
  if (!updated.meta.changes) throw new ApiProblem(409, 'FOOD_BATCH_STALE', '该批次已被他人更新，请刷新后重试。')
  return mapFoodBatchRow({
    ...existing,
    status: input.status,
    checked_at: reopen ? null : stamp,
    checked_by: reopen ? null : context.displayName,
    revision: input.expectedRevision + 1,
    updated_at: stamp
  })
}
