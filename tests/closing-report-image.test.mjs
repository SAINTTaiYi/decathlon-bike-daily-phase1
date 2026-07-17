import test from 'node:test'
import assert from 'node:assert/strict'
import { buildClosingReportModel } from '../apps/web/src/utils/closingReportImage.js'

test('闭店日报图模型只收录未完成的待取/维修/交接，并保留完整销售数据', () => {
  const model = buildClosingReportModel({
    businessDate: '2026-07-18',
    storeName: '测试店',
    exporterName: '小王',
    closedAt: '2026-07-18T12:00:00.000Z',
    appVersion: '5.3.8',
    kpi: {
      salesVehicles: 3,
      safetyChecks: 2,
      safetyModel: 'ST100',
      validReviews: 1,
      usedSold: 0,
      usedReceived: 1
    },
    records: [
      { id: 'p1', scene: 'pickup', title: '待取A', status: '等待取车', lifecycle: 'active' },
      { id: 'p2', scene: 'pickup', title: '已取B', status: '已取车', lifecycle: 'picked-up', pickedUpOn: '2026-07-18' },
      { id: 'r1', scene: 'repair', title: '维修A', status: '维修中', lifecycle: 'active' },
      { id: 'r2', scene: 'repair', title: '完成维修', status: '已完成', lifecycle: 'completed', completedOn: '2026-07-18' },
      { id: 'h1', scene: 'poster', title: '交接A', status: '继续跟进', lifecycle: 'active' },
      { id: 'h2', scene: 'poster', title: '交接完成', status: '已完成', lifecycle: 'completed', completedOn: '2026-07-18' },
      { id: 's1', scene: 'resale', title: '二手车', status: '待上架', lifecycle: 'active' }
    ]
  })

  assert.equal(model.kpi.salesVehicles, 3)
  assert.equal(model.kpi.safetyModel, 'ST100')
  assert.deepEqual(model.pickups.map((item) => item.id), ['p1'])
  assert.deepEqual(model.repairs.map((item) => item.id), ['r1'])
  assert.deepEqual(model.handovers.map((item) => item.id), ['h1'])
  assert.equal(model.storeName, '测试店')
  assert.equal(model.businessDate, '2026-07-18')
})
