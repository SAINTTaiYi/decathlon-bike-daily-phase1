import test from 'node:test'
import assert from 'node:assert/strict'
import { buildRepairCompletion } from '../apps/web/src/data/repairRecord.js'
import {
  buildPickupNotificationUpdate,
  decodePickupContact,
  encodePickupContactMeta,
  inferPickupNotificationStatus,
  inferPickupSource,
  normalizePickupNotificationRecord,
  normalizePickupValues,
  pickupSourceLabel,
  validatePickup
} from '../apps/web/src/data/pickupRecord.js'
import { stripPickupCode } from '../apps/web/src/hooks/useClosingWorkflow.js'

const at = '2026-07-12T10:00:00.000Z'
const baseRepair = {
  id: 'repair-1',
  scene: 'repair',
  kind: 'repair',
  title: 'Riverside 500',
  repairProject: '更换刹车线',
  status: '维修中'
}

test('门店产品维修完毕后原地完成并写入跨日清理字段', () => {
  const result = buildRepairCompletion({ ...baseRepair, repairType: '门店产品维修' }, '2026-07-12', at)
  assert.equal(result.ok, true)
  assert.equal(result.route, 'completed')
  assert.equal(result.record.scene, 'repair')
  assert.equal(result.record.status, '已完成')
  assert.equal(result.record.completedOn, '2026-07-12')
  assert.equal(result.record.completedAt, at)
})

test('付费、质保和免费维修完毕后携带维修字段转入待取', () => {
  const cases = [
    ['付费', '已开付款单'],
    ['质保', '已开质保单'],
    ['免费', '维修中']
  ]
  for (const [repairType, status] of cases) {
    const original = { ...baseRepair, repairType, contactType: 'phone', contactValue: '0', pickupDate: '2026-07-18', status }
    const result = buildRepairCompletion(original, '2026-07-12', at)
    assert.equal(result.ok, true)
    assert.equal(result.route, 'pickup')
    assert.equal(result.record.scene, 'pickup')
    assert.equal(result.record.pickupSource, 'repair')
    assert.equal(result.record.contactValue, '0')
    assert.equal(result.record.repairType, repairType)
    assert.equal(result.record.status, '维修完成')
    assert.equal(result.record.pickupDate, '2026-07-18')
  }
})

test('缺少维修类型时禁止执行维修完毕', () => {
  assert.deepEqual(buildRepairCompletion(baseRepair, '2026-07-12', at), { ok: false, error: '请先编辑并补齐维修类型，再执行维修完毕。' })
})

test('非免费维修车辆只有维修完成、已开付款单或已开质保单时允许取车', () => {
  const repairPickup = { scene: 'pickup', pickupSource: 'repair', title: '维修车', repairType: '付费' }
  for (const status of ['维修中', '等待配件']) {
    const result = validatePickup({ ...repairPickup, status })
    assert.equal(result.ok, false)
    assert.match(result.error, /非免费维修.*维修完成.*已开付款单.*已开质保单/)
  }
  assert.deepEqual(validatePickup({ ...repairPickup, status: '维修完成' }), { ok: true, pickupSource: 'repair' })
  assert.deepEqual(validatePickup({ ...repairPickup, status: '已开付款单' }), { ok: true, pickupSource: 'repair' })
  assert.deepEqual(validatePickup({ ...repairPickup, repairType: '质保', status: '已开质保单' }), { ok: true, pickupSource: 'repair' })
})

test('免费维修完成后无需变更当前状态即可直接取车', () => {
  const freeRepairPickup = { scene: 'pickup', pickupSource: 'repair', title: '免费维修车', repairType: '免费' }
  for (const status of ['维修中', '等待配件', '已开付款单', '已开质保单']) {
    assert.deepEqual(validatePickup({ ...freeRepairPickup, status }), { ok: true, pickupSource: 'repair' })
  }
})

test('待取通知状态可由等待确认切换为已通知且不改变维修状态', () => {
  const record = { id: 'repair-notice', scene: 'pickup', pickupSource: 'repair', repairType: '免费', status: '维修中', notificationStatus: 'pending' }
  const result = buildPickupNotificationUpdate(record, 'notified', at)
  assert.equal(result.ok, true)
  assert.equal(result.record.notificationStatus, 'notified')
  assert.equal(result.record.notifiedAt, at)
  assert.equal(result.record.status, '维修中')
  assert.equal(inferPickupNotificationStatus(result.record), 'notified')
})

test('旧待取通知文案迁移到独立通知状态并恢复维修业务状态', () => {
  const legacy = {
    id: 'legacy-notice',
    scene: 'pickup',
    pickupSource: 'repair',
    repairType: '付费',
    status: '等待确认通知',
    detail: '通知状态：已通知 · 车辆已调试完成',
    meta: 'PICKUP-04 · 付款单在车上'
  }
  const normalized = normalizePickupNotificationRecord(legacy)
  assert.equal(normalized.notificationStatus, 'notified')
  assert.equal(normalized.status, '已开付款单')
  assert.equal(normalized.detail, '车辆已调试完成')
})

test('无效通知状态和已取车辆不能继续更新通知状态', () => {
  const record = { id: 'pickup-notice', scene: 'pickup', notificationStatus: 'pending' }
  assert.equal(buildPickupNotificationUpdate(record, 'unknown', at).ok, false)
  assert.equal(buildPickupNotificationUpdate({ ...record, pickedUpOn: '2026-07-12' }, 'notified', at).ok, false)
})

test('自提订单必须输入非空取货码，输入内容不要求预登记', () => {
  const order = { scene: 'pickup', pickupSource: 'self-pickup' }
  assert.equal(validatePickup(order, '').ok, false)
  assert.equal(validatePickup(order, '   ').ok, false)
  assert.deepEqual(validatePickup(order, '0007'), { ok: true, pickupSource: 'self-pickup' })
  assert.deepEqual(validatePickup(order, 0), { ok: true, pickupSource: 'self-pickup' })
})

test('顾客暂存无需附加校验，可直接取车', () => {
  const storage = { scene: 'pickup', pickupSource: 'customer-storage' }
  assert.deepEqual(validatePickup(storage), { ok: true, pickupSource: 'customer-storage' })
  assert.equal(pickupSourceLabel(storage), '顾客暂存')
})

test('二手车待取无需取货码或暂存说明，并显示二手车来源', () => {
  const usedCar = { scene: 'pickup', pickupSource: 'used-car', resaleStage: 'sold' }
  assert.deepEqual(validatePickup(usedCar), { ok: true, pickupSource: 'used-car' })
  assert.equal(pickupSourceLabel(usedCar), '二手车')
  assert.equal(inferPickupSource({ scene: 'pickup', resaleStage: 'sold' }), 'used-car')
})

test('手动新增待取仅允许自提订单、顾客暂存或二手车；联系方式可空并写入台账', () => {
  const base = { title: '订单车辆', detail: '顾客今日到店', contactType: 'phone', contactValue: '18172049175', status: '等待取车' }
  assert.equal(normalizePickupValues({ ...base, pickupSource: 'repair' }).ok, false)
  // 联系方式可空
  const emptyContact = normalizePickupValues({ ...base, pickupSource: 'self-pickup', selfPickupPlatform: 'tmall', contactValue: '' })
  assert.equal(emptyContact.ok, true)
  assert.equal(emptyContact.fields.meta, '')
  assert.equal(emptyContact.fields.contactValue, '')
  const order = normalizePickupValues({ ...base, pickupSource: 'self-pickup', selfPickupPlatform: 'tmall' })
  assert.equal(order.ok, true)
  assert.equal(order.fields.meta, '18172049175')
  assert.equal(order.fields.contactValue, '18172049175')
  assert.equal(order.fields.contactType, 'phone')
  assert.equal('pickupCode' in order.fields, false)
  const storage = normalizePickupValues({ ...base, pickupSource: 'customer-storage' })
  assert.equal(storage.ok, true)
  assert.equal(storage.fields.meta, '18172049175')
  assert.equal(storage.fields.contactValue, '18172049175')
  assert.equal('pickupCode' in storage.fields, false)
  const member = normalizePickupValues({ ...base, pickupSource: 'customer-storage', contactType: 'member', contactValue: 'M-9' })
  assert.equal(member.ok, true)
  assert.equal(member.fields.meta, '会员号：M-9')
  assert.equal(member.fields.contactType, 'member')
  const usedCar = normalizePickupValues({ ...base, pickupSource: 'used-car', detail: '', contactValue: '' })
  assert.equal(usedCar.ok, true)
  assert.equal(usedCar.fields.pickupSource, 'used-car')
  assert.equal(usedCar.fields.detail, '')
  assert.equal(usedCar.fields.selfPickupPlatform, '')
})

test('自提订单必须选择天猫、京东或小程序；联系方式可空且不保存取车说明', () => {
  const base = { title: '订单车辆', detail: '这段说明不应保存', contactType: 'phone', contactValue: '18172049175', status: '等待顾客取车', pickupSource: 'self-pickup' }
  assert.equal(normalizePickupValues(base).ok, false)
  assert.equal(normalizePickupValues({ ...base, selfPickupPlatform: 'tmall', contactValue: '' }).ok, true)
  for (const selfPickupPlatform of ['tmall', 'jd', 'mini-program']) {
    const result = normalizePickupValues({ ...base, selfPickupPlatform })
    assert.equal(result.ok, true)
    assert.equal(result.fields.selfPickupPlatform, selfPickupPlatform)
    assert.equal(result.fields.detail, '')
    assert.equal(result.fields.meta, '18172049175')
    assert.equal(result.fields.contactValue, '18172049175')
  }
  assert.equal(normalizePickupValues({ ...base, selfPickupPlatform: 'taobao' }).ok, false)
})

test('顾客暂存仍需填写说明；联系方式可空且不会保留自提平台', () => {
  const base = { title: '暂存车辆', contactType: 'phone', contactValue: '18172049175', status: '等待取车', pickupSource: 'customer-storage', selfPickupPlatform: 'tmall' }
  assert.equal(normalizePickupValues({ ...base, detail: '' }).ok, false)
  const emptyContact = normalizePickupValues({ ...base, detail: '暂存说明', contactValue: '' })
  assert.equal(emptyContact.ok, true)
  assert.equal(emptyContact.fields.meta, '')
  const result = normalizePickupValues({ ...base, detail: '暂存说明' })
  assert.equal(result.ok, true)
  assert.equal(result.fields.detail, '暂存说明')
  assert.equal(result.fields.selfPickupPlatform, '')
  assert.equal(result.fields.meta, '18172049175')
  assert.equal(result.fields.contactValue, '18172049175')
})

test('读取旧记录时剥离遗留取货码且不修改原对象', () => {
  const legacy = { id: 'order-1', pickupSource: 'self-pickup', pickupCode: 'SECRET', title: '订单车辆' }
  const safe = stripPickupCode(legacy)
  assert.equal('pickupCode' in safe, false)
  assert.equal(legacy.pickupCode, 'SECRET')
})

test('旧待取记录按维修痕迹或线上自提标记推断来源', () => {
  assert.equal(inferPickupSource({ detail: '维修完成', status: '维修中' }), 'repair')
  assert.equal(inferPickupSource({ kind: 'online', meta: '线上自提' }), 'self-pickup')
  assert.equal(inferPickupSource({ detail: '顾客临时放店内' }), 'customer-storage')
})

test('联系方式 meta 编解码兼容空值、手机号与会员号', () => {
  assert.equal(encodePickupContactMeta('phone', ''), '')
  assert.equal(encodePickupContactMeta('phone', '18172049175'), '18172049175')
  assert.equal(encodePickupContactMeta('member', 'M-1'), '会员号：M-1')
  assert.deepEqual(decodePickupContact({ meta: '' }), { contactType: 'phone', contactValue: '' })
  assert.deepEqual(decodePickupContact({ meta: '18172049175' }), { contactType: 'phone', contactValue: '18172049175' })
  assert.deepEqual(decodePickupContact({ meta: '会员号：M-1' }), { contactType: 'member', contactValue: 'M-1' })
  assert.deepEqual(decodePickupContact({ contactType: 'member', contactValue: 'M-2' }), { contactType: 'member', contactValue: 'M-2' })
})
