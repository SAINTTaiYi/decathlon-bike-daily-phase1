import { useEffect, useRef, useState } from 'react'
import { getBikeDay } from '../api/bi.js'

// 闭店 KPI 弹窗「填写数据」打开时自动同步当日新车/二手车实销（perfeco）。
// 服务端有 10 分钟快照缓存，弹窗反复开关不会打上游。
// 失败静默降级：状态行显示「同步不可用」，表单完全不受影响。
// 返回 { status, newBikes, usedBikes, newTo, usedTo, syncedAt }。
const IDLE = { status: 'idle', newBikes: null, usedBikes: null, newTo: null, usedTo: null, syncedAt: null }
export default function useBikeDaySync(open, { enabled = true } = {}) {
  const [state, setState] = useState(IDLE)
  const inflight = useRef(null)
  useEffect(() => {
    if (!open || !enabled) {
      setState((current) => (current.status === 'idle' ? current : IDLE))
      return undefined
    }
    let cancelled = false
    setState({ status: 'syncing', newBikes: null, usedBikes: null, newTo: null, usedTo: null, syncedAt: null })
    inflight.current = getBikeDay()
      .then((payload) => {
        if (cancelled) return
        if (!payload || payload.available !== true) {
          setState({ status: 'unavailable', newBikes: null, usedBikes: null, newTo: null, usedTo: null, syncedAt: null })
          return
        }
        setState({
          status: 'ok',
          newBikes: payload.newBikes ?? 0,
          usedBikes: payload.usedBikes ?? 0,
          newTo: payload.newTo ?? 0,
          usedTo: payload.usedTo ?? 0,
          syncedAt: payload.syncedAt ?? null
        })
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error', newBikes: null, usedBikes: null, newTo: null, usedTo: null, syncedAt: null })
      })
      .finally(() => { if (!cancelled) inflight.current = null })
    return () => { cancelled = true }
  }, [open, enabled])
  return state
}
