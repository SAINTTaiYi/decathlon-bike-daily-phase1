import test from 'node:test'
import assert from 'node:assert/strict'
import {
  localBusinessDate,
  normalizeRepair,
  normalizeUsername,
  repairCompletionRoute,
  validatePickup,
  validatePickupCompletion
} from '../src/index.js'

test('用户名执行 NFKC、空白规范化和长度限制', () => {
  assert.equal(normalizeUsername('  Ａlice   小王  '), 'Alice 小王')
  assert.equal(normalizeUsername('x'.repeat(30)).length, 24)
})

test('维修规则在共享服务端 domain 中保持现有分流', () => {
  const free = normalizeRepair({ title: 'RC120', contactType: 'phone', contactValue: '0', repairType: '免费', repairProject: '调试', pickupDate: '2026-07-20', status: '维修中' })
  assert.equal(free.ok, true)
  assert.deepEqual(repairCompletionRoute(free.fields), { ok: true, route: 'pickup' })
  assert.deepEqual(repairCompletionRoute({ repairType: '门店产品维修' }), { ok: true, route: 'completed' })
})

test('自提平台、顾客暂存和取车校验由服务端共享规则约束', () => {
  assert.equal(validatePickup({ pickupSource: 'self-pickup', selfPickupPlatform: '', title: '车', status: '待取', contactValue: '18172049175' }).ok, false)
  // 联系方式可空
  assert.equal(validatePickup({ pickupSource: 'self-pickup', selfPickupPlatform: 'tmall', title: '车', status: '待取', contactValue: '' }).ok, true)
  assert.equal(validatePickup({ pickupSource: 'customer-storage', title: '车', detail: '', status: '待取', contactValue: '18172049175' }).ok, false)
  assert.equal(validatePickup({ pickupSource: 'customer-storage', title: '车', detail: '暂存说明', status: '待取', contactValue: '' }).ok, true)
  const withPhone = validatePickup({ pickupSource: 'customer-storage', title: '车', detail: '暂存说明', status: '待取', contactType: 'phone', contactValue: '18172049175' })
  assert.equal(withPhone.ok, true)
  assert.equal(withPhone.fields.meta, '18172049175')
  assert.equal(withPhone.fields.contactValue, '18172049175')
  const withMember = validatePickup({ pickupSource: 'customer-storage', title: '车', detail: '暂存说明', status: '待取', contactType: 'member', contactValue: 'M-001' })
  assert.equal(withMember.ok, true)
  assert.equal(withMember.fields.meta, '会员号：M-001')
  assert.equal(validatePickupCompletion({ pickupSource: 'self-pickup' }, '').ok, false)
  assert.equal(validatePickupCompletion({ pickupSource: 'repair', repairType: '付费', status: '维修中' }).ok, false)
  assert.equal(validatePickupCompletion({ pickupSource: 'repair', repairType: '免费', status: '维修中' }).ok, true)
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
