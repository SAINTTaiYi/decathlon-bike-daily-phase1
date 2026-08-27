import test from 'node:test'
import assert from 'node:assert/strict'
import { buildClosingReportModel, reportContact, reportItemDetail, selfPickupReportLabel, shiphubReportLabel, usedCarReportLabel } from '../apps/web/src/utils/closingReportImage.js'
import { readFile } from 'node:fs/promises'

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

test('日报图将手动与售出转入的待取二手车明确标识为二手车', () => {
  assert.equal(usedCarReportLabel({ pickupSource: 'used-car' }), '二手车')
  assert.equal(usedCarReportLabel({ scene: 'pickup', resaleStage: 'sold' }), '二手车')
  assert.equal(usedCarReportLabel({ pickupSource: 'customer-storage' }), '')
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

test('闭店日报图只等待站点自托管的两套字体，不再探测已移除的字体族', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../apps/web/src/utils/closingReportImage.js', import.meta.url), 'utf8')
  assert.match(source, /"Noto Sans SC Variable"/u)
  assert.match(source, /"Barlow Condensed Ops"/u)
  assert.match(source, /document\.fonts\.load\(/u)
  assert.doesNotMatch(source, /Albert Sans Local|Noto Serif SC Variable/u)
  assert.doesNotMatch(source, /CSSFontFaceRule|new FontFace\(/u)
})

test('闭店日报图并入 Shiphub 同步车辆并按管线阶段标识', () => {
  const model = buildClosingReportModel({
    records: [{ id: 'p1', scene: 'pickup', title: '手工待取', status: '等待取车', lifecycle: 'active' }],
    shiphubOrders: [
      { category: 'hand', order: { id: 'H1', orderNumber: '5127371642958017643', vehicleInfo: '城市通勤车 · 黑色 · M码', customerPhone: '17012345678', channel: '天猫', scheduledAt: '2026-08-27T02:00:00.000Z', localActionState: null } },
      { category: 'pick', order: { id: 'P1', orderNumber: 'cn1192410922059753', items: [{ productLabel: '山地自行车' }], localActionState: null } },
      { category: 'receive', order: { id: 'R1', orderNumber: '3602269002645552', vehicleInfo: '公路自行车 · 白色 · S码', localActionState: 'completed' } }
    ],
    closedAt: '2026-08-27T14:00:00.000Z'
  })
  // 追加在手工待取之后，顺序保持传入顺序
  assert.deepEqual(model.pickups.map((item) => item.id), ['p1', 'shiphub-hand-H1', 'shiphub-pick-P1', 'shiphub-receive-R1'])
  const [hand, pick, receive] = model.pickups.slice(1)
  // 状态标识按管线阶段区分
  assert.equal(hand.status, '待交接核销')
  assert.equal(pick.status, '待门店拣货')
  assert.equal(receive.status, '已本地处理')
  // 右侧黑底标识（短词）
  assert.equal(shiphubReportLabel(hand), '待交接')
  assert.equal(shiphubReportLabel(pick), '待拣货')
  assert.equal(shiphubReportLabel(receive), '已处理')
  assert.equal(shiphubReportLabel(model.pickups[0]), '')
  // 标题优先车辆信息，缺失时回退商品名；联系方式进入手机槽位
  assert.equal(hand.title, '城市通勤车 · 黑色 · M码')
  assert.equal(pick.title, '山地自行车')
  assert.equal(reportContact(hand).contactValue, '17012345678')
  // 订单号进入详情行与工单号
  assert.match(reportItemDetail(hand), /订单 5127371642958017643/u)
  assert.equal(hand.ticketNo, '5127371642958017643')
})

test('闭店导出注入 Shiphub 订单且失败不阻塞闭店流程', async () => {
  const app = await readFile(new URL('../apps/web/src/App.jsx', import.meta.url), 'utf8')
  // enabled 时取缓存并补拉缺失分类，任何失败降级为空数组
  assert.match(app, /if \(shiphub\?\.enabled\)/u)
  assert.match(app, /await shiphub\.loadOrders\(category\)/u)
  assert.match(app, /catch \{ return \[\] \}/u)
  assert.match(app, /shiphubOrders,/u)
  assert.match(app, /const categories = \['hand', 'pick', 'receive'\]/u)
})
