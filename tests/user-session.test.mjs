import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeLoginUsername,
  resolveAuditActor,
  USERNAME_MAX_LENGTH
} from '../apps/web/src/data/userSession.js'
import { describeRecordChanges } from '../apps/web/src/hooks/useClosingWorkflow.js'

test('登录用户名去除首尾空白并合并连续空格', () => {
  assert.equal(normalizeLoginUsername('  小  王  '), '小 王')
  assert.equal(normalizeLoginUsername('\nWorkshop\tLead\n'), 'Workshop Lead')
})

test('空用户名不可形成操作身份且用户名受长度限制', () => {
  assert.equal(normalizeLoginUsername('   '), '')
  assert.equal(normalizeLoginUsername('A'.repeat(50)).length, USERNAME_MAX_LENGTH)
})

test('旧操作记录与系统操作使用明确的审计身份', () => {
  assert.equal(resolveAuditActor(undefined), '历史记录')
  assert.equal(resolveAuditActor('', '系统'), '系统')
  assert.equal(resolveAuditActor(' 小李 '), '小李')
})

test('编辑记录可概括具体修改字段', () => {
  const before = { title: '旧车名', status: '维修中', pickupDate: '2026-07-15', detail: '更换刹车线' }
  const after = { ...before, title: '新车名', status: '等待配件', pickupDate: '2026-07-18' }
  assert.equal(describeRecordChanges(before, after), '修改字段：车辆或事项名称、当前状态、取车日期。')
  assert.equal(describeRecordChanges(after, { ...after }), '已保存台账内容。')
})
