import { first, nowIso, uuid } from '../db.js'

export interface DayRow {
  [key: string]: unknown
  id: string
  business_date: string
  sales_vehicles: number
  safety_checks: number
  safety_model: string
  valid_reviews: number
  used_sold: number
  used_received: number
  sales_saved_at: string | null
  closing_status: 'open' | 'closed'
  closed_at: string | null
  revision: number
  updated_at: string
}

export function mapDay(row: DayRow) {
  return {
    id: row.id,
    dateKey: row.business_date,
    kpi: {
      salesVehicles: row.sales_vehicles,
      safetyChecks: row.safety_checks,
      safetyModel: row.safety_model,
      validReviews: row.valid_reviews,
      usedSold: row.used_sold,
      usedReceived: row.used_received
    },
    kpiSavedAt: row.sales_saved_at,
    closedAt: row.closing_status === 'closed' ? row.closed_at : null,
    revision: row.revision,
    updatedAt: row.updated_at
  }
}

const selectDay = `
  SELECT id, business_date, sales_vehicles, safety_checks, safety_model, valid_reviews, used_sold, used_received,
         sales_saved_at, closing_status, closed_at, revision, updated_at
  FROM daily_closings
  WHERE store_id = ? AND business_date = ?
`

export async function getOrCreateDay(
  db: D1Database,
  storeId: string,
  businessDate: string,
  options: { allowWrite?: boolean } = {}
): Promise<{ day: DayRow; created: boolean }> {
  const existing = await first<DayRow>(db.prepare(selectDay).bind(storeId, businessDate))
  if (existing) return { day: existing, created: false }
  // 只读降级（2026-09-14）：写额度耗尽时当日行可能还没建立，但读接口仍必须可用，
  // 否则门店连历史台账都打不开。用内存里的默认值顶上，created 保持 false
  // （跨日清理同样不执行）；任何写操作本来就会被拦成结构化额度提示。
  if (options.allowWrite === false) {
    const stamp = nowIso()
    return {
      day: {
        id: '',
        business_date: businessDate,
        sales_vehicles: 0,
        safety_checks: 0,
        safety_model: '',
        valid_reviews: 0,
        used_sold: 0,
        used_received: 0,
        sales_saved_at: null,
        closing_status: 'open',
        closed_at: null,
        revision: 0,
        updated_at: stamp,
        read_only_placeholder: 1
      } as DayRow,
      created: false
    }
  }
  const stamp = nowIso()
  const id = uuid()
  await db.prepare(`
    INSERT INTO daily_closings (
      id, store_id, business_date, sales_vehicles, safety_checks, safety_model, valid_reviews,
      used_sold, used_received, closing_status, revision, created_at, updated_at
    ) VALUES (?, ?, ?, 0, 0, '', 0, 0, 0, 'open', 1, ?, ?)
  `).bind(id, storeId, businessDate, stamp, stamp).run()
  const createdRow = await first<DayRow>(db.prepare(selectDay).bind(storeId, businessDate))
  if (!createdRow) throw new Error('DAY_UPSERT_FAILED')
  return { day: createdRow, created: true }
}
