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
