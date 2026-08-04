import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const scene = await readFile(new URL('../apps/web/src/scenes/OpeningScene.jsx', import.meta.url), 'utf8')
const ledger = await readFile(new URL('../apps/web/src/components/pickup/PickupLedger.jsx', import.meta.url), 'utf8')
const dialog = await readFile(new URL('../apps/web/src/components/dialogs/RecordEditorDialog.jsx', import.meta.url), 'utf8')
const config = await readFile(new URL('../apps/web/src/data/operationsData.js', import.meta.url), 'utf8')

test('handover uses the shared PickupLedger card design', () => {
  assert.match(scene, /PickupLedger/u)
  assert.match(scene, /handoverMode/u)
  assert.doesNotMatch(scene, /RecordLedger|SceneTitle/u)
  assert.match(ledger, /handoverMode = false/u)
  assert.match(ledger, /ACTIVE HANDOVER/u)
  assert.doesNotMatch(ledger, /HANDOVER <span>\/ 交接事项/u)
  assert.doesNotMatch(ledger, /STATUS <span>\/ 当前状态/u)
  assert.match(ledger, /handoverMode \? null : <section><h4>CUSTOMER/u)
  assert.match(ledger, /pickup-card-actions/u)
  assert.match(ledger, /handoverMode \? handoverComplete :/u)
  assert.match(ledger, /handoverMode \? handoverCardTitle\(record\)/u)
})

test('handover form is limited to one required item and explicit status select', () => {
  assert.match(config, /poster:[\s\S]*formKind: 'handover'/u)
  assert.match(config, /statusOptions: \['继续跟进', '已处理'\]/u)
  assert.ok(dialog.includes("HANDOVER_STATUSES = [{ value: '继续跟进', label: '继续跟进' }, { value: '已处理', label: '已处理' }]"))
  assert.match(dialog, /function HandoverFields/u)
  assert.match(dialog, /<span>交接事项<\/span><textarea required/u)
  assert.match(dialog, /<span>当前状态<\/span><ProjectSelect/u)
  const section = dialog.slice(dialog.indexOf('function HandoverFields'), dialog.indexOf('function PickupFields'))
  assert.doesNotMatch(section, /事项名称|交接说明|分类、位置或关联信息/u)
})

test('handover saves the one item in existing title/detail fields and preserves legacy meta', () => {
  assert.match(dialog, /const item = draft.detail \|\| draft.title/u)
  assert.match(dialog, /title: value.slice\(0, 80\), detail: value/u)
  assert.match(ledger, /const waitingRecords = handoverMode \? records/u)
  assert.match(ledger, /handoverMode \? 'handover-ledger'/u)
})
