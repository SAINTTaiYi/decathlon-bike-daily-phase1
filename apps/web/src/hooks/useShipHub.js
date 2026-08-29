import { useCallback, useEffect, useRef, useState } from 'react'
import { disconnectShipHub, getShipHubOrders, getShipHubSummary, requestShipHubSync, setShipHubOrderAction, startShipHubConnection } from '../api/shiphub.js'
import { isPreviewHost } from '../utils/previewGate.js'

const EMPTY = { hand: [], pick: [], receive: [], ship: [] }

/* Preview-only connection-state simulator.
 *
 * Preview runs in fixture mode, so the disconnected / reauth_required states
 * never occur naturally there and their appearance cannot be reviewed without
 * waiting for a real token to expire on staging. This lets the state be forced
 * from the browser for visual review.
 *
 * Deliberately display-layer only: it overrides the status the UI renders and
 * nothing else. No fake summary payloads, no fake orders, and the reconnect
 * button still performs the real server-side action, so a simulated state can
 * never be mistaken for a healthy connection or hide a genuine outage.
 */
const SIMULATION_KEY = 'workshop.shiphub-connection-sim.v1'
export const SIMULATED_STATUSES = ['fixture', 'connected', 'reauth_required', 'disconnected']

export function readSimulatedStatus() {
  if (!isPreviewHost()) return ''
  try {
    const raw = window.localStorage.getItem(SIMULATION_KEY) || ''
    return SIMULATED_STATUSES.includes(raw) ? raw : ''
  } catch { return '' }
}

export function writeSimulatedStatus(status) {
  if (!isPreviewHost()) return ''
  const next = SIMULATED_STATUSES.includes(status) ? status : ''
  try {
    if (next) window.localStorage.setItem(SIMULATION_KEY, next)
    else window.localStorage.removeItem(SIMULATION_KEY)
  } catch { /* storage blocked; simulation just does not persist */ }
  return next
}

const CATEGORIES = ['hand', 'pick', 'receive', 'ship']

export default function useShipHub(enabled) {
  const [summary, setSummary] = useState(null)
  const [orders, setOrders] = useState(EMPTY)
  const [loading, setLoading] = useState(false)
  const [ordersLoading, setOrdersLoading] = useState({})
  const [error, setError] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  const [simulatedStatus, setSimulatedStatus] = useState(() => readSimulatedStatus())
  const requestRef = useRef(null)
  const syncingRef = useRef(false)

  const refreshSummary = useCallback(async (signal) => {
    if (!enabled) {
      setSummary(null)
      setError('')
      return null
    }
    setLoading(true)
    try {
      const next = await getShipHubSummary(signal)
      setSummary(next)
      setError('')
      return next
    } catch (nextError) {
      if (nextError?.name === 'AbortError') return null
      setError(nextError?.message || 'Shiphub 状态暂不可用')
      return null
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    const controller = new AbortController()
    void refreshSummary(controller.signal)
    return () => controller.abort()
  }, [refreshSummary])

  const loadOrders = useCallback(async (category) => {
    if (!enabled || !CATEGORIES.includes(category)) return []
    setOrdersLoading((current) => ({ ...current, [category]: true }))
    try {
      const payload = await getShipHubOrders(category)
      const next = Array.isArray(payload?.orders) ? payload.orders : []
      setOrders((current) => ({ ...current, [category]: next }))
      return next
    } catch (nextError) {
      setError(nextError?.message || 'Shiphub 订单暂不可用')
      return []
    } finally {
      setOrdersLoading((current) => ({ ...current, [category]: false }))
    }
  }, [enabled])

  const action = useCallback(async (category, id, state) => {
    const result = await setShipHubOrderAction(category, id, state)
    await loadOrders(category)
    return result
  }, [loadOrders])

  const connect = useCallback((returnTo = '/', login = null) => startShipHubConnection(returnTo, login), [])
  const disconnect = useCallback(async () => {
    const result = await disconnectShipHub()
    await refreshSummary()
    return result
  }, [refreshSummary])

  // 未连接（reauth_required）时先用已存凭据自动重连，再同步。凭据始终留在服务端
  // （部署级 CF secret 或本店加密行），前端只发起动作、不接触任何账密。
  const reconnect = useCallback(async () => {
    setReconnecting(true)
    try {
      const result = await startShipHubConnection('/', null)
      // 浏览器 SSO 兼容路径：拿到跳转地址说明服务端没有可用凭据，无法静默恢复
      if (result?.authorizationUrl) return { reconnected: false, authorizationUrl: result.authorizationUrl }
      await refreshSummary()
      return { reconnected: Boolean(result?.connected) }
    } finally {
      setReconnecting(false)
    }
  }, [refreshSummary])

  const sync = useCallback(async () => {
    // 立即上锁：按钮点下即禁用，消除 202 往返期间的重复点击窗口
    if (syncingRef.current) return { skipped: 'ALREADY_SYNCING' }
    syncingRef.current = true
    setSyncing(true)
    try {
      const status = summary?.connection?.authorizationStatus
      if (status && status !== 'connected') {
        const attempt = await reconnect()
        if (!attempt.reconnected) {
          const message = 'Shiphub 未连接，请在「Shiphub 连接」中手动重新授权。'
          setError(message)
          return { reconnectFailed: true, message }
        }
      }
      let result
      try {
        result = await requestShipHubSync()
      } catch (nextError) {
        // 同步途中 token 失效：重连后只重试一次，不循环
        const code = nextError?.code || ''
        if (code === 'REFRESH_TOKEN_MISSING' || /^OAUTH_TOKEN_HTTP_4/.test(code)) {
          const attempt = await reconnect()
          if (!attempt.reconnected) throw nextError
          result = await requestShipHubSync()
        } else throw nextError
      }
      requestRef.current = result
      await refreshSummary()
      // 后端 202 后真同步在 waitUntil 里跑，回捞期间保持按钮禁用
      await new Promise((resolve) => window.setTimeout(resolve, 1200))
      await refreshSummary()
      await Promise.all(CATEGORIES.map((category) => loadOrders(category)))
      return result
    } finally {
      syncingRef.current = false
      setSyncing(false)
    }
  }, [loadOrders, reconnect, refreshSummary, summary])

  return {
    enabled: Boolean(enabled && summary?.enabled),
    configured: Boolean(summary?.connection),
    summary,
    orders,
    ordersLoading,
    loading,
    syncing,
    reconnecting,
    // 真实判定；preview 模拟开关只覆盖这一个展示值，后端与动作路径不受影响
    connectionStatus: simulatedStatus || (summary?.mode === 'fixture' ? 'fixture' : (summary?.connection?.authorizationStatus || 'disconnected')),
    simulatedStatus,
    simulationAvailable: isPreviewHost(),
    simulateStatus: (status) => setSimulatedStatus(writeSimulatedStatus(status)),
    error,
    loadOrders,
    action,
    connect,
    reconnect,
    disconnect,
    sync,
    refresh: refreshSummary
  }
}
