import { useCallback, useEffect, useRef, useState } from 'react'

import { isAnnouncementVisible, subscribeAnnouncementVisibility } from '../utils/announcementVisibility.js'

/**
 * 每日首个登录用户的 Shiphub 重连提示。
 *
 * 背景：门店营业时间规则（10:00-22:00）之外不调用上游 API，因此夜间掉线的授权
 * 无法自愈，必须靠人工点一次「连接 Shiphub」。这个 hook 负责在第二天第一个
 * 进入工作台的管理者面前把提示推出来。
 *
 * 判定按「日期 + 门店」记账：同一门店同一天只提示一次，谁先登录谁看到。
 * 用 localStorage 而非会话内存，避免刷新页面重复弹。
 *
 * 与更新公告的互斥：公告有多个渲染点（登录前的引导页、会话恢复页、同步页都会
 * 挂载它），且用户通常在登录界面就把公告关掉了。因此不能依赖公告的关闭「事件」
 * 来放行——那个事件在登录前的渲染点上根本不会接到调用方。改为读取公告此刻
 * 是否正在显示这个「状态」：没有公告就立即放行，有公告就等它消失。
 */
const STORAGE_KEY = 'workshop.ledger.shiphub-reconnect-prompt'

/** 需要人工重新授权的连接状态。connected 正常、fixture 是 Preview 假数据。 */
const NEEDS_RECONNECT = new Set(['reauth_required', 'degraded'])

function readStorage() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) || ''
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
  canManage = false
} = {}) {
  const [shouldOpen, setShouldOpen] = useState(false)
  const [announcementVisible, setAnnouncementVisible] = useState(
    () => (typeof window === 'undefined' ? false : isAnnouncementVisible())
  )
  const markedRef = useRef('')

  // 订阅公告的显示状态。读状态而非等关闭事件：公告有多个渲染点，用户常在登录
  // 界面就关掉它，那个实例不接回调，事件永远等不到。
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    setAnnouncementVisible(isAnnouncementVisible())
    return subscribeAnnouncementVisibility(setAnnouncementVisible)
  }, [])

  // 公告正在显示时不抢占；公告不显示即放行，无论它是否曾经出现过。
  const active = enabled && canManage && !announcementVisible

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

  const dismiss = useCallback(() => setShouldOpen(false), [])

  // 调试面板清掉当天记账键后，需要让 hook 忘记本会话已记账的事实，
  // 否则 markedRef 会挡住重放。
  const reset = useCallback(() => {
    markedRef.current = ''
    setShouldOpen(false)
  }, [])

  return { shouldOpen, dismiss, reset }
}
