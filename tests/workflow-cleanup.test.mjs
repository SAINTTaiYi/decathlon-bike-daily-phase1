import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanPreviousCompletedRecords } from '../apps/web/src/hooks/useClosingWorkflow.js'

test('跨日清除已取车辆、已完成其它交接和门店维修，并保留当天完成记录', () => {
  const ledger = {
    version: 5,
    records: [
      { id: 'pickup-old', scene: 'pickup', title: '昨日已取车辆', pickedUpOn: '2026-07-11' },
      { id: 'pickup-today', scene: 'pickup', title: '今日已取车辆', pickedUpOn: '2026-07-12' },
      { id: 'poster-old', scene: 'poster', title: '昨日已完成交接', completedOn: '2026-07-11' },
      { id: 'poster-today', scene: 'poster', title: '今日已完成交接', completedOn: '2026-07-12' },
      { id: 'repair-old', scene: 'repair', title: '昨日已完成门店维修', completedOn: '2026-07-11' },
      { id: 'repair-today', scene: 'repair', title: '今日已完成门店维修', completedOn: '2026-07-12' },
      { id: 'poster-active', scene: 'poster', title: '继续跟进事项' }
    ],
    operations: [],
    updatedAt: null
  }

  const result = cleanPreviousCompletedRecords(ledger, '2026-07-12')
  assert.deepEqual(result.records.map((record) => record.id), ['pickup-today', 'poster-today', 'repair-today', 'poster-active'])
  assert.equal(result.operations.length, 3)
  assert.deepEqual(new Set(result.operations.map((operation) => operation.type)), new Set(['auto-remove-pickup', 'auto-remove-handover', 'auto-remove-store-repair']))
  assert.ok(result.operations.every((operation) => operation.undoable === false))
  assert.ok(result.operations.every((operation) => operation.actorName === '系统'))
})

test('没有跨日完成记录时保持原 ledger 引用', () => {
  const ledger = {
    version: 5,
    records: [{ id: 'poster-today', scene: 'poster', title: '今日完成', completedOn: '2026-07-12' }],
    operations: [],
    updatedAt: null
  }

  assert.equal(cleanPreviousCompletedRecords(ledger, '2026-07-12'), ledger)
})
