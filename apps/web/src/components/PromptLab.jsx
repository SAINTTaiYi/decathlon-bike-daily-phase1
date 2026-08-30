/*
 * PromptLab — preview-only 弹窗重放面板。
 *
 * 为什么存在：更新公告与 Shiphub 重连提示都靠 localStorage 记账做「只弹一次」，
 * 一旦看过就再也不出现。验证这两个弹窗此前只能手动清站点数据，或等到下一次真
 * 发版 / 等真实 refresh token 过期。这个面板把记账键清掉，让弹窗可以重放。
 *
 * 约束与 PaletteLab 一致：
 * - 仅 preview / localhost，绝不在 workshop.skin 渲染。
 * - 纯客户端 localStorage 读写，不调接口、不碰 D1，无存储成本。
 * - 只影响「是否已看过」的记账，不伪造版本号、不改后端连接状态。
 *   重连弹窗还需要连接状态为需重连，用待取车看板的状态模拟器配合。
 */
import { useCallback, useEffect, useState } from 'react'

import { isPreviewHost } from '../utils/previewGate.js'

const SEEN_VERSION_KEY = 'workshop.ledger.seen-app-version'
const DISMISSED_REMOTE_KEY = 'workshop.ledger.dismissed-remote-version'
const RECONNECT_KEY = 'workshop.ledger.shiphub-reconnect-prompt'

function readKey(key) {
  try {
    return window.localStorage.getItem(key) || ''
  } catch {
    return ''
  }
}

function removeKeys(keys) {
  for (const key of keys) {
    try {
      window.localStorage.removeItem(key)
    } catch {
      // 隐私模式下静默失败，面板会照实显示当前值。
    }
  }
}

export default function PromptLab({ onResetReconnect }) {
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState({ seen: '', remote: '', reconnect: '' })
  const [notice, setNotice] = useState('')

  const refresh = useCallback(() => {
    setValues({
      seen: readKey(SEEN_VERSION_KEY),
      remote: readKey(DISMISSED_REMOTE_KEY),
      reconnect: readKey(RECONNECT_KEY)
    })
  }, [])

  // 面板打开期间跟着刷新，关掉弹窗后能立刻看到记账键被写回。
  useEffect(() => {
    if (!open) return undefined
    refresh()
    const timer = window.setInterval(refresh, 1000)
    return () => window.clearInterval(timer)
  }, [open, refresh])

  const replayAnnouncement = useCallback(() => {
    removeKeys([SEEN_VERSION_KEY, DISMISSED_REMOTE_KEY])
    refresh()
    setNotice('已清空公告记账键，刷新页面后公告会重新出现。')
  }, [refresh])

  const replayReconnect = useCallback(() => {
    removeKeys([RECONNECT_KEY])
    onResetReconnect?.()
    refresh()
    setNotice('已清空当天重连记账。连接状态为「需重新授权 / 同步异常」时会立刻重新弹出。')
  }, [onResetReconnect, refresh])

  if (!isPreviewHost()) return null

  return (
    <div className="prompt-lab" data-open={open ? 'true' : 'false'}>
      <button
        type="button"
        className="prompt-lab-trigger"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open ? 'true' : 'false'}
        aria-controls="prompt-lab-panel"
      >
        <span className="prompt-lab-trigger-label">弹窗</span>
      </button>

      {open && (
        <section id="prompt-lab-panel" className="prompt-lab-panel" aria-label="弹窗重放（仅 Preview）">
          <header className="prompt-lab-head">
            <div>
              <p className="prompt-lab-eyebrow">PROMPT LAB</p>
              <h2 className="prompt-lab-title">弹窗重放</h2>
            </div>
            <button type="button" className="prompt-lab-close" onClick={() => setOpen(false)} aria-label="关闭弹窗重放面板">
              ✕
            </button>
          </header>

          <p className="prompt-lab-note">
            仅 Preview 可见。清空「只弹一次」的记账键以便重复验证，不影响真实连接与后端数据。
          </p>

          <div className="prompt-lab-actions">
            <button type="button" className="prompt-lab-action" onClick={replayAnnouncement}>
              重新触发更新公告
            </button>
            <button type="button" className="prompt-lab-action" onClick={replayReconnect}>
              重新触发重连弹窗
            </button>
            <button
              type="button"
              className="prompt-lab-action prompt-lab-action-strong"
              onClick={() => {
                removeKeys([SEEN_VERSION_KEY, DISMISSED_REMOTE_KEY, RECONNECT_KEY])
                window.location.reload()
              }}
            >
              全部清空并重载
            </button>
          </div>

          <dl className="prompt-lab-state">
            <div>
              <dt>seen-app-version</dt>
              <dd data-empty={values.seen ? 'false' : 'true'}>{values.seen || '（空）'}</dd>
            </div>
            <div>
              <dt>dismissed-remote-version</dt>
              <dd data-empty={values.remote ? 'false' : 'true'}>{values.remote || '（空）'}</dd>
            </div>
            <div>
              <dt>shiphub-reconnect-prompt</dt>
              <dd data-empty={values.reconnect ? 'false' : 'true'}>{values.reconnect || '（空）'}</dd>
            </div>
          </dl>

          {notice && <p className="prompt-lab-notice" role="status" aria-live="polite">{notice}</p>}

          <p className="prompt-lab-hint">
            重连弹窗还需要连接状态为需重连：在待取车页用「状态模拟」选「需重新授权」。
          </p>
        </section>
      )}
    </div>
  )
}
