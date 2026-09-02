import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'

// 2026-09-02 D1 免费层行读限额烧穿事故的回归防线。
// 旧写法 `((later.entity_id IS NULL AND e.entity_id IS NULL) OR later.entity_id = e.entity_id)`
// 让 SQLite 放弃 audit_events_entity_idx，has_later_event 退化为 store_created_idx 区间扫描，
// bootstrap 审计 feed 单次读 2-3 万行（staging 单日 5.8M 行，占账号级免费限额 97%）。
// 新写法按 e.entity_id 是否为空拆成两个 EXISTS：非空分支走 entity 索引点查。

test('has_later_event 使用两分支 EXISTS，禁止回退 OR 合并条件', async () => {
  const source = await readFile(new URL('../src/routes/audit.ts', import.meta.url), 'utf8')
  assert.equal((source.match(/\(\(later\.entity_id IS NULL AND e\.entity_id IS NULL\) OR later\.entity_id = e\.entity_id\)/gu) || []).length, 0, '旧 OR 合并条件必须清零（listAudit×2 + listPermanentAudit）')
  assert.equal((source.match(/\(e\.entity_id IS NOT NULL AND EXISTS \(/gu) || []).length, 3, '非空 entity_id 的索引点查分支应出现 3 次')
  assert.equal((source.match(/OR \(e\.entity_id IS NULL AND EXISTS \(/gu) || []).length, 3, 'NULL entity_id 分支应出现 3 次')
})

test('undo 后续计数按 entity_id 空否构造点查条件，不再绑定可空参数两次', async () => {
  const source = await readFile(new URL('../src/routes/audit.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /\(\(e\.entity_id IS NULL AND \? IS NULL\) OR e\.entity_id = \?\)/u)
  assert.match(source, /const entityIdClause = hasEntityId \? 'e\.entity_id = \?' : 'e\.entity_id IS NULL'/u)
  assert.match(source, /AND \$\{entityIdClause\}/u)
})

test('两分支 EXISTS 与旧 OR 语义等价（含 NULL entity_id / 跨店 / 跨实体类型），执行计划命中 entity 索引', () => {
  const db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE audit_events (
      id TEXT PRIMARY KEY,
      store_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX audit_events_store_created_idx ON audit_events(store_id, created_at);
    CREATE INDEX audit_events_entity_idx ON audit_events(entity_type, entity_id, created_at);
  `)
  const insert = db.prepare('INSERT INTO audit_events (id, store_id, entity_type, entity_id, created_at) VALUES (?, ?, ?, ?, ?)')
  insert.run('a1', 's1', 'work-item', 'A', '2026-09-01T01:00:00.000Z')
  insert.run('a2', 's1', 'work-item', 'A', '2026-09-01T02:00:00.000Z')
  insert.run('b1', 's1', 'work-item', 'B', '2026-09-01T01:30:00.000Z')
  insert.run('n1', 's1', 'work-item', null, '2026-09-01T01:00:00.000Z')
  insert.run('n2', 's1', 'work-item', null, '2026-09-01T02:30:00.000Z')
  insert.run('x1', 's2', 'work-item', 'A', '2026-09-01T03:00:00.000Z')
  insert.run('y1', 's1', 'account', 'A', '2026-09-01T03:00:00.000Z')

  const oldSql = `SELECT e.id,
    CASE WHEN EXISTS (
      SELECT 1 FROM audit_events later
      WHERE later.store_id = e.store_id
        AND later.entity_type = e.entity_type
        AND ((later.entity_id IS NULL AND e.entity_id IS NULL) OR later.entity_id = e.entity_id)
        AND later.created_at > e.created_at
    ) THEN 1 ELSE 0 END AS has_later_event
    FROM audit_events e WHERE e.store_id = ? ORDER BY e.id`
  const newSql = `SELECT e.id,
    CASE WHEN
      (e.entity_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM audit_events later
        WHERE later.entity_type = e.entity_type
          AND later.entity_id = e.entity_id
          AND later.store_id = e.store_id
          AND later.created_at > e.created_at))
      OR (e.entity_id IS NULL AND EXISTS (
        SELECT 1 FROM audit_events later
        WHERE later.entity_type = e.entity_type
          AND later.entity_id IS NULL
          AND later.store_id = e.store_id
          AND later.created_at > e.created_at))
    THEN 1 ELSE 0 END AS has_later_event
    FROM audit_events e WHERE e.store_id = ? ORDER BY e.id`

  const oldRows = db.prepare(oldSql).all('s1').map((row: Record<string, unknown>) => ({ ...row }))
  const newRows = db.prepare(newSql).all('s1').map((row: Record<string, unknown>) => ({ ...row }))
  assert.deepEqual(newRows, oldRows, '新旧 SQL 的 has_later_event 语义必须逐行一致')

  const byId = new Map(newRows.map((row) => [String(row.id), Number(row.has_later_event)]))
  assert.equal(byId.get('a1'), 1, 'A 的首事件应看到后续事件')
  assert.equal(byId.get('a2'), 0)
  assert.equal(byId.get('b1'), 0, 'B 无后续事件')
  assert.equal(byId.get('n1'), 1, 'NULL entity_id 的首事件应看到同店同类型 NULL 的后续事件')
  assert.equal(byId.get('n2'), 0)

  const plan = db.prepare(`EXPLAIN QUERY PLAN ${newSql}`).all('s1')
  const planText = plan.map((row: Record<string, unknown>) => Object.values(row).join(' ')).join('\n')
  assert.match(planText, /audit_events_entity_idx/u, '修复后的关联子查询必须命中 entity 索引')
  const oldPlanText = db.prepare(`EXPLAIN QUERY PLAN ${oldSql}`).all('s1')
    .map((row: Record<string, unknown>) => Object.values(row).join(' ')).join('\n')
  assert.doesNotMatch(oldPlanText, /audit_events_entity_idx/u, '旧 OR 写法确实无法命中 entity 索引（回归对照）')
})
