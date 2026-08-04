import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const ledger = await readFile(new URL('../apps/web/src/components/pickup/PickupLedger.jsx', import.meta.url), 'utf8')
const app = await readFile(new URL('../apps/web/src/App.jsx', import.meta.url), 'utf8')
const cleanup = await readFile(new URL('../tests/workflow-cleanup.test.mjs', import.meta.url), 'utf8')

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
