import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SEGMENT_SIZE,
  SCAN_WINDOW_HOURS,
  buildEpc,
  buildScanPlan,
  deriveProductionDate,
  edate,
  filterRecentRecords,
  judgeBatches,
  scanWindowSince
} from '../src/services/food-auto.js'
import { isTodayReceipt, movementsWindow, parseReceptionId, todayBjStartUtcIso } from '../src/services/food-auto-discovery.js'
import { AGGREGATE_LIMIT, aggregateRecords, judgeAggregates, sanitizeAggregates } from '../src/services/food-auto-aggregate.js'
import { FOOD_SCAN_ZONES } from '../src/data/food-scan-zones.js'
import { FOOD_SHELF_LIFE_BY_ITEM } from '../src/data/food-shelf-life.js'

// ── 食品自动登记影子系统 · 服务层（2026-09-18）──
// 全部向量取自 2026-09-17 真实收货单 9701150246 的实跑数据：
// EPC 构造与上游逐字节一致、EDATE 与 Excel 口径一致、批次判定复现当日结论。

test('buildEpc：与上游真实 EPC 逐字节一致（含哨兵 opene̶r）', () => {
  // 真实样本：水 EPC 30395DFA8332E48000ECE0C7 反解 serial=15524039
  assert.equal(buildEpc('358378', '838546', 15_524_039), '30395DFA8332E48000ECE0C7')
  // 真实样本：水 serial 15054844 → 30395DFA8332E48000E5B7FC（9/17 扫描命中段内）
  assert.equal(buildEpc('358378', '838546', 15_054_844), '30395DFA8332E48000E5B7FC')
  // 真实样本：电解质 360839|416599 serial 63141
  assert.equal(buildEpc('360839', '416599', 63_141), '30396061C196D5C00000F6A5')
  // 24 hex、以 30 开头（0x30 头部 + filter/partition）
  const epc = buildEpc('358378', '716614', 4_618_553)
  assert.equal(epc.length, 24)
  assert.match(epc, /^30395DFA82/u)
})

test('edate：与 Excel EDATE 口径一致（含月末溢出与负月）', () => {
  assert.equal(edate('2026-06-15', 8), '2027-02-15')
  assert.equal(edate('2026-06-25', 23), '2028-05-25')
  assert.equal(edate('2027-03-15', -9), '2026-06-15')
  assert.equal(edate('2028-06-25', -24), '2026-06-25')
  // 月末溢出：1/31 + 1 月 → 2/28（2027 非闰年）
  assert.equal(edate('2027-01-31', 1), '2027-02-28')
})

test('deriveProductionDate：生产 = 到期 +1 天 − 保质期月数（9/17 实战向量）', () => {
  // 柠泡泡：到期 2027-03-14、M=9 → 生产 2026-06-15（当日实测批次）
  assert.equal(deriveProductionDate('2027-03-14T00:00:00Z', 9), '2026-06-15')
  // 水：到期 2028-06-24、M=24 → 生产 2026-06-25
  assert.equal(deriveProductionDate('2028-06-24T00:00:00Z', 24), '2026-06-25')
  // 往返一致性：生产 + M 月 − 1 天 = 到期
  assert.equal(edate(edate('2027-03-15', -9), 9), '2027-03-15')
})

test('scanWindowSince：36 小时窗口、整点截断', () => {
  const now = new Date('2026-09-18T05:30:45.123Z')
  const since = scanWindowSince(now)
  assert.equal(since, '2026-09-16T17:00:00')
  assert.equal(SCAN_WINDOW_HOURS, 36)
})

test('filterRecentRecords：只保留窗口内更新，残段与 null 字段不崩', () => {
  const text =
    '[' +
    '{"epc":"30395DFA8332E48000ECE0C7","expiryDate":"2028-06-24T00:00:00Z","obs_time":"2026-06-25T13:14:44.100Z","update_date":"2026-09-17T08:17:36.000Z"},' +
    '{"epc":"30395DFA8332E48000E5B7FC","expiryDate":null,"obs_time":null,"update_date":"2026-09-10T00:00:00Z"},' +
    '{"epc":"30395DFA8332E48000E5B7FD","expiryDate":"2028-06-24T00:00:00Z","obs_time":"2026-06-25T13:14:44.100Z","update_date":"2026-09-17T00:00:00.000Z"}' +
    ']'
  const rows = filterRecentRecords(text, '2026-09-17T00:00:00')
  assert.equal(rows.length, 2, '窗口内应命中 2 条（边界时刻 >= 计入）')
  assert.equal(rows[0].epc, '30395DFA8332E48000ECE0C7')
  assert.equal(rows[0].exp, '2028-06-24T00:00:00Z')
  assert.equal(rows[1].upd, '2026-09-17T00:00:00.000Z')
  // 空数组与截断文本都不崩
  assert.deepEqual(filterRecentRecords('[]', '2026-09-17T00:00:00'), [])
  assert.equal(filterRecentRecords('[{"epc":"AA","update_date":"2026-09-18T00', '2026-09-17T00:00:00').length, 0)
})

test('buildScanPlan：区段展开为 10k 分片，无区段表商品跳过', () => {
  const plan = buildScanPlan([
    { item: '4688456', name: '柠泡泡', qty: 24 },
    { item: '9999999', name: '未知商品', qty: 1 }
  ])
  // 柠泡泡 zones [[1829000,2079000],[2960000,4894000]] → 25 + 194 = 219 段
  assert.equal(plan.segments.length, 219)
  assert.equal(plan.segments[0].comp, '358378')
  assert.equal(plan.segments[0].ir, '716614')
  assert.equal(plan.segments[0].from, 1_829_000)
  assert.equal(plan.segments[0].count, SEGMENT_SIZE)
  const sum = plan.segments.reduce((total, segment) => total + segment.count, 0)
  assert.equal(sum, 2_184_000, '分片覆盖应等于区段总跨度')
  assert.deepEqual(plan.skipped, ['9999999'])
})

test('judgeBatches：共现毫秒是主信号，产出日期与置信', () => {
  const mk = (epc, obs, exp, upd) => ({ epc, obs, exp, upd })
  const exp1 = '2027-03-14T00:00:00Z'
  const obs1 = '2026-06-15T22:44:52.295Z'
  // 柠泡泡 5 条：其中 5 条与另一商品同毫秒（共现）
  const lemon = []
  const water = []
  for (let index = 0; index < 5; index += 1) {
    lemon.push(mk(buildEpc('358378', '716614', 4_268_000 + index), obs1, exp1, `2026-09-17T06:40:27.${800 + index}Z`))
    water.push(mk(buildEpc('358378', '838546', 15_055_100 + index), '2026-06-25T13:14:41.479Z', '2028-06-24T00:00:00Z', `2026-09-17T06:40:27.${800 + index}Z`))
  }
  const judgements = judgeBatches({
    items: [
      { item: '4688456', name: '柠泡泡', qty: 24 },
      { item: '2074681', name: '天然矿泉水500ML', qty: 48 }
    ],
    records: { 4688456: lemon, 2074681: water }
  })
  const lemonRow = judgements.find((row) => row.item === '4688456')
  assert.equal(lemonRow.candidates.length, 1)
  assert.equal(lemonRow.candidates[0].coOccur, 5, '与另一商品同毫秒应全量计入共现')
  assert.equal(lemonRow.candidates[0].count, 5)
  assert.equal(lemonRow.confidence, 'medium', 'coOccur>=1 → 至少 medium')
  // 柠泡泡 M=9（保质期清单）→ 生产/预警均可推出
  assert.equal(lemonRow.shelfLifeMonths, 9)
  assert.equal(lemonRow.expiryDate, '2027-03-14')
  assert.equal(lemonRow.productionDate, '2026-06-15')
  assert.equal(lemonRow.warnOn, '2027-02-15')

  // 无共现、条数少 → low；无记录 → none
  const lonely = judgeBatches({
    items: [{ item: '4688456', name: '柠泡泡', qty: 1 }],
    records: { 4688456: [mk(buildEpc('358378', '716614', 1), obs1, exp1, '2026-09-17T01:00:00Z')] }
  })
  assert.equal(lonely[0].confidence, 'low')

  const empty = judgeBatches({ items: [{ item: '4688456', name: '柠泡泡', qty: 1 }], records: {} })
  assert.equal(empty[0].confidence, 'none')
  assert.equal(empty[0].productionDate, null)
  assert.match(empty[0].note, /未扫描到/u)
})

test('judgeBatches：高共现 + 足量条数 → high；无到期日时给出提示', () => {
  const lemon = []
  const water = []
  for (let index = 0; index < 12; index += 1) {
    const upd = index < 10 ? `2026-09-17T06:40:27.${100 + index}Z` : `2026-09-17T07:00:0${index}Z`
    lemon.push({ epc: buildEpc('358378', '716614', 4_300_000 + index), obs: '2026-06-15T22:44:52.295Z', exp: '2027-03-14T00:00:00Z', upd })
    if (index < 10) water.push({ epc: buildEpc('358378', '838546', 15_056_000 + index), obs: null, exp: null, upd })
  }
  const rows = judgeBatches({
    items: [
      { item: '4688456', name: '柠泡泡', qty: 24 },
      { item: '2074681', name: '天然矿泉水500ML', qty: 48 }
    ],
    records: { 4688456: lemon, 2074681: water }
  })
  const lemonRow = rows.find((row) => row.item === '4688456')
  assert.equal(lemonRow.confidence, 'high', '共现 >=10 且条数 >=8 → high')
  const waterRow = rows.find((row) => row.item === '2074681')
  assert.equal(waterRow.confidence, 'high', '水同样有 10 条共现')
  assert.equal(waterRow.productionDate, null, '无到期日的批次不产出生产日期')
  assert.match(waterRow.note, /无到期日/u)
})

test('parseReceptionId / isTodayReceipt / movementsWindow：收货流水回查口径', () => {
  assert.equal(parseReceptionId('reception_id:9701148468|sap_order:5348528795|package_id:97'), '9701148468')
  assert.equal(parseReceptionId('sap_order:1'), '')
  assert.equal(parseReceptionId(null), '')

  const row = { transaction_type: { code: '020', label: 'receipt' }, transaction_date: '2026-09-17T08:17:36Z' }
  assert.equal(isTodayReceipt(row, '2026-09-16T16:00:00'), true)
  assert.equal(isTodayReceipt(row, '2026-09-17T09:00:00'), false)
  assert.equal(isTodayReceipt({ ...row, transaction_type: { label: 'sale' } }, '2026-09-16T16:00:00'), false)
  assert.equal(isTodayReceipt(null, '2026-09-16T16:00:00'), false)

  // 窗口 [D-1, D+1)：单日窗口上游恒空（memory 101）
  const window = movementsWindow(new Date('2026-09-18T05:30:00Z'))
  assert.deepEqual(window, { start: '2026-09-17', end: '2026-09-19' })
  // 今日北京 0 点 = 前一日 16:00Z
  assert.equal(todayBjStartUtcIso(new Date('2026-09-18T05:30:00Z')), '2026-09-17T16:00:00')
})

test('数据表：区段表与保质期清单覆盖 9/17 全部 8 个食品', () => {
  const items = ['2074681', '4688456', '4630015', '4630013', '4420538', '5779131', '2723121', '4018780']
  for (const item of items) {
    assert.ok(FOOD_SCAN_ZONES[item], `${item} 应有扫描区段`)
    assert.ok(FOOD_SHELF_LIFE_BY_ITEM[item], `${item} 应在保质期清单`)
  }
  // 关键锚点：箱规（整盒数量）来自保质期清单，判定「整箱爆点」用
  assert.equal(FOOD_SHELF_LIFE_BY_ITEM['5779131'].boxQty, 10)
  assert.equal(FOOD_SHELF_LIFE_BY_ITEM['4018780'].boxQty, 7)
  assert.equal(FOOD_SHELF_LIFE_BY_ITEM['2074681'].boxQty, 24)
  assert.equal(FOOD_SHELF_LIFE_BY_ITEM['4688456'].boxQty, 24)
  // 已知清单偏差：畅爽能量胶清单写 24 个月，实测 12（2026-09-17 发现，留待核验暴露）
  assert.equal(FOOD_SHELF_LIFE_BY_ITEM['4018780'].months, 24)
})

test('aggregateRecords：每批一行摘要，含共现计数与序列证据（CPU 约束的核心）', () => {
  const lemon = []
  const water = []
  for (let index = 0; index < 6; index += 1) {
    const upd = index < 4 ? `2026-09-17T06:40:27.${800 + index}Z` : `2026-09-17T07:10:0${index}Z`
    lemon.push({ epc: buildEpc('358378', '716614', 4_268_000 + index), obs: '2026-06-15T22:44:52.295Z', exp: '2027-03-14T00:00:00Z', upd })
    if (index < 4) water.push({ epc: buildEpc('358378', '838546', 15_055_100 + index), obs: '2026-06-25T13:14:41.479Z', exp: '2028-06-24T00:00:00Z', upd })
  }
  const aggregates = aggregateRecords({ 4688456: lemon, 2074681: water })
  const lemonGroup = aggregates['4688456'][0]
  assert.equal(lemonGroup.count, 6)
  assert.equal(lemonGroup.coOccur, 4, '与另一商品同毫秒的 4 条应计入共现')
  assert.equal(lemonGroup.serialMin, 4_268_000)
  assert.equal(lemonGroup.serialMax, 4_268_005)
  assert.equal(lemonGroup.samples.length, 3)
  // 判定与「先聚合再判定」等价（同一数据集、同一算法——生产链路 = 测试链路）
  const onlyLemon = aggregateRecords({ 4688456: lemon })
  const viaAggregate = judgeAggregates([{ item: '4688456', name: '柠泡泡', qty: 24 }], onlyLemon)
  const viaRecords = judgeBatches({ items: [{ item: '4688456', name: '柠泡泡', qty: 24 }], records: { 4688456: lemon } })
  assert.deepEqual(viaAggregate[0].productionDate, viaRecords[0].productionDate)
  assert.deepEqual(viaAggregate[0].confidence, viaRecords[0].confidence)
  assert.deepEqual(viaAggregate[0].warnOn, viaRecords[0].warnOn)
})

test('aggregateRecords：按 score 截断到 200 组（小批大共现不被误裁）', () => {
  const rows = []
  // 220 个小组：其中一组共现极高（应保留在头部），其余无共现
  rows.push({ epc: buildEpc('358378', '716614', 1), obs: 'A', exp: '2027-03-14T00:00:00Z', upd: '2026-09-17T00:00:00.001Z' })
  for (let index = 0; index < 220; index += 1) {
    rows.push({ epc: buildEpc('358378', '716614', 10_000 + index), obs: `obs-${index}`, exp: '2027-03-14T00:00:00Z', upd: `2026-09-17T01:00:${String(index % 60).padStart(2, '0')}.000Z` })
  }
  const other = [{ epc: buildEpc('358378', '838546', 1), obs: 'W', exp: '2028-06-24T00:00:00Z', upd: '2026-09-17T00:00:00.001Z' }]
  const aggregates = aggregateRecords({ 4688456: rows, 2074681: other })
  assert.equal(aggregates['4688456'].length, AGGREGATE_LIMIT)
  assert.equal(aggregates['4688456'][0].obs, 'A', '共现组 score 最高，必须保留')
})

test('sanitizeAggregates：脏数据被丢弃、超限被截断', () => {
  const clean = sanitizeAggregates({
    A: [
      { obs: 'x', exp: '2027-03-14T00:00:00Z', count: 5, coOccur: 2, serialMin: 1, serialMax: 9, samples: ['e1'] },
      { obs: 'y', exp: null, count: 0, coOccur: 0 },
      'garbage',
      { count: 'NaN' }
    ],
    B: 'not-array'
  })
  assert.deepEqual(Object.keys(clean), ['A'])
  assert.equal(clean.A.length, 1)
  assert.equal(clean.A[0].count, 5)
  assert.deepEqual(sanitizeAggregates(null), {})
})
