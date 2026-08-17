import { useCallback, useEffect, useRef, useState } from 'react'
import { disconnectShipHub, getShipHubOrders, getShipHubSummary, requestShipHubSync, setShipHubOrderAction, startShipHubConnection } from '../api/shiphub.js'

const EMPTY = { hand: [], receive: [], ship: [] }

export default function useShipHub(enabled) {
  const [summary, setSummary] = useState(null)
  const [orders, setOrders] = useState(EMPTY)
  const [loading, setLoading] = useState(false)
  const [ordersLoading, setOrdersLoading] = useState({})
  const [error, setError] = useState('')
  const requestRef = useRef(null)

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
    if (!enabled || !['hand', 'receive', 'ship'].includes(category)) return []
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

  const connect = useCallback((returnTo = '/') => startShipHubConnection(returnTo), [])
  const disconnect = useCallback(async () => {
    const result = await disconnectShipHub()
    await refreshSummary()
    return result
  }, [refreshSummary])

  const sync = useCallback(async () => {
    requestRef.current = requestShipHubSync()
    const result = await requestRef.current
    await refreshSummary()
    return result
  }, [refreshSummary])

  return {
    enabled: Boolean(enabled && summary?.enabled),
    configured: Boolean(summary?.connection),
    summary,
    orders,
    ordersLoading,
    loading,
    error,
    loadOrders,
    action,
    connect,
    disconnect,
    sync,
    refresh: refreshSummary
  }
}
