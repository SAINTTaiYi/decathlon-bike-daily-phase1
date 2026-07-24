import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  emptyKpi,
  initialRecords,
  legacyKpiSeed,
  OPERATIONS_DAY_PREFIX,
  OPERATIONS_LEDGER_KEY,
  OPERATIONS_STORAGE_VERSION
} from '../data/operationsData.js'
import { buildRepairCompletion, normalizeRepairValues } from '../data/repairRecord.js'
import { resolveAuditActor } from '../data/userSession.js'
import {
  buildPickupNotificationUpdate,
  inferPickupSource,
  normalizePickupNotificationRecord,
  normalizePickupValues,
  validatePickup
} from '../data/pickupRecord.js'

const LEGACY_LEDGER_KEYS = ['decathlon-bike-operations-ledger:v4']
const LEGACY_DAY_PREFIXES = ['decathlon-bike-closing-v4', 'decathlon-bike-closing']
const RECORD_OPERATION_LIMIT = 300
const DAY_EVENT_LIMIT = 100

function localDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function emptyDay(dateKey) {
  return {
    version: OPERATIONS_STORAGE_VERSION,
    dateKey,
    kpi: { ...emptyKpi },
    kpiSavedAt: null,
    undo: null,
    closedAt: null,
    updatedAt: null,
    events: []
  }
}

function emptyLedger() {
  return {
    version: OPERATIONS_STORAGE_VERSION,
    records: initialRecords.map((record) => ({ ...record })),
    operations: [],
    updatedAt: null
  }
}

function nowIso() {
  return new Date().toISOString()
}

function eventId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function appendEvent(day, event) {
  const at = event.at || nowIso()
  return {
    ...day,
    updatedAt: at,
    events: [{ ...event, id: event.id || eventId(), at }, ...(day.events || [])].slice(0, DAY_EVENT_LIMIT)
  }
}

function dayEvent(operation) {
  const { before, undoable, undoneAt, ...event } = operation
  return event
}

function normalizeText(value, max = 160) {
  return String(value || '').trim().slice(0, max)
}

function normalizeCount(value) {
  const number = Number.parseInt(value, 10)
  return Number.isFinite(number) && number >= 0 ? number : 0
}

const AUDIT_FIELD_LABELS = {
  title: '车辆或事项名称',
  detail: '事项说明',
  meta: '单号或备注',
  status: '当前状态',
  contactType: '联系方式类型',
  contactValue: '联系方式',
  repairType: '维修类型',
  repairProject: '维修项目',
  pickupDate: '取车日期',
  pickupSource: '待取来源',
  selfPickupPlatform: '自提平台'
}

export function describeRecordChanges(before, after) {
  const changedFields = Object.entries(AUDIT_FIELD_LABELS)
    .filter(([field]) => String(before?.[field] ?? '') !== String(after?.[field] ?? ''))
    .map(([, label]) => label)
  return changedFields.length ? `修改字段：${changedFields.join('、')}。` : '已保存台账内容。'
}

export function stripPickupCode(record) {
  if (!record || typeof record !== 'object') return record
  const { pickupCode, ...safeRecord } = record
  return safeRecord
}

function inferResaleStage(record) {
  if (record.resaleStage === 'pending' || record.resaleStage === 'listed') return record.resaleStage
  return /整备|维修|待上架|质检|检测/.test(`${record.status || ''} ${record.detail || ''}`) ? 'pending' : 'listed'
}

function normalizeLedger(parsed) {
  const sourceRecords = Array.isArray(parsed?.records) ? parsed.records : initialRecords
  return {
    version: OPERATIONS_STORAGE_VERSION,
    records: sourceRecords.map((record) => {
      const { todayUpdate, updatedToday, ...normalized } = stripPickupCode(record) || {}
      if (normalized.scene === 'resale') return { ...normalized, resaleStage: inferResaleStage(normalized) }
      return normalizePickupNotificationRecord(normalized)
    }).filter((record) => record.id && record.scene),
    operations: Array.isArray(parsed?.operations) ? parsed.operations.map((operation) => ({ ...operation, before: stripPickupCode(operation.before) })) : [],
    updatedAt: parsed?.updatedAt || null
  }
}

function normalizeDay(dateKey, parsed, legacy) {
  const hasModernDayShape = parsed && parsed.dateKey === dateKey && (parsed.version >= 4 || parsed.kpi || parsed.kpiSavedAt)
  if (hasModernDayShape) {
    return {
      ...emptyDay(dateKey),
      kpi: { ...emptyKpi, ...(parsed.kpi || {}) },
      kpiSavedAt: parsed.kpiSavedAt || null,
      closedAt: parsed.version === OPERATIONS_STORAGE_VERSION ? parsed.closedAt || null : null,
      undo: parsed.version === OPERATIONS_STORAGE_VERSION && parsed.undo?.kind ? parsed.undo : null,
      updatedAt: parsed.updatedAt || null,
      events: Array.isArray(parsed.events) ? parsed.events : []
    }
  }

  const kpiSaved = Boolean(legacy?.completed?.['sales-daily-recorded'])
  return {
    ...emptyDay(dateKey),
    kpi: kpiSaved ? { ...legacyKpiSeed } : { ...emptyKpi },
    kpiSavedAt: kpiSaved ? legacy.updatedAt || nowIso() : null,
    events: Array.isArray(legacy?.events) ? legacy.events : [],
    updatedAt: legacy?.updatedAt || null
  }
}

function migrateLegacyOperations(events = [], records = []) {
  const recordsById = new Map(records.map((record) => [record.id, record]))
  return events.filter((event) => event?.recordId).map((event) => ({
    id: `legacy-${event.id || eventId()}`,
    at: event.at || nowIso(),
    type: event.type || 'legacy-operation',
    scene: event.scene || recordsById.get(event.recordId)?.scene || 'poster',
    recordId: event.recordId,
    recordTitle: recordsById.get(event.recordId)?.title || event.label || '旧版台账记录',
    label: event.label || '旧版操作记录',
    message: event.message || '由旧版本机日志迁移，仅供查看。',
    undoable: false
  }))
}

function mergeLegacyCustom(records, customTasks = []) {
  const ids = new Set(records.map((record) => record.id))
  return [...records, ...customTasks.filter((task) => !ids.has(task.id)).map((task) => ({
    id: task.id,
    scene: 'poster',
    kind: 'handover',
    title: task.title,
    detail: task.label || '旧版自定义交接事项',
    meta: task.meta || 'OTHER · 迁移事项',
    status: '继续跟进'
  }))]
}

export function cleanPreviousCompletedRecords(ledger, dateKey) {
  const removed = ledger.records.filter((record) => (
    record.scene === 'pickup' && record.pickedUpOn && record.pickedUpOn < dateKey
  ) || (
    ['poster', 'repair'].includes(record.scene) && record.completedOn && record.completedOn < dateKey
  ))
  if (!removed.length) return ledger
  const at = nowIso()
  const operations = removed.map((record) => {
    const handoverCompleted = record.scene === 'poster' && record.completedOn
    const repairCompleted = record.scene === 'repair' && record.completedOn
    return {
      id: eventId(),
      at,
      type: handoverCompleted ? 'auto-remove-handover' : repairCompleted ? 'auto-remove-store-repair' : 'auto-remove-pickup',
      scene: record.scene,
      recordId: record.id,
      recordTitle: record.title,
      label: `自动移除：${record.title}`,
      actorName: '系统',
      message: handoverCompleted
        ? `该交接事项已于 ${record.completedOn} 完成，跨日后从其它工作交接台账移除。`
        : repairCompleted
          ? `该门店产品维修已于 ${record.completedOn} 完成，跨日后从维修车辆台账移除。`
          : `该车辆已于 ${record.pickedUpOn} 取走，跨日后从待取车辆台账移除。`,
      undoable: false
    }
  })
  return {
    ...ledger,
    records: ledger.records.filter((record) => !removed.some((item) => item.id === record.id)),
    operations: [...operations, ...ledger.operations].slice(0, RECORD_OPERATION_LIMIT),
    updatedAt: at
  }
}

export default function useClosingWorkflow(actorName) {
  const auditActor = resolveAuditActor(actorName, '未登录用户')
  const [dateKey, setDateKey] = useState(() => localDateKey())
  const dayStorageKey = `${OPERATIONS_DAY_PREFIX}:${dateKey}`
  const [ledger, setLedger] = useState(emptyLedger)
  const [day, setDay] = useState(() => emptyDay(dateKey))
  const [hydrated, setHydrated] = useState(false)
  const [readStorageError, setReadStorageError] = useState('')
  const [ledgerStorageError, setLedgerStorageError] = useState('')
  const [dayStorageError, setDayStorageError] = useState('')
  const syncedLedgerValueRef = useRef(null)
  const syncedDayValueRef = useRef(null)
  const persistenceBlockedRef = useRef(false)

  useEffect(() => {
    const timer = window.setInterval(() => {
      const current = localDateKey()
      setDateKey((previous) => previous === current ? previous : current)
    }, 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    setHydrated(false)
    try {
      const currentLedgerRaw = window.localStorage.getItem(OPERATIONS_LEDGER_KEY)
      const legacyLedgerRaw = !currentLedgerRaw
        ? LEGACY_LEDGER_KEYS.map((key) => window.localStorage.getItem(key)).find(Boolean)
        : null
      const parsedLedger = JSON.parse(currentLedgerRaw || legacyLedgerRaw || 'null')

      const legacyDayEntries = LEGACY_DAY_PREFIXES.map((prefix) => window.localStorage.getItem(`${prefix}:${dateKey}`)).filter(Boolean)
      const currentDayRaw = window.localStorage.getItem(dayStorageKey)
      const parsedDay = JSON.parse(currentDayRaw || legacyDayEntries[0] || 'null')
      const oldestLegacy = legacyDayEntries.length ? JSON.parse(legacyDayEntries.at(-1)) : null

      let nextLedger = parsedLedger ? normalizeLedger(parsedLedger) : emptyLedger()
      if (!currentLedgerRaw && oldestLegacy?.customTasks) {
        nextLedger = { ...nextLedger, records: mergeLegacyCustom(nextLedger.records, oldestLegacy.customTasks) }
      }
      if (!currentLedgerRaw && !nextLedger.operations.length) {
        const legacyEvents = parsedDay?.events || oldestLegacy?.events || []
        nextLedger = { ...nextLedger, operations: migrateLegacyOperations(legacyEvents, nextLedger.records) }
      }
      nextLedger = cleanPreviousCompletedRecords(nextLedger, dateKey)
      const nextDay = normalizeDay(dateKey, parsedDay, oldestLegacy)

      persistenceBlockedRef.current = false
      setLedger(nextLedger)
      setDay(nextDay)
      setReadStorageError('')
    } catch {
      persistenceBlockedRef.current = true
      setLedger(emptyLedger())
      setDay(emptyDay(dateKey))
      setReadStorageError('无法读取本机运营台账，本次操作只会保留到页面关闭。')
    } finally {
      setHydrated(true)
    }
  }, [dateKey, dayStorageKey])

  useEffect(() => {
    if (!hydrated || persistenceBlockedRef.current) return
    const serialized = JSON.stringify(ledger)
    if (syncedLedgerValueRef.current === serialized) {
      syncedLedgerValueRef.current = null
      return
    }
    syncedLedgerValueRef.current = null
    try {
      window.localStorage.setItem(OPERATIONS_LEDGER_KEY, serialized)
      setLedgerStorageError('')
    } catch {
      setLedgerStorageError('无法写入长期业务台账。')
    }
  }, [hydrated, ledger])

  useEffect(() => {
    if (!hydrated || day.dateKey !== dateKey || persistenceBlockedRef.current) return
    const serialized = JSON.stringify(day)
    if (syncedDayValueRef.current === serialized) {
      syncedDayValueRef.current = null
      return
    }
    syncedDayValueRef.current = null
    try {
      window.localStorage.setItem(dayStorageKey, serialized)
      setDayStorageError('')
    } catch {
      setDayStorageError('无法写入当日日报。')
    }
  }, [dateKey, day, dayStorageKey, hydrated])

  useEffect(() => {
    const sync = (event) => {
      if (!event.newValue) return
      try {
        const parsed = JSON.parse(event.newValue)
        if (event.key === OPERATIONS_LEDGER_KEY && parsed?.version === OPERATIONS_STORAGE_VERSION) {
          const incoming = normalizeLedger(parsed)
          const normalized = cleanPreviousCompletedRecords(incoming, dateKey)
          const incomingValue = JSON.stringify(incoming)
          const normalizedValue = JSON.stringify(normalized)
          syncedLedgerValueRef.current = incomingValue === normalizedValue ? normalizedValue : null
          setLedger(normalized)
        }
        if (event.key === dayStorageKey && parsed?.version === OPERATIONS_STORAGE_VERSION && parsed.dateKey === dateKey) {
          const normalized = normalizeDay(dateKey, parsed, null)
          syncedDayValueRef.current = JSON.stringify(normalized)
          setDay(normalized)
        }
      } catch { /* ignore another tab's incomplete write */ }
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [dateKey, dayStorageKey])

  const commitLedger = useCallback((nextRecords, operationInput) => {
    const at = nowIso()
    const operation = {
      id: eventId(),
      at,
      undoable: true,
      ...operationInput,
      actorName: auditActor,
      before: operationInput.before ? clone(operationInput.before) : null
    }
    setLedger({
      version: OPERATIONS_STORAGE_VERSION,
      records: nextRecords,
      operations: [operation, ...(ledger.operations || [])].slice(0, RECORD_OPERATION_LIMIT),
      updatedAt: at
    })
    setDay((current) => appendEvent({
      ...current,
      undo: { kind: 'ledger', operationId: operation.id, label: operation.label }
    }, dayEvent(operation)))
    return operation
  }, [auditActor, ledger])

  const commitDay = useCallback((nextFields, eventInput) => {
    const id = eventId()
    const at = nowIso()
    setDay((current) => {
      const before = { kpi: clone(current.kpi), kpiSavedAt: current.kpiSavedAt }
      const event = { id, at, undoable: true, ...eventInput, actorName: auditActor, before }
      return appendEvent({
        ...current,
        ...nextFields,
        undo: { kind: 'day', operationId: id, label: event.label }
      }, event)
    })
    return { id, at, ...eventInput }
  }, [auditActor])

  const saveKpi = useCallback((values) => {
    if (day.closedAt) return { ok: false, error: '今日闭店已锁定，请先重新打开。' }
    const kpi = {
      salesVehicles: normalizeCount(values.salesVehicles),
      safetyChecks: normalizeCount(values.safetyChecks),
      safetyModel: normalizeText(values.safetyModel, 40),
      validReviews: normalizeCount(values.validReviews),
      usedSold: normalizeCount(values.usedSold),
      usedReceived: normalizeCount(values.usedReceived)
    }
    if (kpi.safetyChecks > 0 && !kpi.safetyModel) return { ok: false, error: '有安全检查开单时，请填写对应型号或单号。' }
    const savedAt = nowIso()
    commitDay({ kpi, kpiSavedAt: savedAt }, {
      type: 'save-kpi',
      scene: 'sales',
      label: '保存当日销售数据',
      message: `销售车辆 ${kpi.salesVehicles} · 安全检查 ${kpi.safetyChecks} · 二手售出 ${kpi.usedSold} · 收车 ${kpi.usedReceived}`
    })
    return { ok: true }
  }, [commitDay, day.closedAt])

  const clearKpi = useCallback(() => {
    if (day.closedAt || !day.kpiSavedAt) return false
    commitDay({ kpi: { ...emptyKpi }, kpiSavedAt: null }, {
      type: 'clear-kpi',
      scene: 'sales',
      label: '清空当日销售数据',
      message: '已清空今天的销售与 KPI 数据。'
    })
    return true
  }, [commitDay, day.closedAt, day.kpiSavedAt])

  const addRecord = useCallback((scene, values) => {
    if (day.closedAt) return { ok: false, error: '今日闭店已锁定，请先重新打开。' }
    const repairResult = scene === 'repair' ? normalizeRepairValues(values) : null
    const pickupResult = scene === 'pickup' ? normalizePickupValues(values) : null
    if (repairResult && !repairResult.ok) return repairResult
    if (pickupResult && !pickupResult.ok) return pickupResult
    const structuredFields = repairResult?.fields || pickupResult?.fields || null
    const title = structuredFields ? structuredFields.title : normalizeText(values.title, 80)
    const detail = structuredFields ? structuredFields.detail : normalizeText(values.detail, 240)
    const meta = structuredFields ? structuredFields.meta : normalizeText(values.meta, 120)
    const status = structuredFields ? structuredFields.status : normalizeText(values.status, 80)
    if (!structuredFields && (!title || !detail || !status)) return { ok: false, error: '请填写名称、事项说明和当前状态。' }
    const record = {
      id: `${scene}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      scene,
      kind: scene === 'poster' ? 'handover' : scene,
      title,
      detail,
      meta,
      status,
      ...(structuredFields || {}),
      ...(scene === 'pickup' ? { notificationStatus: 'pending' } : {}),
      ...(scene === 'resale' ? { resaleStage: 'pending' } : {}),
      createdAt: nowIso()
    }
    commitLedger([...ledger.records, record], {
      type: 'add-record',
      scene,
      recordId: record.id,
      recordTitle: record.title,
      label: `增加：${record.title}`,
      message: `已增加${scene === 'repair' ? '维修车辆' : scene === 'pickup' ? '待取车辆' : scene === 'resale' ? '二手车' : '交接事项'}`
    })
    return { ok: true, record }
  }, [commitLedger, day.closedAt, ledger.records])

  const editRecord = useCallback((recordId, values) => {
    if (day.closedAt) return { ok: false, error: '今日闭店已锁定，请先重新打开。' }
    const previous = ledger.records.find((record) => record.id === recordId)
    if (!previous) return { ok: false, error: '没有找到这条台账记录。' }
    if (previous.pickedUpOn || previous.completedOn) return { ok: false, error: '已完成记录当天只保留查看与撤回，不能继续编辑。' }
    const repairPickup = previous.scene === 'pickup' && inferPickupSource(previous) === 'repair'
    const repairResult = previous.scene === 'repair' || repairPickup ? normalizeRepairValues(values) : null
    const pickupResult = previous.scene === 'pickup' && !repairPickup ? normalizePickupValues(values) : null
    if (repairResult && !repairResult.ok) return repairResult
    if (pickupResult && !pickupResult.ok) return pickupResult
    const structuredFields = repairResult?.fields || pickupResult?.fields || null
    const title = structuredFields ? structuredFields.title : normalizeText(values.title, 80)
    const detail = structuredFields ? structuredFields.detail : normalizeText(values.detail, 240)
    const meta = structuredFields ? structuredFields.meta : normalizeText(values.meta, 120)
    const status = structuredFields ? structuredFields.status : normalizeText(values.status, 80)
    if (!structuredFields && (!title || !detail || !status)) return { ok: false, error: '请填写名称、事项说明和当前状态。' }
    const nextRecord = { ...previous, title, detail, meta, status, ...(structuredFields || {}), ...(repairPickup ? { pickupSource: 'repair' } : {}), updatedAt: nowIso() }
    commitLedger(ledger.records.map((record) => record.id === recordId ? nextRecord : record), {
      type: 'edit-record',
      scene: previous.scene,
      recordId,
      recordTitle: title,
      before: previous,
      label: `编辑：${title}`,
      message: `${describeRecordChanges(previous, nextRecord)} 当前状态：${status}`
    })
    return { ok: true }
  }, [commitLedger, day.closedAt, ledger.records])

  const completeResaleListing = useCallback((recordId) => {
    if (day.closedAt) return false
    const previous = ledger.records.find((record) => record.id === recordId && record.scene === 'resale' && record.resaleStage === 'pending')
    if (!previous) return false
    const at = nowIso()
    const nextRecord = {
      ...previous,
      resaleStage: 'listed',
      status: '已上架',
      listedAt: at,
      updatedAt: at
    }
    commitLedger(ledger.records.map((record) => record.id === recordId ? nextRecord : record), {
      type: 'complete-resale-listing',
      scene: 'resale',
      recordId,
      recordTitle: previous.title,
      before: previous,
      label: `维修完毕：${previous.title}`,
      message: '维修整备完成，已进入已上架二手车在册。'
    })
    return true
  }, [commitLedger, day.closedAt, ledger.records])

  const sellResale = useCallback((recordId) => {
    if (day.closedAt) return false
    const previous = ledger.records.find((record) => record.id === recordId && record.scene === 'resale' && record.resaleStage === 'listed')
    if (!previous) return false
    const at = nowIso()
    const nextRecord = {
      ...previous,
      scene: 'pickup',
      kind: 'pickup',
      status: '等待取车',
      pickupSource: 'used-car',
      notificationStatus: 'pending',
      resaleStage: 'sold',
      soldAt: at,
      updatedAt: at
    }
    commitLedger(ledger.records.map((record) => record.id === recordId ? nextRecord : record), {
      type: 'sell-resale',
      scene: 'resale',
      nextScene: 'pickup',
      recordId,
      recordTitle: previous.title,
      before: previous,
      label: `已售出并转入待取：${previous.title}`,
      message: '二手车已售出，并以二手车标识转入待取车辆。'
    })
    return { ok: true, route: 'pickup', record: nextRecord }
  }, [commitLedger, day.closedAt, ledger.records])

  const completeRepair = useCallback((recordId) => {
    if (day.closedAt) return { ok: false, error: '今日闭店已锁定，请先重新打开。' }
    const previous = ledger.records.find((record) => record.id === recordId && record.scene === 'repair')
    if (!previous || previous.completedOn) return { ok: false, error: '没有找到可完成的维修车辆。' }
    const at = nowIso()
    const completion = buildRepairCompletion(previous, dateKey, at)
    if (!completion.ok) return completion
    const movedToPickup = completion.route === 'pickup'
    commitLedger(ledger.records.map((record) => record.id === recordId ? completion.record : record), {
      type: movedToPickup ? 'complete-repair' : 'complete-store-repair',
      scene: 'repair',
      ...(movedToPickup ? { nextScene: 'pickup' } : {}),
      recordId,
      recordTitle: previous.title,
      before: previous,
      label: `维修完毕：${previous.title}`,
      message: movedToPickup
        ? '付费、质保或免费维修已携带完整维修单转入待取车辆。'
        : '门店产品维修已完成；今天原地标黑保留，下一日期自动移除。'
    })
    return { ok: true, route: completion.route, record: completion.record }
  }, [commitLedger, dateKey, day.closedAt, ledger.records])

  const completeHandover = useCallback((recordId) => {
    if (day.closedAt) return false
    const previous = ledger.records.find((record) => record.id === recordId && record.scene === 'poster')
    if (!previous || previous.completedOn) return false
    const at = nowIso()
    const nextRecord = {
      ...previous,
      status: '已完成',
      completedOn: dateKey,
      completedAt: at,
      updatedAt: at
    }
    commitLedger(ledger.records.map((record) => record.id === recordId ? nextRecord : record), {
      type: 'complete-handover',
      scene: 'poster',
      recordId,
      recordTitle: previous.title,
      before: previous,
      label: `完成：${previous.title}`,
      message: '交接事项已完成；今天保留黑色记录，下一日期自动移除。'
    })
    return true
  }, [commitLedger, dateKey, day.closedAt, ledger.records])

  const updatePickupNotification = useCallback((recordId, notificationStatus) => {
    if (day.closedAt) return { ok: false, error: '今日闭店已锁定，请先重新打开。' }
    const previous = ledger.records.find((record) => record.id === recordId && record.scene === 'pickup')
    const at = nowIso()
    const update = buildPickupNotificationUpdate(previous, notificationStatus, at)
    if (!update.ok) return update
    if (previous.notificationStatus === notificationStatus) return { ok: true, unchanged: true, record: previous }
    commitLedger(ledger.records.map((record) => record.id === recordId ? update.record : record), {
      type: 'update-pickup-notification',
      scene: 'pickup',
      recordId,
      recordTitle: previous.title,
      before: previous,
      label: `${notificationStatus === 'notified' ? '已通知' : '等待确认通知'}：${previous.title}`,
      message: notificationStatus === 'notified' ? '已记录顾客通知完成。' : '已恢复为等待确认通知。'
    })
    return { ok: true, record: update.record }
  }, [commitLedger, day.closedAt, ledger.records])

  const completePickup = useCallback((recordId, suppliedCode = '') => {
    if (day.closedAt) return { ok: false, error: '今日闭店已锁定，请先重新打开。' }
    const previous = ledger.records.find((record) => record.id === recordId && record.scene === 'pickup')
    if (!previous || previous.pickedUpOn) return { ok: false, error: '没有找到可取车的记录。' }
    const validation = validatePickup(previous, suppliedCode)
    if (!validation.ok) return validation
    const at = nowIso()
    const nextRecord = {
      ...previous,
      status: '已取车',
      pickedUpOn: dateKey,
      pickedUpAt: at,
      updatedAt: at
    }
    commitLedger(ledger.records.map((record) => record.id === recordId ? nextRecord : record), {
      type: 'complete-pickup',
      scene: 'pickup',
      recordId,
      recordTitle: previous.title,
      before: previous,
      label: `确认取车：${previous.title}`,
      message: '车辆已取走；今天保留黑色记录，下一日期自动移除。'
    })
    return { ok: true, pickupSource: validation.pickupSource }
  }, [commitLedger, dateKey, day.closedAt, ledger.records])

  const removeRecord = useCallback((recordId) => {
    if (day.closedAt) return false
    const record = ledger.records.find((item) => item.id === recordId)
    if (!record || record.pickedUpOn || record.completedOn) return false
    commitLedger(ledger.records.filter((item) => item.id !== recordId), {
      type: 'remove-record',
      scene: record.scene,
      recordId,
      recordTitle: record.title,
      before: record,
      label: `删除：${record.title}`,
      message: '已从长期业务台账删除。'
    })
    return true
  }, [commitLedger, day.closedAt, ledger.records])

  const canUndoOperation = useCallback((operationId) => {
    if (day.closedAt) return false
    const operation = (ledger.operations || []).find((item) => item.id === operationId)
    if (!operation?.recordId || !operation.undoable || operation.undoneAt) return false
    const latestOperation = (ledger.operations || []).find((item) => item.recordId === operation.recordId)
    return latestOperation?.id === operationId
  }, [day.closedAt, ledger.operations])

  const undoRecordOperation = useCallback((operationId) => {
    if (!canUndoOperation(operationId)) return false
    const target = ledger.operations.find((operation) => operation.id === operationId)
    let nextRecords
    if (target.type === 'add-record') {
      nextRecords = ledger.records.filter((record) => record.id !== target.recordId)
    } else if (target.before) {
      const restored = clone(target.before)
      const exists = ledger.records.some((record) => record.id === target.recordId)
      nextRecords = exists
        ? ledger.records.map((record) => record.id === target.recordId ? restored : record)
        : [...ledger.records, restored]
    } else {
      return false
    }

    const at = nowIso()
    const undoOperation = {
      id: eventId(),
      at,
      type: 'undo-record-operation',
      scene: target.scene,
      nextScene: target.nextScene || target.before?.scene,
      recordId: target.recordId,
      recordTitle: target.recordTitle,
      targetOperationId: target.id,
      label: `撤回：${target.label}`,
      actorName: auditActor,
      message: '已恢复该条记录到这次操作之前的状态。',
      undoable: false
    }
    const operations = ledger.operations.map((operation) => operation.id === target.id ? { ...operation, undoneAt: at } : operation)
    setLedger({
      version: OPERATIONS_STORAGE_VERSION,
      records: nextRecords,
      operations: [undoOperation, ...operations].slice(0, RECORD_OPERATION_LIMIT),
      updatedAt: at
    })
    setDay((current) => appendEvent({
      ...current,
      undo: current.undo?.operationId === target.id ? null : current.undo
    }, dayEvent(undoOperation)))
    return true
  }, [auditActor, canUndoOperation, ledger.operations, ledger.records])

  const undoLast = useCallback(() => {
    if (day.closedAt || !day.undo) return false
    if (day.undo.kind === 'ledger') return undoRecordOperation(day.undo.operationId)
    if (day.undo.kind !== 'day') return false
    const target = day.events.find((event) => event.id === day.undo.operationId)
    if (!target?.before) return false
    setDay((current) => appendEvent({
      ...current,
      kpi: { ...emptyKpi, ...(target.before.kpi || {}) },
      kpiSavedAt: target.before.kpiSavedAt || null,
      undo: null,
      events: current.events.map((event) => event.id === target.id ? { ...event, undoneAt: nowIso() } : event)
    }, {
      type: 'undo-day-operation',
      scene: 'sales',
      actorName: auditActor,
      label: `撤回：${day.undo.label}`,
      message: '已恢复这次销售数据操作之前的状态。'
    }))
    return true
  }, [auditActor, day.closedAt, day.undo, undoRecordOperation])

  const records = useMemo(() => ledger.records.map((record) => ({
    ...record,
    pickedUpToday: record.scene === 'pickup' && record.pickedUpOn === dateKey,
    completedToday: ['poster', 'repair'].includes(record.scene) && record.completedOn === dateKey
  })), [dateKey, ledger.records])

  const recordsByScene = useMemo(() => records.reduce((groups, record) => {
    groups[record.scene] ??= []
    groups[record.scene].push(record)
    return groups
  }, {}), [records])

  const kpiReady = Boolean(day.kpiSavedAt)
  const readyCount = kpiReady ? 1 : 0
  const totalRequired = 1
  const readiness = kpiReady ? 100 : 0
  const remainingRequirements = kpiReady ? [] : [{ id: 'daily-kpi', scene: 'pulse', title: '填写当日销售数据', label: '这是唯一的闭店要求' }]
  const remainingCount = remainingRequirements.length
  const allComplete = kpiReady

  const completeClosing = useCallback(() => {
    if (!kpiReady) return false
    setDay((current) => {
      if (current.closedAt) return current
      const at = nowIso()
      return {
        ...appendEvent(current, {
          id: eventId(),
          at,
          type: 'close-day',
          scene: 'sales',
          actorName: auditActor,
          label: '完成闭店',
          message: '当日销售数据已填写，闭店完成。'
        }),
        closedAt: at,
        undo: null
      }
    })
    return true
  }, [auditActor, kpiReady])

  const reopenClosing = useCallback(() => {
    setDay((current) => ({
      ...appendEvent(current, {
        type: 'reopen-day',
        scene: 'sales',
        actorName: auditActor,
        label: '重新打开闭店',
        message: '闭店状态已重新打开，可继续修改。'
      }),
      closedAt: null,
      undo: null
    }))
  }, [auditActor])

  const resetDay = useCallback(() => {
    if (day.closedAt) return false
    commitDay({ kpi: { ...emptyKpi }, kpiSavedAt: null }, {
      type: 'reset-day',
      scene: 'sales',
      label: '重置当日日报',
      message: '已清空今天的销售数据；长期业务台账保持不变。'
    })
    return true
  }, [commitDay, day.closedAt])

  const getOperationHistory = useCallback((scene, recordId = null) => {
    if (scene === 'pulse' || scene === 'sales') {
      return (day.events || []).filter((event) => ['save-kpi', 'clear-kpi', 'reset-day', 'undo-day-operation', 'close-day', 'reopen-day'].includes(event.type))
    }
    return (ledger.operations || []).filter((operation) => {
      if (recordId) return operation.recordId === recordId
      return operation.scene === scene || operation.nextScene === scene
    })
  }, [day.events, ledger.operations])

  const canUndoHistoryEvent = useCallback((event) => {
    if (event.recordId) return canUndoOperation(event.id)
    return !day.closedAt && !event.undoneAt && day.undo?.kind === 'day' && day.undo.operationId === event.id
  }, [canUndoOperation, day.closedAt, day.undo])

  const undoHistoryEvent = useCallback((event) => {
    if (event.recordId) return undoRecordOperation(event.id)
    if (day.undo?.operationId === event.id) return undoLast()
    return false
  }, [day.undo, undoLast, undoRecordOperation])

  const canUndo = !day.closedAt && Boolean(day.undo) && (day.undo.kind === 'ledger'
    ? canUndoOperation(day.undo.operationId)
    : day.events.some((event) => event.id === day.undo.operationId && event.before && !event.undoneAt))
  const writeStorageErrors = [ledgerStorageError, dayStorageError].filter(Boolean).join(' ')
  const storageError = readStorageError || (writeStorageErrors ? `${writeStorageErrors} 请不要关闭页面，并先复制当日报告。` : '')

  return {
    dateKey,
    hydrated,
    storageError,
    records,
    recordsByScene,
    kpi: day.kpi,
    kpiSavedAt: day.kpiSavedAt,
    kpiReady,
    events: day.events,
    closedAt: day.closedAt,
    totalRequired,
    readyCount,
    remainingCount,
    remainingRequirements,
    readiness,
    allComplete,
    canUndo,
    saveKpi,
    clearKpi,
    addRecord,
    editRecord,
    completeResaleListing,
    sellResale,
    completeRepair,
    completeHandover,
    updatePickupNotification,
    completePickup,
    removeRecord,
    undoLast,
    getOperationHistory,
    canUndoHistoryEvent,
    undoHistoryEvent,
    completeClosing,
    reopenClosing,
    resetDay
  }
}
