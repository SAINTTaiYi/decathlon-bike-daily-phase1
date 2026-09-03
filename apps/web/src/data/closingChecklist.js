import { auditEventBelongsToScene } from './auditEvents.js'
import {
  inferPickupNotificationStatus,
  inferPickupSource,
  pickupSourceLabel,
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
 *
 * The failure this is built to prevent: a bike physically left the store but nobody pressed
 * 确认取车, the day was closed, and the correction had to happen the next morning by hand
 * (so the pickup lands on the wrong business date). "No change today" is therefore not a
 * reassurance — on this ledger it is the highest-risk state, and the copy says so.
 */
export const CLOSING_CHECK_MODULES = [
  { id: 'pickup', scene: 'pickup', no: '02', code: 'PICKUP', title: '待取车辆' },
  { id: 'poster', scene: 'poster', no: '03', code: 'OTHER', title: '其它交接' },
  { id: 'repair', scene: 'repair', no: '04', code: 'REPAIR', title: '维修交接' }
]

/**
 * Group order for the in-store roll call. Self-pickup and used-car lead because those are the
 * two sources that produced the missed-pickup incident: both leave the store on the customer's
 * schedule, and used-car rows are now the only place a sold second-hand bike is tracked here
 * (the 05 二手车 module is being retired in favour of the official used-bike software).
 */
export const IN_STORE_SOURCE_ORDER = ['self-pickup', 'used-car', 'customer-storage', 'repair']

/** A row sitting this long with no activity is called out as an aging liability. */
export const STALE_AFTER_DAYS = 3

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
 * Local calendar date of a record's creation. Records carry a UTC instant (`createdAt`) but no
 * per-row business date, so the store's own calendar day is derived with local Date accessors —
 * in the browser that is the store's timezone, which is what "挂账几天" has to mean.
 */
export function recordDateKey(createdAt) {
  if (!createdAt) return ''
  const at = new Date(createdAt)
  if (Number.isNaN(at.getTime())) return ''
  const year = at.getFullYear()
  const month = String(at.getMonth() + 1).padStart(2, '0')
  const day = String(at.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Whole days between two `YYYY-MM-DD` keys. Anchored at UTC midnight on purpose: the inputs are
 * already calendar dates, so anchoring locally would let a DST shift turn a day into 23 or 25
 * hours and round the gap to the wrong integer.
 */
export function dayGap(fromDateKey, toDateKey) {
  if (!fromDateKey || !toDateKey) return 0
  const from = Date.parse(`${fromDateKey}T00:00:00Z`)
  const to = Date.parse(`${toDateKey}T00:00:00Z`)
  if (Number.isNaN(from) || Number.isNaN(to)) return 0
  return Math.max(0, Math.round((to - from) / 86400000))
}

/** How many days a record has been carried on the ledger, as of the given business date. */
export function recordAgeDays(record, dateKey = '') {
  return dayGap(recordDateKey(record?.createdAt), dateKey)
}

export function formatAgeLabel(days) {
  if (days <= 0) return '今天新增'
  if (days === 1) return '已挂账 1 天'
  return `已挂账 ${days} 天`
}

/**
 * Still-open rows per ledger, using the same definitions the closing report image already
 * relies on so the dialog and the exported report can never disagree about what is unfinished.
 */
export function isOpenForScene(record, scene) {
  if (!record || record.scene !== scene) return false
  if (scene === 'pickup') return !record.pickedUpOn && record.lifecycle !== 'picked-up' && record.lifecycle !== 'sold'
  return !record.completedOn && record.lifecycle === 'active'
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
    // dialog is open (5min interval plus window focus), so a colleague editing the same store
    // from another device can change this set after it was acknowledged. Binding the
    // acknowledgement to this fingerprint makes such a confirmation drop itself instead of
    // silently vouching for a ledger the operator never saw.
    fingerprint: entries.length ? `${entries.length}:${entries.map((entry) => entry.id).join('|')}` : 'none'
  }
}

/** Aging summary of a ledger's still-open rows, oldest first. */
export function buildModuleBacklog(scene, records = [], { dateKey = '' } = {}) {
  const open = (records || [])
    .filter((record) => isOpenForScene(record, scene))
    .map((record) => ({
      id: record.id,
      title: record.title || '未命名记录',
      ageDays: recordAgeDays(record, dateKey),
      stale: recordAgeDays(record, dateKey) >= STALE_AFTER_DAYS
    }))
    .sort((a, b) => b.ageDays - a.ageDays)
  const oldestDays = open.length ? open[0].ageDays : 0
  return {
    openCount: open.length,
    items: open,
    oldestDays,
    staleCount: open.filter((item) => item.stale).length
  }
}

export function formatChangeTally(tally = []) {
  return tally.map(({ actionLabel, count }) => `${actionLabel} ${count}`).join(' · ')
}

/**
 * Copy for a ledger with no net change today. Deliberately not reassuring: an untouched row is
 * exactly how a bike that already left the store stays on the books.
 */
export function noChangeMessage(backlog) {
  if (!backlog?.openCount) return '今天没有变动，台账也没有未完成的记录。'
  const oldest = formatAgeLabel(backlog.oldestDays)
  if (backlog.staleCount) {
    return `今天没有任何变动，但台账上还有 ${backlog.openCount} 项未完成，最久的${oldest}。请确认它们确实还没处理完，不是忘了记录。`
  }
  return `今天没有变动，台账上还有 ${backlog.openCount} 项未完成，最久的${oldest}。请确认这就是今天的真实情况。`
}

/**
 * In-store roll call across every pickup source, grouped so the two customer-scheduled sources
 * (self-pickup and used-car) are read first. This is the direct guard against the missed
 * 确认取车: every bike the ledger still believes is in the shop has to be looked at by name.
 */
export function buildInStoreFocus(records = [], { dateKey = '' } = {}) {
  const pickups = (records || []).filter((record) => record?.scene === 'pickup')
  const waiting = pickups.filter((record) => isOpenForScene(record, 'pickup'))
  const pickedUpToday = pickups.filter((record) => Boolean(record.pickedUpToday) || (Boolean(dateKey) && record.pickedUpOn === dateKey))

  const items = waiting.map((record) => {
    const source = inferPickupSource(record)
    const ageDays = recordAgeDays(record, dateKey)
    return {
      id: record.id,
      title: record.title || '未命名车辆',
      source,
      sourceLabel: pickupSourceLabel(record),
      platform: selfPickupPlatformLabel(record),
      ageDays,
      ageLabel: formatAgeLabel(ageDays),
      stale: ageDays >= STALE_AFTER_DAYS,
      // Notification state is meaningless for repair rows: those are driven by repair status.
      notified: source === 'repair' ? null : inferPickupNotificationStatus(record) === 'notified'
    }
  })

  const groups = IN_STORE_SOURCE_ORDER
    .map((source) => {
      const groupItems = items.filter((item) => item.source === source).sort((a, b) => b.ageDays - a.ageDays)
      return {
        source,
        label: groupItems[0]?.sourceLabel || pickupSourceLabel({ pickupSource: source }),
        count: groupItems.length,
        awaitingNotice: groupItems.filter((item) => item.notified === false).length,
        staleCount: groupItems.filter((item) => item.stale).length,
        items: groupItems
      }
    })
    .filter((group) => group.count > 0)

  const awaitingNotice = items.filter((item) => item.notified === false).length
  const staleCount = items.filter((item) => item.stale).length
  const oldestDays = items.reduce((max, item) => Math.max(max, item.ageDays), 0)

  return {
    total: pickups.length,
    waitingCount: waiting.length,
    pickedUpTodayCount: pickedUpToday.length,
    awaitingNotice,
    staleCount,
    oldestDays,
    items,
    groups,
    tone: waiting.length ? 'warn' : 'ok',
    headline: waiting.length
      ? `台账上还有 ${waiting.length} 台车在店里`
      : '台账上没有留在店里的车',
    detail: waiting.length
      ? '请逐台对照现场：车还在店里就跳过，已经被顾客取走就现在点确认取车。闭店后普通伙伴改不了，只能第二天补记到错误的日期上。'
      : '请确认今天新到的自提订单、卖掉的二手车都已录入台账。',
    // The reconciliation prompt: comparing this number against the floor is the only way to
    // catch "the system says it is here but it is not".
    reconcileLabel: waiting.length
      ? `请到现场数一次：应该有 ${waiting.length} 台车${staleCount ? `，其中 ${staleCount} 台已挂账 ${STALE_AFTER_DAYS} 天以上` : ''}。`
      : ''
  }
}

/**
 * Soft cross-check between the sales figure and the ledger. Second-hand sales now live in the
 * official used-bike software, so the KPI number is the only independent second source for
 * "a used bike was sold today". Deliberately advisory, never a gate: a bike sold and ridden
 * away the same day never needs a pickup row, so sold > logged is perfectly normal.
 */
export function buildUsedCarCrossCheck(records = [], kpi = {}, { dateKey = '' } = {}) {
  const soldToday = Number(kpi?.usedSold ?? 0)
  const loggedToday = (records || []).filter((record) => (
    record?.scene === 'pickup'
    && inferPickupSource(record) === 'used-car'
    && Boolean(dateKey)
    && recordDateKey(record.createdAt) === dateKey
  )).length
  const applicable = soldToday > 0
  return {
    applicable,
    soldToday,
    loggedToday,
    tone: applicable && loggedToday < soldToday ? 'warn' : 'ok',
    message: applicable
      ? `今天销售二手车 ${soldToday} 台，其中 ${loggedToday} 台已加入待取台账。当天就被骑走的不用记；留在店里等取的必须记，否则明天没人知道这台车还在。`
      : ''
  }
}

/** Full dialog model: one row per module plus the in-store roll call and the used-car check. */
export function buildClosingChecklist({ events = [], records = [], dateKey = '', kpi = {} } = {}) {
  return {
    modules: CLOSING_CHECK_MODULES.map((module) => {
      const changes = buildModuleChanges(module.scene, events)
      const backlog = buildModuleBacklog(module.scene, records, { dateKey })
      return {
        ...module,
        ...changes,
        backlog,
        carryMessage: changes.changed ? '' : noChangeMessage(backlog)
      }
    }),
    inStore: buildInStoreFocus(records, { dateKey }),
    usedCar: buildUsedCarCrossCheck(records, kpi, { dateKey })
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
