import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 每日首个登录用户的 Shiphub 重连提示。
 *
 * 背景：门店营业时间规则（10:00-22:00）之外不调用上游 API，因此夜间掉线的授权
 * 无法自愈，必须靠人工点一次「连接 Shiphub」。这个 hook 负责在第二天第一个
 * 登录的用户面前把提示推出来——但要排在更新公告之后，不与公告同时出现。
 *
 * 判定按「日期 + 门店」记账：同一门店同一天只提示一次，谁先登录谁看到。
 * 用 localStorage 而非会话内存，避免刷新页面重复弹。
 */
const STORAGE_KEY = 'workshop.ledger.shiphub-reconnect-prompt'
/** 更新公告的已读键，与 UpdateRefreshDialog 保持一致。 */
const SEEN_VERSION_KEY = 'workshop.ledger.seen-app-version'

/** 需要人工重新授权的连接状态。connected 正常、fixture 是 Preview 假数据。 */
const NEEDS_RECONNECT = new Set(['reauth_required', 'degraded'])

function readStorage() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

function readVersionSeen() {
  try {
    return window.localStorage.getItem(SEEN_VERSION_KEY) || ''
  } catch {
    return ''
  }
}

function writeStorage(value) {
  try {
    window.localStorage.setItem(STORAGE_KEY, value)
  } catch {
    // 隐私模式 / 存储写入失败：提示可能重复出现，但不影响功能。
  }
}

/** 本地日期键（门店按本地作息记账，不用 UTC）。 */
export function localDateKey(now = new Date()) {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function buildPromptKey(storeId, now) {
  return `${localDateKey(now)}::${storeId || 'unknown'}`
}

export function shouldPromptReconnect({ connectionStatus, enabled = true, storeId, seenKey, now } = {}) {
  if (!enabled) return false
  if (!NEEDS_RECONNECT.has(connectionStatus)) return false
  return seenKey !== buildPromptKey(storeId, now)
}

export default function useShipHubReconnectPrompt({
  enabled = false,
  connectionStatus = '',
  storeId = '',
  canManage = false,
  appVersion = ''
} = {}) {
  // 公告是否已让路。公告不会出现时（当前版本已确认过）无需等待。
  const [announcementCleared, setAnnouncementCleared] = useState(false)
  const [shouldOpen, setShouldOpen] = useState(false)
  const markedRef = useRef('')

  // 公告只在「捆绑版本未被确认」时弹出。已确认过就不会有公告，直接放行，
  // 否则提示会永远等一个不会到来的关闭事件。
  useEffect(() => {
    if (!enabled || announcementCleared || typeof window === 'undefined') return
    if (readVersionSeen() === appVersion) setAnnouncementCleared(true)
  }, [announcementCleared, appVersion, enabled])

  const active = enabled && canManage && announcementCleared

  useEffect(() => {
    if (!active || typeof window === 'undefined') return
    if (shouldOpen) return
    const key = buildPromptKey(storeId)
    if (markedRef.current === key) return
    if (!shouldPromptReconnect({ connectionStatus, storeId, seenKey: readStorage() })) return
    // 先记账再开弹窗：即便用户立刻关掉，当天也不再重复打扰。
    markedRef.current = key
    writeStorage(key)
    setShouldOpen(true)
  }, [active, connectionStatus, shouldOpen, storeId])

  const clearAnnouncement = useCallback(() => setAnnouncementCleared(true), [])
  const dismiss = useCallback(() => setShouldOpen(false), [])

  return { shouldOpen, clearAnnouncement, dismiss }
}
