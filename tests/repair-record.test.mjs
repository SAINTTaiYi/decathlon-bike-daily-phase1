import test from 'node:test'
import assert from 'node:assert/strict'
import {
  COMPLETED_REPAIR_STATUSES,
  normalizeRepairRecord,
  normalizeRepairValues,
  repairRecordToDraft,
  STORE_PRODUCT_REPAIR
} from '../apps/web/src/data/repairRecord.js'

const valid = {
  title: 'Riverside 500',
  contactType: 'phone',
  contactValue: '13800138000',
  repairType: '付费',
  repairProject: '更换后刹车线并调试变速',
  pickupDate: '2026-07-18',
  status: '已开付款单'
}

test('联系方式 0 是有效字符串并按结构保存', () => {
  const result = normalizeRepairValues({ ...valid, contactValue: 0 })
  assert.equal(result.ok, true)
  assert.equal(result.fields.contactValue, '0')
  assert.equal(result.fields.meta, '手机号：0 · 付费 · 取车：2026-07-18')
})

test('门店产品维修无需取车日期并主动清空旧日期', () => {
  const result = normalizeRepairValues({ ...valid, repairType: STORE_PRODUCT_REPAIR, pickupDate: '2026-07-18' })
  assert.equal(result.ok, true)
  assert.equal(result.fields.pickupDate, '')
  assert.equal(result.fields.meta, '手机号：13800138000 · 门店产品维修')
})

test('非门店产品维修必须选择有效日期', () => {
  assert.deepEqual(normalizeRepairValues({ ...valid, pickupDate: '' }), { ok: false, error: '请选择有效的取车日期。' })
  assert.deepEqual(normalizeRepairValues({ ...valid, pickupDate: '2026-02-31' }), { ok: false, error: '请选择有效的取车日期。' })
})

test('快速服务免费是完成前的明确提醒状态', () => {
  const result = normalizeRepairValues({ ...valid, repairType: '免费', status: '快速服务免费' })
  assert.equal(result.ok, true)
  assert.equal(result.fields.repairType, '免费')
  assert.equal(result.fields.status, '快速服务免费')
  assert.equal(result.fields.pickupDate, '2026-07-18')
})

test('维修类型与当前状态拒绝任意输入或绕过维修完毕直接选完成状态', () => {
  assert.deepEqual(normalizeRepairValues({ ...valid, repairType: '免费维修' }), { ok: false, error: '请选择维修类型。' })
  assert.deepEqual(normalizeRepairValues({ ...valid, status: '等待复检' }), { ok: false, error: '维修中的车辆不能直接选择“维修完成-*”状态，请使用“维修完毕”操作。' })
  assert.deepEqual(normalizeRepairValues({ ...valid, status: '维修完成-已开付款单' }), { ok: false, error: '维修中的车辆不能直接选择“维修完成-*”状态，请使用“维修完毕”操作。' })
})

test('旧版维修记录映射到新表单且要求补齐新增字段', () => {
  const draft = repairRecordToDraft({ title: '旧车', detail: '旧维修事项', meta: '旧维修单', status: '等待复检' })
  assert.equal(draft.title, '旧车')
  assert.equal(draft.repairProject, '旧维修事项')
  assert.equal(draft.status, '维修中')
  assert.equal(draft.contactValue, '')
  assert.equal(draft.repairType, '')
})

test('待取中的维修完成记录只允许五个完成状态并可直接编辑保存', () => {
  for (const status of COMPLETED_REPAIR_STATUSES) {
    const draft = repairRecordToDraft({ ...valid, scene: 'pickup', pickupSource: 'repair', status })
    assert.equal(draft.status, status)
    const result = normalizeRepairValues({ ...valid, status }, { completed: true })
    assert.equal(result.ok, true)
    assert.equal(result.fields.status, status)
  }
  const invalid = normalizeRepairValues({ ...valid, status: '已开付款单' }, { completed: true })
  assert.equal(invalid.ok, false)
  assert.match(invalid.error, /只能在五个.*维修完成/u)
})

test('旧版统一维修完成状态按维修类型保守迁移为不可误放行状态', () => {
  assert.equal(normalizeRepairRecord({ scene: 'pickup', pickupSource: 'repair', repairType: '付费', status: '维修完成' }).status, '维修完成-已开维修单')
  assert.equal(normalizeRepairRecord({ scene: 'pickup', pickupSource: 'repair', repairType: '质保', status: '维修完成' }).status, '维修完成-已开质保维修单')
  assert.equal(normalizeRepairRecord({ scene: 'pickup', pickupSource: 'repair', repairType: '免费', status: '维修完成' }).status, '维修完成-快速服务免费')
})

test('Web 与共享 Domain 的维修状态集合和映射保持完全一致', async () => {
  const domain = await import('../packages/domain/src/index.js')
  const web = await import('../apps/web/src/data/repairRecord.js')
  for (const key of ['REPAIR_STATUSES', 'COMPLETED_REPAIR_STATUSES', 'REPAIR_PICKUP_READY_STATUSES']) {
    assert.deepEqual(web[key], domain[key])
  }
  assert.deepEqual(web.REPAIR_COMPLETION_STATUS_MAP, domain.REPAIR_COMPLETION_STATUS_MAP)
})
