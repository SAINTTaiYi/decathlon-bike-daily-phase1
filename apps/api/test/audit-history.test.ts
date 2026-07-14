import test from 'node:test'
import assert from 'node:assert/strict'
import { auditSceneForKind, mapAuditEvent, type AuditRow } from '../src/routes/audit.js'

function row(overrides: Partial<AuditRow> = {}): AuditRow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    action: 'edit-record',
    entityType: 'work-item',
    entityId: '22222222-2222-4222-8222-222222222222',
    actorNameSnapshot: '测试用户',
    businessDate: '2026-07-15',
    summary: '编辑记录',
    reversible: true,
    revertedBy: null,
    revertedAt: null,
    hasLaterEvent: false,
    beforeKind: 'repair',
    afterKind: 'repair',
    currentKind: 'repair',
    createdAt: new Date('2026-07-15T01:00:00.000Z'),
    ...overrides
  }
}

test('审计 kind 映射保持其它交接的 poster 场景命名', () => {
  assert.equal(auditSceneForKind('handover'), 'poster')
  assert.equal(auditSceneForKind('resale'), 'resale')
  assert.equal(auditSceneForKind('unknown'), null)
})

test('维修转待取事件保留前后两个模块归属', () => {
  const event = mapAuditEvent(row({ action: 'complete-repair', beforeKind: 'repair', afterKind: 'pickup', currentKind: 'pickup' }), '2026-07-15')
  assert.equal(event.previousScene, 'repair')
  assert.equal(event.scene, 'pickup')
  assert.equal(event.nextScene, 'pickup')
  assert.equal(event.canUndo, true)
})

test('跨日事件只读，已撤回事件使用真实撤回时间', () => {
  const revertedAt = new Date('2026-07-16T02:00:00.000Z')
  const event = mapAuditEvent(row({ businessDate: '2026-07-14', revertedBy: '33333333-3333-4333-8333-333333333333', revertedAt }), '2026-07-15')
  assert.equal(event.canUndo, false)
  assert.equal(event.undoneAt, revertedAt)
  assert.equal(event.message, '该操作已撤回')
})
