import test from 'node:test'
import assert from 'node:assert/strict'
import {
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

test('免费是有效维修类型并保留取车日期与当前状态', () => {
  const result = normalizeRepairValues({ ...valid, repairType: '免费', status: '维修中' })
  assert.equal(result.ok, true)
  assert.equal(result.fields.repairType, '免费')
  assert.equal(result.fields.status, '维修中')
  assert.equal(result.fields.pickupDate, '2026-07-18')
  assert.equal(result.fields.meta, '手机号：13800138000 · 免费 · 取车：2026-07-18')
})

test('维修类型与当前状态拒绝任意输入', () => {
  assert.deepEqual(normalizeRepairValues({ ...valid, repairType: '免费维修' }), { ok: false, error: '请选择维修类型。' })
  assert.deepEqual(normalizeRepairValues({ ...valid, status: '等待复检' }), { ok: false, error: '请选择当前状态。' })
})

test('旧版维修记录映射到新表单且要求补齐新增字段', () => {
  const draft = repairRecordToDraft({ title: '旧车', detail: '旧维修事项', meta: '旧维修单', status: '等待复检' })
  assert.equal(draft.title, '旧车')
  assert.equal(draft.repairProject, '旧维修事项')
  assert.equal(draft.status, '维修中')
  assert.equal(draft.contactValue, '')
  assert.equal(draft.repairType, '')
})
