import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  CLOSING_CHECK_MODULES,
  buildClosingChecklist,
  buildModuleChanges,
  buildSelfPickupFocus,
  changeActionLabel,
  closingGateState,
  formatChangeTally,
  isModuleConfirmed,
  toggleModuleConfirmation
} from '../apps/web/src/data/closingChecklist.js'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

const event = (overrides) => ({
  id: `e-${Math.random().toString(16).slice(2)}`,
  entityType: 'work-item',
  entityId: 'r1',
  action: 'edit-record',
  label: '编辑：某车',
  at: '2026-08-09T01:00:00.000Z',
  scene: 'pickup',
  previousScene: 'pickup',
  nextScene: 'pickup',
  undoneAt: null,
  ...overrides
})

test('闭店核对覆盖待取、其它交接、维修三个跨日台账，顺序对齐总览模块编号', () => {
  assert.deepEqual(CLOSING_CHECK_MODULES.map((module) => module.id), ['pickup', 'poster', 'repair'])
  assert.deepEqual(CLOSING_CHECK_MODULES.map((module) => module.no), ['02', '03', '04'])
  assert.deepEqual(CLOSING_CHECK_MODULES.map((module) => module.scene), ['pickup', 'poster', 'repair'])
})

test('模块今天没有审计事件时判定为与昨日相同', () => {
  const result = buildModuleChanges('repair', [event({ scene: 'pickup', previousScene: 'pickup', nextScene: 'pickup' })])
  assert.equal(result.changed, false)
  assert.equal(result.count, 0)
  assert.deepEqual(result.entries, [])
})

test('有变动时给出简短变动项与动作计数', () => {
  const result = buildModuleChanges('pickup', [
    event({ id: 'a', entityId: 'r1', action: 'add-record', label: '增加：捷安特 ATX', at: '2026-08-09T02:00:00.000Z' }),
    event({ id: 'b', entityId: 'r2', action: 'complete-pickup', label: '确认取车：美利达', at: '2026-08-09T03:00:00.000Z' })
  ])
  assert.equal(result.changed, true)
  assert.equal(result.count, 2)
  // Newest first, so the closing reviewer reads the most recent action at the top.
  assert.deepEqual(result.entries.map((entry) => entry.entityId), ['r2', 'r1'])
  assert.deepEqual(result.entries.map((entry) => entry.actionLabel), ['取车', '新增'])
  assert.equal(result.entries[1].label, '增加：捷安特 ATX')
  assert.equal(formatChangeTally(result.tally), '取车 1 · 新增 1')
})

test('同一条记录当天多次操作只算一项变动，并保留最后一次动作', () => {
  const result = buildModuleChanges('poster', [
    event({ id: 'a', entityId: 'r9', scene: 'poster', previousScene: 'poster', nextScene: 'poster', action: 'add-record', label: '增加：换季陈列', at: '2026-08-09T01:00:00.000Z' }),
    event({ id: 'b', entityId: 'r9', scene: 'poster', previousScene: 'poster', nextScene: 'poster', action: 'edit-record', label: '编辑：换季陈列', at: '2026-08-09T05:00:00.000Z' })
  ])
  assert.equal(result.count, 1)
  assert.equal(result.entries[0].actionLabel, '编辑')
})

test('已撤回的操作、撤回事件本身和自动清理都不算相对昨日的净变动', () => {
  const undone = buildModuleChanges('pickup', [event({ action: 'add-record', undoneAt: '2026-08-09T04:00:00.000Z' })])
  assert.equal(undone.changed, false)

  const undoEvent = buildModuleChanges('pickup', [event({ action: 'undo-operation', label: '撤回：增加' })])
  assert.equal(undoEvent.changed, false)

  const cleanup = buildModuleChanges('pickup', [event({ action: 'auto-cleanup', label: '自动清理：昨日已取车' })])
  assert.equal(cleanup.changed, false)

  const closing = buildModuleChanges('pickup', [event({ entityType: 'daily-closing', action: 'save-kpi' })])
  assert.equal(closing.changed, false)
})

test('维修转待取的事件同时计入维修与待取两个台账的变动', () => {
  const crossScene = event({ action: 'complete-repair', label: '维修完毕并转入待取：某车', scene: 'pickup', previousScene: 'repair', nextScene: 'pickup' })
  assert.equal(buildModuleChanges('repair', [crossScene]).changed, true)
  assert.equal(buildModuleChanges('pickup', [crossScene]).changed, true)
  assert.equal(buildModuleChanges('resale', [crossScene]).changed, false)
})

test('动作标签覆盖真实审计动作名，未知动作有兜底', () => {
  assert.equal(changeActionLabel('add-record'), '新增')
  assert.equal(changeActionLabel('remove-record'), '删除')
  assert.equal(changeActionLabel('update-pickup-notification'), '通知')
  assert.equal(changeActionLabel('complete-handover'), '交接完成')
  assert.equal(changeActionLabel('something-new'), '变动')
})

test('自提车辆着重提示统计等待取车、今日已取车与未通知台数', () => {
  const focus = buildSelfPickupFocus([
    { id: 's1', scene: 'pickup', pickupSource: 'self-pickup', selfPickupPlatform: 'tmall', title: '天猫订单车', notificationStatus: 'pending' },
    { id: 's2', scene: 'pickup', pickupSource: 'self-pickup', selfPickupPlatform: 'jd', title: '京东订单车', notificationStatus: 'notified' },
    { id: 's3', scene: 'pickup', pickupSource: 'self-pickup', title: '已取走的自提车', pickedUpOn: '2026-08-09', pickedUpToday: true },
    { id: 'x1', scene: 'pickup', pickupSource: 'customer-storage', title: '顾客暂存', detail: '暂存' },
    { id: 'x2', scene: 'repair', title: '维修车' }
  ], { dateKey: '2026-08-09' })

  assert.equal(focus.total, 3)
  assert.equal(focus.waitingCount, 2)
  assert.equal(focus.pickedUpTodayCount, 1)
  assert.equal(focus.awaitingNotice, 1)
  assert.equal(focus.tone, 'warn')
  assert.match(focus.headline, /2 台自提车辆仍在等待取车/u)
  assert.match(focus.detail, /1 台还没有通知顾客/u)
  assert.deepEqual(focus.waiting.map((item) => item.platform), ['天猫', '京东'])
  assert.deepEqual(focus.waiting.map((item) => item.notified), [false, true])
})

test('没有等待取车的自提车辆时仍然提示核对当日自提订单是否录入完毕', () => {
  const focus = buildSelfPickupFocus([{ id: 's1', scene: 'pickup', pickupSource: 'self-pickup', title: '已取走', pickedUpOn: '2026-08-09', pickedUpToday: true }], { dateKey: '2026-08-09' })
  assert.equal(focus.tone, 'ok')
  assert.equal(focus.waitingCount, 0)
  assert.equal(focus.pickedUpTodayCount, 1)
  assert.match(focus.detail, /今天新到的自提订单都已录入/u)
})

test('完整模型同时返回三个模块行与自提提示', () => {
  const checklist = buildClosingChecklist({ events: [], records: [], dateKey: '2026-08-09' })
  assert.equal(checklist.modules.length, 3)
  assert.deepEqual(checklist.modules.map((module) => module.changed), [false, false, false])
  assert.ok(checklist.selfPickup)
})

test('闭店闸门：三个模块的全部确认组合中，只有三项齐备才放开', () => {
  const { modules } = buildClosingChecklist({ events: [], records: [], dateKey: '2026-08-09' })
  let openCount = 0
  // All 2^3 combinations, so a future refactor cannot loosen the gate for any subset.
  for (let mask = 0; mask < 8; mask += 1) {
    let confirmed = {}
    let confirmedCount = 0
    modules.forEach((module, index) => {
      if (!(mask & (1 << index))) return
      confirmed = toggleModuleConfirmation(module, confirmed)
      confirmedCount += 1
    })
    const state = closingGateState(modules, confirmed)
    assert.equal(state.pendingCount, 3 - confirmedCount)
    assert.equal(state.gateOpen, confirmedCount === 3)
    if (state.gateOpen) openCount += 1
  }
  assert.equal(openCount, 1)
})

test('闭店闸门文案列出仍待确认的台账名称，齐备后转为可闭店', () => {
  const { modules } = buildClosingChecklist({ events: [], records: [], dateKey: '2026-08-09' })
  const [pickup, poster, repair] = modules
  const none = closingGateState(modules, {})
  assert.equal(none.gateOpen, false)
  assert.equal(none.pendingCount, 3)
  assert.equal(none.pendingLabel, '待取车辆、其它交接、维修交接')
  assert.match(none.message, /还有 3 个台账待确认：待取车辆、其它交接、维修交接。/u)

  let confirmed = toggleModuleConfirmation(pickup, {})
  confirmed = toggleModuleConfirmation(poster, confirmed)
  const partial = closingGateState(modules, confirmed)
  assert.equal(partial.gateOpen, false)
  assert.equal(partial.pendingLabel, '维修交接')
  assert.match(partial.message, /还有 1 个台账待确认：维修交接。/u)

  const all = closingGateState(modules, toggleModuleConfirmation(repair, confirmed))
  assert.equal(all.gateOpen, true)
  assert.equal(all.pendingLabel, '')
  assert.match(all.message, /三个台账都已确认/u)
})

test('再次点击可撤销单个模块的确认', () => {
  const { modules } = buildClosingChecklist({ events: [], records: [], dateKey: '2026-08-09' })
  const [pickup] = modules
  const on = toggleModuleConfirmation(pickup, {})
  assert.equal(isModuleConfirmed(pickup, on), true)
  const off = toggleModuleConfirmation(pickup, on)
  assert.equal(isModuleConfirmed(pickup, off), false)
  assert.equal(closingGateState(modules, off).pendingCount, 3)
})

test('确认后台账被他人改动，该模块的确认自动失效，必须重新核对', () => {
  // The workflow keeps polling while the dialog is open, so another device can change the
  // same store's ledger after a row was acknowledged. The acknowledgement must not survive.
  const before = buildClosingChecklist({ events: [], records: [], dateKey: '2026-08-09' })
  const pickupBefore = before.modules[0]
  const confirmed = toggleModuleConfirmation(pickupBefore, {})
  assert.equal(closingGateState(before.modules, confirmed).gateOpen, false)
  assert.equal(isModuleConfirmed(pickupBefore, confirmed), true)

  const after = buildClosingChecklist({
    events: [event({ id: 'late', entityId: 'late-record', action: 'add-record', label: '增加：同事刚加的车' })],
    records: [],
    dateKey: '2026-08-09'
  })
  const pickupAfter = after.modules[0]
  assert.notEqual(pickupAfter.fingerprint, pickupBefore.fingerprint)
  assert.equal(isModuleConfirmed(pickupAfter, confirmed), false)
  assert.equal(closingGateState(after.modules, confirmed).pendingCount, 3)

  // Re-acknowledging the new change set restores the row.
  const reconfirmed = toggleModuleConfirmation(pickupAfter, confirmed)
  assert.equal(isModuleConfirmed(pickupAfter, reconfirmed), true)
})

test('无变动模块的指纹稳定，后台刷新不会无故清掉已确认状态', () => {
  const first = buildClosingChecklist({ events: [], records: [], dateKey: '2026-08-09' })
  const second = buildClosingChecklist({ events: [], records: [], dateKey: '2026-08-09' })
  const confirmed = toggleModuleConfirmation(first.modules[2], {})
  assert.equal(first.modules[2].fingerprint, 'none')
  assert.equal(isModuleConfirmed(second.modules[2], confirmed), true)
})

test('闭店弹窗三个模块都确认后才放开最终确认闭店按钮', async () => {
  const dialog = await read('apps/web/src/components/dialogs/ConfirmClosingDialog.jsx')
  assert.match(dialog, /buildClosingChecklist/u)
  // The gate rule itself lives in the pure module and is covered exhaustively above; the
  // dialog must consume it rather than re-deriving the condition locally.
  assert.match(dialog, /closingGateState\(modules, confirmed\)/u)
  assert.match(dialog, /const \{ pending, gateOpen, message: gateMessage \} =/u)
  assert.match(dialog, /if \(!gateOpen\) return/u)
  assert.match(dialog, /disabled=\{submitting \|\| !gateOpen\}/u)
  assert.match(dialog, /aria-pressed=\{isConfirmed\}/u)
  // Re-opening the dialog must not inherit a previous session's acknowledgements.
  assert.match(dialog, /if \(open\) setConfirmed\(\{\}\)/u)
})

test('闭店弹窗对无变动模块给出延续提示，对有变动模块列出简短变动项', async () => {
  const dialog = await read('apps/web/src/components/dialogs/ConfirmClosingDialog.jsx')
  assert.match(dialog, /与昨日相同，没有变动/u)
  assert.match(dialog, /没有变动的记录会原样延续到明天/u)
  assert.match(dialog, /formatChangeTally\(module\.tally\)/u)
  assert.match(dialog, /module\.entries\.slice\(0, VISIBLE_CHANGES\)/u)
  assert.match(dialog, /另有 \{module\.entries\.length - VISIBLE_CHANGES\} 项变动/u)
  // The gate copy lives in the pure rule so the dialog cannot drift from it.
  assert.match(dialog, /message: gateMessage/u)
  assert.match(dialog, /\{gateMessage\}/u)
})

test('闭店弹窗着重提示当日自提车辆，并保留原有确认中按钮状态', async () => {
  const dialog = await read('apps/web/src/components/dialogs/ConfirmClosingDialog.jsx')
  assert.match(dialog, /SELF PICKUP · 今日自提车辆/u)
  assert.match(dialog, /data-tone=\{selfPickup\.tone\}/u)
  assert.match(dialog, /selfPickup\.pickedUpTodayCount/u)
  assert.match(dialog, /IconWarning/u)
  assert.match(dialog, /data-processing=\{submitting \? 'true' : undefined\}/u)
  assert.match(dialog, /确认中…/u)
  assert.doesNotMatch(dialog, /closing-confirm-mark/u)
})

test('App 向闭店弹窗传入当日审计事件、台账记录与业务日期', async () => {
  const app = await read('apps/web/src/App.jsx')
  // The JSX line contains inline arrow functions, so assert on the extracted element
  // rather than a `[^>]*` window that cannot cross `=>`.
  const element = app.split('\n').find((line) => line.includes('<ConfirmClosingDialog')) || ''
  assert.match(element, /events=\{workflow\.events\}/u)
  assert.match(element, /records=\{workflow\.records\}/u)
  assert.match(element, /dateKey=\{workflow\.dateKey\}/u)
  assert.match(element, /onConfirm=\{confirmClose\}/u)
})

test('闭店核对视觉沿用 DESIGN.md token，黄色仍只留给唯一主动作', async () => {
  const css = await read('apps/web/src/styles/workshop-system.css')
  assert.match(css, /\.closing-check-focus \{/u)
  assert.match(css, /\.closing-check-row\[data-confirmed='true'\] \{ box-shadow: inset 4px 0 0 var\(--ops-success\); \}/u)
  // 44px touch target per DESIGN.md accessibility baseline.
  assert.match(css, /\.closing-check-action \{[^}]*min-height: 44px/su)
  // The three gate buttons are structural black, not a second yellow primary action.
  assert.match(css, /\.closing-check-action \{[^}]*background: var\(--ops-black\)/su)
  assert.doesNotMatch(css, /\.closing-check-action \{[^}]*background: var\(--ops-yellow\)/su)
  assert.match(css, /\.closing-check-action\[aria-pressed='true'\]/u)
  assert.match(css, /forced-colors: active/u)
  // The retired READY block must not leave dead selectors behind.
  assert.doesNotMatch(css, /closing-confirm-mark/u)
  const components = await read('apps/web/src/styles/components.css')
  assert.doesNotMatch(components, /closing-confirm-mark/u)
})
