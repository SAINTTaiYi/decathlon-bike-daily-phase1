import { all } from '../db.js'

export type BusinessTrendDay = {
  date: string
  salesVehicles: number | null
  salesSaved: boolean
  repairIntake: number
}

export type BusinessTrends = {
  startDate: string
  endDate: string
  days: BusinessTrendDay[]
  sales: { total: number; savedDays: number; missingDays: number }
  repairs: { intakeTotal: number }
}

type SalesRow = { business_date: string; sales_vehicles: number; sales_saved_at: string | null }
type RepairRow = { business_date: string; repair_intake: number }

function isoDaysEndingAt(endDate: string, count: number): string[] {
  const end = new Date(`${endDate}T00:00:00.000Z`)
  if (Number.isNaN(end.getTime())) throw new Error('INVALID_BUSINESS_DATE')
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(end)
    date.setUTCDate(end.getUTCDate() - (count - index - 1))
    return date.toISOString().slice(0, 10)
  })
}

export async function buildBusinessTrends(db: D1Database, storeId: string, endDate: string, count = 7): Promise<BusinessTrends> {
  const dates = isoDaysEndingAt(endDate, count)
  const startDate = dates[0]
  if (!startDate) throw new Error('INVALID_TREND_WINDOW')
  const [salesRows, repairRows] = await Promise.all([
    all<SalesRow>(db.prepare(`
      SELECT business_date, sales_vehicles, sales_saved_at
      FROM daily_closings
      WHERE store_id = ? AND business_date BETWEEN ? AND ?
      ORDER BY business_date
    `).bind(storeId, startDate, endDate)),
    all<RepairRow>(db.prepare(`
      SELECT event.business_date, COUNT(*) AS repair_intake
      FROM audit_events event
      WHERE event.store_id = ?
        AND event.audit_module = 'repair'
        AND event.action = 'add-record'
        AND event.business_date BETWEEN ? AND ?
        AND NOT EXISTS (
          SELECT 1 FROM audit_events undo
          WHERE undo.store_id = event.store_id
            AND undo.reverted_event_id = event.id
        )
      GROUP BY event.business_date
      ORDER BY event.business_date
    `).bind(storeId, startDate, endDate))
  ])
  const salesByDate = new Map(salesRows.map((row) => [row.business_date, row]))
  const repairsByDate = new Map(repairRows.map((row) => [row.business_date, Number(row.repair_intake)]))
  const days = dates.map((date) => {
    const sales = salesByDate.get(date)
    const salesSaved = Boolean(sales?.sales_saved_at)
    return {
      date,
      salesVehicles: salesSaved ? Number(sales?.sales_vehicles ?? 0) : null,
      salesSaved,
      repairIntake: repairsByDate.get(date) ?? 0
    }
  })
  const savedDays = days.filter((day) => day.salesSaved).length
  return {
    startDate,
    endDate,
    days,
    sales: {
      total: days.reduce((sum, day) => sum + (day.salesVehicles ?? 0), 0),
      savedDays,
      missingDays: days.length - savedDays
    },
    repairs: { intakeTotal: days.reduce((sum, day) => sum + day.repairIntake, 0) }
  }
}
