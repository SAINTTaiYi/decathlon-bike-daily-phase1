import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { listBootstrapAuditFeed } from '../src/routes/audit.js'
import { getOrCreateDay } from '../src/services/closing.js'
import { migratedTestDatabase, type TestD1Database } from '../security/d1-test-adapter.js'

// 2026-09-03 D1 免费层限额预算回归：bootstrap 审计 feed 必须有界。
// 旧版无日期 LIMIT 500 随历史总量线性增长（staging 实测 1.2k+ 行/次）；
// 新版 = 当天事件（0022 索引前缀）+ 在册记录事件史（entity 点查），不随历史增长。

const STORE = 'bb000000-0000-4000-8000-000000000001'
const OTHER = 'bb000000-0000-4000-8000-000000000002'
const TODAY = '2026-09-03'

async function seed(): Promise<TestD1Database> {
  const db = await migratedTestDatabase()
  const insertStore = db.sqlite.prepare(`INSERT INTO stores (id, code, name, timezone, status, created_at, updated_at) VALUES (?, ?, ?, 'Asia/Shanghai', 'active', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z')`)
  insertStore.run(STORE, 'BUD', '预算店')
  insertStore.run(OTHER, 'OTH', '他店')
  const insertEvent = db.sqlite.prepare(`INSERT INTO audit_events (id, store_id, actor_name_snapshot, action, entity_type, entity_id, business_date, summary, reversible, request_id, audit_module, created_at) VALUES (?, ?, '预算测试', 'add-record', 'work-item', ?, ?, ?, ?, ?, 'repair', ?)`)
  // 当天事件：R1 的两条（前者会被后者顶掉 canUndo）+ 一条 NULL entity
  insertEvent.run('e-t2', STORE, 'R1', TODAY, '今天第二条', 1, 'req-t2', '2026-09-03T02:00:00.000Z')
  insertEvent.run('e-t1', STORE, 'R1', TODAY, '今天第一条', 1, 'req-t1', '2026-09-03T01:00:00.000Z')
  insertEvent.run('e-tn', STORE, null, TODAY, '今天空对象', 0, 'req-tn', '2026-09-03T01:30:00.000Z')
  // 在册记录 R1 的三天前事件（跨天维修的操作记录抽屉依赖它）
  insertEvent.run('e-r1-old', STORE, 'R1', '2026-08-31', '三天前开单', 0, 'req-r1o', '2026-08-31T05:00:00.000Z')
  // 不在册记录 R2 的旧事件（已完成清理）与 他店事件：都不得进 feed
  insertEvent.run('e-r2-old', STORE, 'R2', '2026-08-30', '已完成记录', 0, 'req-r2o', '2026-08-30T05:00:00.000Z')
  insertEvent.run('e-other', OTHER, 'R9', TODAY, '他店事件', 0, 'req-ot', '2026-09-03T03:00:00.000Z')
  return db
}

test('listBootstrapAuditFeed：当天事件 + 在册记录事件史，撤回判定只对当天开放', async () => {
  const db = await seed()
  const events = await listBootstrapAuditFeed(db as unknown as D1Database, STORE, TODAY, ['R1'])
  assert.deepEqual(events.map((event: any) => event.id), ['e-t2', 'e-tn', 'e-t1', 'e-r1-old'], 'feed = 当天事件(倒序) + 在册记录事件史')
  const byId = new Map(events.map((event: any) => [event.id, event]))
  assert.equal(byId.get('e-t2').canUndo, true, '当天最新一条可撤回')
  assert.equal(byId.get('e-t1').canUndo, false, '当天较早一条被后续事件顶掉（has_later_event）')
  assert.equal(byId.get('e-tn').canUndo, false, 'reversible=0 不可撤回')
  assert.equal(byId.get('e-r1-old').canUndo, false, '历史事件不可撤回（跨日）')
  assert.equal(byId.get('e-r1-old').entityId, 'R1', '在册记录历史进 feed')
  // 无在册记录时：只有当天事件
  const todayOnly = await listBootstrapAuditFeed(db as unknown as D1Database, STORE, TODAY, [])
  assert.deepEqual(todayOnly.map((event: any) => event.id), ['e-t2', 'e-tn', 'e-t1'])
})

test('feed 两条查询分别命中 0022 门店业务日索引与 entity 索引', async () => {
  const db = await seed()
  const todayPlan = db.sqlite.prepare(`EXPLAIN QUERY PLAN
    SELECT e.id FROM audit_events e
    WHERE e.store_id = ? AND e.business_date = ?
    ORDER BY e.created_at DESC LIMIT 500`).all(STORE, TODAY)
  assert.match(JSON.stringify(todayPlan), /audit_events_store_date_created_idx/u, '当天查询必须走门店+业务日索引')
  const historyPlan = db.sqlite.prepare(`EXPLAIN QUERY PLAN
    SELECT e.id FROM audit_events e
    WHERE e.entity_type = 'work-item' AND e.entity_id IN (?)
      AND e.store_id = ? AND e.business_date != ?`).all('R1', STORE, TODAY)
  assert.match(JSON.stringify(historyPlan), /audit_events_entity_idx/u, '在册记录事件史必须走 entity 索引')
})

test('getOrCreateDay 返回创建标志，bootstrap 只在当日首次访问时执行清理扫描', async () => {
  const db = await seed()
  const first = await getOrCreateDay(db as unknown as D1Database, STORE, TODAY)
  assert.equal(first.created, true, '当日首次访问必须标记 created')
  assert.equal(first.day.business_date, TODAY)
  const second = await getOrCreateDay(db as unknown as D1Database, STORE, TODAY)
  assert.equal(second.created, false, '后续访问不得重复创建/触发清理')

  const bootstrap = await readFile(new URL('../src/routes/bootstrap.ts', import.meta.url), 'utf8')
  assert.match(bootstrap, /if \(dayCreated\) \{/u, '清理必须门控在 dayCreated 上')
  assert.match(bootstrap, /listBootstrapAuditFeed\(c\.env\.DB, context\.storeId, businessDate, records\.map\(\(record\) => record\.id\)\)/u, 'bootstrap 必须使用有界 feed 并传入在册记录 id')
  assert.doesNotMatch(bootstrap, /listAudit\(c\.env\.DB, context\.storeId, undefined/u, 'bootstrap 不得再走无日期审计查询')
  const migration = await readFile(new URL('../../../migrations/d1/0022_audit_feed_store_date_index.sql', import.meta.url), 'utf8')
  assert.match(migration, /CREATE INDEX audit_events_store_date_created_idx/u)
})
