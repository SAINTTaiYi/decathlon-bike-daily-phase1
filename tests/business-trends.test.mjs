import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
const root = new URL('../', import.meta.url)
const read = (file) => readFile(new URL(file, root), 'utf8')

test('desktop business trends use real bootstrap history and remove decorative hard-coded dates', async () => {
  const [bootstrap, hook, overview, charts] = await Promise.all([read('apps/worker/src/routes/bootstrap.ts'),read('apps/web/src/hooks/useRemoteClosingWorkflow.js'),read('apps/web/src/components/overview/WorkshopOverviewPage.jsx'),read('apps/web/src/components/overview/BusinessTrendCharts.jsx')])
  assert.match(bootstrap, /buildBusinessTrends/u); assert.match(bootstrap, /events,\n      trends/u)
  assert.match(hook, /trends: state\.trends/u); assert.match(overview, /SalesHairlineChart/u); assert.match(overview, /RepairRungChart/u)
  assert.doesNotMatch(overview, /07\/29|07\/30|chartDates|sales \* 16|repairCount \* 15/u)
  assert.match(charts, /HAIRLINE LINE · DAILY CLOSINGS/u); assert.match(charts, /RUNG BARS · REVERSAL-AWARE AUDIT EVENTS/u)
})

test('Lieflat contracts keep honest units, missing-sales semantics, accessibility and reduced motion', async () => {
  const [charts, css] = await Promise.all([read('apps/web/src/components/overview/BusinessTrendCharts.jsx'),read('apps/web/src/styles/desktop-workbench.css')])
  assert.match(charts, /salesVehicles === null/u); assert.match(charts, /空心 = 未填写/u); assert.match(charts, /一横档 = 一张新增维修单/u)
  assert.match(charts, /role="img"/u); assert.match(charts, /tabIndex="0"/u)
  assert.match(css, /prefers-reduced-motion: reduce/u)
  assert.doesNotMatch(css, /ops-trend-bars/u)
})

test('charts follow the Workshop brand tokens with a single yellow today hero', async () => {
  const [charts, css, design] = await Promise.all([read('apps/web/src/components/overview/BusinessTrendCharts.jsx'), read('apps/web/src/styles/desktop-workbench.css'), read('DESIGN.md')])
  // 品牌 token 正本存在且图表引用它们
  assert.match(design, /--ops-yellow.*#ffc31a|#ffc31a.*--ops-yellow/u)
  assert.match(charts, /--ops-black/u); assert.match(charts, /--ops-yellow/u); assert.match(charts, /--ops-text-muted/u)
  assert.match(charts, /黄 = 今日/u)
  // 强调色只有一个语义（今日徽章），数据保持中性墨阶，不混用其它色相
  assert.doesNotMatch(charts, /#8F8E88|#C6C5BF|#DEDDD6|#1C1C1A|#F0EFEB/u)
  // 卡片外观改用品牌变量，告别旧 lieflat 灰阶
  assert.match(css, /background: var\(--ops-page\)/u); assert.match(css, /color: var\(--ops-text\)/u)
  assert.match(css, /color: var\(--ops-text-muted\)/u); assert.doesNotMatch(css, /#f0efeb|#1c1c1a|#8f8e88/u)
  // 悬停聚焦只服务于真实记录列，且带 reduced-motion 降级
  assert.match(css, /\.ops-lieflat-col \{ transition: opacity 140ms ease; \}/u)
  assert.match(css, /\.ops-lieflat-col \{ transition: none; \}/u)
})
