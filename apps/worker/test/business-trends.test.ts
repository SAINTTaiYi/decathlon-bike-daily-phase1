import assert from 'node:assert/strict'
import test from 'node:test'
import { migratedTestDatabase } from '../security/d1-test-adapter.js'
import { buildBusinessTrends } from '../src/services/trends.js'

const STORE_A = '30000000-0000-4000-8000-000000009001'
const STORE_B = '30000000-0000-4000-8000-000000009002'
const STAMP = '2026-08-05T01:00:00.000Z'

type TestDb = Awaited<ReturnType<typeof migratedTestDatabase>>
function seedStore(db: TestDb, id: string, code: string): void {
  db.sqlite.prepare(`INSERT INTO stores (id, code, name, timezone, status, created_at, updated_at) VALUES (?, ?, ?, 'Asia/Shanghai', 'active', ?, ?)`).run(id, code, code, STAMP, STAMP)
}
function seedDay(db: TestDb, storeId: string, date: string, sales: number, saved: boolean): void {
  db.sqlite.prepare(`INSERT INTO daily_closings (id, store_id, business_date, sales_vehicles, sales_saved_at, closing_status, revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'open', 1, ?, ?)`).run(`${storeId}-${date}`, storeId, date, sales, saved ? STAMP : null, STAMP, STAMP)
}
function seedAudit(db: TestDb, input: { id: string; storeId: string; date: string; action?: string; module?: string; revertedEventId?: string | null }): void {
  db.sqlite.prepare(`INSERT INTO audit_events (id, store_id, actor_name_snapshot, action, entity_type, entity_id, business_date, summary, reversible, reverted_event_id, request_id, audit_module, created_at) VALUES (?, ?, '趋势测试', ?, 'work-item', ?, ?, '趋势测试事件', 0, ?, ?, ?, ?)`).run(input.id, input.storeId, input.action ?? 'add-record', `entity-${input.id}`, input.date, input.revertedEventId ?? null, `request-${input.id}`, input.module ?? 'repair', STAMP)
}

test('七个自然日销售趋势保留缺失日、保留真实零值并隔离门店', async () => {
  const db = await migratedTestDatabase()
  try {
    seedStore(db, STORE_A, 'TREND-A'); seedStore(db, STORE_B, 'TREND-B')
    seedDay(db, STORE_A, '2026-08-01', 3, true); seedDay(db, STORE_A, '2026-08-03', 0, true)
    seedDay(db, STORE_A, '2026-08-04', 9, false); seedDay(db, STORE_A, '2026-08-05', 2, true)
    seedDay(db, STORE_B, '2026-08-05', 100, true)
    const trends = await buildBusinessTrends(db as unknown as D1Database, STORE_A, '2026-08-05')
    assert.deepEqual(trends.days.map((day) => day.date), ['2026-07-30','2026-07-31','2026-08-01','2026-08-02','2026-08-03','2026-08-04','2026-08-05'])
    assert.deepEqual(trends.days.map((day) => day.salesVehicles), [null,null,3,null,0,null,2])
    assert.deepEqual(trends.sales, { total: 5, savedDays: 3, missingDays: 4 })
  } finally { db.close() }
})

test('维修新增趋势按门店统计 add-record 并排除被撤回事件', async () => {
  const db = await migratedTestDatabase()
  try {
    seedStore(db, STORE_A, 'TREND-A'); seedStore(db, STORE_B, 'TREND-B')
    seedAudit(db, { id: 'repair-kept', storeId: STORE_A, date: '2026-08-02' })
    seedAudit(db, { id: 'repair-undone', storeId: STORE_A, date: '2026-08-04' })
    seedAudit(db, { id: 'undo-repair', storeId: STORE_A, date: '2026-08-04', action: 'undo-operation', revertedEventId: 'repair-undone' })
    seedAudit(db, { id: 'other-store', storeId: STORE_B, date: '2026-08-02' })
    seedAudit(db, { id: 'handover', storeId: STORE_A, date: '2026-08-03', module: 'handover' })
    const trends = await buildBusinessTrends(db as unknown as D1Database, STORE_A, '2026-08-05')
    assert.deepEqual(trends.days.map((day) => day.repairIntake), [0,0,0,1,0,0,0])
    assert.deepEqual(trends.repairs, { intakeTotal: 1 })
  } finally { db.close() }
})
