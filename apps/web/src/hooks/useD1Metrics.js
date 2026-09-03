import { useEffect, useRef, useState } from 'react'
import { getD1Metrics } from '../api/d1.js'

// D1 用量快照轮询：60 秒一次；页面隐藏时暂停、回到前台且数据超过 45 秒立即补拉。
// 端点本身有 60 秒服务端缓存且零 D1 行读，轮询不产生任何数据库负担。
// 失败时保留上一份快照并标记 stale（卡片降级显示「同步失败」），不弹错误打扰。
const POLL_MS = 60_000
const REFRESH_AFTER_VISIBLE_MS = 45_000

export default function useD1Metrics(enabled) {
  const [snapshot, setSnapshot] = useState(null)
  const [stale, setStale] = useState(false)
  const inFlight = useRef(null)

  useEffect(() => {
    if (!enabled) return undefined
    let cancelled = false
    let timer = 0

    const pull = async () => {
      if (inFlight.current) return
      const controller = new AbortController()
      inFlight.current = controller
      try {
        const payload = await getD1Metrics(controller.signal)
        if (!cancelled) {
          if (payload && payload.available) {
            setSnapshot(payload)
            setStale(false)
          } else {
            // 未配置 token（available:false）——监控功能整体隐藏。
            setSnapshot(null)
          }
        }
      } catch {
        if (!cancelled) setStale(true)
      } finally {
        inFlight.current = null
      }
    }

    const schedule = () => { timer = window.setTimeout(loop, POLL_MS) }
    const loop = async () => { await pull(); if (!cancelled) schedule() }
    void pull()
    schedule()

    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      const fetchedAt = snapshot?.fetchedAt ? Date.parse(snapshot.fetchedAt) : 0
      if (!fetchedAt || Date.now() - fetchedAt > REFRESH_AFTER_VISIBLE_MS) void pull()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      if (inFlight.current) inFlight.current.abort()
      inFlight.current = null
    }
    // snapshot.fetchedAt 只在可见性判断里读取，避免每次快照更新重建定时器。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  return { snapshot, stale }
}
