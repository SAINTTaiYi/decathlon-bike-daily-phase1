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

export async function getOrCreateDay(db: D1Database, storeId: string, businessDate: string): Promise<DayRow> {
  const existing = await first<DayRow>(db.prepare(selectDay).bind(storeId, businessDate))
  if (existing) return existing
  const stamp = nowIso()
  const id = uuid()
  await db.prepare(`
    INSERT INTO daily_closings (
      id, store_id, business_date, sales_vehicles, safety_checks, safety_model, valid_reviews,
      used_sold, used_received, closing_status, revision, created_at, updated_at
    ) VALUES (?, ?, ?, 0, 0, '', 0, 0, 0, 'open', 1, ?, ?)
  `).bind(id, storeId, businessDate, stamp, stamp).run()
  const created = await first<DayRow>(db.prepare(selectDay).bind(storeId, businessDate))
  if (!created) throw new Error('DAY_UPSERT_FAILED')
  return created
}
