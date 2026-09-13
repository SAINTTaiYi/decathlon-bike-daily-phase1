import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createFoodBatch,
  getFoodBatches,
  getFoodOverview,
  getFoodShelfLife,
  updateFoodBatchStatus
} from '../api/food.js'

/**
 * 食品保质期台账数据层（2026-09-13）。
 *
 * 双端 shell（FoodShellMobile / FoodShellDesktop）共享这一份数据流：
 * 计数摘要、清单字典、当前筛选下的批次分页、登记与处理动作。
 *
 * 刷新策略：进入应用拉一次 overview + 首屏批次；写操作（登记 / 处理）后
 * 只重拉涉及的部分（处理只改计数与当前页，登记改计数与待办首屏），
 * 不做轮询——台账不是实时看板，门店一天打开几次，避免白白消耗 D1 读额度。
 */
const SEARCH_DEBOUNCE_MS = 300

export function useFoodLedger(enabled) {
  const [counts, setCounts] = useState(null)
  const [today, setToday] = useState('')
  const [shelfLife, setShelfLife] = useState([])
  const [shelfLifeReady, setShelfLifeReady] = useState(false)
  const [batches, setBatches] = useState([])
  const [hasMore, setHasMore] = useState(false)
  const [filter, setFilter] = useState('flagged')
  const [kind, setKind] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')
  const requestRef = useRef(0)
  const pageSizeRef = useRef(100)

  const loadOverview = useCallback(async () => {
    try {
      const payload = await getFoodOverview()
      setCounts(payload.counts)
      setToday(payload.today)
      return payload
    } catch (cause) {
      setError(cause?.message || '读取台账摘要失败。')
      return null
    }
  }, [])

  const loadBatches = useCallback(async ({ nextFilter, nextKind, nextQuery, append = false } = {}) => {
    const targetFilter = nextFilter ?? filter
    const targetKind = nextKind ?? kind
    const targetQuery = nextQuery ?? query
    const offset = append ? batches.length : 0
    const ticket = requestRef.current + 1
    requestRef.current = ticket
    setLoading(true)
    try {
      const payload = await getFoodBatches({
        filter: targetFilter,
        kind: targetKind,
        q: targetQuery,
        limit: pageSizeRef.current,
        offset
      })
      if (requestRef.current !== ticket) return null
      setBatches((previous) => (append ? [...previous, ...payload.batches] : payload.batches))
      setHasMore(payload.hasMore)
      setToday(payload.today)
      setError('')
      return payload
    } catch (cause) {
      if (requestRef.current === ticket) setError(cause?.message || '读取批次失败。')
      return null
    } finally {
      if (requestRef.current === ticket) setLoading(false)
    }
  }, [filter, kind, query, batches.length])

  const loadShelfLife = useCallback(async (force = false) => {
    if (shelfLifeReady && !force) return shelfLife
    try {
      const payload = await getFoodShelfLife()
      setShelfLife(payload.items || [])
      setShelfLifeReady(true)
      return payload.items || []
    } catch (cause) {
      setError(cause?.message || '读取保质期清单失败。')
      return []
    }
  }, [shelfLifeReady, shelfLife])

  useEffect(() => {
    if (!enabled) return undefined
    void loadOverview()
    void loadBatches({ nextFilter: 'flagged', nextKind: '', nextQuery: '' })
    // 仅在进入应用时跑一次；后续由筛选变化与写操作驱动。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  // 筛选 / 分类 / 搜索变化 → 重新拉第一页（搜索去抖）。
  const firstRunRef = useRef(true)
  useEffect(() => {
    if (!enabled) return undefined
    if (firstRunRef.current) { firstRunRef.current = false; return undefined }
    const timer = window.setTimeout(() => { void loadBatches({ nextFilter: filter, nextKind: kind, nextQuery: query }) }, query ? SEARCH_DEBOUNCE_MS : 0)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, kind, query, enabled])

  const loadMore = useCallback(() => {
    if (loading || !hasMore) return Promise.resolve(null)
    return loadBatches({ append: true })
  }, [loading, hasMore, loadBatches])

  const register = useCallback(async (input) => {
    setSyncing(true)
    try {
      const payload = await createFoodBatch(input)
      await loadOverview()
      await loadBatches({ nextFilter: filter, nextKind: kind, nextQuery: query })
      setError('')
      return { ok: true, ...payload }
    } catch (cause) {
      return { ok: false, message: cause?.message || '登记失败，请重试。' }
    } finally {
      setSyncing(false)
    }
  }, [filter, kind, query, loadOverview, loadBatches])

  const handle = useCallback(async (batch, status) => {
    setSyncing(true)
    try {
      await updateFoodBatchStatus(batch.id, { expectedRevision: batch.revision, status })
      await loadOverview()
      await loadBatches({ nextFilter: filter, nextKind: kind, nextQuery: query })
      setError('')
      return { ok: true }
    } catch (cause) {
      return { ok: false, message: cause?.message || '处理失败，请重试。' }
    } finally {
      setSyncing(false)
    }
  }, [filter, kind, query, loadOverview, loadBatches])

  const applyShelfItem = useCallback((item) => {
    setShelfLife((previous) => {
      const rest = previous.filter((entry) => entry.itemCode !== item.itemCode)
      return [...rest, item].sort((a, b) => (a.category || '').localeCompare(b.category || '', 'zh-CN') || a.itemCode.localeCompare(b.itemCode))
    })
  }, [])

  return {
    counts,
    today,
    shelfLife,
    shelfLifeReady,
    batches,
    hasMore,
    filter,
    setFilter,
    kind,
    setKind,
    query,
    setQuery,
    loading,
    syncing,
    error,
    loadOverview,
    loadBatches,
    loadShelfLife,
    loadMore,
    register,
    handle,
    applyShelfItem
  }
}

export default useFoodLedger
