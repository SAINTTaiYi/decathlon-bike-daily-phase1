import test from 'node:test'
import assert from 'node:assert/strict'
import {
  computeFoodDates,
  daysUntil,
  edate,
  foodBatchStage,
  foodReceiptWarning,
  isFoodBatchFlagged,
  isIsoDate
} from '../src/index.js'

// 锚点全部取自门店现行 Excel 台账《五象食品&产品台账登记本》的真实单元格，
// 保证 JS 实现与表内 EDATE 公式逐年逐月一致（改口径必须先改这些断言）。
test('EDATE 与台账实测样本一致（食品类2026 真实行）', () => {
  assert.equal(edate('2025-09-11', 23), '2027-08-11') // 2074681 天然矿泉水500ML / 24 个月
  assert.equal(edate('2025-10-27', 8), '2026-06-27') // 5144573 蛋白棒 / 9 个月
  assert.equal(edate('2026-05-25', 17), '2027-10-25') // 4630013 乳清蛋白粉 30克 / 18 个月
  assert.equal(edate('2026-08-14', 11), '2027-07-14') // 5144799 西梅苹果果泥 / 12 个月
  assert.equal(edate('2025-03-10', 35), '2028-02-10') // 4885348 防晒喷雾 / 36 个月（非食品）
})

test('EDATE 复刻 Excel 月末截断与负数月', () => {
  assert.equal(edate('2026-01-31', 1), '2026-02-28')
  assert.equal(edate('2026-01-31', 2), '2026-03-31')
  assert.equal(edate('2024-02-29', 12), '2025-02-28')
  assert.equal(edate('2028-10-07', -1), '2028-09-07')
  assert.equal(edate('bad-date', 1), '')
})

test('isIsoDate 拒绝日历上不存在的日期', () => {
  assert.equal(isIsoDate('2026-09-13'), true)
  assert.equal(isIsoDate('2024-02-29'), true)
  assert.equal(isIsoDate('2026-02-30'), false)
  assert.equal(isIsoDate('2026-13-01'), false)
  assert.equal(isIsoDate('20260913'), false)
  assert.equal(isIsoDate(null), false)
})

test('computeFoodDates 覆盖食品 / 非食品生产日期 / 非食品限制使用日期三分支', () => {
  const food = computeFoodDates({ kind: 'food', productionDate: '2025-09-11', shelfLifeMonths: 24 })
  assert.deepEqual(food, { ok: true, warnOn: '2027-08-11', expiresOn: '2027-09-11' })

  const nonFoodProduction = computeFoodDates({ kind: 'nonfood', dateType: 'production', productionDate: '2025-03-10', shelfLifeMonths: 36 })
  assert.deepEqual(nonFoodProduction, { ok: true, warnOn: '2028-02-10', expiresOn: '2028-03-10' })

  const restricted = computeFoodDates({ kind: 'nonfood', dateType: 'restricted', restrictedDate: '2028-10-07', shelfLifeMonths: 36 })
  assert.deepEqual(restricted, { ok: true, warnOn: '2028-09-07', expiresOn: '2028-10-07' })

  // 限制使用日期口径不需要生产日期字段
  const restrictedNoProduction = computeFoodDates({ kind: 'nonfood', dateType: 'restricted', restrictedDate: '2027-05-01', shelfLifeMonths: 24 })
  assert.deepEqual(restrictedNoProduction, { ok: true, warnOn: '2027-04-01', expiresOn: '2027-05-01' })
  // 清单缺码（无保质期月数）一律拒绝登记，逼迫先补清单——与 Excel 表头
  // 「如出现 #N/A 则 item 需要在【清单】里新增」的既有流程一致
  assert.deepEqual(computeFoodDates({ kind: 'nonfood', dateType: 'restricted', restrictedDate: '2027-05-01' }), { ok: false, error: 'SHELF_LIFE_INVALID' })
})

test('computeFoodDates 拒绝非法保质期与非法日期', () => {
  assert.deepEqual(computeFoodDates({ kind: 'food', productionDate: '2026-01-01', shelfLifeMonths: 0 }), { ok: false, error: 'SHELF_LIFE_INVALID' })
  assert.deepEqual(computeFoodDates({ kind: 'food', productionDate: '2026-01-01', shelfLifeMonths: 'abc' }), { ok: false, error: 'SHELF_LIFE_INVALID' })
  assert.deepEqual(computeFoodDates({ kind: 'food', productionDate: '2026-02-30', shelfLifeMonths: 12 }), { ok: false, error: 'DATE_INVALID' })
  assert.deepEqual(computeFoodDates({ kind: 'nonfood', dateType: 'restricted', restrictedDate: '', shelfLifeMonths: 12 }), { ok: false, error: 'DATE_INVALID' })
})

test('foodBatchStage 按预警日 / 到期日 / 处理状态分级', () => {
  const today = '2026-09-13'
  assert.equal(foodBatchStage({ status: 'sold_out', warnOn: '2026-01-01', expiresOn: '2026-02-01' }, today), 'closed')
  assert.equal(foodBatchStage({ status: 'isolated', warnOn: '2026-01-01', expiresOn: '2026-02-01' }, today), 'closed')
  assert.equal(foodBatchStage({ status: 'open', warnOn: '2026-08-01', expiresOn: '2026-09-12' }, today), 'expired')
  // 台账真实红标行：4248040 高纤蛋白棒，预警 2026-08-14，仍未处理
  assert.equal(foodBatchStage({ status: 'open', warnOn: '2026-08-14', expiresOn: '2026-09-14' }, today), 'flagged')
  assert.equal(foodBatchStage({ status: 'open', warnOn: '2026-09-01', expiresOn: '2026-10-01' }, today), 'flagged')
  assert.equal(foodBatchStage({ status: 'open', warnOn: '2026-10-20', expiresOn: '2026-10-25' }, today), 'soon')
  assert.equal(foodBatchStage({ status: 'open', warnOn: '2027-01-01', expiresOn: '2027-02-01' }, today), 'fresh')
  // 列名下划线形态（D1 行）同样支持
  assert.equal(foodBatchStage({ status: 'open', warn_on: '2026-08-14', expires_on: '2026-09-14' }, today), 'flagged')
  assert.equal(foodBatchStage(null, today), 'fresh')
})

test('isFoodBatchFlagged 只认未处理且已过预警日的批次', () => {
  const today = '2026-09-13'
  assert.equal(isFoodBatchFlagged({ status: 'open', warnOn: '2026-09-13' }, today), true)
  assert.equal(isFoodBatchFlagged({ status: 'open', warnOn: '2026-09-14' }, today), false)
  assert.equal(isFoodBatchFlagged({ status: 'sold_out', warnOn: '2026-01-01' }, today), false)
  assert.equal(isFoodBatchFlagged({ status: 'open', warnOn: '' }, today), false)
})

test('daysUntil 与 foodReceiptWarning 按 SOP 第 8 条给出 45 天来货提醒', () => {
  assert.equal(daysUntil('2026-09-20', '2026-09-13'), 7)
  assert.equal(daysUntil('2026-09-13', '2026-09-13'), 0)
  assert.equal(daysUntil('2026-09-01', '2026-09-13'), -12)
  assert.equal(daysUntil('', '2026-09-13'), null)

  // 收货时距到期 <45 天需在部门群沟通；≥45 天不提醒
  assert.equal(foodReceiptWarning('2026-10-01', '2026-09-13'), 18)
  assert.equal(foodReceiptWarning('2026-12-01', '2026-09-13'), null)
})
