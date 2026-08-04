import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const css = await readFile(new URL('../apps/web/src/styles/desktop-workbench.css', import.meta.url), 'utf8')
const ledger = await readFile(new URL('../apps/web/src/components/pickup/PickupLedger.jsx', import.meta.url), 'utf8')

test('desktop overview overrides the mobile display rule and places first-screen cards side by side', () => {
  assert.match(css, /\.workshop-overview-panel \.ops-mobile-overview \{[\s\S]*?display: grid;/u)
  assert.match(css, /ops-closing-card \{[\s\S]*?grid-column: span 7;/u)
  assert.match(css, /ops-sales-panel \{[\s\S]*?grid-column: span 5;/u)
})

test('desktop card reveal keeps its column width and only grows downward', () => {
  const expandedBlock = css.match(/\.pickup-card-frame\[data-expanded='true'\] \{[^}]*\}/u)?.[0] || ''
  assert.match(expandedBlock, /grid-column: auto;/u)
  assert.doesNotMatch(expandedBlock, /grid-column: span/u)
  assert.match(css, /grid-auto-rows: auto;/u)
})

test('pickup display title and completion state do not treat a string false as completed', () => {
  assert.match(ledger, /function isPickedUpToday\(value\) \{ return value === true \|\| value === 1 \|\| value === '1' \|\| value === 'true' \}/u)
  assert.match(ledger, /function pickupCardTitle\(record, detailLine\) \{ return String\(record\.title \|\| ''\)\.trim\(\) \|\| detailLine \|\| '未命名待取车辆' \}/u)
  assert.match(ledger, /const cardTitle = handoverMode \? detailLine : pickupCardTitle\(record, detailLine\)/u)
  assert.match(ledger, /records\.filter\(\(record\) => !isPickedUpToday\(record\.pickedUpToday\)\)/u)
})
