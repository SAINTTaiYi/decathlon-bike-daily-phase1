import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { auditEventBelongsToScene, currentBusinessDayEvents } from '../data/auditEvents.js'
import { emptyKpi } from '../data/operationsData.js'
import {
  clearSales, closeDay, createWorkItem, getBootstrap, planLocalV5Import, previewLocalV5,
  removeWorkItem, reopenDay, saveSales, undoAuditEvent, updateWorkItem, workItemAction, getPermanentAuditHistory
} from '../api/workflow.js'
import { buildPickupNotificationUpdate } from '../data/pickupRecord.js'
import { buildRepairCompletion, normalizeRepairRecord } from '../data/repairRecord.js'

const emptyState = { businessDate: '', day: { kpi: emptyKpi, kpiSavedAt: null, closedAt: null, revision: 0 }, records: [], events: [], trends: null, store: null }

export default function useRemoteClosingWorkflow(enabled) {
  const [state, setState] = useState(emptyState)
  const [hydrated, setHydrated] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [storageError, setError] = useState('')
  const [lastSyncedAt, setLastSyncedAt] = useState('')
  const hasSnapshotRef = useRef(false)

  const refresh = useCallback(async (signal) => {
    if (!enabled) return null
    setSyncing(true)
    try {
      const payload = await getBootstrap(signal)
      const normalizedPayload = { ...payload, records: (payload.records || []).map(normalizeRepairRecord) }
      setState(normalizedPayload)
      hasSnapshotRef.current = true
      setLastSyncedAt(new Date().toISOString())
      setError('')
      setHydrated(true)
      return normalizedPayload
    } catch (error) {
      if (error.name !== 'AbortError') {
        setError(hasSnapshotRef.current
          ? `同步失败，当前仅显示最近成功加载的数据：${error.message}`
          : `无法读取门店数据库：${error.message}`)
        setHydrated(true)
      }
      return null
    } finally {
      if (!signal?.aborted) setSyncing(false)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) {
      hasSnapshotRef.current = false
      setHydrated(false)
      setSyncing(false)
      setState(emptyState)
      setError('')
      setLastSyncedAt('')
      return undefined
    }
    const controller = new AbortController()
    void refresh(controller.signal)
    const focus = () => void refresh()
    window.addEventListener('focus', focus)
    const timer = window.setInterval(() => { if (!document.hidden && navigator.onLine) void refresh() }, 45_000)
    return () => { controller.abort(); window.removeEventListener('focus', focus); window.clearInterval(timer) }
  }, [enabled, refresh])

  const applyServerResult = useCallback((result) => {
    if (!result || typeof result !== 'object') return
    setState((current) => {
      let records = current.records
      let events = current.events
      let day = current.day
      if (result.record?.id) {
        const next = normalizeRepairRecord(result.record)
        const index = records.findIndex((item) => item.id === next.id)
        if (index >= 0) {
          records = records.slice()
          records[index] = { ...records[index], ...next }
        } else {
          records = [next, ...records]
        }
      }
      if (result.removedId) {
        records = records.filter((item) => item.id !== result.removedId)
      }
      if (result.eventId && result.record) {
        const stamp = new Date().toISOString()
        events = [{
          id: result.eventId,
          entityId: result.record.id,
          entityType: 'work-item',
          createdAt: stamp,
          canUndo: true,
          summary: result.summary || '',
          action: result.action || 'update'
        }, ...events]
      }
      if (result.day) day = { ...day, ...result.day }
      if (records === current.records && events === current.events && day === current.day) return current
      return { ...current, records, events, day }
    })
  }, [])

  const run = useCallback(async (operation, { sync = 'background', apply = true } = {}) => {
    if (!navigator.onLine) return { ok: false, error: '当前离线，只能查看最近加载的数据。' }
    if (storageError) return { ok: false, error: '数据库同步尚未恢复。请先重新同步，再执行修改。' }
    try {
      const result = await operation()
      // Most mutations paint immediately. Pickup can defer this one visual state change until its pixel fill completes.
      if (apply) applyServerResult(result)
      if (sync === 'full') {
        await refresh()
      } else if (sync === 'background') {
        // Do not block toast/button feedback on a full bootstrap round-trip.
        void refresh()
      }
      return { ok: true, ...result }
    } catch (error) {
      if (error.code === 'REVISION_CONFLICT') await refresh()
      return { ok: false, error: error.message, code: error.code }
    }
  }, [applyServerResult, refresh, storageError])

  const recordsByScene = useMemo(() => state.records.reduce((groups, record) => {
    groups[record.scene] ??= []
    groups[record.scene].push(record)
    return groups
  }, {}), [state.records])
  const kpiReady = Boolean(state.day.kpiSavedAt)
  const remainingRequirements = kpiReady ? [] : [{ id: 'daily-kpi', scene: 'pulse', title: '填写当日销售数据', label: '这是唯一的闭店要求' }]

  const findRecord = useCallback((id) => state.records.find((record) => record.id === id), [state.records])
  const saveKpi = useCallback((values) => run(() => saveSales({ ...values, expectedRevision: state.day.revision }), { sync: 'full' }), [run, state.day.revision])
  const clearKpi = useCallback(() => run(() => clearSales(state.day.revision), { sync: 'full' }), [run, state.day.revision])
  const addRecord = useCallback((scene, values) => run(() => createWorkItem(scene, values)), [run])
  const editRecord = useCallback((id, values) => { const record = findRecord(id); return record ? run(() => updateWorkItem(record, values)) : Promise.resolve({ ok: false, error: '没有找到这条台账记录。' }) }, [findRecord, run])
  const patchRecordLocal = useCallback((id, patch) => {
    setState((current) => {
      const index = current.records.findIndex((item) => item.id === id)
      if (index < 0) return current
      const records = current.records.slice()
      records[index] = { ...records[index], ...patch, updatedAt: new Date().toISOString() }
      return { ...current, records }
    })
  }, [])

  const action = useCallback((id, name, extra, options) => {
    const record = findRecord(id)
    if (!record) return Promise.resolve({ ok: false, error: '没有找到这条台账记录。' })
    return run(() => workItemAction(record, name, extra), options)
  }, [findRecord, run])
  const commitDeferredResult = useCallback((result) => {
    applyServerResult(result)
    void refresh()
  }, [applyServerResult, refresh])
  const removeRecord = useCallback((id) => {
    const record = findRecord(id)
    if (!record) return Promise.resolve({ ok: false, error: '没有找到这条台账记录。' })
    return run(async () => {
      const result = await removeWorkItem(record)
      return { ...result, removedId: record.id }
    })
  }, [findRecord, run])
  const allEvents = state.events
  const dayEvents = useMemo(() => currentBusinessDayEvents(allEvents, state.businessDate), [allEvents, state.businessDate])
  const getOperationHistory = useCallback((scene, recordId = null) => {
    if (recordId) return allEvents.filter((event) => event.entityId === recordId)
    if (scene === 'pulse' || scene === 'sales') return allEvents.filter((event) => event.entityType === 'daily-closing')
    return allEvents.filter((event) => auditEventBelongsToScene(event, scene))
  }, [allEvents])
  const undoHistoryEvent = useCallback((event) => run(() => undoAuditEvent(event)), [run])
  const canUndoHistoryEvent = useCallback((event) => !state.day.closedAt && Boolean(event.canUndo), [state.day.closedAt])
  const getPermanentHistory = useCallback(async (filters = {}) => {
    if (!navigator.onLine) return { ok: false, error: '当前离线，无法读取永久操作记录。', events: [], nextCursor: null }
    try {
      const result = await getPermanentAuditHistory(filters)
      return { ok: true, events: result.events || [], nextCursor: result.nextCursor || null }
    } catch (error) {
      return { ok: false, error: error.message || '无法读取永久操作记录。', events: [], nextCursor: null }
    }
  }, [])
  const latestUndo = allEvents.find((event) => event.canUndo)

  return {
    dateKey: state.businessDate,
    hydrated,
    hasSnapshot: Boolean(state.businessDate),
    syncing,
    storageError,
    lastSyncedAt,
    records: state.records,
    recordsByScene,
    trends: state.trends,
    kpi: state.day.kpi,
    kpiSavedAt: state.day.kpiSavedAt,
    kpiReady,
    events: dayEvents,
    allEvents,
    closedAt: state.day.closedAt,
    totalRequired: 1,
    readyCount: kpiReady ? 1 : 0,
    remainingCount: remainingRequirements.length,
    remainingRequirements,
    readiness: kpiReady ? 100 : 0,
    allComplete: kpiReady,
    canUndo: !state.day.closedAt && Boolean(latestUndo),
    saveKpi,
    clearKpi,
    addRecord,
    editRecord,
    completeResaleListing: (id) => action(id, 'list-resale'),
    sellResale: (id) => action(id, 'sell-resale'),
    completeRepair: (id, options = {}) => {
      const previous = findRecord(id)
      if (!previous || previous.scene !== 'repair') return Promise.resolve({ ok: false, error: '没有找到可完成的维修车辆。' })
      const at = new Date().toISOString()
      const completion = buildRepairCompletion(previous, state.businessDate, at)
      if (!completion.ok) return Promise.resolve(completion)
      const apply = options.apply ?? true
      const sync = options.sync ?? 'background'
      // The default is instant. Pixel-dissolve callers defer this local commit until the server-confirmed visual departure ends.
      if (apply) applyServerResult({ record: completion.record })
      return run(async () => {
        try {
          const result = await workItemAction(previous, 'complete-repair')
          return { ...result, route: result.route || completion.route }
        } catch (error) {
          if (apply) applyServerResult({ record: previous })
          throw error
        }
      }, { sync, apply })
    },
    completeHandover: (id) => action(id, 'complete-handover'),
    updatePickupNotification: (id, notificationStatus) => {
      const previous = findRecord(id)
      if (!previous) return Promise.resolve({ ok: false, error: '没有找到这条台账记录。' })
      const at = new Date().toISOString()
      const update = buildPickupNotificationUpdate(previous, notificationStatus, at)
      if (!update.ok) return Promise.resolve(update)
      if (previous.notificationStatus === notificationStatus) return Promise.resolve({ ok: true, unchanged: true, record: previous })
      applyServerResult({ record: update.record })
      return run(async () => {
        try {
          return await workItemAction(previous, 'notification', { notificationStatus })
        } catch (error) {
          applyServerResult({ record: previous })
          throw error
        }
      }, { sync: 'background' })
    },
    completePickup: (id, pickupCode = '', options) => action(id, 'pick-up', { pickupCode }, options),
    commitDeferredResult,
    patchRecordLocal,
    removeRecord,
    undoLast: () => latestUndo ? undoHistoryEvent(latestUndo) : Promise.resolve({ ok: false, error: '没有可撤回的操作。' }),
    getOperationHistory,
    canUndoHistoryEvent,
    undoHistoryEvent,
    getPermanentHistory,
    completeClosing: () => run(closeDay, { sync: 'full' }),
    reopenClosing: () => run(reopenDay, { sync: 'full' }),
    resetDay: () => run(() => clearSales(state.day.revision), { sync: 'full' }),
    refresh,
    previewLocalV5,
    planLocalV5Import
  }
}
