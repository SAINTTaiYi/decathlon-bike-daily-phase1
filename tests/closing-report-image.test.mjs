import test from 'node:test'
import assert from 'node:assert/strict'
import { buildClosingReportModel, reportContact, reportItemDetail, selfPickupReportLabel } from '../apps/web/src/utils/closingReportImage.js'

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


test('日报图为线上自提订单显示对应平台标识，并保留普通待取的取车日期语义', () => {
  assert.equal(selfPickupReportLabel({ pickupSource: 'self-pickup', selfPickupPlatform: 'tmall' }), '天猫自提')
  assert.equal(selfPickupReportLabel({ pickupSource: 'self-pickup', selfPickupPlatform: 'jd' }), '京东自提')
  assert.equal(selfPickupReportLabel({ pickupSource: 'self-pickup', selfPickupPlatform: 'mini-program' }), '小程序自提')
  assert.equal(selfPickupReportLabel({ pickupSource: 'customer-storage', selfPickupPlatform: 'tmall' }), '')
  assert.equal(selfPickupReportLabel({ kind: 'online', meta: '线上自提 京东' }), '京东自提')
})

test('日报图模型冻结 KPI 与待取记录快照，不受后续页面状态改写影响', () => {
  const kpi = { salesVehicles: 4, safetyChecks: 2, safetyModel: 'ST100', validReviews: 3, usedSold: 1, usedReceived: 2 }
  const records = [{ id: 'order-1', scene: 'pickup', title: '订单车', pickupSource: 'self-pickup', selfPickupPlatform: 'tmall', lifecycle: 'active' }]
  const model = buildClosingReportModel({ kpi, records, closedAt: '2026-07-21T09:00:00.000Z' })
  kpi.salesVehicles = 0
  records[0].selfPickupPlatform = 'jd'
  assert.equal(model.kpi.salesVehicles, 4)
  assert.equal(model.pickups[0].selfPickupPlatform, 'tmall')
})

test('自动闭店日报图使用服务器 close 响应的 KPI 快照而不是等待 React 刷新后的状态', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../apps/web/src/App.jsx', import.meta.url), 'utf8')
  assert.match(source, /kpi: result\.day\?\.kpi/u)
  assert.match(source, /closedAt: result\.day\?\.closedAt/u)
  assert.match(source, /\}, \{ automatic: true \}\)/u)
})


test('自提车辆手机号只进入日报图手机号槽位，不作为详情内容', () => {
  const order = {
    scene: 'pickup',
    pickupSource: 'self-pickup',
    selfPickupPlatform: 'tmall',
    detail: '',
    meta: '18172049175'
  }
  assert.equal(reportItemDetail(order), '')
  assert.deepEqual(reportContact(order), { contactType: 'phone', contactValue: '18172049175' })
})

test('日报图测量与绘制都使用同一自提详情过滤规则', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../apps/web/src/utils/closingReportImage.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /itemDetail\(/u)
  assert.match(source, /reportItemDetail\(item\)/u)
})

test('自提车辆会员号也使用日报图联系槽位，详情保持为空', () => {
  const order = {
    scene: 'pickup',
    pickupSource: 'self-pickup',
    selfPickupPlatform: 'jd',
    detail: '',
    meta: '会员号：M-2048'
  }
  assert.equal(reportItemDetail(order), '')
  assert.deepEqual(reportContact(order), { contactType: 'member', contactValue: 'M-2048' })
})

test('日报图导出器使用 Signal Grid 自托管 Sans/Condensed 字体，不引用已删除的 Serif 资源', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../apps/web/src/utils/closingReportImage.js', import.meta.url), 'utf8')
  assert.match(source, /Barlow Condensed Local/u)
  assert.match(source, /Noto Sans SC Variable/u)
  assert.ok(source.includes(`document.fonts.load('900 48px \"Noto Sans SC Variable\"', sample)`))
  assert.match(source, /await ensureLatinReportFonts\(\)/u)
  assert.doesNotMatch(source, /if \(fontsReadyPromise\) return/u)
  assert.match(source, /await ensureReportFonts\(model\)/u)
  assert.doesNotMatch(source, /Noto Serif SC Variable|noto-serif-sc/u)
  assert.doesNotMatch(source, /\/fonts\/albert-sans-variable\.woff2/u)
})
