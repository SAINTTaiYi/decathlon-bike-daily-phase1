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

test('expanded handovers reveal their full item while the completed marker stays compact', () => {
  assert.match(ledger, /const newlyCompletedOpenRecord = records\.find\(\(record\) => completionById\.get\(record\.id\) && !handoverCompletionByIdRef\.current\.get\(record\.id\) && expandedId === record\.id\)/u)
  assert.match(ledger, /setExpandedId\(''\)\n    setHandoverStampMotionId\(newlyCompletedOpenRecord\.id\)/u)
  assert.match(ledger, /\{!handoverComplete \? <b data-repair=/u)
  assert.match(ledger, /handoverMode \? <>?<section className="pickup-detail-wide handover-detail-full"><h4>HANDOVER <span>\/ 交接事项/u)
  assert.match(ledger, /<Highlight query=\{query\}>\{handoverDetail\}<\/Highlight>/u)
  assert.doesNotMatch(ledger, /<h4>STATUS <span>\/ 当前状态<\/span><\/h4>/u)
  assert.match(ledger, /handover-complete-stamp-stage/u)
  assert.match(styles, /--pickup-action-yellow: var\(--ops-yellow, #ff5a28\)/u)
  assert.match(styles, /handover-detail-full \{[\s\S]*?grid-column: 1 \/ -1;[\s\S]*?grid-row: auto;/u)
  assert.match(styles, /handover-detail-full p \{[\s\S]*?text-overflow: clip;[\s\S]*?white-space: normal;[\s\S]*?-webkit-line-clamp: unset;/u)
  assert.match(styles, /data-complete='true'\] \.pickup-card-summary \{[\s\S]*?min-height: 112px;[\s\S]*?padding-bottom: 52px;/u)
  assert.doesNotMatch(styles, /min-height: clamp\(206px, 53vw, 356px\)/u)
  assert.match(styles, /width: clamp\(96px, 29vw, 138px\);/u)
  assert.match(styles, /handover-complete-stamp-arrive/u)
  assert.doesNotMatch(styles, /handover-complete-stamp-trail/u)
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/u)
})
