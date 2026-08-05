import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const css = await readFile(new URL('../apps/web/src/styles/desktop-workbench.css', import.meta.url), 'utf8')
const ledger = await readFile(new URL('../apps/web/src/components/pickup/PickupLedger.jsx', import.meta.url), 'utf8')

test('desktop reference uses the physical-pixel canvas and stable two-panel first row', () => {
  assert.match(css, /@media \(min-width: 768px\)/u)
  assert.match(css, /zoom: calc\(100vw \/ 1536px\)/u)
  assert.match(css, /ops-closing-card \{ grid-column: 1;/u)
  assert.match(css, /ops-sales-panel \{ grid-column: 2;/u)
  assert.match(css, /ops-analytics-grid/u)
})

test('desktop ledger retains a single full-width row per record and expanded detail grows down only', () => {
  assert.match(css, /.pickup-card-grid \{ grid-template-columns: minmax\(0, 1fr\); gap: 7px;/u)
  assert.match(css, /.pickup-card-frame\[data-expanded='true'\] \{ grid-column: auto; filter: none;/u)
  assert.match(ledger, /pickup-card-reveal/u)
  assert.match(css, /grid-template-columns: 96px minmax\(310px, 1.5fr\) minmax\(280px, 1fr\) 160px/u)
})

test('pickup display title and completion state do not treat a string false as completed', () => {
  assert.match(ledger, /function isPickedUpToday\(value\) \{ return value === true \|\| value === 1 \|\| value === '1' \|\| value === 'true' \}/u)
  assert.match(ledger, /function pickupCardTitle\(record, detailLine\) \{ return String\(record\.title \|\| ''\)\.trim\(\) \|\| detailLine \|\| '未命名待取车辆' \}/u)
  assert.match(ledger, /const cardTitle = handoverMode \? handoverCardTitle\(record\) : pickupCardTitle\(record, detailLine\)/u)
  assert.match(ledger, /records\.filter\(\(record\) => !isPickedUpToday\(record\.pickedUpToday\)\)/u)
})
