import { useCallback, useEffect, useRef, useState } from 'react'

import { isAnnouncementBlocking, subscribeAnnouncementBlocking } from '../utils/announcementVisibility.js'

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
 * 时序要求（用户明确）：打开 ops → 登录界面弹更新公告 → 点「立即刷新」→ 正常
 * 登录 → 进入主界面后才弹重连提示。因此这里有两道闸：
 *
 * 1) 工作台就绪（调用方传入 enabled）。登录界面、密码修改页、同步页都不算。
 * 2) 公告已让开。公告有多个渲染点，用户通常在登录界面就关掉它，那个实例并不接
 *    onDismissed 回调，所以「关闭事件」不是可靠信号；改读模块级占位状态。占位
 *    包含「判定中」——远端版本检查要等一次 fetch 往返才显示，若只看「正在显示」
 *    会在空窗里抢先弹出，随后被公告覆盖。
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
  const [announcementBlocking, setAnnouncementBlocking] = useState(
    () => (typeof window === 'undefined' ? true : isAnnouncementBlocking())
  )
  const markedRef = useRef('')

  // 订阅公告占位状态。读状态而非等关闭事件：公告有多个渲染点，用户常在登录
  // 界面就关掉它，那个实例不接回调，事件永远等不到。
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    setAnnouncementBlocking(isAnnouncementBlocking())
    return subscribeAnnouncementBlocking(setAnnouncementBlocking)
  }, [])

  // 公告仍占位（显示中或判定中）时不抢占，让它先弹完。
  const active = enabled && canManage && !announcementBlocking

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
