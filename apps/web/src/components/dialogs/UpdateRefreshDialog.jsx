import { useEffect, useState } from 'react'
import AppDialog from './AppDialog.jsx'
import { APP_VERSION, currentRelease } from '../../data/releaseNotes.js'

const STORAGE_KEY = 'workshop.ledger.seen-app-version'

function readSeenVersion() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

function writeSeenVersion(version) {
  try {
    window.localStorage.setItem(STORAGE_KEY, version)
  } catch {
    // Ignore private-mode / storage failures; the prompt will simply reappear next visit.
  }
}

export default function UpdateRefreshDialog() {
  const [open, setOpen] = useState(false)
  const [previousVersion, setPreviousVersion] = useState('')

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const seen = readSeenVersion()
    // Show whenever the current version has not been confirmed yet.
    // That covers first visit after deploy, version upgrades, and cleared storage.
    if (seen === APP_VERSION) return undefined
    setPreviousVersion(seen)
    setOpen(true)
    return undefined
  }, [])

  const dismiss = () => {
    writeSeenVersion(APP_VERSION)
    setOpen(false)
  }

  const refreshNow = () => {
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
      description="工作台已发布新版本。为避免继续使用旧缓存页面，请先刷新浏览器再操作。"
    >
      <div className="update-refresh-card" role="status" aria-live="polite">
        <div>
          <span>当前版本</span>
          <strong>V{APP_VERSION}</strong>
        </div>
        <div>
          <span>上次访问</span>
          <strong>{previousVersion ? `V${previousVersion}` : '未确认'}</strong>
        </div>
      </div>

      <div className="update-refresh-copy">
        <p><strong>{currentRelease.title}</strong></p>
        <p>{currentRelease.summary}</p>
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
