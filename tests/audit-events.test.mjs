import test from 'node:test'
import assert from 'node:assert/strict'
import { auditEventBelongsToScene, currentBusinessDayEvents } from '../apps/web/src/data/auditEvents.js'

test('当日日志只保留当前业务日，跨日事件仍可供历史查询', () => {
  const events = [
    { id: 'today', dateKey: '2026-07-15' },
    { id: 'previous', dateKey: '2026-07-14' }
  ]
  assert.deepEqual(currentBusinessDayEvents(events, '2026-07-15').map((event) => event.id), ['today'])
})

test('维修转待取事件同时属于维修模块与待取模块历史', () => {
  const event = { scene: 'pickup', previousScene: 'repair', nextScene: 'pickup' }
  assert.equal(auditEventBelongsToScene(event, 'repair'), true)
  assert.equal(auditEventBelongsToScene(event, 'pickup'), true)
  assert.equal(auditEventBelongsToScene(event, 'resale'), false)
})
