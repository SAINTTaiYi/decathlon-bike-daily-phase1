import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('初始数据库 migration 覆盖身份、业务、审计、幂等和附件', async () => {
  const sql = await readFile(new URL('../../../supabase/migrations/202607150001_initial_fullstack.sql', import.meta.url), 'utf8')
  for (const table of ['users', 'stores', 'store_members', 'auth_sessions', 'daily_closings', 'work_items', 'repair_details', 'pickup_details', 'resale_details', 'handover_details', 'audit_events', 'attachments', 'idempotency_requests', 'app_releases']) {
    assert.match(sql, new RegExp(`create table bike_ops\\.${table}`))
  }
  assert.match(sql, /create schema if not exists extensions/u)
  assert.match(sql, /revoke all on schema bike_ops from anon, authenticated/u)
})

test('Supabase Storage migration 创建私有 Bucket 并限制图片类型与单文件大小', async () => {
  const sql = await readFile(new URL('../../../supabase/migrations/202607150002_supabase_private_storage.sql', import.meta.url), 'utf8')
  assert.match(sql, /to_regclass\('storage\.buckets'\)/u)
  assert.match(sql, /'bike-ops-media'/u)
  assert.match(sql, /false,\s*10485760/u)
  assert.match(sql, /image\/jpeg/u)
  assert.match(sql, /image\/png/u)
  assert.match(sql, /image\/webp/u)
})

test('Staging 安全迁移保护 migration history 并覆盖外键索引', async () => {
  const sql = await readFile(new URL('../../../supabase/migrations/202607150003_staging_security_indexes.sql', import.meta.url), 'utf8')
  assert.match(sql, /alter table public\.bike_ops_schema_migrations enable row level security/u)
  assert.match(sql, /revoke all on table public\.bike_ops_schema_migrations from public, anon, authenticated/u)
  for (const index of [
    'attachments_store_id_idx',
    'attachments_uploaded_by_idx',
    'audit_events_actor_user_id_idx',
    'daily_closings_closed_by_idx',
    'daily_closings_sales_saved_by_idx',
    'handover_details_completed_by_idx',
    'idempotency_requests_user_id_idx',
    'import_jobs_imported_by_idx',
    'pickup_details_picked_up_by_idx',
    'pickup_details_repair_work_item_id_idx',
    'store_members_user_id_idx',
    'work_items_created_by_idx',
    'work_items_deleted_by_idx',
    'work_items_updated_by_idx'
  ]) assert.match(sql, new RegExp(`create index if not exists ${index}`, 'u'))
})

test('D1 一致性迁移仅补回非店修撤回后丢失的完成维修审计边', async () => {
  const sql = await readFile(new URL('../../../migrations/d1/0003_repair_undo_consistency.sql', import.meta.url), 'utf8')
  assert.match(sql, /BEGIN IMMEDIATE;/u)
  assert.match(sql, /JOIN audit_events AS undone ON undone\.reverted_event_id = completed\.id/u)
  assert.match(sql, /JOIN pickup_details AS pickup ON pickup\.work_item_id = item\.id AND pickup\.pickup_source = 'repair'/u)
  assert.match(sql, /completed\.action = 'complete-repair'/u)
  assert.match(sql, /'recover-complete-repair'/u)
  assert.match(sql, /'系统修复'/u)
  assert.match(sql, /COMMIT;/u)
})
