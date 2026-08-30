import { useCallback, useEffect, useRef, useState } from 'react'
import AppDialog from './AppDialog.jsx'
import { APP_VERSION, currentRelease } from '../../data/releaseNotes.js'
import { fetchReleaseInfo, onServerVersion } from '../../api/client.js'

const STORAGE_KEY = 'workshop.ledger.seen-app-version'
const DISMISSED_REMOTE_KEY = 'workshop.ledger.dismissed-remote-version'
const VERSION_ENDPOINT = '/api/v1/meta/version'
/** How often a visible tab re-checks the server while idle. */
const POLL_INTERVAL_MS = 30_000
/** Minimum gap between interaction-triggered checks (scroll/tap/edit). */
const INTERACTION_THROTTLE_MS = 30_000

function readStorage(key) {
  try {
    return window.localStorage.getItem(key) || ''
  } catch {
    return ''
  }
}

function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Ignore private-mode / storage failures; the prompt may reappear.
  }
}

function readSeenVersion() {
  return readStorage(STORAGE_KEY)
}

function writeSeenVersion(version) {
  writeStorage(STORAGE_KEY, version)
}

function isValidVersion(value) {
  return typeof value === 'string' && /^\d+\.\d+\.\d+$/u.test(value)
}

async function fetchRemoteAppVersion(signal) {
  const response = await fetch(`${VERSION_ENDPOINT}?_=${Date.now()}`, {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { accept: 'application/json' },
    signal
  })
  if (!response.ok) return ''
  const payload = await response.json().catch(() => null)
  const version = payload?.appVersion || payload?.version || ''
  return isValidVersion(version) ? version : ''
}

export default function UpdateRefreshDialog({ enabled = true, onDismissed }) {
  const [open, setOpen] = useState(false)
  const [previousVersion, setPreviousVersion] = useState('')
  const [availableVersion, setAvailableVersion] = useState(APP_VERSION)
  const [remoteUpdate, setRemoteUpdate] = useState(false)
  const [releaseInfo, setReleaseInfo] = useState(null)
  const openRef = useRef(false)
  const lastRemoteCheckAtRef = useRef(0)
  const inFlightRef = useRef(false)
  const releaseInfoAbortRef = useRef(null)

  useEffect(() => {
    openRef.current = open
  }, [open])

  // 拉取服务端发布的公告正文。失败时静默降级：弹窗仍显示版本号对比。
  const loadReleaseInfo = useCallback(async () => {
    releaseInfoAbortRef.current?.abort()
    const controller = new AbortController()
    releaseInfoAbortRef.current = controller
    const info = await fetchReleaseInfo({ signal: controller.signal })
    if (controller.signal.aborted) return
    if (info) setReleaseInfo(info)
  }, [])

  const openLocalPrompt = useCallback(() => {
    const seen = readSeenVersion()
    // Fresh load of a new bundle that has not been confirmed yet.
    if (seen === APP_VERSION) return false
    setPreviousVersion(seen)
    setAvailableVersion(APP_VERSION)
    setRemoteUpdate(false)
    setReleaseInfo({
      version: APP_VERSION,
      date: currentRelease.date,
      title: currentRelease.title,
      summary: currentRelease.summary,
      changes: currentRelease.changes
    })
    setOpen(true)
    return true
  }, [])

  const openRemotePrompt = useCallback((remoteVersion) => {
    if (!remoteVersion || !isValidVersion(remoteVersion)) return false
    if (remoteVersion === APP_VERSION) return false
    if (readStorage(DISMISSED_REMOTE_KEY) === remoteVersion) return false
    setPreviousVersion(APP_VERSION)
    setAvailableVersion(remoteVersion)
    setRemoteUpdate(true)
    setReleaseInfo(null)
    setOpen(true)
    void loadReleaseInfo()
    return true
  }, [loadReleaseInfo])

  const checkRemoteVersion = useCallback(async ({ force = false, signal } = {}) => {
    if (typeof window === 'undefined') return
    if (document.visibilityState === 'hidden') return
    if (!navigator.onLine) return
    if (openRef.current) return
    const now = Date.now()
    if (!force && now - lastRemoteCheckAtRef.current < INTERACTION_THROTTLE_MS) return
    if (inFlightRef.current) return

    inFlightRef.current = true
    lastRemoteCheckAtRef.current = now
    try {
      const remoteVersion = await fetchRemoteAppVersion(signal)
      if (signal?.aborted) return
      if (!remoteVersion) return
      openRemotePrompt(remoteVersion)
    } catch (error) {
      if (error?.name === 'AbortError') return
      // Network blips should not surface as UI errors for this soft check.
    } finally {
      inFlightRef.current = false
    }
  }, [openRemotePrompt])

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined

    // 1) Existing first-load behaviour against the bundled APP_VERSION.
    openLocalPrompt()

    // 2) 业务请求快通道：任意 API 响应头 X-App-Version 变化立即触发弹窗。
    const handleServerVersion = (version) => {
      if (typeof version !== 'string' || !version) return
      if (document.visibilityState === 'hidden') return
      openRemotePrompt(version)
    }
    onServerVersion(handleServerVersion)

    // 3) Continuous remote checks: focus/visibility, timer, and user interaction.
    let controller = new AbortController()
    const runRemoteCheck = (options = {}) => {
      controller.abort()
      controller = new AbortController()
      void checkRemoteVersion({ ...options, signal: controller.signal })
    }

    const onFocus = () => runRemoteCheck({ force: true })
    const onVisibility = () => {
      if (document.visibilityState === 'visible') runRemoteCheck({ force: true })
    }
    const onInteraction = () => runRemoteCheck({ force: false })

    // Periodic poll while the tab stays open and visible.
    const pollTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') runRemoteCheck({ force: true })
    }, POLL_INTERVAL_MS)

    // Usage-time checks: scroll / tap / edit (throttled inside checkRemoteVersion).
    const interactionEvents = ['pointerdown', 'keydown', 'input', 'scroll', 'touchstart']
    for (const eventName of interactionEvents) {
      window.addEventListener(eventName, onInteraction, { passive: true, capture: true })
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)

    // One immediate remote check after mount so a long-lived tab that just
    // received this bundle still learns about a newer server release quickly.
    runRemoteCheck({ force: true })

    return () => {
      controller.abort()
      onServerVersion(null)
      releaseInfoAbortRef.current?.abort()
      window.clearInterval(pollTimer)
      for (const eventName of interactionEvents) {
        window.removeEventListener(eventName, onInteraction, { capture: true })
      }
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [checkRemoteVersion, enabled, openLocalPrompt, openRemotePrompt])

  const dismiss = () => {
    if (remoteUpdate) {
      // Remember this remote version so focus/poll spam does not re-open the same prompt.
      writeStorage(DISMISSED_REMOTE_KEY, availableVersion)
    } else {
      writeSeenVersion(APP_VERSION)
    }
    setOpen(false)
    // 公告已关闭：让父级接续后续提示（例如 Shiphub 需要重新授权）。
    onDismissed?.()
  }

  const refreshNow = () => {
    if (remoteUpdate) {
      writeStorage(DISMISSED_REMOTE_KEY, availableVersion)
    }
    // Mark the version being loaded as seen, so the fresh bundle after reload
    // does not prompt again for the same release.
    writeSeenVersion(availableVersion)
    window.location.reload()
  }

  const notes = releaseInfo
  const notesLoading = remoteUpdate && !notes

  return (
    <AppDialog
      open={open}
      onClose={dismiss}
      className="update-refresh-dialog"
      eyebrow="UPDATE AVAILABLE · 版本已更新"
      title="请刷新后继续使用"
      description={remoteUpdate
        ? '服务端已发布新版本，当前标签页仍是旧缓存。请先刷新浏览器再操作。'
        : '工作台已发布新版本。为避免继续使用旧缓存页面，请先刷新浏览器再操作。'}
    >
      <div className="update-refresh-card" role="status" aria-live="polite">
        <div>
          <span>{remoteUpdate ? '服务端版本' : '当前版本'}</span>
          <strong>V{availableVersion}</strong>
        </div>
        <div>
          <span>{remoteUpdate ? '当前页面' : '上次访问'}</span>
          <strong>{previousVersion ? `V${previousVersion}` : '未确认'}</strong>
        </div>
      </div>

      <div className="update-refresh-copy">
        {notes?.title && <p><strong>{notes.title}</strong></p>}
        {notes?.summary && <p>{notes.summary}</p>}
        {Array.isArray(notes?.changes) && notes.changes.length > 0 && (
          <ul className="update-refresh-changes">
            {notes.changes.map((change) => <li key={change}>{change}</li>)}
          </ul>
        )}
        {notesLoading && <p>已发布 V{availableVersion}，更新详情即将显示。</p>}
        <ol>
          <li>点“立即刷新”加载最新页面。</li>
          <li>若按钮无效，请手动强制刷新：iPhone 用 Safari 重新打开；Android Chrome 可下拉刷新或清除站点数据后重进。</li>
          <li>刷新完成前，请不要继续录入或闭店，以免旧页面与新版本不一致。</li>
        </ol>
      </div>

      <div className="dialog-footer update-refresh-actions">
        <button type="button" className="secondary-action" onClick={dismiss}>稍后手动刷新</button>
        <button type="button" className="primary-action" data-autofocus onClick={refreshNow}>立即刷新</button>
      </div>
    </AppDialog>
  )
}
