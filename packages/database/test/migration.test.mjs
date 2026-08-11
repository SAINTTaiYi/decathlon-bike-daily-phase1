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
  const executableSql = sql.replace(/^--.*$/gmu, '')
  assert.doesNotMatch(executableSql, /\b(?:BEGIN|COMMIT|SAVEPOINT)\b/u)
  assert.match(sql, /JOIN audit_events AS undone ON undone\.reverted_event_id = completed\.id/u)
  assert.match(sql, /JOIN pickup_details AS pickup ON pickup\.work_item_id = item\.id AND pickup\.pickup_source = 'repair'/u)
  assert.match(sql, /completed\.action = 'complete-repair'/u)
  assert.match(sql, /'recover-complete-repair'/u)
  assert.match(sql, /'系统修复'/u)
  assert.match(sql, /Wrangler owns the migration transaction/u)
})


test('二手车待取迁移扩展 D1 与 Supabase 的来源约束且不放宽其它约束', async () => {
  const [d1, supabase] = await Promise.all([
    readFile(new URL('../../../migrations/d1/0005_pickup_used_car_source.sql', import.meta.url), 'utf8'),
    readFile(new URL('../../../supabase/migrations/202607250001_pickup_used_car_source.sql', import.meta.url), 'utf8')
  ])
  assert.match(d1, /ALTER TABLE pickup_details RENAME TO/u)
  assert.match(d1, /'self-pickup', 'repair', 'customer-storage', 'used-car'/u)
  assert.match(d1, /pickup_source = 'self-pickup' AND self_pickup_platform IS NOT NULL/u)
  assert.match(d1, /DROP TABLE pickup_details_before_used_car_source/u)
  assert.match(supabase, /DROP CONSTRAINT IF EXISTS pickup_details_pickup_source_check/u)
  assert.match(supabase, /'self-pickup', 'repair', 'customer-storage', 'used-car'/u)
})

test('D1 永久审计迁移为历史记录分类、回填并建立筛选索引', async () => {
  const sql = await readFile(new URL('../../../migrations/d1/0004_permanent_audit_history.sql', import.meta.url), 'utf8')
  const executableSql = sql.replace(/^--.*$/gmu, '')
  assert.doesNotMatch(executableSql, /\b(?:BEGIN|COMMIT|SAVEPOINT)\b/u)
  assert.match(sql, /ADD COLUMN audit_module/u)
  assert.match(sql, /UPDATE audit_events[\s\S]*SET audit_module/u)
  assert.match(sql, /audit_events_store_module_date_created_idx/u)
})


test('全国门店目录与自助注册迁移保留单活跃成员、OTP 状态机和平台管理员唯一约束', async () => {
  const [d1, supabase] = await Promise.all([
    readFile(new URL('../../../migrations/d1/0006_store_directory_self_registration.sql', import.meta.url), 'utf8'),
    readFile(new URL('../../../supabase/migrations/202607260001_store_directory_self_registration.sql', import.meta.url), 'utf8')
  ])
  for (const sql of [d1, supabase]) {
    for (const table of ['regions', 'cities', 'registration_challenges', 'role_change_requests', 'store_transfer_requests']) {
      assert.match(sql, new RegExp(`create table(?: if not exists)? (?:bike_ops\.)?${table}`, 'iu'))
    }
    assert.match(sql, /store_members_one_active_user_idx/u)
    assert.match(sql, /users_one_platform_admin_idx/u)
    assert.match(sql, /status.*'pending'.*'verified'.*'completed'.*'expired'/isu)
    assert.match(sql, /'operator'.*'manager'.*'admin'/isu)
    assert.match(sql, /'pending'.*'approved'.*'rejected'.*'cancelled'/isu)
    assert.match(sql, /'南区'/u)
    assert.match(sql, /'广西'/u)
  }
  assert.match(d1, /ALTER TABLE store_members RENAME TO store_members_legacy/u)
  assert.match(d1, /ON CONFLICT\(code\) DO UPDATE SET city_id/u)
  assert.match(supabase, /alter table bike_ops\.store_members drop constraint store_members_pkey/u)
  assert.match(supabase, /on conflict \(code\) do update set city_id/u)
})

test('维修完成状态迁移同步扩展 D1 与 Supabase 约束并保守迁移旧待取记录', async () => {
  const [d1, supabase] = await Promise.all([
    readFile(new URL('../../../migrations/d1/0007_repair_completion_statuses.sql', import.meta.url), 'utf8'),
    readFile(new URL('../../../supabase/migrations/202607270001_repair_completion_statuses.sql', import.meta.url), 'utf8')
  ])
  const executableD1 = d1.replace(/^--.*$/gmu, '')
  assert.doesNotMatch(executableD1, /\b(?:BEGIN|COMMIT|SAVEPOINT)\b/u)
  assert.match(d1, /ALTER TABLE repair_details RENAME TO repair_details_before_completion_statuses/u)
  assert.match(d1, /'维修完成-已开质保付款单-请过机'/u)
  assert.match(d1, /r\.repair_type = '免费'.*'维修完成-快速服务免费'/su)
  assert.match(d1, /ELSE '维修完成-已开维修单'/u)
  assert.match(d1, /UPDATE work_items[\s\S]*pickup_source = 'repair'/u)
  assert.match(supabase, /drop constraint if exists repair_details_repair_status_check/u)
  assert.match(supabase, /from bike_ops\.work_items w\s+left join bike_ops\.pickup_details p on p\.work_item_id = w\.id\s+where w\.id = r\.work_item_id/su)
  assert.doesNotMatch(supabase, /left join bike_ops\.pickup_details p on p\.work_item_id = r\.work_item_id/u)
  assert.match(supabase, /validate constraint repair_details_repair_status_check/u)
  assert.match(supabase, /set status = r\.repair_status/u)
})


test('平面门店迁移移除区域、城市和 city_id', async () => {
  const [d1, supabase] = await Promise.all([
    readFile(new URL('../../../migrations/d1/0012_flat_store_self_registration.sql', import.meta.url), 'utf8'),
    readFile(new URL('../../../supabase/migrations/202607280001_flat_store_self_registration.sql', import.meta.url), 'utf8')
  ])
  for (const sql of [d1, supabase]) {
    assert.match(sql, /drop table.*cities/isu)
    assert.match(sql, /drop table.*regions/isu)
    assert.match(sql, /drop table.*subregions/isu)
    assert.match(sql, /drop column.*city_id/isu)
    assert.match(sql, /self_registration_pending/iu)
  }
})
