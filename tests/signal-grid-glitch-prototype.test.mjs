import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('prototype replaces bicycle imagery with an abstract six-signal glitch field', async () => {
  const [field, app, css] = await Promise.all([
    read('../apps/web/src/components/lookbook/MainHeadImage.jsx'),
    read('../apps/web/src/App.jsx'),
    read('../apps/web/src/styles/signal-grid-glitch-prototype.css')
  ])
  assert.doesNotMatch(app, /MainHeadImage/u)
  assert.match(field, /signal-glitch-field/u)
  for (const module of ['overview', 'pickup', 'repair', 'resale', 'sales', 'closing']) {
    assert.ok(field.includes(`['${module}',`))
  }
  assert.match(field, /signal-glitch-fragment-\$\{module\}/u)
  assert.doesNotMatch(field, /<picture|<img|workshop-head-signal|自行车|bike/iu)
  assert.match(css, /signal-glitch-canvas/u)
  assert.match(css, /repeating-linear-gradient/u)
  assert.match(css, /repeating-radial-gradient/u)
})

test('Overview is an asymmetric neutral editorial map with compressed module traces', async () => {
  const [pulse, css] = await Promise.all([
    read('../apps/web/src/scenes/PulseScene.jsx'),
    read('../apps/web/src/styles/signal-grid-glitch-prototype.css')
  ])
  assert.match(pulse, /signal-overview-prototype/u)
  assert.match(pulse, /overviewEntries[\s\S]*priorityScore/u)
  assert.match(pulse, /data-business-scene=\{sceneId\} data-business-rank=\{index \+ 1\}/u)
  assert.match(pulse, /signal-business-map-trace/u)
  assert.doesNotMatch(pulse, /ModuleIcon|SIGNAL_ICON_STROKE/u)
  assert.match(css, /grid-template-columns: repeat\(12, minmax\(0, 1fr\)\)/u)
  assert.match(css, /data-business-rank='1'[\s\S]*grid-column: span 7[\s\S]*grid-row: span 2/u)
  assert.match(css, /data-business-rank='4'[\s\S]*grid-column: span 6/u)
  assert.match(css, /signal-business-map button[\s\S]*background: var\(--sg-glitch-paper\)/u)
  assert.match(css, /signal-business-map button::before[\s\S]*var\(--sg-module-signal\)/u)
})

test('Repair prototype uses continuous archive records and text-led actions', async () => {
  const [repair, ledger, css] = await Promise.all([
    read('../apps/web/src/scenes/RepairScene.jsx'),
    read('../apps/web/src/components/lookbook/RecordLedger.jsx'),
    read('../apps/web/src/styles/signal-grid-glitch-prototype.css')
  ])
  assert.match(repair, /signal-repair-prototype/u)
  assert.match(repair, /variant="glitch-archive"/u)
  assert.match(ledger, /data-ledger-variant=\{variant \|\| undefined\}/u)
  assert.match(ledger, /record-history-label">查看历史/u)
  assert.match(css, /data-ledger-variant='glitch-archive'/u)
  assert.match(css, /record-swipe-frame[\s\S]*border-bottom: 1px solid var\(--sg-glitch-ink\)/u)
  assert.match(css, /record-actions[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/u)
  assert.match(css, /record-primary-action::before[\s\S]*var\(--sg-p-module-repair\)/u)
})

test('Repair task layer protects field labels, controls, helper and error content', async () => {
  const [dialog, form, css] = await Promise.all([
    read('../apps/web/src/components/dialogs/AppDialog.jsx'),
    read('../apps/web/src/components/dialogs/RecordEditorDialog.jsx'),
    read('../apps/web/src/styles/signal-grid-glitch-prototype.css')
  ])
  assert.match(dialog, /data-signal-module=\{signalModule\}/u)
  assert.match(form, /RepairFields/u)
  assert.match(css, /data-signal-module='repair'.*dialog-header::before/su)
  assert.match(css, /data-signal-module='repair'.*:is\(\.field-row > span, \.field-group legend, \.field-help, \.form-error, \.conditional-field-note, input, textarea, select, \.project-select-trigger\)[\s\S]*text-shadow: none/u)
  assert.match(css, /data-signal-module='repair'.*:is\(input, textarea, select, \.project-select-trigger\)[\s\S]*background: var\(--sg-p-color-surface\)/u)
})

test('prototype navigation is number and typography led with only tiny color traces', async () => {
  const [dock, css] = await Promise.all([
    read('../apps/web/src/components/lookbook/ActionDock.jsx'),
    read('../apps/web/src/styles/signal-grid-glitch-prototype.css')
  ])
  assert.match(dock, /<b>\{label\}<\/b>/u)
  assert.match(dock, /<i aria-hidden="true" \/>/u)
  assert.doesNotMatch(dock, /NavIcon|ActiveNavIcon|DockIcon|data-signal-icon/u)
  assert.match(css, /signal-type-navigation button\[data-active='true'\]/u)
  assert.match(css, /repeating-linear-gradient\(90deg, var\(--sg-module-signal\)/u)
})

test('glitch motion is brief, observer-driven and reduced-motion safe', async () => {
  const [hook, app, css] = await Promise.all([
    read('../apps/web/src/hooks/useGlitchPrototypeMotion.js'),
    read('../apps/web/src/App.jsx'),
    read('../apps/web/src/styles/signal-grid-glitch-prototype.css')
  ])
  assert.match(app, /useGlitchPrototypeMotion/u)
  assert.match(hook, /IntersectionObserver/u)
  assert.match(hook, /duration: 210/u)
  assert.match(hook, /animation\.cancel\(\)/u)
  assert.doesNotMatch(hook, /addEventListener\(['"]scroll/u)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/u)
  assert.doesNotMatch(css, /prefers-reduced-motion:[\s\S]*clip-path: none/u)
})
