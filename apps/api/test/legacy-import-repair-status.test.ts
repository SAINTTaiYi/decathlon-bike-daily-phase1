import test from 'node:test'
import assert from 'node:assert/strict'
import { planLegacyRecords } from '../src/services/legacy-import.js'

const base = {
  id: 'legacy-repair-pickup',
  scene: 'pickup',
  pickupSource: 'repair',
  title: '旧维修待取车',
  contactType: 'phone',
  contactValue: '0',
  repairProject: '旧维修事项',
  pickupDate: '2026-07-30',
  notificationStatus: 'notified'
}

test('旧版维修待取记录导入时保守迁移到新的维修完成状态', () => {
  const cases = [
    [{ ...base, repairType: '付费', status: '维修完成' }, '维修完成-已开维修单'],
    [{ ...base, repairType: '质保', status: '维修完成' }, '维修完成-已开质保维修单'],
    [{ ...base, repairType: '免费', status: '维修完成' }, '维修完成-快速服务免费'],
    [{ ...base, repairType: '付费', status: '已取车', meta: '已开付款单' }, '维修完成-已开付款单'],
    [{ ...base, repairType: '质保', status: '已通知', detail: '质保付款单已开' }, '维修完成-已开质保付款单-请过机']
  ] as const

  for (const [record, expectedStatus] of cases) {
    const plan = planLegacyRecords([record])
    assert.equal(plan.rejected.length, 0)
    assert.equal(plan.accepted.length, 1)
    assert.equal(plan.accepted[0]?.repair?.repairStatus, expectedStatus)
    assert.equal(plan.accepted[0]?.status, expectedStatus)
  }
})
