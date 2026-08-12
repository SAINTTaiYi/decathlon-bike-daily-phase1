import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const scene = await readFile(new URL('../apps/web/src/scenes/OpeningScene.jsx', import.meta.url), 'utf8')
const ledger = await readFile(new URL('../apps/web/src/components/pickup/PickupLedger.jsx', import.meta.url), 'utf8')
const dialog = await readFile(new URL('../apps/web/src/components/dialogs/RecordEditorDialog.jsx', import.meta.url), 'utf8')
const config = await readFile(new URL('../apps/web/src/data/operationsData.js', import.meta.url), 'utf8')

test('handover uses the shared PickupLedger card design and exposes complete text after expansion', () => {
  assert.match(scene, /PickupLedger/u)
  assert.match(scene, /handoverMode/u)
  assert.doesNotMatch(scene, /RecordLedger|SceneTitle/u)
  assert.match(ledger, /handoverMode = false/u)
  assert.match(ledger, /ACTIVE HANDOVER/u)
  assert.match(ledger, /handoverMode \? <>?<section className="pickup-detail-wide handover-detail-full"><h4>HANDOVER <span>\/ 交接事项/u)
  assert.match(ledger, /<Highlight query=\{query\}>\{handoverDetail\}<\/Highlight>/u)
  assert.doesNotMatch(ledger, /STATUS <span>\/ 当前状态/u)
  assert.match(ledger, /pickup-card-actions/u)
  assert.match(ledger, /handoverMode \? handoverComplete :/u)
  assert.match(ledger, /handoverMode \? handoverCardTitle\(record\)/u)
  assert.match(ledger, /handoverMode \? handoverCardDetail\(record\)/u)
  assert.match(ledger, /repairPickup \|\| handoverMode[\s\S]*?record\.contactValue/u)
  assert.match(ledger, /CONTACT <span>\/ 联系方式<\/span>/u)
  assert.match(ledger, /<dt>电话号码<\/dt><dd>\{contactValue \|\| '无'\}<\/dd>/u)
})

test('handover form keeps one required item, adds an optional phone, and uses an explicit status select', () => {
  assert.match(config, /poster:[\s\S]*formKind: 'handover'/u)
  assert.match(config, /statusOptions: \['继续跟进', '已处理'\]/u)
  assert.ok(dialog.includes("HANDOVER_STATUSES = [{ value: '继续跟进', label: '继续跟进' }, { value: '已处理', label: '已处理' }]"))
  assert.match(dialog, /function HandoverFields/u)
  assert.match(dialog, /<span>交接事项<\/span><textarea required/u)
  assert.match(dialog, /<span>电话号码（选填）<\/span>[\s\S]*?inputMode="tel"[\s\S]*?placeholder="可不填"/u)
  const phoneStart = dialog.indexOf('电话号码（选填）')
  const phoneField = dialog.slice(phoneStart, dialog.indexOf('</label>', phoneStart))
  assert.doesNotMatch(phoneField, /required/u)
  assert.match(dialog, /contactValue: record\?\.contactValue \|\| ''/u)
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
