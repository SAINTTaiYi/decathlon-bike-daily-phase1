// 2026-09-02：BI 数据移入销售数据模块 + 移动端 BI（memory 23① 双端独立实现）。
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
const root = new URL('../', import.meta.url)
const read = (file) => readFile(new URL(file, root), 'utf8')

test('销售模块换血：旧 KPI 销售组件删除，BI 双端挂载', async () => {
  const overview = await read('apps/web/src/components/overview/WorkshopOverviewPage.jsx')
  assert.ok(!/SalesVehiclesPanel/u.test(overview), '旧销售面板组件必须删除')
  assert.ok(!/kpiItems/u.test(overview), '旧 KPI 列表必须删除')
  assert.match(overview, /ops-sales-slot/u, '销售模块槽位保留')
  assert.match(overview, /useViewportKind/u, '运行时视口择一挂载')
  assert.match(overview, /viewport === 'desktop' \? <BiInsightPanel \/> : <BiSalesMobile \/>/u, '桌面 BI / 移动 BI 双实现')
  assert.match(overview, /ops-overview-left/u, '桌面左栏包装存在')
  assert.match(overview, /function operationSummary/u, '台账索引摘要函数不得误删')
  assert.match(overview, /operationSummary\(workflow\)/u)
})

test('移动端 BI 独立实现：组件与 CSS 齐全', async () => {
  const mobile = await read('apps/web/src/components/overview/BiSalesMobile.jsx')
  const css = await read('apps/web/src/styles/mobile-bi.css')
  for (const name of ['BimStat', 'BimDis', 'BimGauge', 'BimRepair', 'BimRanking', 'BimReview']) {
    assert.match(mobile, new RegExp(`function ${name}`), `缺少移动卡 ${name}`)
  }
  assert.match(mobile, /ops-bim-panel/u)
  for (const cls of ['ops-bim-card', 'ops-bim-main', 'ops-bim-extra', 'ops-bim-tabs', 'ops-bim-pill', 'ops-bim-tab', 'ops-bim-rows', 'ops-bim-row', 'ops-bim-bar', 'ops-bim-note', 'ops-bim-chart', 'ops-bim-sub', 'ops-bim-src']) {
    assert.match(css, new RegExp(`\\.${cls}[\\s>{]`, 'u'), `移动样式缺失 .${cls}`)
  }
  // 行截断与左起条（memory 25/27 同款约束）
  assert.match(css, /\.ops-bim-row\s*\{[^}]*minmax\(0,\s*1fr\)/u)
  assert.match(css, /\.ops-bim-row\s*>\s*\.name\s*\{[^}]*text-overflow:\s*ellipsis/u)
  assert.match(css, /\.ops-bim-bar\s*>\s*i\s*\{[^}]*transform-origin:\s*left/u)
  // 动效全 GSAP，移动 CSS 无动画/过渡
  assert.ok(!/@keyframes|animation:|transition:/u.test(css), 'mobile-bi.css 禁止 CSS 动画')
  assert.match(mobile, /gsap\.to\(pill/u, '分段滑块走 GSAP')
})

test('旧销售样式全清：三个 CSS 文件零残留', async () => {
  const dw = await read('apps/web/src/styles/desktop-workbench.css')
  const mo = await read('apps/web/src/styles/mobile-overview.css')
  const fr = await read('apps/web/src/styles/frosted.css')
  for (const css of [dw, mo, fr]) {
    assert.ok(!/ops-sales-panel/u.test(css), 'ops-sales-panel 残留')
    assert.ok(!/ops-kpi-grid/u.test(css), 'ops-kpi-grid 残留')
    assert.ok(!/ops-blueprint/u.test(css), 'ops-blueprint 残留')
  }
  // 桌面新布局：左栏 + 销售槽各一处
  const left = dw.match(/\.ops-overview-left\s*\{[^}]*\}/gu) ?? []
  assert.ok(left.length >= 1, '桌面左栏规则缺失')
  assert.match(dw, /\.ops-mobile-overview > \.ops-sales-slot\s*\{[^}]*grid-column:\s*2/u)
})

test('移动端左栏 display:contents，桌面左栏成列', async () => {
  const mo = await read('apps/web/src/styles/mobile-overview.css')
  assert.match(mo, /\.ops-overview-left\s*\{\s*display:\s*contents/u, '移动端左栏必须透明')
})
