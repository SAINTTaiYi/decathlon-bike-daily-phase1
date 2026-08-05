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
  assert.match(charts, /role="img"/u); assert.match(charts, /tabIndex="0"/u); assert.match(css, /#1c1c1a/u); assert.match(css, /#f0efeb/u)
  assert.match(css, /prefers-reduced-motion: reduce/u); assert.doesNotMatch(css, /ops-trend-bars/u)
})
