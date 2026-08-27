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
      'shiphub_identity_leases',
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

test('0019 放宽 Shiphub category CHECK 并在重建中完整保留既有数据', async () => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec('PRAGMA foreign_keys = ON')
    const names = (await readdir(new URL('../../../migrations/d1/', import.meta.url)))
      .filter((name) => /^\d+_.+\.sql$/u.test(name))
      .sort()
    const before = names.filter((name) => name < '0019_')
    const migration0019 = names.find((name) => name.startsWith('0019_'))
    assert.ok(migration0019, '0019 migration must exist')
    for (const name of before) db.exec(await readFile(new URL(`../../../migrations/d1/${name}`, import.meta.url), 'utf8'))

    // 迁移前的既有数据（0018 基线，hand/receive/ship）
    const stamp = '2026-08-26T00:00:00.000Z'
    db.prepare("INSERT INTO stores (id, code, name, timezone, status, created_at, updated_at) VALUES ('mig19-store', 'MIG19', '迁移测试店', 'Asia/Shanghai', 'active', ?, ?)").run(stamp, stamp)
    db.prepare("INSERT INTO users (id, username_key, display_name, password_hash, created_at, updated_at) VALUES ('mig19-user', 'mig19user', '迁移测试', 'x', ?, ?)").run(stamp, stamp)
    db.prepare("INSERT INTO shiphub_category_state (store_id, category, last_count, updated_at) VALUES ('mig19-store', 'hand', 3, ?)").run(stamp)
    db.prepare("INSERT INTO shiphub_sync_runs (id, store_id, category, trigger_source, started_at, status, pages, orders, detail_count) VALUES ('mig19-run', 'mig19-store', 'hand', 'scheduled', ?, 'succeeded', 1, 1, 1)").run(stamp)
    db.prepare("INSERT INTO shiphub_orders (store_id, category, upstream_order_id, display_label, source_label, order_status, first_seen_at, last_seen_at, last_seen_run_id, created_at, updated_at, channel, is_encrypted_order) VALUES ('mig19-store', 'hand', 'R001', '迁移前订单', 'Shiphub 自提', 'pending', ?, ?, 'mig19-run', ?, ?, 'cube', 1)").run(stamp, stamp, stamp, stamp)
    db.prepare("INSERT INTO shiphub_order_items (store_id, category, upstream_order_id, upstream_item_id, product_label, sku, quantity, created_at, updated_at) VALUES ('mig19-store', 'hand', 'R001', 'R001-1', '迁移前车辆', 'SKU-1', 1, ?, ?)").run(stamp, stamp)
    db.prepare("INSERT INTO shiphub_order_actions (id, store_id, category, upstream_order_id, action_type, local_state, actor_user_id, acted_at, created_at) VALUES ('mig19-act', 'mig19-store', 'hand', 'R001', 'pickup', 'completed', 'mig19-user', ?, ?)").run(stamp, stamp)

    // 应用 0019
    db.exec(await readFile(new URL(`../../../migrations/d1/${migration0019}`, import.meta.url), 'utf8'))

    // 既有数据逐表保留
    assert.equal(db.prepare("SELECT last_count FROM shiphub_category_state WHERE store_id = 'mig19-store' AND category = 'hand'").get().last_count, 3)
    assert.equal(db.prepare("SELECT status FROM shiphub_sync_runs WHERE id = 'mig19-run'").get().status, 'succeeded')
    const order = db.prepare("SELECT display_label, source_label, channel, is_encrypted_order, last_seen_run_id FROM shiphub_orders WHERE store_id = 'mig19-store' AND upstream_order_id = 'R001'").get()
    assert.deepEqual({ ...order }, { display_label: '迁移前订单', source_label: 'Shiphub 自提', channel: 'cube', is_encrypted_order: 1, last_seen_run_id: 'mig19-run' })
    assert.equal(db.prepare("SELECT product_label FROM shiphub_order_items WHERE upstream_order_id = 'R001'").get().product_label, '迁移前车辆')
    assert.equal(db.prepare("SELECT action_type FROM shiphub_order_actions WHERE id = 'mig19-act'").get().action_type, 'pickup')

    // pick 分类可在全部四类表中写入（CHECK 已放宽，含 action_type='pick'）
    db.prepare("INSERT INTO shiphub_category_state (store_id, category, last_count, updated_at) VALUES ('mig19-store', 'pick', 2, ?)").run(stamp)
    db.prepare("INSERT INTO shiphub_sync_runs (id, store_id, category, trigger_source, started_at, status, pages, orders, detail_count) VALUES ('mig19-run-p', 'mig19-store', 'pick', 'scheduled', ?, 'succeeded', 1, 1, 1)").run(stamp)
    db.prepare("INSERT INTO shiphub_orders (store_id, category, upstream_order_id, display_label, source_label, order_status, first_seen_at, last_seen_at, last_seen_run_id, created_at, updated_at) VALUES ('mig19-store', 'pick', 'P001', '拣货订单', 'Shiphub 待拣货', 'pending', ?, ?, 'mig19-run-p', ?, ?)").run(stamp, stamp, stamp, stamp)
    db.prepare("INSERT INTO shiphub_order_items (store_id, category, upstream_order_id, upstream_item_id, product_label, sku, quantity, created_at, updated_at) VALUES ('mig19-store', 'pick', 'P001', 'P001-1', '拣货车辆', 'SKU-P', 1, ?, ?)").run(stamp, stamp)
    db.prepare("INSERT INTO shiphub_order_actions (id, store_id, category, upstream_order_id, action_type, local_state, actor_user_id, acted_at, created_at) VALUES ('mig19-act-p', 'mig19-store', 'pick', 'P001', 'pick', 'completed', 'mig19-user', ?, ?)").run(stamp, stamp)

    // 外键完整 + 索引重建 + 不残留 _rebuild_old 表
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0)
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'shiphub_%'").all().map((row) => row.name)
    for (const expected of ['shiphub_sync_runs_store_started_idx', 'shiphub_orders_current_idx', 'shiphub_order_actions_idempotency_idx', 'shiphub_order_actions_current_idx']) {
      assert.ok(indexes.includes(expected), `index ${expected} must exist after 0019`)
    }
    const leftovers = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '%rebuild_old'").all()
    assert.deepEqual(leftovers, [])
  } finally {
    db.close()
  }
})
