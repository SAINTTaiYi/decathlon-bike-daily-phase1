// BI 面板第三/四行（车型销售榜 + 评价 360 哑铃 + 维修统计）回归断言。
// 2026-09-02 复核：榜单按 自行车+工作室 Universe 源端过滤（不能多也不能少）。
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
const root = new URL('../', import.meta.url)
const read = (file) => readFile(new URL(file, root), 'utf8')

test('面板底行挂载：销售榜 + 维修统计，评价哑铃在中行', async () => {
  const charts = await read('apps/web/src/components/overview/BiInsightCharts.jsx')
  for (const name of ['BiModelRanking', 'BiReviewCard', 'BiRepairStat']) {
    assert.match(charts, new RegExp(`export function ${name}`), `缺少组件 ${name}`)
  }
  assert.match(charts, /ops-bi-bottom-grid/u)
  assert.match(charts, /MODEL_TABS/u)
  assert.match(charts, /gsap\.to\(pill/u)
  assert.match(charts, /ops-bi-model-pill/u)
  // 评价卡 = F12 Dumbbell Queue（批次内模板不重复，memory skill 规则）
  assert.match(charts, /DUMBBELL QUEUE/u)
  assert.match(charts, /ONE BEAD = ONE ENTITY/u)
})

test('车型榜过滤诚实：纯车品，非车编码零残留', async () => {
  const { BI_SNAPSHOT } = await import('../apps/web/src/data/biSnapshot.js')
  const { models } = BI_SNAPSHOT
  assert.equal(models.top.length, 10)
  assert.equal(models.flop.length, 10)
  assert.match(models.week, /2026-08-23/u)
  for (const row of [...models.top, ...models.flop]) {
    assert.deepEqual(Object.keys(row).sort(), ['code', 'model', 'qty', 'rank', 'share', 'to', 'wow', 'yoy'])
    assert.ok(Number.isInteger(row.qty) && row.qty >= 0)
    assert.ok(typeof row.to === 'number' && row.to > 0)
  }
  // 2026-09-02 Universe 过滤后定案锚点
  assert.equal(models.top[0].model, '26" EXPL 500 CN YELLOW')
  assert.equal(models.top[0].to, 1479.9)
  assert.equal(models.top[0].share, 18.0)
  assert.equal(models.flop[0].model, 'TUC 520 ELOPS LF CN dark blue')
  assert.equal(models.flop[0].wow, -99.0)
  // 不能多：旧全店榜里的非车品编码必须零残留
  const codes = [...models.top, ...models.flop].map(r => r.code)
  for (const bad of ['8363990', '8930219', '8798188', '8969343', '8655827', '8495330']) {
    assert.ok(!codes.includes(bad), `非车品编码 ${bad} 不得进入过滤榜`)
  }
})

test('全渠道车型：M218 按 Sports Sales 过滤，合计为全聚合口径', async () => {
  const { BI_SNAPSHOT } = await import('../apps/web/src/data/biSnapshot.js')
  const charts = await read('apps/web/src/components/overview/BiInsightCharts.jsx')
  const { allChannel } = BI_SNAPSHOT.models
  assert.equal(allChannel.rows.length, 17, '快照保留有销量的 17 行（零额行剔除）')
  assert.match(await read('apps/web/src/components/overview/BiInsightCharts.jsx'), /allChannel\.rows\.slice\(0, 10\)/u, '上屏必须截前 10')
  assert.equal(allChannel.total.qty, 107, '合计=21 个车型全聚合（每渠道前 5 口径）')
  assert.equal(allChannel.total.to, 89258.42)
  const sorted = [...allChannel.rows].sort((a, b) => b.qty - a.qty)
  assert.deepEqual(allChannel.rows, sorted, '全量行必须按销量降序')
  for (const row of allChannel.rows) {
    assert.ok(Number.isInteger(row.qty) && row.qty >= 0, '允许周销量 0 的上榜车型（有额无件）')
    assert.ok(row.channels, '每行必须标渠道构成')
  }
  assert.equal(allChannel.rows[0].code, '8640568')
  assert.equal(allChannel.rows[0].qty, 26)
  const rc = allChannel.rows.find(r => r.code === '9010483')
  assert.equal(rc.qty, 12)
  assert.match(rc.channels, /Tmall 7/u)
  assert.match(charts, /key: 'allChannel', label: '全渠道车型'/u)
  assert.match(charts, /ALL CHANNEL TOP SALES · BI M218/u)
})

test('评价 360 哑铃：三实体定案值与明细不可用披露', async () => {
  const { BI_SNAPSHOT } = await import('../apps/web/src/data/biSnapshot.js')
  const charts = await read('apps/web/src/components/overview/BiInsightCharts.jsx')
  const { review } = BI_SNAPSHOT
  assert.equal(review.score360, 33.09)
  assert.equal(review.rankChina, 189)
  assert.equal(review.benchmark.china, 65.89)
  assert.equal(review.benchmark.zone, 66.29)
  assert.equal(review.till.satisfaction, 99.28)
  assert.equal(review.detail.available, false, '明细不可用必须显式披露')
  assert.match(charts, /review\.detail\.note/u, '评价卡必须展示明细待补注记')
  assert.match(charts, /review\.benchmark\.zone/u, '哑铃必须含南区珠')
})

test('CSS 落地：车型榜类名齐全，旧 grid 已删', async () => {
  const css = await read('apps/web/src/styles/desktop-workbench.css')
  const classes = [
    'ops-bi-bottom-grid', 'ops-bi-models-card', 'ops-bi-model-tabs', 'ops-bi-model-pill',
    'ops-bi-model-tab', 'ops-bi-model-basis', 'ops-bi-model-rows', 'ops-bi-model-row',
    'ops-bi-model-bar', 'ops-bi-review-note', 'ops-bi-review-card'
  ]
  for (const cls of classes) {
    assert.match(css, new RegExp(`\\.${cls}[\\s>]`, 'u'), `样式缺失：.${cls}`)
  }
  assert.ok(!/\.ops-bi-models-grid/u.test(css))
  assert.match(css, /\.ops-bi-model-tabs\s*\{[^}]*position:\s*relative/u)
  assert.match(css, /\.ops-bi-model-pill\s*\{[^}]*position:\s*absolute/u)
  assert.match(css, /\.ops-bi-model-row\s*\{[^}]*minmax\(0,\s*1fr\)/u)
  assert.match(css, /\.ops-bi-model-row\s*>\s*\.name\s*\{[^}]*text-overflow:\s*ellipsis/u)
})

test('布局约束：底行轨道唯一 2fr:1fr，禁止降列', async () => {
  const css = await read('apps/web/src/styles/desktop-workbench.css')
  const blocks = css.match(/\.ops-bi-bottom-grid\s*\{[^}]*\}/gu) ?? []
  assert.equal(blocks.length, 1, '底行轨道只允许一处声明')
  assert.match(blocks[0], /grid-template-columns:\s*minmax\(0,\s*2fr\)\s*minmax\(0,\s*1fr\)/u)
  assert.ok(!/repeat\(2/u.test(blocks[0]), '禁止按宽度降列')
})
