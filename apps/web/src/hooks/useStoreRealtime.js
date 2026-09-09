import { useEffect, useRef } from 'react'

// ── 门店数据实时推送（2026-09-09 实时推送第一批）──────────────────────
// 长轮询 + 版本号：服务端有变更立即返回，无变更挂起 25 秒。
// 页面因此不再需要手动刷新——任何写操作（含后台 Shiphub/BI 同步）都会
// 让挂起中的请求立刻返回，从而触发 onChange 重新拉取权威数据。
//
// 设计要点：
// ① 静默重连：网络错误/服务端 5xx 退避后重试，绝不打断用户。
// ② 页面隐藏时暂停（省流量、省电量），回到前台立即恢复。
// ③ 版本号只前进不回退；服务端返回的 version 一定 >= since。
// ④ onChange 用 ref 持有，避免因回调引用变化导致重连风暴。
const RETRY_BASE_MS = 3_000
const RETRY_MAX_MS = 60_000

export default function useStoreRealtime(onChange, { enabled = true } = {}) {
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange }, [onChange])

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined
    let cancelled = false
    let version = 0
    let retryDelay = RETRY_BASE_MS
    let timer = null
    let controller = null

    const schedule = (ms) => {
      if (cancelled) return
      window.clearTimeout(timer)
      timer = window.setTimeout(loop, ms)
    }

    const loop = async () => {
      if (cancelled) return
      // 页面隐藏时不做长轮询；visibilitychange 恢复时会立刻重启。
      if (document.hidden || !navigator.onLine) { schedule(RETRY_BASE_MS); return }
      controller = new AbortController()
      try {
        const res = await fetch(`/api/v1/changes?since=${version}`, {
          method: 'GET',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { accept: 'application/json' },
          signal: controller.signal
        })
        if (cancelled) return
        if (res.status === 401 || res.status === 403) { schedule(RETRY_MAX_MS); return }
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json().catch(() => null)
        if (cancelled) return
        const next = Number(data?.version)
        if (Number.isFinite(next)) version = Math.max(version, next)
        retryDelay = RETRY_BASE_MS
        if (data?.changed) {
          try { onChangeRef.current?.() } catch { /* 回调异常不影响轮询 */ }
        }
        schedule(0)
      } catch (error) {
        if (cancelled || error?.name === 'AbortError') return
        retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS)
        schedule(retryDelay)
      }
    }

    const onVisibility = () => { if (!document.hidden) schedule(0) }

    void loop()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      controller?.abort()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [enabled])
}
