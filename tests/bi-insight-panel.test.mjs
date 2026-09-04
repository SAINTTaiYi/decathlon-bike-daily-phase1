// BI 门店经营面板（lieflat G18/L14/F11/F3/F12 × BI Portal 1299 快照）回归断言。
// 2026-09-02 终版：BI 数据挂载在「销售数据」场景（SalesScene），总览页保持原样不塞 BI。
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
const root = new URL('../', import.meta.url)
const read = (file) => readFile(new URL(file, root), 'utf8')

test('BI 面板组件齐全，且只挂载进销售数据场景', async () => {
  const [charts, scene, overview] = await Promise.all([
    read('apps/web/src/components/overview/BiInsightCharts.jsx'),
    read('apps/web/src/scenes/SalesScene.jsx'),
    read('apps/web/src/components/overview/WorkshopOverviewPage.jsx'),
  ])
  // 2026-09-04 第二轮：原 G18/L14 单源卡（BiStatCard/BiDisField）替换为 BI×CIS 双源对比卡。
  for (const name of ['BiSourceCompare', 'BiOnlineGauge', 'BiRepairTrend', 'BiRepairStat', 'BiReviewCard', 'BiModelRanking', 'BiInsightPanel']) {
    assert.match(charts, new RegExp(`export function ${name}`), `缺少组件 ${name}`)
  }
  // 销售场景挂 BI（桌面面板），并保留闭店填写入口
  assert.match(scene, /<BiInsightPanel \/>/u)
  assert.match(scene, /sales-bi-slot/u)
  assert.match(scene, /onEditKpi/u, '闭店填写入口必须保留')
  // 总览页不再塞 BI，恢复原销售卡 + 索引 + 分析区
  assert.doesNotMatch(overview, /BiInsightPanel/u, '总览页不得再挂 BI 面板')
  assert.match(overview, /<SalesVehiclesPanel/u)
  assert.match(overview, /<OperationsIndex/u)
})

test('口径诚实：过滤维度与全店标注都进快照', async () => {
  const { BI_SNAPSHOT } = await import('../apps/web/src/data/biSnapshot.js')
  assert.equal(BI_SNAPSHOT.scope.label, '自行车 + 工作室')
  assert.deepEqual(BI_SNAPSHOT.scope.universes, ['Cycling And Urban Gliding', 'Workshop'])
  assert.equal(BI_SNAPSHOT.repair.caliber, 'cycling+workshop')
  assert.equal(BI_SNAPSHOT.models.caliber, 'cycling+workshop')
  assert.equal(BI_SNAPSHOT.economic.caliber, 'store')
  const charts = await read('apps/web/src/components/overview/BiInsightCharts.jsx')
  assert.match(charts, /全店口径/u)
  assert.match(charts, /源端过滤/u)
})

test('维修数据诚实：自行车+工作室 35 周序列', async () => {
  const { BI_SNAPSHOT } = await import('../apps/web/src/data/biSnapshot.js')
  const { repair } = BI_SNAPSHOT
  assert.equal(repair.weeks.length, 35)
  assert.equal(repair.total, 55731)
  assert.equal(repair.avg, 1592)
  assert.equal(repair.weeks.reduce((s, w) => s + w.value, 0), repair.total)
})

test('CSS 落地：BI 面板 grid 类名都有真实声明', async () => {
  const css = await read('apps/web/src/styles/desktop-workbench.css')
  for (const cls of ['ops-bi-grid', 'ops-bi-mid-grid', 'ops-bi-bottom-grid', 'ops-bi-card']) {
    assert.match(css, new RegExp(`\\.${cls}[\\s{]`, 'u'), `样式缺失 .${cls}`)
  }
})
