import { useCallback, useRef, useState } from 'react'
import { APP_VERSION } from '../data/releaseNotes.js'
import { fetchRemoteAppVersion, isRemoteNewer } from '../utils/appVersion.js'

/**
 * 版本闸门（2026-09-18 用户定案 B）——「产出物落地」前的旧页面校验。
 *
 * 用法：const versionGate = useVersionGate();
 *       versionGate.guard(() => doSomething(), { label: '闭店' })
 * guard 会先把动作挂起，确认页面不是旧缓存（或用户选择继续）后才执行。
 *
 * 设计约束：
 * - fail-open：离线、超时、取不到版本、版本号非三段式（后端后缀 6.8.6-1）
 *   一律放行 —— 闸门绝不能让门店在临近闭店时做不了事。
 * - 只挡「明确判定落后」：远端三段式版本严格大于本地 APP_VERSION。
 * - MEMO_MS 记忆：一次判定（干净或用户已选择继续）后 5 分钟内不再重复拦截；
 *   同一轮闭店「入口 → 确认完成」不会被拦两次，超过 5 分钟则重新校验。
 * - 逃生门：用户点「仍要{label}」按旧页面继续，并写入记忆；
 *   取消（背景点击 / Esc / 关闭按钮）不写记忆，下次动作仍会校验。
 */
const MEMO_MS = 5 * 60 * 1000
const CHECK_TIMEOUT_MS = 4_000

export default function useVersionGate() {
  const [gate, setGate] = useState(null)
  const settledAtRef = useRef(0)
  const pendingRef = useRef(null)

  const readRemoteVersion = useCallback(async () => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS)
    try {
      return await fetchRemoteAppVersion(controller.signal)
    } catch {
      return ''
    } finally {
      window.clearTimeout(timer)
    }
  }, [])

  const guard = useCallback((run, { label = '继续' } = {}) => {
    if (Date.now() - settledAtRef.current < MEMO_MS) return Promise.resolve().then(run)
    return readRemoteVersion().then((remoteVersion) => {
      if (!remoteVersion || !isRemoteNewer(remoteVersion, APP_VERSION)) {
        settledAtRef.current = Date.now()
        return run()
      }
      return new Promise((resolve, reject) => {
        pendingRef.current = { run, resolve, reject }
        setGate({ remoteVersion, label })
      })
    })
  }, [readRemoteVersion])

  const continueGate = useCallback(() => {
    const pending = pendingRef.current
    pendingRef.current = null
    setGate(null)
    if (!pending) return
    // 用户明确选择按旧页面继续：同样进入记忆窗口，避免连环拦截。
    settledAtRef.current = Date.now()
    Promise.resolve().then(pending.run).then(pending.resolve, pending.reject)
  }, [])

  const cancelGate = useCallback(() => {
    const pending = pendingRef.current
    pendingRef.current = null
    setGate(null)
    pending?.resolve(undefined)
  }, [])

  return {
    guard,
    dialogProps: {
      open: Boolean(gate),
      remoteVersion: gate?.remoteVersion || '',
      label: gate?.label || '继续',
      onContinue: continueGate,
      onCancel: cancelGate
    }
  }
}
