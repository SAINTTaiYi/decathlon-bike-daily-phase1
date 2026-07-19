import { useCallback, useEffect, useState } from 'react'
import AppDialog from './AppDialog.jsx'
import { APP_VERSION, currentRelease } from '../../data/releaseNotes.js'

const STORAGE_KEY = 'workshop.ledger.seen-app-version'
const DISMISSED_REMOTE_KEY = 'workshop.ledger.dismissed-remote-version'
const VERSION_ENDPOINT = '/api/v1/meta/version'

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

export default function UpdateRefreshDialog() {
  const [open, setOpen] = useState(false)
  const [previousVersion, setPreviousVersion] = useState('')
  const [availableVersion, setAvailableVersion] = useState(APP_VERSION)
  const [remoteUpdate, setRemoteUpdate] = useState(false)

  const openLocalPrompt = useCallback(() => {
    const seen = readSeenVersion()
    // Fresh load of a new bundle that has not been confirmed yet.
    if (seen === APP_VERSION) return false
    setPreviousVersion(seen)
    setAvailableVersion(APP_VERSION)
    setRemoteUpdate(false)
    setOpen(true)
    return true
  }, [])

  const openRemotePrompt = useCallback((remoteVersion) => {
    if (!remoteVersion || remoteVersion === APP_VERSION) return false
    if (readStorage(DISMISSED_REMOTE_KEY) === remoteVersion) return false
    setPreviousVersion(APP_VERSION)
    setAvailableVersion(remoteVersion)
    setRemoteUpdate(true)
    setOpen(true)
    return true
  }, [])

  const checkRemoteVersion = useCallback(async (signal) => {
    if (typeof window === 'undefined') return
    if (document.visibilityState === 'hidden') return
    if (!navigator.onLine) return
    try {
      const remoteVersion = await fetchRemoteAppVersion(signal)
      if (signal?.aborted) return
      if (!remoteVersion) return
      // Only interrupt an already-open local prompt when a newer remote version is found.
      openRemotePrompt(remoteVersion)
    } catch (error) {
      if (error?.name === 'AbortError') return
      // Network blips should not surface as UI errors for this soft check.
    }
  }, [openRemotePrompt])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    // 1) Existing first-load behaviour against the bundled APP_VERSION.
    openLocalPrompt()

    // 2) When the tab returns to the foreground, compare against the server.
    let controller = new AbortController()
    const runRemoteCheck = () => {
      controller.abort()
      controller = new AbortController()
      void checkRemoteVersion(controller.signal)
    }

    const onFocus = () => runRemoteCheck()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') runRemoteCheck()
    }

    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      controller.abort()
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [checkRemoteVersion, openLocalPrompt])

  const dismiss = () => {
    if (remoteUpdate) {
      // Remember this remote version so focus spam does not re-open the same prompt.
      writeStorage(DISMISSED_REMOTE_KEY, availableVersion)
    } else {
      writeSeenVersion(APP_VERSION)
    }
    setOpen(false)
  }

  const refreshNow = () => {
    if (remoteUpdate) {
      writeStorage(DISMISSED_REMOTE_KEY, availableVersion)
    }
    // After reload the new bundle becomes APP_VERSION; clear seen only if we already
    // match, otherwise leave seen as-is so the post-reload prompt can still fire if needed.
    writeSeenVersion(APP_VERSION)
    window.location.reload()
  }

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
        <p><strong>{remoteUpdate ? `已发布 V${availableVersion}` : currentRelease.title}</strong></p>
        <p>{remoteUpdate
          ? '刷新后才会加载新页面、新校验与新界面。继续使用旧页面可能导致录入与版本不一致。'
          : currentRelease.summary}</p>
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
