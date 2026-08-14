import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  CLOSING_CHECK_MODULES,
  IN_STORE_SOURCE_ORDER,
  STALE_AFTER_DAYS,
  buildClosingChecklist,
  buildInStoreFocus,
  buildModuleBacklog,
  buildModuleChanges,
  buildUsedCarCrossCheck,
  changeActionLabel,
  closingGateState,
  dayGap,
  formatAgeLabel,
  formatChangeTally,
  isModuleConfirmed,
  isOpenForScene,
  noChangeMessage,
  recordAgeDays,
  recordDateKey,
  toggleModuleConfirmation
} from '../apps/web/src/data/closingChecklist.js'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

const TODAY = '2026-08-11'

/**
 * Fixture timestamps use 04:00Z so the derived local calendar day is identical in UTC (CI and
 * the sandbox) and in Asia/Shanghai (the store). Times near midnight would make these
 * assertions depend on the runner's timezone.
 */
const at = (dateKey) => `${dateKey}T04:00:00.000Z`

const event = (overrides) => ({
  id: `e-${Math.random().toString(16).slice(2)}`,
  entityType: 'work-item',
  entityId: 'r1',
  scene: 'pickup',
  action: 'add-record',
  label: '增加：捷安特 ATX 860',
  at: '2026-08-11T04:10:00.000Z',
  ...overrides
})

const pickup = (overrides) => ({
  id: `p-${Math.random().toString(16).slice(2)}`,
  scene: 'pickup',
  title: '待取车',
  lifecycle: 'active',
  pickupSource: 'customer-storage',
  createdAt: at(TODAY),
  ...overrides
})

test('闭店核对覆盖待取、其它交接、维修三个跨日台账，顺序对齐总览模块编号', () => {
  assert.deepEqual(CLOSING_CHECK_MODULES.map((module) => module.id), ['pickup', 'poster', 'repair'])
  assert.deepEqual(CLOSING_CHECK_MODULES.map((module) => module.no), ['02', '03', '04'])
  assert.deepEqual(CLOSING_CHECK_MODULES.map((module) => module.scene), ['pickup', 'poster', 'repair'])
})

test('模块今天没有审计事件时判定为与昨日相同', () => {
  const changes = buildModuleChanges('repair', [event({ scene: 'pickup' })])
  assert.equal(changes.changed, false)
  assert.equal(changes.count, 0)
  assert.equal(changes.fingerprint, 'none')
})

test('有变动时给出简短变动项与动作计数', () => {
  const changes = buildModuleChanges('pickup', [
    // Distinct timestamps on purpose: equal times would tie and leave insertion order,
    // so "newest first" would not actually be under test.
    event({ id: 'e1', entityId: 'r1', action: 'add-record', at: at(TODAY), label: '增加：A 车' }),
    event({ id: 'e2', entityId: 'r2', action: 'complete-pickup', at: '2026-08-11T06:00:00.000Z', label: '确认取车：B 车' })
  ])
  assert.equal(changes.changed, true)
  assert.equal(changes.count, 2)
  // Tally follows entry order, so it reads most-recent-action first.
  assert.equal(formatChangeTally(changes.tally), '取车 1 · 新增 1')
  assert.deepEqual(changes.entries.map((entry) => entry.label), ['确认取车：B 车', '增加：A 车'])
})

test('同一条记录当天多次操作只算一项变动，并保留最后一次动作', () => {
  const changes = buildModuleChanges('pickup', [
    event({ id: 'e1', entityId: 'r1', action: 'add-record', at: '2026-08-11T04:00:00.000Z' }),
    event({ id: 'e2', entityId: 'r1', action: 'edit-record', at: '2026-08-11T05:00:00.000Z', label: '编辑：A 车' })
  ])
  assert.equal(changes.count, 1)
  assert.equal(changes.entries[0].actionLabel, '编辑')
})

test('已撤回的操作、撤回事件本身和自动清理都不算相对昨日的净变动', () => {
  const changes = buildModuleChanges('pickup', [
    event({ id: 'e1', entityId: 'r1', undoneAt: '2026-08-11T06:00:00.000Z' }),
    event({ id: 'e2', entityId: 'r2', action: 'undo-operation' }),
    event({ id: 'e3', entityId: 'r3', action: 'auto-cleanup' })
  ])
  assert.equal(changes.changed, false)
})

test('维修转待取的事件同时计入维修与待取两个台账的变动', () => {
  const events = [event({ id: 'e1', entityId: 'r1', scene: 'pickup', previousScene: 'repair', action: 'complete-repair', label: '维修完成：C 车' })]
  assert.equal(buildModuleChanges('pickup', events).count, 1)
  assert.equal(buildModuleChanges('repair', events).count, 1)
})

test('动作标签覆盖真实审计动作名，未知动作有兜底', () => {
  assert.equal(changeActionLabel('complete-pickup'), '取车')
  assert.equal(changeActionLabel('update-pickup-notification'), '通知')
  assert.equal(changeActionLabel('complete-handover'), '交接完成')
  assert.equal(changeActionLabel('something-new'), '变动')
})

test('挂账天数按本地日历日相减，今天新增显示为今天', () => {
  assert.equal(recordDateKey(at('2026-08-08')), '2026-08-08')
  assert.equal(recordDateKey(''), '')
  assert.equal(recordDateKey('not-a-date'), '')
  assert.equal(dayGap('2026-08-08', TODAY), 3)
  assert.equal(dayGap('', TODAY), 0)
  // Never negative: a clock skew must not render as "已挂账 -1 天".
  assert.equal(dayGap('2026-08-12', TODAY), 0)
  assert.equal(recordAgeDays({ createdAt: at('2026-08-08') }, TODAY), 3)
  assert.equal(formatAgeLabel(0), '今天新增')
  assert.equal(formatAgeLabel(1), '已挂账 1 天')
  assert.equal(formatAgeLabel(5), '已挂账 5 天')
})

test('跨月与跨年的挂账天数计算正确', () => {
  assert.equal(dayGap('2026-07-30', '2026-08-02'), 3)
  assert.equal(dayGap('2025-12-30', '2026-01-02'), 3)
})

test('未完成判定与日报图一致：取车、完成、售出的记录都不再计入', () => {
  assert.equal(isOpenForScene(pickup({}), 'pickup'), true)
  assert.equal(isOpenForScene(pickup({ pickedUpOn: TODAY }), 'pickup'), false)
  assert.equal(isOpenForScene(pickup({ lifecycle: 'picked-up' }), 'pickup'), false)
  assert.equal(isOpenForScene(pickup({ lifecycle: 'sold' }), 'pickup'), false)
  assert.equal(isOpenForScene({ scene: 'repair', lifecycle: 'active' }, 'repair'), true)
  assert.equal(isOpenForScene({ scene: 'repair', lifecycle: 'active', completedOn: TODAY }, 'repair'), false)
  assert.equal(isOpenForScene({ scene: 'poster', lifecycle: 'completed' }, 'poster'), false)
  assert.equal(isOpenForScene(null, 'pickup'), false)
})

test('台账积压按最久优先排序，并标出超过阈值的挂账项', () => {
  const backlog = buildModuleBacklog('pickup', [
    pickup({ id: 'a', title: '新车', createdAt: at(TODAY) }),
    pickup({ id: 'b', title: '老车', createdAt: at('2026-08-05') }),
    pickup({ id: 'c', title: '已取走', pickedUpOn: TODAY, createdAt: at('2026-08-01') })
  ], { dateKey: TODAY })
  assert.equal(backlog.openCount, 2)
  assert.deepEqual(backlog.items.map((item) => item.title), ['老车', '新车'])
  assert.equal(backlog.oldestDays, 6)
  assert.equal(backlog.staleCount, 1)
})

test('无变动模块的文案点名挂账风险，不再是安心的延续提示', () => {
  const stale = noChangeMessage({ openCount: 2, oldestDays: 6, staleCount: 1 })
  assert.match(stale, /今天没有任何变动/u)
  assert.match(stale, /还有 2 项未完成/u)
  assert.match(stale, /已挂账 6 天/u)
  assert.match(stale, /不是忘了记录/u)

  const fresh = noChangeMessage({ openCount: 1, oldestDays: 1, staleCount: 0 })
  assert.match(fresh, /今天没有变动/u)
  assert.match(fresh, /真实情况/u)

  const empty = noChangeMessage({ openCount: 0, oldestDays: 0, staleCount: 0 })
  assert.match(empty, /没有未完成的记录/u)
})

test('在店车辆逐台核对覆盖四种来源，自提与二手车排在最前', () => {
  assert.deepEqual(IN_STORE_SOURCE_ORDER, ['self-pickup', 'used-car', 'customer-storage', 'repair'])
  const focus = buildInStoreFocus([
    pickup({ id: 'r1', pickupSource: 'repair', title: '维修车', repairType: '付费', status: '维修完成-已开付款单' }),
    pickup({ id: 'c1', pickupSource: 'customer-storage', title: '暂存车' }),
    pickup({ id: 'u1', pickupSource: 'used-car', title: '二手车', notificationStatus: 'pending' }),
    pickup({ id: 's1', pickupSource: 'self-pickup', selfPickupPlatform: 'jd', title: '京东自提车', notificationStatus: 'pending' })
  ], { dateKey: TODAY })

  assert.equal(focus.waitingCount, 4)
  assert.deepEqual(focus.groups.map((group) => group.source), ['self-pickup', 'used-car', 'customer-storage', 'repair'])
  assert.deepEqual(focus.groups.map((group) => group.count), [1, 1, 1, 1])
  assert.equal(focus.groups[0].label, '自提订单车辆')
  assert.equal(focus.groups[1].label, '二手车')
})

test('二手车待取被逐台列出，这是图二事故里被漏掉的那一类', () => {
  const focus = buildInStoreFocus([
    pickup({ id: 'u1', pickupSource: 'used-car', title: 'JD 自营二手车', notificationStatus: 'pending' })
  ], { dateKey: TODAY })
  const usedGroup = focus.groups.find((group) => group.source === 'used-car')
  assert.ok(usedGroup, '二手车必须单独成组')
  assert.equal(usedGroup.items[0].title, 'JD 自营二手车')
  assert.equal(usedGroup.awaitingNotice, 1)
  assert.equal(focus.tone, 'warn')
})

test('维修车不参与通知状态统计，其它来源参与', () => {
  const focus = buildInStoreFocus([
    pickup({ id: 'r1', pickupSource: 'repair', title: '维修车', repairType: '付费', status: '维修完成-已开付款单' }),
    pickup({ id: 'u1', pickupSource: 'used-car', title: '二手车', notificationStatus: 'pending' }),
    pickup({ id: 'c1', pickupSource: 'customer-storage', title: '暂存车', notificationStatus: 'notified' })
  ], { dateKey: TODAY })
  const byId = new Map(focus.items.map((item) => [item.id, item]))
  assert.equal(byId.get('r1').notified, null)
  assert.equal(byId.get('u1').notified, false)
  assert.equal(byId.get('c1').notified, true)
  assert.equal(focus.awaitingNotice, 1)
})

test('在店核对给出现场对账台数，并统计今日已取车与挂账偏久台数', () => {
  const focus = buildInStoreFocus([
    pickup({ id: 'a', title: '老车', createdAt: at('2026-08-01') }),
    pickup({ id: 'b', title: '新车', createdAt: at(TODAY) }),
    pickup({ id: 'c', title: '今天取走', pickedUpOn: TODAY, pickedUpToday: true, createdAt: at('2026-08-09') })
  ], { dateKey: TODAY })
  assert.equal(focus.waitingCount, 2)
  assert.equal(focus.pickedUpTodayCount, 1)
  assert.equal(focus.staleCount, 1)
  assert.equal(focus.oldestDays, 10)
  assert.match(focus.headline, /还有 2 台车在店里/u)
  assert.match(focus.reconcileLabel, /到现场数一次/u)
  assert.match(focus.reconcileLabel, /应该有 2 台车/u)
  assert.match(focus.reconcileLabel, new RegExp(`1 台已挂账 ${STALE_AFTER_DAYS} 天以上`, 'u'))
})

test('在店核对提示闭店后普通伙伴无法补记，日期会落到错误的一天', () => {
  const focus = buildInStoreFocus([pickup({ id: 'a' })], { dateKey: TODAY })
  assert.match(focus.detail, /已经被顾客取走就现在点确认取车/u)
  assert.match(focus.detail, /闭店后普通伙伴改不了/u)
})

test('没有在店车辆时转为 ok 态，并要求确认新到自提与卖掉的二手车都已录入', () => {
  const focus = buildInStoreFocus([
    pickup({ id: 'a', pickedUpOn: TODAY, pickedUpToday: true })
  ], { dateKey: TODAY })
  assert.equal(focus.tone, 'ok')
  assert.equal(focus.waitingCount, 0)
  assert.equal(focus.reconcileLabel, '')
  assert.match(focus.headline, /没有留在店里的车/u)
  assert.match(focus.detail, /卖掉的二手车都已录入/u)
})

test('二手车交叉校验只在今天有二手车销售时出现，且当天售出多于在册不算错', () => {
  const none = buildUsedCarCrossCheck([], { usedSold: 0 }, { dateKey: TODAY })
  assert.equal(none.applicable, false)
  assert.equal(none.message, '')

  const missing = buildUsedCarCrossCheck([], { usedSold: 2 }, { dateKey: TODAY })
  assert.equal(missing.applicable, true)
  assert.equal(missing.soldToday, 2)
  assert.equal(missing.loggedToday, 0)
  assert.equal(missing.tone, 'warn')
  assert.match(missing.message, /今天销售二手车 2 台/u)
  assert.match(missing.message, /其中 0 台已加入待取台账/u)
  assert.match(missing.message, /当天就被骑走的不用记/u)

  const matched = buildUsedCarCrossCheck([
    pickup({ id: 'u1', pickupSource: 'used-car', createdAt: at(TODAY) })
  ], { usedSold: 1 }, { dateKey: TODAY })
  assert.equal(matched.loggedToday, 1)
  assert.equal(matched.tone, 'ok')
})

test('二手车交叉校验只统计今天新增的二手车待取行', () => {
  const check = buildUsedCarCrossCheck([
    pickup({ id: 'u1', pickupSource: 'used-car', createdAt: at('2026-08-05') }),
    pickup({ id: 'u2', pickupSource: 'used-car', createdAt: at(TODAY) })
  ], { usedSold: 1 }, { dateKey: TODAY })
  assert.equal(check.loggedToday, 1)
})

test('完整模型同时返回三个模块行、在店核对与二手车校验', () => {
  const checklist = buildClosingChecklist({ events: [], records: [], dateKey: TODAY, kpi: {} })
  assert.equal(checklist.modules.length, 3)
  assert.deepEqual(checklist.modules.map((module) => module.changed), [false, false, false])
  assert.ok(checklist.inStore)
  assert.ok(checklist.usedCar)
  assert.ok(checklist.modules.every((module) => module.backlog))
})

test('无变动模块在完整模型里带上挂账文案，有变动模块不带', () => {
  const checklist = buildClosingChecklist({
    events: [event({ id: 'e1', entityId: 'r1', scene: 'pickup', action: 'add-record' })],
    records: [pickup({ id: 'r9', createdAt: at('2026-08-04') })],
    dateKey: TODAY,
    kpi: {}
  })
  const [pickupModule, posterModule] = checklist.modules
  assert.equal(pickupModule.changed, true)
  assert.equal(pickupModule.carryMessage, '')
  assert.equal(posterModule.changed, false)
  assert.match(posterModule.carryMessage, /今天没有变动/u)
})

test('闭店闸门：三个模块的全部确认组合中，只有三项齐备才放开', () => {
  const { modules } = buildClosingChecklist({ events: [], records: [], dateKey: TODAY, kpi: {} })
  let openCount = 0
  // All 2^3 combinations, so a future refactor cannot loosen the gate for any subset.
  for (let mask = 0; mask < 8; mask += 1) {
    let confirmed = {}
    modules.forEach((module, index) => {
      if (mask & (1 << index)) confirmed = toggleModuleConfirmation(module, confirmed)
    })
    const state = closingGateState(modules, confirmed)
    const confirmedCount = modules.filter((module) => isModuleConfirmed(module, confirmed)).length
    assert.equal(state.pendingCount, 3 - confirmedCount)
    assert.equal(state.gateOpen, confirmedCount === 3)
    if (state.gateOpen) openCount += 1
  }
  assert.equal(openCount, 1)
})

test('闭店闸门文案列出仍待确认的台账名称，齐备后转为可闭店', () => {
  const { modules } = buildClosingChecklist({ events: [], records: [], dateKey: TODAY, kpi: {} })
  const none = closingGateState(modules, {})
  assert.equal(none.gateOpen, false)
  assert.equal(none.pendingCount, 3)
  assert.equal(none.pendingLabel, '待取车辆、其它交接、维修交接')
  assert.match(none.message, /还有 3 个台账待确认：待取车辆、其它交接、维修交接。/u)

  let partial = {}
  partial = toggleModuleConfirmation(modules[0], partial)
  partial = toggleModuleConfirmation(modules[1], partial)
  const partialState = closingGateState(modules, partial)
  assert.equal(partialState.gateOpen, false)
  assert.equal(partialState.pendingLabel, '维修交接')
  assert.match(partialState.message, /还有 1 个台账待确认：维修交接。/u)

  let all = {}
  for (const module of modules) all = toggleModuleConfirmation(module, all)
  const allState = closingGateState(modules, all)
  assert.equal(allState.gateOpen, true)
  assert.equal(allState.pendingLabel, '')
  assert.match(allState.message, /三个台账都已确认/u)
})

test('再次点击可撤销单个模块的确认', () => {
  const { modules } = buildClosingChecklist({ events: [], records: [], dateKey: TODAY, kpi: {} })
  const once = toggleModuleConfirmation(modules[0], {})
  assert.equal(isModuleConfirmed(modules[0], once), true)
  const twice = toggleModuleConfirmation(modules[0], once)
  assert.equal(isModuleConfirmed(modules[0], twice), false)
})

test('确认后台账被他人改动，该模块的确认自动失效，必须重新核对', () => {
  const before = buildClosingChecklist({
    events: [event({ id: 'e1', entityId: 'r1', scene: 'pickup' })],
    records: [],
    dateKey: TODAY,
    kpi: {}
  })
  const confirmed = toggleModuleConfirmation(before.modules[0], {})
  assert.equal(isModuleConfirmed(before.modules[0], confirmed), true)

  // A colleague edits the same ledger from another device; the workflow polls and the change
  // set the operator acknowledged is no longer what is on screen.
  const after = buildClosingChecklist({
    events: [
      event({ id: 'e1', entityId: 'r1', scene: 'pickup' }),
      event({ id: 'e2', entityId: 'r2', scene: 'pickup', action: 'complete-pickup' })
    ],
    records: [],
    dateKey: TODAY,
    kpi: {}
  })
  assert.equal(isModuleConfirmed(after.modules[0], confirmed), false)
  assert.equal(closingGateState(after.modules, confirmed).pendingCount, 3)
})

test('无变动模块的指纹稳定，后台刷新不会无故清掉已确认状态', () => {
  const first = buildClosingChecklist({ events: [], records: [], dateKey: TODAY, kpi: {} })
  const confirmed = toggleModuleConfirmation(first.modules[1], {})
  const second = buildClosingChecklist({ events: [], records: [], dateKey: TODAY, kpi: {} })
  assert.equal(isModuleConfirmed(second.modules[1], confirmed), true)
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
  assert.match(dialog, /toggleModuleConfirmation\(module, current\)/u)
})

test('闭店弹窗对无变动模块给出挂账文案，对有变动模块列出简短变动项', async () => {
  const dialog = await read('apps/web/src/components/dialogs/ConfirmClosingDialog.jsx')
  assert.match(dialog, /module\.carryMessage/u)
  assert.match(dialog, /closing-check-carry/u)
  assert.match(dialog, /formatChangeTally\(module\.tally\)/u)
  assert.match(dialog, /entries\.slice\(0, VISIBLE_CHANGES\)/u)
  assert.match(dialog, /另有 \{module\.entries\.length - VISIBLE_CHANGES\} 项变动/u)
  assert.match(dialog, /module\.backlog\.openCount/u)
})

test('闭店弹窗渲染在店车辆分组、现场对账与二手车交叉校验', async () => {
  const dialog = await read('apps/web/src/components/dialogs/ConfirmClosingDialog.jsx')
  assert.match(dialog, /IN STORE · 台账上还在店里的车/u)
  assert.match(dialog, /data-tone=\{inStore\.tone\}/u)
  assert.match(dialog, /inStore\.pickedUpTodayCount/u)
  assert.match(dialog, /inStore\.groups\.map/u)
  assert.match(dialog, /inStore\.reconcileLabel/u)
  assert.match(dialog, /closing-check-reconcile/u)
  assert.match(dialog, /usedCar\.applicable/u)
  assert.match(dialog, /closing-check-crosscheck/u)
  // Aging must be visible per vehicle: that is what tells an operator a bike probably left.
  assert.match(dialog, /item\.ageLabel/u)
  assert.match(dialog, /data-stale=\{item\.stale \? 'true' : 'false'\}/u)
})

test('App 向闭店弹窗传入当日审计事件、台账记录、业务日期与销售数据', async () => {
  const app = await read('apps/web/src/App.jsx')
  const line = app.split('\n').find((row) => row.includes('<ClosingCheckPage'))
  assert.ok(line, '必须渲染 ClosingCheckPage')
  assert.match(line, /events=\{workflow\.events\}/u)
  assert.match(line, /records=\{workflow\.records\}/u)
  assert.match(line, /dateKey=\{workflow\.dateKey\}/u)
  assert.match(line, /kpi=\{workflow\.kpi\}/u)
})

test('闭店核对视觉沿用 DESIGN.md token，黄色仍只留给唯一主动作', async () => {
  const css = await read('apps/web/src/styles/workshop-system.css')
  assert.match(css, /\.closing-check-focus \{/u)
  assert.match(css, /\.closing-check-group \{/u)
  assert.match(css, /\.closing-check-reconcile \{/u)
  assert.match(css, /\.closing-check-crosscheck \{/u)
  // Module acknowledgement buttons are structural, so they stay black; the single yellow
  // primary action in this decision area remains 确认闭店.
  const action = css.match(/\.closing-check-action \{[^}]*\}/u)?.[0] || ''
  assert.match(action, /var\(--ops-black\)/u)
  assert.doesNotMatch(action, /--ops-yellow/u)
  // Risk states must not rely on colour alone under forced colours.
  const forced = css.match(/@media \(forced-colors: active\) \{[\s\S]*?\n\}/u)?.[0] || ''
  assert.match(forced, /closing-check-focus/u)
  assert.match(forced, /closing-check-crosscheck/u)
  assert.match(forced, /closing-check-focus-list li\[data-stale='true'\]/u)
})
