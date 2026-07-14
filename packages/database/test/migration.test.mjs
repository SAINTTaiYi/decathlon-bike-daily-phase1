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
