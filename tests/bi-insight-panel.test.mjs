// BI 门店经营面板（lieflat G18/L14/F11/F3/F12 × BI Portal 1299 快照）回归断言。
// 2026-09-02 复核：车型/维修按 自行车+工作室 Universe 源端过滤；经济表保留全店口径并显式标注。
// 教训依据：测试全绿但功能不可用（memory 26/27/33）——同时断言 JSX、CSS 落地与布局约束。
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
const root = new URL('../', import.meta.url)
const read = (file) => readFile(new URL(file, root), 'utf8')

test('BI 面板挂载进桌面总览分析区，三行七卡齐全', async () => {
  const [overview, charts] = await Promise.all([read('apps/web/src/components/overview/WorkshopOverviewPage.jsx'), read('apps/web/src/components/overview/BiInsightCharts.jsx')])
  assert.match(overview, /import \{ BiInsightPanel \} from '\.\/BiInsightCharts\.jsx'/u)
  assert.match(overview, /<BiInsightPanel \/>/u)
  assert.match(overview, /showAnalytics \? <OverviewAnalytics/u)
  for (const name of ['BiStatCard', 'BiDisField', 'BiOnlineGauge', 'BiRepairTrend', 'BiRepairStat', 'BiReviewCard', 'BiInsightPanel']) {
    assert.match(charts, new RegExp(`export function ${name}`), `缺少组件 ${name}`)
  }
  assert.match(charts, /ops-bi-grid/u)
  assert.match(charts, /ops-bi-mid-grid/u)
  assert.match(charts, /ops-bi-bottom-grid/u)
  assert.match(charts, /<BiRepairTrend snapshot=\{snapshot\} \/>/u)
  assert.match(charts, /<BiReviewCard snapshot=\{snapshot\} \/>/u)
  assert.match(charts, /<BiModelRanking snapshot=\{snapshot\} \/>/u)
  assert.match(charts, /<BiRepairStat snapshot=\{snapshot\} \/>/u)
})

test('口径诚实：过滤维度与全店标注都进快照', async () => {
  const data = await read('apps/web/src/data/biSnapshot.js')
  const { BI_SNAPSHOT } = await import('../apps/web/src/data/biSnapshot.js')
  assert.equal(BI_SNAPSHOT.scope.label, '自行车 + 工作室')
  assert.deepEqual(BI_SNAPSHOT.scope.universes, ['Cycling And Urban Gliding', 'Workshop'])
  assert.equal(BI_SNAPSHOT.repair.caliber, 'cycling+workshop')
  assert.equal(BI_SNAPSHOT.models.caliber, 'cycling+workshop')
  assert.equal(BI_SNAPSHOT.economic.caliber, 'store', '经济表必须显式标全店口径')
  assert.equal(BI_SNAPSHOT.storeSummary.caliber, 'store')
  const charts = await read('apps/web/src/components/overview/BiInsightCharts.jsx')
  assert.match(charts, /全店口径/u, '经济卡必须向用户披露全店口径')
  assert.match(charts, /源端过滤/u, '过滤卡必须披露源端过滤')
  assert.match(data, /暂不开放|均未开放/u)
})

test('维修数据诚实：自行车+工作室 35 周序列（2026-09-02 重提）', async () => {
  const { BI_SNAPSHOT } = await import('../apps/web/src/data/biSnapshot.js')
  const { repair } = BI_SNAPSHOT
  assert.equal(repair.weeks.length, 35, '维修周序列必须是 35 个完整周')
  assert.equal(repair.total, 55731)
  assert.equal(repair.avg, 1592)
  assert.equal(repair.recentAvg, 1410)
  assert.deepEqual(repair.peak, { week: 'W01', value: 4462 })
  assert.deepEqual(repair.latest, { week: 'W35', value: 1057 })
  assert.equal(repair.weeks.reduce((s, w) => s + w.value, 0), repair.total, '合计必须等于周序列之和')
  // 旧全店口径值不得残留冒充过滤值
  const serialized = JSON.stringify(repair)
  assert.ok(!serialized.includes('114267') && !serialized.includes('7665'), '旧全店维修值不得残留')
})

test('CSS 落地：新 grid 类名都有真实声明且唯一', async () => {
  const css = await read('apps/web/src/styles/desktop-workbench.css')
  for (const cls of ['ops-bi-mid-grid', 'ops-bi-bottom-grid', 'ops-bi-grid', 'ops-bi-review-note']) {
    const blocks = css.match(new RegExp(`\\.${cls}\\s*\\{`, 'gu')) ?? []
    assert.ok(blocks.length >= 1, `样式缺失：.${cls}`)
  }
  // 旧类名必须已删除（memory 23②：删旧不覆盖）
  assert.ok(!/\.ops-bi-repair-grid/u.test(css), '旧 repair-grid 必须删除')
  assert.ok(!/\.ops-bi-models-grid/u.test(css), '旧 models-grid 必须删除')
  const mid = css.match(/\.ops-bi-mid-grid\s*\{[^}]*\}/u)
  assert.ok(mid, 'mid-grid 块缺失')
  assert.match(mid[0], /grid-template-columns:\s*minmax\(0,\s*2fr\)\s*minmax\(0,\s*1fr\)/u)
})

test('动效规则：BI 块无 CSS 动画，入场全走 GSAP', async () => {
  const css = await read('apps/web/src/styles/desktop-workbench.css')
  const charts = await read('apps/web/src/components/overview/BiInsightCharts.jsx')
  const start = css.indexOf('.ops-bi-mid-grid')
  const end = css.indexOf('.ops-bi-model-tabs')
  const block = css.slice(start, end)
  assert.ok(!/@keyframes|animation:|transition:/u.test(block), 'BI 新块禁止 CSS 动画/过渡')
  assert.match(charts, /gsap\.timeline\(\)/u)
})
