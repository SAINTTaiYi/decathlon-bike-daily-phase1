import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('core business modules use deliberate module headers with real operational metrics', async () => {
  const [primitive, pickup, repair, resale, sales, other, pulse] = await Promise.all([
    read('../apps/web/src/components/lookbook/LookbookPrimitives.jsx'),
    read('../apps/web/src/scenes/PickupScene.jsx'),
    read('../apps/web/src/scenes/RepairScene.jsx'),
    read('../apps/web/src/scenes/ResaleScene.jsx'),
    read('../apps/web/src/scenes/SalesScene.jsx'),
    read('../apps/web/src/scenes/OpeningScene.jsx'),
    read('../apps/web/src/scenes/PulseScene.jsx')
  ])
  assert.match(primitive, /signalHeader = false/u)
  assert.match(primitive, /SignalModuleMetrics items=\{metrics\}/u)
  for (const source of [pickup, repair, resale, sales]) assert.match(source, /<SceneTitle scene=\{scene\} signalHeader/u)
  assert.match(pickup, /WAITING \/ 待取/u)
  assert.match(pickup, /NOTIFIED \/ 已通知/u)
  assert.match(repair, /PARTS \/ 等待配件/u)
  assert.match(resale, /PENDING \/ 待上架/u)
  assert.match(sales, /REVIEWS \/ 有效评价/u)
  assert.doesNotMatch(other, /signalHeader/u)
  assert.doesNotMatch(pulse, /signalHeader/u)
})

test('shared record grammar combines text, icon and structure without changing business actions', async () => {
  const [ledger, state, resale] = await Promise.all([
    read('../apps/web/src/components/lookbook/RecordLedger.jsx'),
    read('../apps/web/src/components/lookbook/SignalStateMark.jsx'),
    read('../apps/web/src/scenes/ResaleScene.jsx')
  ])
  assert.match(state, /IconClock/u)
  assert.match(state, /@iconoir-solid\/Flash\.mjs/u)
  assert.match(state, /@iconoir-solid\/CheckCircle\.mjs/u)
  assert.match(state, /@iconoir-solid\/WarningTriangle\.mjs/u)
  assert.match(state, /data-signal-icon=\{\['active', 'complete', 'danger'\]\.includes\(tone\) \? 'filled' : 'outline'\}/u)
  assert.match(state, /<dl className="signal-module-metrics"/u)
  assert.match(ledger, /<SignalStateMark tone=\{stateTone\}>\{englishState\}<\/SignalStateMark>/u)
  assert.match(ledger, /data-priority=\{priorityTone\}/u)
  assert.match(ledger, /businessTone === 'pending'/u)
  for (const handler of ['onPickup', 'onRepairComplete', 'onResaleListing', 'onResaleSold', 'onHandoverComplete']) {
    assert.match(ledger, new RegExp(`\\b${handler}\\(`, 'u'))
  }
  assert.match(ledger, /PickupPixelFill/u)
  assert.match(ledger, /RepairPixelDissolve/u)
  assert.doesNotMatch(resale, /\sdark(?:\s|\/|>)/u)
  assert.match(resale, /emphasis="pending"/u)
})

test('Phase 3 CSS uses flat module color, neutral dense records and semantic priority states', async () => {
  const [css, index] = await Promise.all([
    read('../apps/web/src/styles/signal-grid-modules.css'),
    read('../apps/web/src/styles/index.css')
  ])
  assert.match(index, /signal-grid-modules\.css/u)
  assert.match(css, /\.signal-module-header[\s\S]*?background: var\(--sg-module-color\)/u)
  assert.match(css, /\.signal-record-row[\s\S]*?background: var\(--sg-color-surface\)/u)
  assert.match(css, /data-priority='pending'[\s\S]*?color-mix/u)
  assert.match(css, /data-priority='current'[\s\S]*?background: var\(--sg-module-color\)/u)
  assert.match(css, /data-priority='danger'[\s\S]*?var\(--sg-color-danger\)/u)
  assert.match(css, /data-resolved='true'[\s\S]*?var\(--sg-color-success-mark\)/u)
  assert.match(css, /\.signal-record-row \.record-actions button[\s\S]*?min-height: 44px/u)
  assert.match(css, /@media \(max-width: 390px\)[\s\S]*?\.signal-sales-metrics \{ grid-template-columns: 1fr; \}/u)
  const radiusValues = [...css.matchAll(/border-radius:\s*([^;]+);/gu)].map((match) => match[1].replace(/\s*!important$/u, '').trim())
  assert.ok(radiusValues.length > 0)
  assert.ok(radiusValues.every((value) => value === 'var(--sg-corner)' || value === '0'))
  const shadowValues = [...css.matchAll(/box-shadow:\s*([^;]+);/gu)].map((match) => match[1].trim())
  assert.ok(shadowValues.every((value) => value === 'none'))
  assert.doesNotMatch(css, /linear-gradient|radial-gradient/u)
})

test('sales and closing surfaces use real data and preserve existing workflow controls', async () => {
  const [sales, closing] = await Promise.all([
    read('../apps/web/src/scenes/SalesScene.jsx'),
    read('../apps/web/src/components/lookbook/ClosingSummary.jsx')
  ])
  for (const field of ['salesVehicles', 'safetyChecks', 'safetyModel', 'validReviews', 'usedSold', 'usedReceived']) {
    assert.match(sales, new RegExp(`kpi\\.${field}`, 'u'))
  }
  assert.match(sales, /SignalStateMark tone=\{kpiReady \? 'complete' : 'pending'\}/u)
  assert.match(sales, /onClick=\{onEditKpi\}/u)
  assert.match(closing, /SignalStateMark tone=\{closed \? 'complete' : workflow\.kpiReady \? 'active' : 'pending'\}/u)
  assert.match(closing, /--signal-readiness/u)
  assert.match(closing, /onClick=\{onCompleteClosing\}/u)
  assert.match(closing, /onClick=\{onReopenClosing\}/u)
  assert.match(closing, /onExportReport/u)
})
