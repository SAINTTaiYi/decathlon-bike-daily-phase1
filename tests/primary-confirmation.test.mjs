import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync(new URL('../apps/web/src/App.jsx', import.meta.url), 'utf8')
const ledger = readFileSync(new URL('../apps/web/src/components/lookbook/RecordLedger.jsx', import.meta.url), 'utf8')
const pickupDialog = readFileSync(new URL('../apps/web/src/components/dialogs/PickupConfirmDialog.jsx', import.meta.url), 'utf8')
const closingDialog = readFileSync(new URL('../apps/web/src/components/dialogs/ConfirmClosingDialog.jsx', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../apps/web/src/styles/workshop-system.css', import.meta.url), 'utf8')

test('所有记录业务主操作共享确认中状态与单次远端确认守卫', () => {
  assert.match(app, /const \[primaryProcessingId, setPrimaryProcessingId\]/)
  assert.match(app, /const beginPrimaryConfirmation/)
  assert.match(app, /const performPrimaryAction/)
  assert.match(app, /onResaleListing: \(record\) => void performPrimaryAction/)
  assert.match(app, /onResaleSold: \(record\) => void performPrimaryAction/)
  assert.match(app, /onRepairComplete: \(record\) => void completeRepairWithConfirmation/)
  assert.match(app, /onHandoverComplete: \(record\) => void performPrimaryAction/)
  assert.match(app, /primaryActionBusy: Boolean\(primaryProcessingId\)/)
})

test('记录主操作在等待时显示统一勾选确认态，编辑和删除不借用该视觉状态', () => {
  assert.match(ledger, /const primaryButton = \(label, onClick\)/)
  assert.match(ledger, /data-processing=\{primaryProcessing \? 'true' : undefined\}/)
  assert.match(ledger, /aria-busy=\{primaryProcessing \|\| undefined\}/)
  assert.match(ledger, /\{primaryProcessing \? '确认中…' : label\}/)
  assert.match(ledger, /disabled=\{Boolean\(closedAt\) \|\| primaryProcessing\} aria-label=\{`编辑/)
  const editLine = ledger.split('\n').find((line) => line.includes('record-edit-action')) || ''
  const deleteLine = ledger.split('\n').find((line) => line.includes('record-swipe-delete-action')) || ''
  assert.doesNotMatch(editLine, /data-processing/)
  assert.doesNotMatch(deleteLine, /data-processing/)
})
test('自提取货和闭店确认弹窗也使用相同的确认中按钮状态', () => {
  assert.match(pickupDialog, /IconCheck/)
  assert.match(pickupDialog, /data-processing=\{submitting \? 'true' : undefined\}/)
  assert.match(pickupDialog, /确认中…/)
  assert.match(closingDialog, /IconCheck/)
  assert.match(closingDialog, /data-processing=\{submitting \? 'true' : undefined\}/)
  assert.match(closingDialog, /确认中…/)
})

test('确认中视觉保持黑色主动作面和可读的等待状态', () => {
  assert.match(styles, /\.record-actions \.record-primary-action\[data-processing='true'\]:disabled/)
  assert.match(styles, /\.primary-action\[data-processing='true'\]/)
  assert.match(styles, /cursor: wait/)
})


test('质保付款完成状态打开非阻断过机提醒后再执行取车', () => {
  assert.match(app, /record\.status === REPAIR_POS_REMINDER_STATUS/u)
  assert.match(pickupDialog, /请确保顾客已过机核验/u)
  assert.match(pickupDialog, /已核验，继续取车/u)
  assert.match(pickupDialog, /本提醒不会阻止取车/u)
})
