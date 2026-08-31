// BI 门店经营面板（lieflat G18/L14/F11 × BI Portal 1299 快照）回归断言。
// 教训依据：测试全绿但功能不可用（memory 26/27）——本文件同时断言
// JSX 结构、CSS 落地（每个类名都有真实声明）与布局约束，不做仅查 token 的假断言。
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
const root = new URL('../', import.meta.url)
const read = (file) => readFile(new URL(file, root), 'utf8')

test('BI 面板挂载进桌面总览分析区，三卡齐全', async () => {
  const [overview, charts] = await Promise.all([read('apps/web/src/components/overview/WorkshopOverviewPage.jsx'), read('apps/web/src/components/overview/BiInsightCharts.jsx')])
  assert.match(overview, /import \{ BiInsightPanel \} from '\.\/BiInsightCharts\.jsx'/u)
  assert.match(overview, /<BiInsightPanel \/>/u)
  // 面板位于 OverviewAnalytics（showAnalytics 桌面门控内），不改动既有门控
  assert.match(overview, /showAnalytics \? <OverviewAnalytics/u)
  assert.match(charts, /export function BiStatCard/u)
  assert.match(charts, /export function BiDisField/u)
  assert.match(charts, /export function BiOnlineGauge/u)
  assert.match(charts, /export function BiInsightPanel/u)
})

test('数据诚实：快照值、单位注记与 100 点账目', async () => {
  const [data, charts] = await Promise.all([read('apps/web/src/data/biSnapshot.js'), read('apps/web/src/components/overview/BiInsightCharts.jsx')])
  // 2026-08-31 链路实测值不得漂移
  for (const value of ['427916', '-0.1044', '1912284', '309252', '0.318', '61299', '56503', '118623', "'1299'"]) {
    assert.ok(data.includes(value), `快照缺少实测值 ${value}`)
  }
  assert.match(data, /capturedAt: '2026-08-31'/u)
  // 单位注记：1 点/1 刻度 = 1 个百分点，图内账目 52+48=100 与未捕捉残差
  assert.match(charts, /1 点 = DIS 的 1 个百分点/u)
  assert.match(charts, /1 刻度 = 门店 TO 的 1%/u)
  assert.match(charts, /ONE DOT = 1% OF DIS/u)
  assert.match(charts, /另 0\.7% 未捕捉/u)
  assert.match(charts, /ONE TICK = 1% OF STORE TO/u)
  // 面板头如实标注 SNAPSHOT，不冒充 LIVE
  assert.match(charts, /SNAPSHOT · /u)
  assert.doesNotMatch(charts, /LIVE · BI/u)
})

test('动效遵循工作台规则：GSAP 驱动 + reveal 重播 + reduced-motion 直达终态', async () => {
  const charts = await read('apps/web/src/components/overview/BiInsightCharts.jsx')
  assert.match(charts, /import \{ gsap \} from 'gsap'/u)
  assert.match(charts, /gsap\.timeline\(\)/u)
  assert.match(charts, /prefers-reduced-motion: reduce/u)
  // reduced 时不建时间线（直达终态），revealed/replay 语义保留
  assert.match(charts, /if \(!node \|\| reduced \|\| !revealed\) return undefined/u)
  assert.match(charts, /IntersectionObserver/u)
  assert.match(charts, /点击或按 Enter 重播入场动画/u)
  // 可访问性：图表可聚焦、有文字替代
  assert.match(charts, /role="img"/u)
  assert.match(charts, /tabIndex="0"/u)
  assert.match(charts, /aria-label/u)
  // 确定性伪随机（mono-tokens 血统），禁用 Math.random
  assert.match(charts, /\(i \* 73856093\) \^ \(k \* 19349663\)/u)
  assert.doesNotMatch(charts, /Math\.random/u)
})

test('CSS 落地：每个 BI 类名都有真实声明，布局约束不降级', async () => {
  const css = await read('apps/web/src/styles/desktop-workbench.css')
  // 每个组件用到的类名在桌面样式表中有声明（防「测试全绿但样式缺失」）
  for (const selector of ['.ops-bi-panel', '.ops-bi-grid', '.ops-bi-card', '.ops-bi-stat-card', '.ops-bi-stat-main', '.ops-bi-yoy', '.ops-bi-stat-extra', '.ops-bi-chart']) {
    assert.ok(new RegExp(`${selector.replace(/\./g, '\\.')}[^{]*\\{`).test(css), `样式缺失：${selector}`)
  }
  // 面板横跨分析网格两列
  assert.match(css, /\.ops-bi-panel \{ grid-column: 1 \/ -1/u)
  // 三卡任何宽度都并排（用户硬规则：禁止按宽度降列数）
  const columnRules = css.match(/\.ops-bi-grid[^{]*\{[^}]*grid-template-columns:[^}]*\}/gu) ?? []
  assert.equal(columnRules.length, 1, 'ops-bi-grid 的列轨道只允许一处声明')
  assert.match(columnRules[0], /repeat\(3, minmax\(0, 1fr\)\)/u)
  assert.doesNotMatch(css, /\.ops-bi-grid[^{]*\{[^}]*repeat\(2/u)
  assert.doesNotMatch(css, /\.ops-bi-card[^{]*\{[^}]*grid-column: 1 \/ -1/u)
  // SVG 变换锚定自身包围盒（GSAP scale 不跑偏）
  assert.match(css, /\.ops-bi-chart \[data-bi-dot\][^{]*\{ transform-box: fill-box/u)
  // 填充不由 BI 块私自刷实心（归 frosted.css 统一管）
  assert.doesNotMatch(css, /\.ops-bi-card \{[^}]*background:/u)
  assert.doesNotMatch(css, /\.ops-bi-panel \{[^}]*background:/u)
})
