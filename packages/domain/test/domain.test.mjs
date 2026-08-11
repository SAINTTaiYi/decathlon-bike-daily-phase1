import test from 'node:test'
import assert from 'node:assert/strict'
import {
  COMPLETED_REPAIR_STATUSES,
  localBusinessDate,
  normalizeRepair,
  normalizeUsername,
  repairCompletionRoute,
  validatePickup,
  validatePickupCompletion,
  validateRepairStatusContext
} from '../src/index.js'

test('用户名执行 NFKC、空白规范化和长度限制', () => {
  assert.equal(normalizeUsername('  Ａlice   小王  '), 'Alice 小王')
  assert.equal(normalizeUsername('x'.repeat(30)).length, 24)
})

test('维修完成共享规则执行五种精确状态映射并阻止未开单完成', () => {
  const mappings = [
    ['已开付款单', '维修完成-已开付款单'],
    ['已开维修单', '维修完成-已开维修单'],
    ['已开质保维修单', '维修完成-已开质保维修单'],
    ['已开质保付款单-请过机', '维修完成-已开质保付款单-请过机'],
    ['快速服务免费', '维修完成-快速服务免费']
  ]
  for (const [status, completedStatus] of mappings) {
    const route = repairCompletionRoute({ repairType: status.includes('质保') ? '质保' : status.includes('免费') ? '免费' : '付费', status })
    assert.equal(route.ok, true)
    assert.equal(route.route, 'pickup')
    assert.equal(route.completedStatus, completedStatus)
    assert.equal(route.previousStatus, status)
  }
  assert.equal(repairCompletionRoute({ repairType: '付费', status: '维修中' }).ok, false)
  assert.deepEqual(repairCompletionRoute({ repairType: '门店产品维修', status: '维修中' }), { ok: true, route: 'completed' })
})

test('维修状态上下文禁止通过编辑跨越维修中与维修完成', () => {
  assert.equal(validateRepairStatusContext('已开付款单', false).ok, true)
  assert.equal(validateRepairStatusContext('维修完成-已开付款单', false).ok, false)
  for (const status of COMPLETED_REPAIR_STATUSES) assert.equal(validateRepairStatusContext(status, true).ok, true)
  assert.equal(validateRepairStatusContext('已开付款单', true).ok, false)
})

test('自提平台、顾客暂存和维修取车校验由服务端共享规则约束', () => {
  assert.equal(validatePickup({ pickupSource: 'self-pickup', selfPickupPlatform: '', title: '车', status: '待取', contactValue: '18172049175' }).ok, false)
  assert.equal(validatePickup({ pickupSource: 'self-pickup', selfPickupPlatform: 'tmall', title: '车', status: '待取', contactValue: '' }).ok, true)
  assert.equal(validatePickup({ pickupSource: 'customer-storage', title: '车', detail: '', status: '待取', contactValue: '18172049175' }).ok, false)
  assert.equal(validatePickup({ pickupSource: 'customer-storage', title: '车', detail: '暂存说明', status: '待取', contactValue: '' }).ok, true)
  assert.equal(validatePickupCompletion({ pickupSource: 'self-pickup' }, '').ok, false)

  const blockedPaid = validatePickupCompletion({ pickupSource: 'repair', repairType: '付费', status: '维修完成-已开维修单' })
  assert.equal(blockedPaid.ok, false)
  assert.match(blockedPaid.error, /维修完成-已开付款单/u)
  const blockedWarranty = validatePickupCompletion({ pickupSource: 'repair', repairType: '质保', status: '维修完成-已开质保维修单' })
  assert.equal(blockedWarranty.ok, false)
  assert.match(blockedWarranty.error, /维修完成-已开质保付款单-请过机/u)
  assert.deepEqual(validatePickupCompletion({ pickupSource: 'repair', repairType: '付费', status: '维修完成-已开付款单' }), { ok: true })
  assert.deepEqual(validatePickupCompletion({ pickupSource: 'repair', repairType: '免费', status: '维修完成-快速服务免费' }), { ok: true })
  assert.deepEqual(validatePickupCompletion({ pickupSource: 'repair', repairType: '质保', status: '维修完成-已开质保付款单-请过机' }), { ok: true, warning: '请确保顾客已过机核验。' })
})

test('维修表单共享规范允许完成状态传输，但上下文由路由单独约束', () => {
  const result = normalizeRepair({ title: 'RC120', contactType: 'phone', contactValue: '0', repairType: '付费', repairProject: '调试', pickupDate: '2026-07-20', status: '维修完成-已开付款单' })
  assert.equal(result.ok, true)
  assert.equal(result.fields.status, '维修完成-已开付款单')
})

test('二手车待取不要求平台或暂存说明，并保留可选联系方式', () => {
  const result = validatePickup({ pickupSource: 'used-car', title: '二手 Rockrider', status: '等待取车', contactValue: '' })
  assert.equal(result.ok, true)
  assert.equal(result.fields.pickupSource, 'used-car')
  assert.equal(result.fields.selfPickupPlatform, '')
  assert.equal(result.fields.detail, '')
  assert.equal(result.fields.contactValue, '')
})

test('业务日期由门店时区决定', () => {
  assert.equal(localBusinessDate('Asia/Shanghai', new Date('2026-07-14T16:30:00.000Z')), '2026-07-15')
})
