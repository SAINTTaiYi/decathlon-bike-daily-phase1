import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { mapWorkItem } from '../src/repositories/work-items.js'

const config = {
  APP_ENV: 'staging', APP_VERSION: '5.5.1', GIT_SHA: 'test', COOKIE_SECURE: true,
  SESSION_TTL_HOURS: 12, allowedOrigins: ['https://example.test'],
  SESSION_SECRET: 's'.repeat(32), CSRF_SECRET: 'c'.repeat(32), PASSWORD_PEPPER: 'p'.repeat(32)
} as const

test('Worker 映射稳定工单号到前端记录', async () => {
  const record = await mapWorkItem({
    id: 'work-1', ticket_no: 31, kind: 'repair', title: 'ST520', detail: '保养+更换刹车线管',
    meta: '付费', status: '维修中', lifecycle: 'active', revision: 1,
    created_at: '2026-07-19T00:00:00.000Z', updated_at: '2026-07-19T00:00:00.000Z'
  }, '2026-07-19', config)
  assert.equal(record.ticketNo, 31)
  assert.equal(record.title, 'ST520')
})

test('D1 工单号迁移包含回填、门店唯一索引和原子计数器', async () => {
  const sql = await readFile(new URL('../../../migrations/d1/0002_work_item_ticket_numbers.sql', import.meta.url), 'utf8')
  assert.match(sql, /ALTER TABLE work_items ADD COLUMN ticket_no INTEGER/u)
  assert.match(sql, /CREATE UNIQUE INDEX work_items_store_ticket_no_idx/u)
  assert.match(sql, /CREATE TABLE work_item_counters/u)
})
