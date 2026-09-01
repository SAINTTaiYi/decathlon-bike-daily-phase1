// BI 面板第三行（商品销售榜 + 顾客评价 360 分）回归断言。
// 依据 memory 26/27/33 教训：测试全绿但功能不可用——同时断言
// JSX 结构、CSS 落地（每个类名都有真实声明）、布局约束与数据诚实。
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
const root = new URL('../', import.meta.url)
const read = (file) => readFile(new URL(file, root), 'utf8')

test('第三行挂载：销售榜 + 评价卡组件齐全并装进面板', async () => {
  const charts = await read('apps/web/src/components/overview/BiInsightCharts.jsx')
  for (const name of ['BiModelRanking', 'BiReviewCard']) {
    assert.match(charts, new RegExp(`export function ${name}`), `缺少组件 ${name}`)
  }
  assert.match(charts, /ops-bi-models-grid/u)
  assert.match(charts, /<BiModelRanking snapshot=\{snapshot\} \/>/u)
  assert.match(charts, /<BiReviewCard snapshot=\{snapshot\} \/>/u)
  // TOP/FLOP 切换与 GSAP 滑块（动效全 GSAP，memory 22）
  assert.match(charts, /MODEL_TABS/u)
  assert.match(charts, /gsap\.to\(pill/u)
  assert.match(charts, /ops-bi-model-pill/u)
})

test('车型榜数据诚实：Top/Flop 各 10 行，数量/金额/占比/同比/环比全定案', async () => {
  const { BI_SNAPSHOT } = await import('../apps/web/src/data/biSnapshot.js')
  const { models } = BI_SNAPSHOT
  assert.equal(models.top.length, 10)
  assert.equal(models.flop.length, 10)
  assert.match(models.week, /2026-08-23/u)
  for (const row of [...models.top, ...models.flop]) {
    assert.deepEqual(Object.keys(row).sort(), ['code', 'model', 'qty', 'rank', 'share', 'to', 'wow', 'yoy'], '行字段必须是定案列集合')
    assert.ok(typeof row.share === 'number')
    assert.ok(Number.isInteger(row.qty) && row.qty >= 0, 'qty 必须是非负整数')
    assert.ok(typeof row.to === 'number' && row.to > 0, 'to 必须是正金额')
    assert.ok(row.yoy === null || typeof row.yoy === 'number')
    assert.ok(row.wow === null || typeof row.wow === 'number')
  }
  // 2026-09-01 两轮提取定案锚点（占比=zone 解码，数量/金额=DataTable 直读）
  assert.equal(models.top[0].model, '26" EXPL 500 CN YELLOW')
  assert.equal(models.top[0].share, 4.5)
  assert.equal(models.top[0].qty, 1)
  assert.equal(models.top[0].to, 1479.9)
  assert.equal(models.top[8].qty, 4)
  assert.equal(models.top[8].to, 510.14)
  assert.equal(models.top[8].wow, 292.7)
  assert.equal(models.top[6].yoy, -3.0)
  assert.equal(models.flop[0].model, 'MINERAL WATER 500ML*')
  assert.equal(models.flop[0].to, 2.85)
  assert.equal(models.flop[0].yoy, -80.1)
  assert.equal(models.flop[0].wow, -66.7)
  assert.equal(models.flop[1].qty, 0)
  // 口径纠错：旧轮误标的"同比"实为环比——快照必须区分两列，不得合并
  assert.ok('wow' in models.top[1] && 'yoy' in models.top[1])
  // 口径未定案的度量（1K/0K 格式化串等）不得进入快照
  const serialized = JSON.stringify(models)
  assert.ok(!serialized.includes('1K') && !serialized.includes('Calculation_'), '未定案度量不得上屏')
})

test('全渠道车型：M218 渠道榜聚合，数量与合计诚实', async () => {
  const { BI_SNAPSHOT } = await import('../apps/web/src/data/biSnapshot.js')
  const charts = await read('apps/web/src/components/overview/BiInsightCharts.jsx')
  const { allChannel } = BI_SNAPSHOT.models
  assert.ok(allChannel && Array.isArray(allChannel.rows) && allChannel.rows.length === 9, '全渠道榜应为 9 行车型')
  for (const row of allChannel.rows) {
    assert.deepEqual(Object.keys(row).sort(), ['channel', 'code', 'model', 'qty', 'rank', 'to'], '全渠道行字段固定')
    assert.ok(Number.isInteger(row.qty) && row.qty >= 1, '全渠道行只收录有销量的车型')
    assert.ok(typeof row.to === 'number' && row.to > 0)
    assert.ok(row.channel, '每行必须标渠道')
  }
  // 2026-09-01 M218 直读定案锚点
  assert.equal(allChannel.rows[0].code, '8871303')
  assert.equal(allChannel.rows[0].qty, 13)
  assert.equal(allChannel.rows[0].to, 8943.61)
  assert.equal(allChannel.rows[0].channel, '到店')
  assert.equal(allChannel.total.qty, 26)
  assert.equal(allChannel.total.to, 25906.89)
  // 合计必须等于各行之和（防口径漂移）
  assert.equal(allChannel.rows.reduce((sum, row) => sum + row.qty, 0), allChannel.total.qty)
  assert.ok(Math.abs(allChannel.rows.reduce((sum, row) => sum + row.to, 0) - allChannel.total.to) < 0.01)
  // 组件必须有三标签与全渠道渲染分支
  assert.match(charts, /key: 'allChannel', label: '全渠道车型'/u)
  assert.match(charts, /models\.allChannel\.rows/u)
  assert.match(charts, /ALL CHANNEL TOP SALES · BI M218/u)
})

test('评价数据诚实：门店级定案值齐全，疑似池值不得冒充', async () => {
  const { BI_SNAPSHOT } = await import('../apps/web/src/data/biSnapshot.js')
  const { review } = BI_SNAPSHOT
  assert.match(review.report, /M243/u)
  assert.equal(review.score360, 33.09)
  assert.equal(review.rankChina, 189)
  assert.equal(review.rankZone, 48)
  assert.equal(review.benchmark.china, 65.89)
  assert.equal(review.benchmark.zone, 66.29)
  assert.equal(review.till.satisfaction, 99.28)
  assert.equal(review.till.coverage, 68)
  assert.equal(review.till.orders, 2466)
  assert.equal(review.till.prevOrders, 2904)
  assert.match(review.week, /2026-08-22/u)
  // 2026-09-01 前未定案的池尾疑似值不得作为门店分数上屏
  for (const bogus of [87.27, 82.73, 94.44, 92.86]) {
    assert.notEqual(review.score360, bogus, `疑似池值 ${bogus} 不得冒充门店 360 分`)
  }
  assert.match(review.newReviews.note, /无新增评论/u)
})

test('CSS 落地：每个新类名都有真实声明（防样式缺失假绿）', async () => {
  const css = await read('apps/web/src/styles/desktop-workbench.css')
  const classes = [
    'ops-bi-models-grid', 'ops-bi-models-card', 'ops-bi-model-tabs', 'ops-bi-model-pill',
    'ops-bi-model-tab', 'ops-bi-model-basis', 'ops-bi-model-rows', 'ops-bi-model-row',
    'ops-bi-model-bar', 'ops-bi-review-note'
  ]
  for (const cls of classes) {
    const re = new RegExp(`\\.${cls}\\s*\\{`, 'u')
    assert.match(css, re, `样式缺失：.${cls}`)
  }
  assert.match(css, /\.ops-bi-model-row\s*>\s*\.rank\s*\{/u)
  assert.match(css, /\.ops-bi-model-row\s*>\s*\.name\s*\{/u)
  assert.match(css, /\.ops-bi-model-row\s*>\s*\.val\s*\{/u)
  assert.match(css, /\.ops-bi-model-row\s*>\s*\.val\s+b\s*\{/u)
  assert.match(css, /\.ops-bi-model-row\s*>\s*\.val\s+small\s*\{/u)
  assert.match(css, /\.ops-bi-model-bar\s*>\s*i\s*\{/u)
  assert.match(css, /\.ops-bi-review-card\s+\.ops-bi-stat-extra\s*\{/u)
})

test('布局约束：轨道/滑块/截断规则不得退化', async () => {
  const css = await read('apps/web/src/styles/desktop-workbench.css')
  // 第三行轨道唯一且 2fr:1fr，禁止降列
  const gridBlocks = css.match(/\.ops-bi-models-grid\s*\{[^}]*\}/gu) ?? []
  assert.equal(gridBlocks.length, 1, '第三行轨道只允许一处声明')
  assert.match(gridBlocks[0], /grid-template-columns:\s*minmax\(0,\s*2fr\)\s*minmax\(0,\s*1fr\)/u)
  assert.ok(!/\.ops-bi-models-grid[^}]*repeat\(2/u.test(css), '禁止按宽度降列')
  // GSAP 滑块：轨道 relative、滑块 absolute（memory 27 同款）
  assert.match(css, /\.ops-bi-model-tabs\s*\{[^}]*position:\s*relative/u)
  assert.match(css, /\.ops-bi-model-pill\s*\{[^}]*position:\s*absolute/u)
  // 商品名单行截断，防横向溢出（memory 25 minmax(0) 规则）
  assert.match(css, /\.ops-bi-model-row\s*\{[^}]*minmax\(0,\s*1fr\)/u)
  assert.match(css, /\.ops-bi-model-row\s*>\s*\.name\s*\{[^}]*text-overflow:\s*ellipsis/u)
  // 条从左起画
  assert.match(css, /\.ops-bi-model-bar\s*>\s*i\s*\{[^}]*transform-origin:\s*left/u)
})

test('动效规则：新块无 CSS 动画，滑块与行入场全走 GSAP', async () => {
  const css = await read('apps/web/src/styles/desktop-workbench.css')
  const charts = await read('apps/web/src/components/overview/BiInsightCharts.jsx')
  const start = css.indexOf('.ops-bi-models-grid')
  const noteAt = css.indexOf('.ops-bi-review-note')
  assert.ok(start > 0 && noteAt > start)
  const block = css.slice(start, css.indexOf('}', noteAt))
  assert.ok(!/@keyframes|animation:|transition:/u.test(block), '新块禁止 CSS 动画/过渡（GSAP 唯一动效来源）')
  assert.match(charts, /scaleX: 0/u)
  assert.match(charts, /killTweensOf\(pill\)/u)
})
