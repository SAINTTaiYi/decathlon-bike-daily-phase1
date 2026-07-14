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
  assert.equal(validatePickup({ pickupSource: 'self-pickup', selfPickupPlatform: '', title: '车', status: '待取' }).ok, false)
  assert.equal(validatePickup({ pickupSource: 'customer-storage', title: '车', detail: '', status: '待取' }).ok, false)
  assert.equal(validatePickupCompletion({ pickupSource: 'self-pickup' }, '').ok, false)
  assert.equal(validatePickupCompletion({ pickupSource: 'repair', repairType: '付费', status: '维修中' }).ok, false)
  assert.equal(validatePickupCompletion({ pickupSource: 'repair', repairType: '免费', status: '维修中' }).ok, true)
})

test('业务日期由门店时区决定', () => {
  assert.equal(localBusinessDate('Asia/Shanghai', new Date('2026-07-14T16:30:00.000Z')), '2026-07-15')
})
