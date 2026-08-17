import assert from 'node:assert/strict'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { readdir, readFile } from 'node:fs/promises'

async function applyAll(db) {
  const names = (await readdir(new URL('../../../migrations/d1/', import.meta.url)))
    .filter((name) => /^\d+_.+\.sql$/u.test(name))
    .sort()
  for (const name of names) db.exec(await readFile(new URL(`../../../migrations/d1/${name}`, import.meta.url), 'utf8'))
}

test('0015 Shiphub 迁移为禁用默认的纯新增 schema，并保持外键完整', async () => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec('PRAGMA foreign_keys = ON')
    await applyAll(db)
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'shiphub_%' ORDER BY name").all().map((row) => row.name)
    assert.deepEqual(tables, [
      'shiphub_category_state',
      'shiphub_connections',
      'shiphub_oauth_states',
      'shiphub_order_actions',
      'shiphub_order_items',
      'shiphub_orders',
      'shiphub_sync_leases',
      'shiphub_sync_runs'
    ])
    const stamp = '2026-08-18T00:00:00.000Z'
    db.prepare(`INSERT INTO stores (id, code, name, timezone, status, created_at, updated_at) VALUES (?, ?, ?, 'Asia/Shanghai', 'active', ?, ?)`)
      .run('shiphub-migration-store', 'SHIPHUB-MIGRATION', 'Shiphub 迁移测试店', stamp, stamp)
    db.prepare('INSERT INTO shiphub_connections (store_id, created_at, updated_at) VALUES (?, ?, ?)')
      .run('shiphub-migration-store', stamp, stamp)
    const connection = db.prepare('SELECT enabled, mode, authorization_status FROM shiphub_connections WHERE store_id = ?').get('shiphub-migration-store')
    assert.deepEqual({ ...connection }, { enabled: 0, mode: 'fixture', authorization_status: 'disconnected' })
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0)
  } finally {
    db.close()
  }
})
