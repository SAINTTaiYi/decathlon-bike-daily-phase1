import assert from 'node:assert/strict'
import test from 'node:test'
import { readdir, readFile } from 'node:fs/promises'
import { migratedTestDatabase, type TestD1Database } from '../security/d1-test-adapter.js'

// 2026-09-13 D1 免费层限额预算回归：shiphub_sync_runs 按 started_at 的运维/排查查询。
// 既有 shiphub_sync_runs_store_started_idx 是 (store_id, started_at DESC) 复合索引，
// 只服务带 store_id 前缀的查询；仅按 started_at 过滤/排序的查询没有可用前缀：
// 范围查询退化为整索引扫描（preview 实测 69,128 行/次），ORDER BY started_at DESC LIMIT
// 退化为整表扫描 + 临时 B 树排序，且都随历史总量线性增长（2026-09-13 的 7 条排查查询
// 烧掉约 83 万行）。0034 单列索引让这类查询只读命中区间，门店前缀查询保持不变。

const STORE = '30000000-0000-4000-8000-000000001299'
const FROM = '2026-09-13T00:00:00.000Z'
const RANGE_SQL = 'SELECT COUNT(*) AS n, MAX(started_at) AS last FROM shiphub_sync_runs WHERE started_at >= ?'
const ORDER_SQL = 'SELECT started_at, category, status FROM shiphub_sync_runs ORDER BY started_at DESC LIMIT 20'

function planText(db: TestD1Database, sql: string, ...params: string[]): string {
  return db.sqlite.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params)
    .map((row) => Object.values(row as Record<string, unknown>).join(' '))
    .join('\n')
}

async function seeded(): Promise<TestD1Database> {
  const db = await migratedTestDatabase()
  // 1299 门店由迁移 0006 预置（id 30000000-0000-4000-8000-000000001299），直接引用。
  const insert = db.sqlite.prepare(`INSERT INTO shiphub_sync_runs (id, store_id, category, trigger_source, started_at, status) VALUES (?, ?, 'hand', 'scheduled', ?, 'succeeded')`)
  insert.run('run-1', STORE, '2026-09-13T01:00:00.000Z')
  insert.run('run-2', STORE, '2026-09-13T02:00:00.000Z')
  return db
}

test('0034 迁移创建 shiphub_sync_runs 的 started_at 单列索引', async () => {
  const names = (await readdir(new URL('../../../migrations/d1/', import.meta.url))).filter((name) => /^0034_.+\.sql$/u.test(name))
  assert.equal(names.length, 1, '0034 迁移必须恰好一个文件')
  const sql = await readFile(new URL(`../../../migrations/d1/${names[0]}`, import.meta.url), 'utf8')
  assert.match(sql, /CREATE INDEX shiphub_sync_runs_started_idx\s+ON shiphub_sync_runs\(started_at DESC\)/u, '0034 必须创建 started_at 单列索引')
})

test('时间窗口查询命中 0034 索引区间，倒序列表不再临时排序', async () => {
  const db = await seeded()
  const range = planText(db, RANGE_SQL, FROM)
  assert.match(range, /SEARCH shiphub_sync_runs USING (?:COVERING )?INDEX shiphub_sync_runs_started_idx/u, '范围查询必须走 started_at 单列索引')
  assert.doesNotMatch(range, /SCAN shiphub_sync_runs USING/u, '范围查询不得再整表/整索引扫描')
  const order = planText(db, ORDER_SQL)
  assert.match(order, /shiphub_sync_runs_started_idx/u, '倒序列表必须走 started_at 单列索引')
  assert.doesNotMatch(order, /TEMP B-TREE/u, '倒序列表不得再出现临时 B 树排序')
  const row = db.sqlite.prepare(RANGE_SQL).get(FROM) as { n: number; last: string } | undefined
  assert.equal(row?.n, 2, '区间查询语义不变')
  assert.equal(row?.last, '2026-09-13T02:00:00.000Z')
})

test('无 0034 索引的旧 schema 下同查询退化为整索引/整表扫描（回归对照）', async () => {
  const db = await seeded()
  db.sqlite.exec('DROP INDEX shiphub_sync_runs_started_idx')
  const range = planText(db, RANGE_SQL, FROM)
  assert.doesNotMatch(range, /shiphub_sync_runs_started_idx/u, '删除后不得再引用该索引')
  assert.match(range, /SCAN shiphub_sync_runs USING/u, '旧 schema 下范围查询确实退化为扫描（对照）')
  const order = planText(db, ORDER_SQL)
  assert.match(order, /TEMP B-TREE/u, '旧 schema 下倒序列表确实出现临时排序（对照）')
})

test('门店前缀查询继续走 (store_id, started_at) 复合索引，不被新索引取代', async () => {
  const db = await seeded()
  const cf = planText(db, `SELECT MAX(started_at) FROM shiphub_sync_runs WHERE store_id = ? AND status = 'succeeded' AND started_at >= ?`, STORE, FROM)
  assert.match(cf, /shiphub_sync_runs_store_started_idx/u, '监控查询必须继续命中门店复合索引')
  const manual = planText(db, `SELECT id FROM shiphub_sync_runs WHERE store_id = ? AND trigger_source = 'manual' AND started_at > ? ORDER BY started_at DESC LIMIT 1`, STORE, FROM)
  assert.match(manual, /shiphub_sync_runs_store_started_idx/u, '手动同步冷却查询必须继续命中门店复合索引')
})
