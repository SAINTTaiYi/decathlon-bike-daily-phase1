import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFile } from 'node:fs/promises'

async function apply(db, name) {
  const sql = await readFile(new URL(`../../../migrations/d1/${name}`, import.meta.url), 'utf8')
  db.exec(sql)
}

test('D1 目录注册迁移可从旧 schema 顺序执行，并把多门店旧成员收敛为一条当前关系', async () => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec('PRAGMA foreign_keys = ON')
    for (const name of ['0001_initial_sqlite.sql', '0002_work_item_ticket_numbers.sql', '0003_repair_undo_consistency.sql', '0004_permanent_audit_history.sql', '0005_pickup_used_car_source.sql']) await apply(db, name)
    const stampA = '2026-01-01T00:00:00.000Z'
    const stampB = '2026-01-02T00:00:00.000Z'
    db.prepare(`INSERT INTO stores (id, code, name, timezone, status, created_at, updated_at) VALUES (?, ?, ?, 'Asia/Shanghai', 'active', ?, ?)`)
      .run('legacy-store-a', 'legacy-a', '历史 A 店', stampA, stampA)
    db.prepare(`INSERT INTO stores (id, code, name, timezone, status, created_at, updated_at) VALUES (?, ?, ?, 'Asia/Shanghai', 'active', ?, ?)`)
      .run('legacy-store-b', 'legacy-b', '历史 B 店', stampB, stampB)
    db.prepare(`INSERT INTO stores (id, code, name, timezone, status, created_at, updated_at) VALUES (?, ?, ?, 'Asia/Shanghai', 'active', ?, ?)` )
      .run('legacy-store-1299', '1299', '旧五象店', stampA, stampA)
    db.prepare(`INSERT INTO users (id, username_key, display_name, password_hash, status, must_change_password, failed_login_count, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', 0, 0, ?, ?)`)
      .run('legacy-user', 'legacy-user', '历史用户', 'pbkdf2$sha256$100000$abc$def', stampA, stampA)
    db.prepare(`INSERT INTO store_members (store_id, user_id, role, created_at) VALUES (?, ?, ?, ?)`)
      .run('legacy-store-a', 'legacy-user', 'manager', stampA)
    db.prepare(`INSERT INTO store_members (store_id, user_id, role, created_at) VALUES (?, ?, ?, ?)`)
      .run('legacy-store-b', 'legacy-user', 'admin', stampB)

    await apply(db, '0006_store_directory_self_registration.sql')

    assert.equal(db.prepare(`SELECT count(*) AS count FROM store_members WHERE user_id = ? AND status = 'active'`).get('legacy-user').count, 1)
    const archived = db.prepare(`SELECT status, effective_to, end_reason FROM store_members WHERE store_id = ? AND user_id = ?`).get('legacy-store-b', 'legacy-user')
    assert.equal(archived.status, 'inactive')
    assert.equal(archived.effective_to, stampB)
    assert.equal(archived.end_reason, '迁移：统一单一当前门店关系')
    assert.equal(db.prepare(`SELECT count(*) AS count FROM stores WHERE city_id = ? AND status = 'active'`).get('30000000-0000-4000-8000-000000000002').count, 4)
    assert.equal(db.prepare(`SELECT city_id FROM stores WHERE id = ?`).get('legacy-store-1299').city_id, '30000000-0000-4000-8000-000000000002')
  } finally {
    db.close()
  }
})

test('D1 平面门店迁移移除区域、城市和 city_id，保留业务门店表', async () => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec('PRAGMA foreign_keys = ON')
    for (const name of ['0001_initial_sqlite.sql', '0002_work_item_ticket_numbers.sql', '0003_repair_undo_consistency.sql', '0004_permanent_audit_history.sql', '0005_pickup_used_car_source.sql', '0006_store_directory_self_registration.sql', '0007_repair_completion_statuses.sql', '0008_store_pending_status.sql', '0009_directory_subregions.sql', '0010_admin_console_query_indexes.sql', '0011_directory_guangxi_cities.sql', '0012_flat_store_self_registration.sql']) await apply(db, name)
    const storeColumns = db.prepare('PRAGMA table_info(stores)').all().map((row) => row.name)
    assert.equal(storeColumns.includes('city_id'), false)
    assert.equal(storeColumns.includes('self_registration_pending'), true)
    assert.equal(db.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name IN ('regions', 'cities')").get().count, 0)
    assert.equal(db.prepare('SELECT count(*) AS count FROM stores').get().count, 4)
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0)
  } finally {
    db.close()
  }
})

test('D1 维修完成状态迁移执行后同步主记录和维修详情，并保守处理旧统一完成状态', async () => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec('PRAGMA foreign_keys = ON')
    for (const name of [
      '0001_initial_sqlite.sql',
      '0002_work_item_ticket_numbers.sql',
      '0003_repair_undo_consistency.sql',
      '0004_permanent_audit_history.sql',
      '0005_pickup_used_car_source.sql'
    ]) await apply(db, name)

    const stamp = '2026-07-27T10:00:00.000Z'
    db.prepare(`INSERT INTO stores (id, code, name, timezone, status, created_at, updated_at) VALUES ('repair-store', 'repair-store', '维修迁移店', 'Asia/Shanghai', 'active', ?, ?)`).run(stamp, stamp)
    db.prepare(`INSERT INTO users (id, username_key, display_name, password_hash, status, must_change_password, failed_login_count, created_at, updated_at) VALUES ('repair-user', 'repair-user', '维修迁移用户', 'unused', 'active', 0, 0, ?, ?)`).run(stamp, stamp)

    const cases = [
      ['legacy-paid', 1, '付费', '已开付款单', '维修完成-已开付款单'],
      ['legacy-warranty', 2, '质保', '已开质保单', '维修完成-已开质保维修单'],
      ['legacy-free', 3, '免费', '维修中', '维修完成-快速服务免费'],
      ['legacy-unknown-paid', 4, '付费', '维修中', '维修完成-已开维修单']
    ]
    for (const [id, ticketNo, repairType, repairStatus] of cases) {
      db.prepare(`
        INSERT INTO work_items (
          id, store_id, ticket_no, kind, title, detail, meta, status, lifecycle, revision,
          created_by, updated_by, created_at, updated_at
        ) VALUES (?, 'repair-store', ?, 'pickup', ?, '旧维修', ?, '维修完成', 'active', 1, 'repair-user', 'repair-user', ?, ?)
      `).run(id, ticketNo, id, repairType, stamp, stamp)
      db.prepare(`
        INSERT INTO repair_details (
          work_item_id, contact_type, contact_ciphertext, repair_type, repair_project,
          pickup_date, repair_status, repair_completed_at
        ) VALUES (?, 'phone', 'cipher', ?, '旧维修', '2026-07-30', ?, ?)
      `).run(id, repairType, repairStatus, stamp)
      db.prepare(`INSERT INTO pickup_details (work_item_id, pickup_source, notification_status, repair_work_item_id) VALUES (?, 'repair', 'pending', ?)`).run(id, id)
    }

    await apply(db, '0007_repair_completion_statuses.sql')

    for (const [id, , , , expectedStatus] of cases) {
      assert.equal(db.prepare('SELECT status FROM work_items WHERE id = ?').get(id).status, expectedStatus)
      assert.equal(db.prepare('SELECT repair_status FROM repair_details WHERE work_item_id = ?').get(id).repair_status, expectedStatus)
    }
    assert.match(db.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'repair_details'`).get().sql, /维修完成-已开质保付款单-请过机/u)
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0)
  } finally {
    db.close()
  }
})

test('D1 交接电话号码迁移保留旧记录并新增可空加密列', async () => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec('PRAGMA foreign_keys = ON')
    for (const name of ['0001_initial_sqlite.sql', '0002_work_item_ticket_numbers.sql', '0003_repair_undo_consistency.sql', '0004_permanent_audit_history.sql', '0005_pickup_used_car_source.sql', '0006_store_directory_self_registration.sql', '0007_repair_completion_statuses.sql', '0008_store_pending_status.sql', '0009_directory_subregions.sql', '0010_admin_console_query_indexes.sql', '0011_directory_guangxi_cities.sql', '0012_flat_store_self_registration.sql']) await apply(db, name)
    const stamp = '2026-08-12T10:00:00.000Z'
    db.prepare(`
      INSERT INTO users (id, username_key, display_name, password_hash, status, must_change_password, failed_login_count, created_at, updated_at)
      VALUES ('handover-migration-user', 'handover-migration-user', '交接迁移用户', 'unused', 'active', 0, 0, ?, ?)
    `).run(stamp, stamp)
    db.prepare(`
      INSERT INTO work_items (id, store_id, ticket_no, kind, title, detail, meta, status, lifecycle, revision, created_by, updated_by, created_at, updated_at)
      VALUES ('legacy-handover', '30000000-0000-4000-8000-000000001299', 1, 'handover', '旧交接事项', '旧交接事项', '', '继续跟进', 'active', 1, 'handover-migration-user', 'handover-migration-user', ?, ?)
    `).run(stamp, stamp)
    db.prepare(`INSERT INTO handover_details (work_item_id, completed_on, completed_at, completed_by) VALUES ('legacy-handover', '2026-08-12', ?, 'handover-migration-user')`).run(stamp)

    await apply(db, '0013_optional_handover_phone.sql')

    const columns = db.prepare('PRAGMA table_info(handover_details)').all().map((row) => row.name)
    assert.equal(columns.includes('contact_ciphertext'), true)
    assert.equal(columns.includes('contact_fingerprint'), true)
    assert.deepEqual(
      { ...db.prepare('SELECT completed_on, completed_at, completed_by, contact_ciphertext, contact_fingerprint FROM handover_details WHERE work_item_id = ?').get('legacy-handover') },
      { completed_on: '2026-08-12', completed_at: stamp, completed_by: 'handover-migration-user', contact_ciphertext: null, contact_fingerprint: null }
    )
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0)
  } finally {
    db.close()
  }
})
