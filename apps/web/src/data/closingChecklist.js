import { auditEventBelongsToScene } from './auditEvents.js'
import {
  inferPickupNotificationStatus,
  inferPickupSource,
  selfPickupPlatformLabel
} from './pickupRecord.js'

/**
 * Closing checklist model.
 *
 * The three long-lived handover ledgers (待取 / 其它交接 / 维修) are not required to be
 * edited every day: an untouched record carries over to the next business date. That
 * carry-over is convenient but it also means an operator can close the day without ever
 * looking at a ledger that should have changed. These helpers turn today's audit trail
 * into an explicit per-module acknowledgement so closing states what was reviewed.
 *
 * Order follows the operations index (02 PICKUP / 03 OTHER / 04 REPAIR) so the dialog rows
 * line up with the overview module numbering and the bottom dock.
 */
export const CLOSING_CHECK_MODULES = [
  { id: 'pickup', scene: 'pickup', no: '02', code: 'PICKUP', title: '待取车辆' },
  { id: 'poster', scene: 'poster', no: '03', code: 'OTHER', title: '其它交接' },
  { id: 'repair', scene: 'repair', no: '04', code: 'REPAIR', title: '维修交接' }
]

const ACTION_LABELS = {
  'add-record': '新增',
  'edit-record': '编辑',
  'remove-record': '删除',
  'complete-pickup': '取车',
  'update-pickup-notification': '通知',
  'complete-repair': '维修完成',
  'complete-handover': '交接完成',
  'complete-resale-listing': '上架',
  'sell-resale': '售出'
}

export function changeActionLabel(action) {
  return ACTION_LABELS[action] || '变动'
}

/**
 * Events that do not represent a net human change against yesterday's ledger:
 * - `undoneAt` events were reverted (undo is same-business-day only, so the ledger is back
 *   to its pre-event state);
 * - `undo-operation` is the reverting event itself, so counting it would double-report;
 * - `auto-cleanup` is bootstrap housekeeping that retires items completed on earlier dates.
 */
function isNetChange(event) {
  if (!event || event.entityType !== 'work-item') return false
  if (event.undoneAt) return false
  return event.action !== 'undo-operation' && event.action !== 'auto-cleanup'
}

function newerFirst(a, b) {
  return String(b?.at || '').localeCompare(String(a?.at || ''))
}

/**
 * Net change set for one module today, deduplicated to one entry per record so a record
 * added and then edited reads as a single changed vehicle rather than two.
 */
export function buildModuleChanges(scene, events = []) {
  const relevant = (events || []).filter((event) => isNetChange(event) && auditEventBelongsToScene(event, scene))
  const latestByRecord = new Map()
  for (const event of relevant) {
    const key = event.entityId || event.id
    const current = latestByRecord.get(key)
    if (!current || newerFirst(event, current) < 0) latestByRecord.set(key, event)
  }
  const entries = [...latestByRecord.values()].sort(newerFirst).map((event) => ({
    id: event.id,
    entityId: event.entityId || '',
    action: event.action,
    actionLabel: changeActionLabel(event.action),
    label: event.label || changeActionLabel(event.action),
    at: event.at || ''
  }))
  const counts = new Map()
  for (const entry of entries) counts.set(entry.action, (counts.get(entry.action) || 0) + 1)
  return {
    scene,
    changed: entries.length > 0,
    count: entries.length,
    entries,
    tally: [...counts.entries()].map(([action, count]) => ({ action, actionLabel: changeActionLabel(action), count })),
    // Identity of exactly what the operator was shown. The workflow keeps polling while the
    // dialog is open (45s interval plus window focus), so a colleague editing the same store
    // from another device can change this set after it was acknowledged. Binding the
    // acknowledgement to this fingerprint makes such a confirmation drop itself instead of
    // silently vouching for a ledger the operator never saw.
    fingerprint: entries.length ? `${entries.length}:${entries.map((entry) => entry.id).join('|')}` : 'none'
  }
}

export function formatChangeTally(tally = []) {
  return tally.map(({ actionLabel, count }) => `${actionLabel} ${count}`).join(' · ')
}

/**
 * Self-pickup (online order) vehicles need an explicit daily read: they arrive and leave on
 * their own schedule, so a stale row is the most common closing mistake in this ledger.
 */
export function buildSelfPickupFocus(records = [], { dateKey = '' } = {}) {
  const selfPickup = (records || []).filter((record) => record?.scene === 'pickup' && inferPickupSource(record) === 'self-pickup')
  const pickedUpToday = selfPickup.filter((record) => Boolean(record.pickedUpToday) || (Boolean(dateKey) && record.pickedUpOn === dateKey))
  const waiting = selfPickup.filter((record) => !record.pickedUpOn)
  const waitingList = waiting.map((record) => ({
    id: record.id,
    title: record.title || '未命名车辆',
    platform: selfPickupPlatformLabel(record),
    notified: inferPickupNotificationStatus(record) === 'notified'
  }))
  const awaitingNotice = waitingList.filter((item) => !item.notified).length
  return {
    total: selfPickup.length,
    waitingCount: waiting.length,
    pickedUpTodayCount: pickedUpToday.length,
    awaitingNotice,
    waiting: waitingList,
    tone: waiting.length ? 'warn' : 'ok',
    headline: waiting.length
      ? `${waiting.length} 台自提车辆仍在等待取车`
      : '没有等待取车的自提车辆',
    detail: waiting.length
      ? awaitingNotice
        ? `其中 ${awaitingNotice} 台还没有通知顾客。请逐台核对今天是否已被取走、状态是否已更新。`
        : '全部已通知顾客。请逐台核对今天是否已被取走、状态是否已更新。'
      : '请确认今天新到的自提订单都已录入，已取走的都已确认取车。'
  }
}

/** Full dialog model: one row per module plus the self-pickup emphasis. */
export function buildClosingChecklist({ events = [], records = [], dateKey = '' } = {}) {
  return {
    modules: CLOSING_CHECK_MODULES.map((module) => ({ ...module, ...buildModuleChanges(module.scene, events) })),
    selfPickup: buildSelfPickupFocus(records, { dateKey })
  }
}

/**
 * The closing gate. Every module must be acknowledged before the day can be closed, so the
 * rule lives here as pure logic instead of inline in the dialog: it is the one decision in
 * this feature that must never silently regress.
 */
export function closingGateState(modules = [], confirmed = {}) {
  const pending = (modules || []).filter((module) => !isModuleConfirmed(module, confirmed))
  const pendingLabel = pending.map((module) => module.title).join('、')
  return {
    pending,
    pendingCount: pending.length,
    gateOpen: pending.length === 0,
    pendingLabel,
    message: pending.length
      ? `还有 ${pending.length} 个台账待确认：${pendingLabel}。`
      : '三个台账都已确认，可以完成闭店。'
  }
}

/**
 * A module counts as confirmed only while the change set still matches the one that was
 * acknowledged. If a background refresh brings in a new change, the stored fingerprint stops
 * matching and the row returns to unconfirmed.
 */
export function isModuleConfirmed(module, confirmed = {}) {
  if (!module) return false
  return Boolean(confirmed?.[module.id]) && confirmed[module.id] === module.fingerprint
}

/** Records an acknowledgement against the exact change set on screen, or clears it. */
export function toggleModuleConfirmation(module, confirmed = {}) {
  const next = { ...confirmed }
  if (isModuleConfirmed(module, confirmed)) delete next[module.id]
  else next[module.id] = module.fingerprint
  return next
}
