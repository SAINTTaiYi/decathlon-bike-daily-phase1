import test from 'node:test'
import assert from 'node:assert/strict'
import {
  displayContactValue,
  formatDetailDate,
  formatScanDate,
  formatTicketNumber,
  joinMaintenanceLine,
  serviceSectionLabel,
  splitMaintenanceItems
} from '../apps/web/src/data/recordPresentation.js'

test('工单号统一为六位数字并为旧记录提供稳定后备编号', () => {
  assert.equal(formatTicketNumber(31, 'record-a'), '#000031')
  assert.equal(formatTicketNumber('7', 'record-b'), '#000007')
  assert.equal(formatTicketNumber(undefined, 'legacy-record'), formatTicketNumber(undefined, 'legacy-record'))
  assert.match(formatTicketNumber(undefined, 'legacy-record'), /^#\d{6}$/u)
})

test('维修内容按加号、换行、分号、顿号和竖线拆分为可扫描项目', () => {
  assert.deepEqual(splitMaintenanceItems('299保养+更换刹车线管'), ['299保养', '更换刹车线管'])
  assert.deepEqual(splitMaintenanceItems('保养\n更换刹车皮；调试变速'), ['保养', '更换刹车皮', '调试变速'])
  assert.deepEqual(splitMaintenanceItems('• 保养、- 更换刹车线管'), ['保养', '更换刹车线管'])
  assert.deepEqual(splitMaintenanceItems('保养｜调圈｜换链条'), ['保养', '调圈', '换链条'])
})

test('维修内容在卡片中完整合并为竖线扫描行，不截断', () => {
  assert.equal(joinMaintenanceLine('299保养+更换刹车线管'), '299保养｜更换刹车线管')
  assert.equal(joinMaintenanceLine('保养｜调圈｜换链条｜更换飞轮'), '保养｜调圈｜换链条｜更换飞轮')
})

test('手机号完整显示，日期默认短写', () => {
  assert.equal(displayContactValue('18172049175'), '18172049175')
  assert.equal(displayContactValue(' 013123456934 '), '013123456934')
  assert.equal(formatScanDate('2026-07-31'), '07.31')
  assert.equal(formatDetailDate('2026-07-31'), '2026.07.31')
})

test('服务票据区标题按维修、订单和暂存语义输出', () => {
  assert.equal(serviceSectionLabel({ scene: 'repair' }), 'Maintenance')
  assert.equal(serviceSectionLabel({ pickupSource: 'repair' }), 'Maintenance')
  assert.equal(serviceSectionLabel({ pickupSource: 'self-pickup' }), 'Order')
  assert.equal(serviceSectionLabel({ pickupSource: 'customer-storage' }), 'Storage note')
  assert.equal(serviceSectionLabel({ pickupSource: 'used-car' }), 'Used bike')
})
