import test from 'node:test'
import assert from 'node:assert/strict'
import { buildClosingReportModel, reportContact, reportItemDetail, selfPickupReportLabel, shiphubReportLabel, shiphubReportRecord, usedCarReportLabel } from '../apps/web/src/utils/closingReportImage.js'
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

test('闭店日报图并入 Shiphub 同步车辆：右侧标识=渠道名（在途后缀），整车过滤与官方车型名', () => {
  const model = buildClosingReportModel({
    records: [{ id: 'p1', scene: 'pickup', title: '手工待取', status: '等待取车', lifecycle: 'active' }],
    shiphubOrders: [
      { category: 'hand', order: { id: 'H1', orderNumber: '5127371642958017643', vehicleInfo: '城市通勤车 · 黑色 · M码', customerPhone: '17012345678', channel: '天猫', scheduledAt: '2026-08-27T02:00:00.000Z', localActionState: null, items: [{ sku: '4810987' }] } },
      { category: 'pick', order: { id: 'P1', orderNumber: 'cn1192410922059753', items: [{ productLabel: '山地自行车', sku: '5493775' }], localActionState: null, channel: '京东' } },
      { category: 'receive', order: { id: 'R1', orderNumber: '3602269002645552', vehicleInfo: '公路自行车 · 白色 · S码', localActionState: 'completed', channel: '小程序', items: [{ sku: '4265914' }] } }
    ],
    shiphubVehicleLookup: {
      '4810987': { model: '8797823', label: '20" EXPL 120 CN', isBike: true, isBuyback: false },
      '5493775': { model: '8480274', label: 'TUC 100 ELOPS LF CN BLACK', isBike: true, isBuyback: false },
      '4265914': { model: '8640568', label: 'RS ILS FIT3 CN LIGHT PURPLE', isBike: false, isBuyback: false }
    },
    closedAt: '2026-08-27T14:00:00.000Z'
  })
  // 追加在手工待取之后；非整车（4265914 轮滑鞋）被剔除
  assert.deepEqual(model.pickups.map((item) => item.id), ['p1', 'shiphub-hand-H1', 'shiphub-pick-P1'])
  const [hand, pick] = model.pickups.slice(1)
  // 状态标识按管线阶段区分（左侧 status chip 不变）
  assert.equal(hand.status, '待交接核销')
  assert.equal(pick.status, '待门店拣货')
  // 右侧黑底标识（2026-09-04 定案）：显示渠道名，与手动自提车辆标识同构
  assert.equal(shiphubReportLabel(hand), '天猫')
  assert.equal(shiphubReportLabel({ ...pick, shiphubChannel: '京东', shiphubCategory: 'receive', localActionState: null }), '京东在途')
  assert.equal(shiphubReportLabel(model.pickups[0]), '')
  // 无渠道时退回管线阶段词
  assert.equal(shiphubReportLabel({ shiphub: true, shiphubCategory: 'hand', shiphubChannel: null, localActionState: null }), '待交接')
  // 已本地处理仍显示已处理
  assert.equal(shiphubReportLabel({ shiphub: true, shiphubCategory: 'receive', shiphubChannel: '小程序', localActionState: 'completed' }), '已处理')
  // 标题用 perfeco 官方车型名（不再是上游的颜色/尺码串）
  assert.equal(hand.title, '20" EXPL 120 CN')
  assert.equal(pick.title, 'TUC 100 ELOPS LF CN BLACK')
  assert.equal(reportContact(hand).contactValue, '17012345678')
  // 订单号进入详情行与工单号
  assert.match(reportItemDetail(hand), /订单 5127371642958017643/u)
  assert.equal(hand.ticketNo, '5127371642958017643')
  // 分类缺失（无 lookup）时降级旧行为：不过滤、显示 vehicleInfo
  const degraded = buildClosingReportModel({
    shiphubOrders: [{ category: 'hand', order: { id: 'H2', orderNumber: 'X1', vehicleInfo: '旧颜色 · 尺码', channel: '天猫', items: [{ sku: '4265914' }] } }],
    closedAt: '2026-08-27T14:00:00.000Z'
  })
  assert.equal(degraded.pickups.length, 1)
  assert.equal(degraded.pickups[0].title, '旧颜色 · 尺码')
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

// ── 2026-09-17：日报图加记录生成日期 + 实心色块改 Ops 主题黄（去掉黑色）────────

test('闭店日报图为每条记录带上生成日期（手工记录用 createdAt，Shiphub 用首次同步时间）', () => {
  const rows = [
    { id: 'p1', scene: 'pickup', title: '待取A', status: '等待取车', lifecycle: 'active', createdAt: '2026-09-12T03:20:00.000Z' },
    { id: 'r1', scene: 'repair', title: '维修A', status: '维修中', lifecycle: 'active', createdAt: '2026-09-14T06:00:00.000Z' },
    { id: 'h1', scene: 'poster', title: '交接A', status: '继续跟进', lifecycle: 'active', createdAt: '2026-09-15T06:00:00.000Z' }
  ]
  const model = buildClosingReportModel({ records: rows, closedAt: '2026-09-16T13:00:00.000Z' })
  assert.equal(model.pickups[0].createdAt, '2026-09-12T03:20:00.000Z')
  assert.equal(model.repairs[0].createdAt, '2026-09-14T06:00:00.000Z')
  assert.equal(model.handovers[0].createdAt, '2026-09-15T06:00:00.000Z')
  // Shiphub 同步车辆没有「建单时间」，用首次同步时间（first_seen_at）当生成日期
  const ship = shiphubReportRecord('hand', {
    id: 'H1', orderNumber: '5127371642958017643', vehicleInfo: '城市通勤车', items: [{ sku: '4810987' }],
    firstSeenAt: '2026-09-13T02:00:00.000Z', scheduledAt: '2026-09-14T02:00:00.000Z'
  }, null)
  assert.equal(ship.createdAt, '2026-09-13T02:00:00.000Z')
  assert.equal(shiphubReportRecord('hand', { id: 'H2', items: [] }, null).createdAt, '')
})

test('闭店日报图的实心色块统一改为 Ops 主题黄，黑色只留在文字与细线上', async () => {
  const source = await readFile(new URL('../apps/web/src/utils/closingReportImage.js', import.meta.url), 'utf8')
  assert.match(source, /const BRAND = '#ffde59'/u, '必须显式声明 Ops 主题黄（与 --ops-yellow 同值）')
  // 销售 hero 大块
  assert.match(source, /ctx\.fillStyle = BRAND\n\s*ctx\.fillRect\(heroX, blockY, heroW, heroH\)/u, '销售 hero 必须用主题黄填充')
  assert.match(source, /ctx\.fillStyle = BRAND\n\s*ctx\.fillRect\(heroX, blockY \+ heroH - 20, heroW, 20\)/u, 'hero 底边接缝也必须用主题黄')
  // 卡片左侧色条 / 右侧来源标识面板 / 顶部版本徽章
  assert.match(source, /ctx\.fillStyle = BRAND\n\s*ctx\.fillRect\(x, y, BAR_W, h\)/u, '卡片左侧色条必须改主题黄')
  assert.match(source, /if \(sourceIdentity\) fillRound\(ctx, panelX, panelY, panelW, panelH, 16, BRAND\)/u, '来源标识面板必须改主题黄')
  assert.match(source, /fillRound\(ctx, WIDTH - PAD - vw, 58, vw, 48, 8, BRAND\)/u, '版本徽章必须改主题黄')
  // 黄底上的文字与图形改深色（白字白线在黄底上会看不见）
  assert.match(source, /ctx\.fillStyle = BRAND_INK/u, '黄底上的数字必须用深色')
  // 白卡纸面（SURFACE / CHIP_BG 两个 token）保留；黄底上的白色文字 / 图形必须清零。
  assert.doesNotMatch(source, /fillStyle = '#ffffff'/u, '黄底上不得再写白字（黄底白字不可读）')
  assert.doesNotMatch(source, /rgba\(255,\s*255,\s*255/u, '不得再保留白色半透明网格 / 曲线 / 标签')
  assert.doesNotMatch(source, /ctx\.fillStyle = '#fff'/u, '不得再保留裸白填充')
  // 黑色实心块必须清零（只允许作为文字色与细线）
  assert.doesNotMatch(source, /fillRound\(ctx, panelX, panelY, panelW, panelH, 16, INK\)/u, '来源标识面板不得再是黑底')
  assert.doesNotMatch(source, /fillRound\(ctx, WIDTH - PAD - vw, 58, vw, 48, 8, INK\)/u, '版本徽章不得再是黑底')
  assert.doesNotMatch(source, /ctx\.fillStyle = INK\n\s*ctx\.fillRect\(heroX/u, '销售 hero 不得再是黑底')
})

test('闭店日报图卡片在业务编号旁打印生成日期（三类卡片共用同一处）', async () => {
  const source = await readFile(new URL('../apps/web/src/utils/closingReportImage.js', import.meta.url), 'utf8')
  assert.match(source, /function formatCreatedStamp\(value\)/u, '必须有生成日期格式化器')
  assert.match(source, /at\.getMonth\(\)/u, '生成日期必须按门店本地日历取值（createdAt 是 UTC 瞬时）')
  assert.match(source, /生成 \$\{createdStamp\}/u, '卡片必须打印「生成 MM.DD」')
  assert.match(source, /const createdStamp = formatCreatedStamp\(item\.createdAt\)/u, '生成日期必须取 item.createdAt')
})
