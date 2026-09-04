// 2026-09-02 终版：BI 移入销售数据场景 + 移动端独立实现（memory 23① 双端独立）。
// 总览页恢复原样（保留销售卡），不再塞 BI。
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
const root = new URL('../', import.meta.url)
const read = (file) => readFile(new URL(file, root), 'utf8')

test('销售场景换血：BI 双端挂载，闭店入口保留，总览恢复原样', async () => {
  const [scene, overview] = await Promise.all([
    read('apps/web/src/scenes/SalesScene.jsx'),
    read('apps/web/src/components/overview/WorkshopOverviewPage.jsx'),
  ])
  assert.match(scene, /useViewportKind/u, '运行时视口择一挂载')
  assert.match(scene, /viewport === 'desktop' \? <BiInsightPanel \/> : <BiSalesMobile \/>/u)
  assert.match(scene, /operationSummary|onEditKpi|kpiReady/u, '闭店流程字段保留')
  // 总览页恢复：有销售卡、有索引、无 BI、无左栏包装
  assert.match(overview, /function SalesVehiclesPanel/u)
  assert.match(overview, /function operationSummary/u)
  assert.match(overview, /function displayMetric/u)
  assert.doesNotMatch(overview, /ops-overview-left/u, '总览左栏包装必须移除')
  assert.doesNotMatch(overview, /BiSalesMobile/u, '总览不得挂移动 BI')
})

test('移动端 BI 独立实现：组件与 CSS 齐全', async () => {
  const mobile = await read('apps/web/src/components/overview/BiSalesMobile.jsx')
  const css = await read('apps/web/src/styles/mobile-bi.css')
  // 2026-09-04 第二轮：BimStat/BimDis 替换为 BI×CIS 对比卡 BimCompare。
  for (const name of ['BimCompare', 'BimGauge', 'BimRepair', 'BimRanking', 'BimReview']) {
    assert.match(mobile, new RegExp(`function ${name}`), `缺少移动卡 ${name}`)
  }
  assert.match(mobile, /ops-bim-panel/u)
  for (const cls of ['ops-bim-card', 'ops-bim-compare-table', 'ops-bim-compare-row', 'ops-bim-tabs', 'ops-bim-pill', 'ops-bim-tab', 'ops-bim-rows', 'ops-bim-row', 'ops-bim-bar', 'ops-bim-note', 'ops-bim-chart']) {
    assert.match(css, new RegExp(`\\.${cls}[\\s>{]`, 'u'), `移动样式缺失 .${cls}`)
  }
  assert.match(css, /\.ops-bim-row\s*\{[^}]*minmax\(0,\s*1fr\)/u)
  assert.match(css, /\.ops-bim-bar\s*>\s*i\s*\{[^}]*transform-origin:\s*left/u)
  assert.ok(!/@keyframes|animation:|transition:/u.test(css), 'mobile-bi.css 禁止 CSS 动画')
  assert.ok(!/\.ops-bim-main|\.ops-bim-extra|\.ops-bim-stat/u.test(css), '已删卡的死样式必须清干净')
  assert.match(mobile, /gsap\.to\(pill/u, '分段滑块走 GSAP')
})

test('移动端左栏透明（display:contents），销售卡样式回归', async () => {
  const mo = await read('apps/web/src/styles/mobile-overview.css')
  assert.match(mo, /\.ops-sales-panel/u, '移动端销售卡样式必须回归')
})
