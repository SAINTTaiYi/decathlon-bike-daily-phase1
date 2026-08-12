import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFile, readdir } from 'node:fs/promises'

const MIGRATION_0011 = '0011_directory_guangxi_cities.sql'
const NANNING_ID = '30000000-0000-4000-8000-000000000002'
const GUILIN_ID = '50000000-0000-4000-8000-000000000001'
const LIUZHOU_ID = '50000000-0000-4000-8000-000000000002'

function migrationUrl(name) {
  return new URL(`../../../migrations/d1/${name}`, import.meta.url)
}

async function readMigration(name) {
  return readFile(migrationUrl(name), 'utf8')
}

/** Strip `--` line comments so text contracts assert on executable SQL only. */
function executableSql(sql) {
  return sql
    .split('\n')
    .map((line) => line.replace(/--.*$/u, ''))
    .join('\n')
}

async function baselineMigrationNames() {
  // 0012_flat_store_self_registration removes the directory tables (regions/cities/subregions).
  // 0011 tests the pre-flat chain (0001..0010 -> 0011) as a deployable forward migration.
  const files = await readdir(new URL('../../../migrations/d1/', import.meta.url))
  return files
    .filter((name) => name.endsWith('.sql') && name !== MIGRATION_0011 && !name.startsWith('0012_'))
    .sort()
}

async function buildBaseline() {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  for (const name of await baselineMigrationNames()) {
    db.exec(await readMigration(name))
  }
  return db
}

function storeRow(db, code) {
  const row = db.prepare('SELECT * FROM stores WHERE code = ?').get(code)
  return row ? { ...row } : row
}

/**
 * Mirrors governance.ts: cities are joined to subregions with an INNER JOIN, so a city whose
 * subregion_id is NULL disappears from the directory the app renders.
 */
function directoryTree(db) {
  return db
    .prepare(
      `SELECT r.name AS region, sr.name AS subregion, c.name AS city, c.sort_order AS sortOrder,
              (SELECT count(*) FROM stores s WHERE s.city_id = c.id) AS storeCount
       FROM cities c
       JOIN subregions sr ON sr.id = c.subregion_id
       JOIN regions r ON r.id = c.region_id
       ORDER BY r.sort_order, sr.sort_order, c.sort_order`
    )
    .all()
    .map((row) => ({ ...row }))
}

test('0011 把广西原地改名为南宁并新增桂林、柳州，1670/1299 零写入', async () => {
  const db = await buildBaseline()
  try {
    const baselineCity = db.prepare('SELECT * FROM cities WHERE id = ?').get(NANNING_ID)
    assert.equal(baselineCity.name, '广西', '基线前置条件：0006 seed 的城市名为广西')
    assert.ok(baselineCity.subregion_id, '基线前置条件：0009 已回填 subregion_id')
    assert.equal(
      db.prepare('SELECT count(*) AS n FROM stores WHERE city_id = ?').get(NANNING_ID).n,
      4,
      '基线前置条件：4 家门店都挂在同一个城市下'
    )

    // Sentinel updated_at values turn "no write" into an observable fact: a rewrite with the same
    // wall-clock timestamp would still overwrite the sentinel.
    const sentinel = 'SENTINEL-NO-WRITE'
    db.prepare('UPDATE stores SET updated_at = ? WHERE code IN (?, ?)').run(sentinel, '1299', '1670')
    const before1299 = storeRow(db, '1299')
    const before1670 = storeRow(db, '1670')

    db.exec(await readMigration(MIGRATION_0011))

    assert.deepEqual(storeRow(db, '1299'), before1299, '1299 五象店承载真实生产数据，必须零写入')
    assert.deepEqual(storeRow(db, '1670'), before1670, '1670 民族东店随城市改名留在原地，必须零写入')

    const nanning = db.prepare('SELECT * FROM cities WHERE id = ?').get(NANNING_ID)
    assert.equal(nanning.name, '南宁', '广西原地改名为南宁')
    assert.equal(nanning.normalized_name, '南宁')
    assert.equal(nanning.sort_order, 10)
    assert.equal(
      db.prepare(`SELECT count(*) AS n FROM cities WHERE normalized_name = '广西'`).get().n,
      0,
      '改名后不应残留广西'
    )

    for (const [id, name, sortOrder] of [[GUILIN_ID, '桂林', 20], [LIUZHOU_ID, '柳州', 30]]) {
      const city = db.prepare('SELECT * FROM cities WHERE id = ?').get(id)
      assert.ok(city, `${name} 必须存在`)
      assert.equal(city.name, name)
      assert.equal(city.normalized_name, name, 'normalizedName() 对中文是恒等映射')
      assert.equal(city.sort_order, sortOrder)
      assert.equal(city.region_id, nanning.region_id, '新城市继承同一个大区')
      assert.equal(city.subregion_id, nanning.subregion_id, '新城市必须挂在广西江湖区下，否则从目录静默消失')
    }

    assert.equal(storeRow(db, '994').city_id, GUILIN_ID, '994 穿山店迁到桂林')
    assert.equal(storeRow(db, '1249').city_id, LIUZHOU_ID, '1249 河东店迁到柳州')
    assert.equal(
      db.prepare('SELECT count(*) AS n FROM stores WHERE city_id IS NULL').get().n,
      0,
      '没有门店因为迁移丢失城市归属'
    )
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0)
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok')
  } finally {
    db.close()
  }
})

test('0011 迁移后的目录树是 南区 -> 广西江湖区 -> 南宁/桂林/柳州', async () => {
  const db = await buildBaseline()
  try {
    db.exec(await readMigration(MIGRATION_0011))
    assert.deepEqual(directoryTree(db), [
      { region: '南区', subregion: '广西江湖区', city: '南宁', sortOrder: 10, storeCount: 2 },
      { region: '南区', subregion: '广西江湖区', city: '桂林', sortOrder: 20, storeCount: 1 },
      { region: '南区', subregion: '广西江湖区', city: '柳州', sortOrder: 30, storeCount: 1 }
    ])
  } finally {
    db.close()
  }
})

test('0011 可重复执行：第二、三次运行不写任何一行', async () => {
  const db = await buildBaseline()
  try {
    const sql = await readMigration(MIGRATION_0011)
    db.exec(sql)

    const sentinel = 'SENTINEL-IDEMPOTENT'
    db.prepare('UPDATE cities SET updated_at = ?').run(sentinel)
    db.prepare('UPDATE stores SET updated_at = ?').run(sentinel)
    const citiesBefore = db.prepare('SELECT * FROM cities ORDER BY id').all()
    const storesBefore = db.prepare('SELECT * FROM stores ORDER BY code').all()

    db.exec(sql)
    db.exec(sql)

    assert.deepEqual(db.prepare('SELECT * FROM cities ORDER BY id').all(), citiesBefore)
    assert.deepEqual(db.prepare('SELECT * FROM stores ORDER BY code').all(), storesBefore)
    assert.equal(
      db.prepare('SELECT count(*) AS n FROM cities WHERE updated_at <> ?').get(sentinel).n,
      0,
      '重复执行不得刷新任何 cities.updated_at'
    )
    assert.equal(
      db.prepare('SELECT count(*) AS n FROM stores WHERE updated_at <> ?').get(sentinel).n,
      0,
      '重复执行不得刷新任何 stores.updated_at'
    )
  } finally {
    db.close()
  }
})

test('0011 只前向新增：不含破坏性语句，且从不点名 1299', async () => {
  const sql = executableSql(await readMigration(MIGRATION_0011))

  for (const forbidden of ['DELETE', 'DROP', 'ALTER', 'TRUNCATE', 'REPLACE INTO']) {
    assert.equal(
      new RegExp(`\\b${forbidden}\\b`, 'iu').test(sql),
      false,
      `0011 不得出现 ${forbidden}`
    )
  }
  assert.equal(sql.includes('1299'), false, '可执行 SQL 不得点名 1299，它只能随城市改名留在原地')
  assert.equal(sql.includes('1670'), false, '可执行 SQL 不得点名 1670，同上')

  const storeCodes = [...sql.matchAll(/WHERE\s+code\s*=\s*'(\d+)'/giu)].map((m) => m[1])
  assert.deepEqual(storeCodes, ['994', '1249'], '只有 994 和 1249 被改归属')

  const cityInserts = [...sql.matchAll(/INSERT\s+INTO\s+cities\s*\(([^)]*)\)/giu)].map((m) => m[1])
  assert.equal(cityInserts.length, 2, '恰好新增两个城市')
  for (const columns of cityInserts) {
    assert.match(columns, /subregion_id/u, '每个新城市都必须显式写 subregion_id')
  }

  const storeUpdates = [...sql.matchAll(/UPDATE\s+stores\b[\s\S]*?;/giu)].map((m) => m[0])
  assert.equal(storeUpdates.length, 2)
  for (const statement of storeUpdates) {
    assert.match(statement, /EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+cities/iu, '门店改归属必须带 EXISTS 守卫，避免写入 NULL city_id')
    assert.match(statement, /city_id\s*=\s*'50000000-/u, '目标城市必须是字面量 id，不能是可能求值为 NULL 的子查询')
  }
})

test('每个 D1 迁移文件都登记在 worker 测试适配器的清单里', async () => {
  const adapter = await readFile(
    new URL('../../../apps/worker/security/d1-test-adapter.ts', import.meta.url),
    'utf8'
  )
  const files = (await readdir(new URL('../../../migrations/d1/', import.meta.url)))
    .filter((name) => name.endsWith('.sql'))
    .sort()

  assert.ok(files.includes(MIGRATION_0011))
  for (const name of files) {
    assert.ok(adapter.includes(`'${name}'`), `d1-test-adapter.ts 缺少 ${name}，worker 测试会跑在过期 schema 上`)
  }
})
