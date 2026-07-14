import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { auditEventBelongsToScene, currentBusinessDayEvents } from '../data/auditEvents.js'
import { emptyKpi } from '../data/operationsData.js'
import {
  clearSales, closeDay, createWorkItem, getBootstrap, planLocalV5Import, previewLocalV5,
  removeWorkItem, reopenDay, saveSales, undoAuditEvent, updateWorkItem, workItemAction
} from '../api/workflow.js'

const emptyState = { businessDate: '', day: { kpi: emptyKpi, kpiSavedAt: null, closedAt: null, revision: 0 }, records: [], events: [], store: null }

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
      setState(payload)
      hasSnapshotRef.current = true
      setLastSyncedAt(new Date().toISOString())
      setError('')
      setHydrated(true)
      return payload
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

  const run = useCallback(async (operation) => {
    if (!navigator.onLine) return { ok: false, error: '当前离线，只能查看最近加载的数据。' }
    if (storageError) return { ok: false, error: '数据库同步尚未恢复。请先重新同步，再执行修改。' }
    try {
      const result = await operation()
      await refresh()
      return { ok: true, ...result }
    } catch (error) {
      if (error.code === 'REVISION_CONFLICT') await refresh()
      return { ok: false, error: error.message, code: error.code }
    }
  }, [refresh, storageError])

  const recordsByScene = useMemo(() => state.records.reduce((groups, record) => {
    groups[record.scene] ??= []
    groups[record.scene].push(record)
    return groups
  }, {}), [state.records])
  const kpiReady = Boolean(state.day.kpiSavedAt)
  const remainingRequirements = kpiReady ? [] : [{ id: 'daily-kpi', scene: 'pulse', title: '填写当日销售数据', label: '这是唯一的闭店要求' }]

  const findRecord = useCallback((id) => state.records.find((record) => record.id === id), [state.records])
  const saveKpi = useCallback((values) => run(() => saveSales({ ...values, expectedRevision: state.day.revision })), [run, state.day.revision])
  const clearKpi = useCallback(() => run(() => clearSales(state.day.revision)), [run, state.day.revision])
  const addRecord = useCallback((scene, values) => run(() => createWorkItem(scene, values)), [run])
  const editRecord = useCallback((id, values) => { const record = findRecord(id); return record ? run(() => updateWorkItem(record, values)) : Promise.resolve({ ok: false, error: '没有找到这条台账记录。' }) }, [findRecord, run])
  const action = useCallback((id, name, extra) => { const record = findRecord(id); return record ? run(() => workItemAction(record, name, extra)) : Promise.resolve({ ok: false, error: '没有找到这条台账记录。' }) }, [findRecord, run])
  const removeRecord = useCallback((id) => { const record = findRecord(id); return record ? run(() => removeWorkItem(record)) : Promise.resolve({ ok: false, error: '没有找到这条台账记录。' }) }, [findRecord, run])
  const allEvents = state.events
  const dayEvents = useMemo(() => currentBusinessDayEvents(allEvents, state.businessDate), [allEvents, state.businessDate])
  const getOperationHistory = useCallback((scene, recordId = null) => {
    if (recordId) return allEvents.filter((event) => event.entityId === recordId)
    if (scene === 'pulse' || scene === 'sales') return allEvents.filter((event) => event.entityType === 'daily-closing')
    return allEvents.filter((event) => auditEventBelongsToScene(event, scene))
  }, [allEvents])
  const undoHistoryEvent = useCallback((event) => run(() => undoAuditEvent(event)), [run])
  const canUndoHistoryEvent = useCallback((event) => !state.day.closedAt && Boolean(event.canUndo), [state.day.closedAt])
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
    completeRepair: (id) => action(id, 'complete-repair'),
    completeHandover: (id) => action(id, 'complete-handover'),
    updatePickupNotification: (id, notificationStatus) => action(id, 'notification', { notificationStatus }),
    completePickup: (id, pickupCode = '') => action(id, 'pick-up', { pickupCode }),
    removeRecord,
    undoLast: () => latestUndo ? undoHistoryEvent(latestUndo) : Promise.resolve({ ok: false, error: '没有可撤回的操作。' }),
    getOperationHistory,
    canUndoHistoryEvent,
    undoHistoryEvent,
    completeClosing: () => run(closeDay),
    reopenClosing: () => run(reopenDay),
    resetDay: () => run(() => clearSales(state.day.revision)),
    refresh,
    previewLocalV5,
    planLocalV5Import
  }
}
