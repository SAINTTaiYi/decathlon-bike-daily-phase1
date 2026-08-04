import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const ledger = await readFile(new URL('../apps/web/src/components/pickup/PickupLedger.jsx', import.meta.url), 'utf8')
const app = await readFile(new URL('../apps/web/src/App.jsx', import.meta.url), 'utf8')
const cleanup = await readFile(new URL('../tests/workflow-cleanup.test.mjs', import.meta.url), 'utf8')
const styles = await readFile(new URL('../apps/web/src/styles/pickup-ledger.css', import.meta.url), 'utf8')

test('handover card exposes the existing completion action only while unresolved', () => {
  assert.match(ledger, /onHandoverComplete/u)
  assert.match(ledger, /const handoverComplete = handoverMode && Boolean\(record\.completedToday \|\| record\.completedOn\)/u)
  assert.match(ledger, /handoverMode \? handoverComplete :/u)
  assert.match(ledger, /handoverMode \? onHandoverComplete\(record\) : repairMode \? onRepairComplete\(record\) : onPickup\(record\)/u)
  assert.match(ledger, /handoverMode \? '完成交接' : repairMode \? '维修完成' : '确认取车'/u)
  assert.match(app, /onHandoverComplete: \(record\) => void performPrimaryAction\(record, \(\) => workflow\.completeHandover\(record\.id\)/u)
})

test('completed handovers retain today and are removed at the next business-day cleanup', () => {
  assert.match(ledger, /const waitingRecords = handoverMode \? records :/u)
  assert.match(cleanup, /auto-remove-handover/u)
})


test('completed handovers auto-collapse once after persistence and use the yellow stamped completion marker', () => {
  assert.match(ledger, /const newlyCompletedOpenRecord = records\.find\(\(record\) => completionById\.get\(record\.id\) && !handoverCompletionByIdRef\.current\.get\(record\.id\) && expandedId === record\.id\)/u)
  assert.match(ledger, /setExpandedId\(''\)\n    setHandoverStampMotionId\(newlyCompletedOpenRecord\.id\)/u)
  assert.match(ledger, /\{!handoverComplete \? <b data-repair=/u)
  assert.match(ledger, /handover-complete-stamp/u)
  assert.match(ledger, /handoverStampEntering=\{handoverStampMotionId === record\.id\}/u)
  assert.match(styles, /--pickup-action-yellow: #ffc31a/u)
  assert.doesNotMatch(ledger, /<h4>HANDOVER <span>\/ 交接事项<\/span><\/h4>/u)
  assert.doesNotMatch(ledger, /<h4>STATUS <span>\/ 当前状态<\/span><\/h4>/u)
  assert.match(ledger, /handoverMode \? null : <section><h4>CUSTOMER/u)
  assert.match(ledger, /handover-complete-stamp-stage/u)
  assert.match(styles, /width: min\(57%, 430px\)/u)
  assert.match(styles, /aspect-ratio: 2\.58 \/ 1/u)
  assert.match(styles, /border: clamp\(3px, \.8vw, 6px\) solid var\(--stamp-yellow\)/u)
  assert.match(styles, /color: var\(--stamp-yellow\)/u)
  assert.match(styles, /handover-complete-stamp-arrive/u)
  assert.match(styles, /handover-complete-stamp-trail/u)
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/u)
})
