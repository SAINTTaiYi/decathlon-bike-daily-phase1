import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const pickupLedger = await readFile(new URL('../apps/web/src/components/pickup/PickupLedger.jsx', import.meta.url), 'utf8')
const repairScene = await readFile(new URL('../apps/web/src/scenes/RepairScene.jsx', import.meta.url), 'utf8')
const app = await readFile(new URL('../apps/web/src/App.jsx', import.meta.url), 'utf8')

test('维修场景复用待取卡片台账，而非通用 RecordLedger', () => {
  assert.match(repairScene, /PickupLedger/u)
  assert.match(repairScene, /repairMode/u)
  assert.doesNotMatch(repairScene, /RecordLedger/u)
  assert.match(pickupLedger, /repairMode = false/u)
  assert.match(pickupLedger, /className="pickup-card-grid"/u)
  assert.match(pickupLedger, /pickup-card-reveal/u)
})

test('维修卡没有通知状态，主操作为维修完成并沿用现有完成回调', () => {
  assert.match(pickupLedger, /!repairMode && !pickedUp/u)
  assert.match(pickupLedger, /repairMode \? '维修完成' : '确认取车'/u)
  assert.match(pickupLedger, /repairMode \? onRepairComplete\(record\) : onPickup\(record\)/u)
  assert.match(app, /onRepairComplete: \(record\) => void completeRepairWithConfirmation\(record\)/u)
  assert.doesNotMatch(repairScene, /等待通知|已通知|确认取车/u)
})

test('维修完成仍使用既有延迟提交，保持转入待取的业务流', () => {
  assert.match(pickupLedger, /repairPixelDissolveId/u)
  assert.match(pickupLedger, /reduced \? 0 : 460/u)
  assert.match(pickupLedger, /onRepairPixelDissolveComplete/u)
  assert.ok(app.includes('workflow.completeRepair(record.id'))
  assert.match(app, /维修完成，已携带维修单转入待取/u)
})
