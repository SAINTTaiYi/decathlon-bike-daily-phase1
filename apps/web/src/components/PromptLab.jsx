/*
 * PromptLab — preview-only 弹窗重放面板。
 *
 * 为什么存在：更新公告与 Shiphub 重连提示都靠 localStorage 记账做「只弹一次」，
 * 一旦看过就再也不出现。验证这两个弹窗此前只能手动清站点数据，或等到下一次真
 * 发版 / 等真实 refresh token 过期。这个面板把记账键清掉，让弹窗可以重放。
 *
 * 约束与 PaletteLab 一致：
 * - 仅 preview / localhost，绝不在 workshop.skin 渲染。
 * - 纯客户端，不调接口、不碰 D1，无存储成本。
 * - 只影响「是否已看过」的记账与版本闸门模拟的返回值，不改后端连接状态、
 *   不写任何服务器数据。重连弹窗还需要连接状态为需重连，用待取车看板的状态
 *   模拟器配合。
 *
 * 版本闸门模拟（2026-09-18）：日报图由本地代码绘制，版本闸门只在「服务端版本
 * 确实比页面新」时才拦。Preview 上 bundle 与服务端永远同版本，验收闸门就需要
 * 一个可控的「服务端已发新版」：这里只在本会话内存里改写 /api/v1/meta/version
 * 的返回值（不落盘、刷新即失效、生产环境永远不会安装这个改写），用来触发
 * 真实的闸门链路。 */
import { useCallback, useEffect, useState } from 'react'

import { APP_VERSION } from '../data/releaseNotes.js'
import { VERSION_ENDPOINT } from '../utils/appVersion.js'
import { isPreviewHost } from '../utils/previewGate.js'

const SEEN_VERSION_KEY = 'workshop.ledger.seen-app-version'
const DISMISSED_REMOTE_KEY = 'workshop.ledger.dismissed-remote-version'
const RECONNECT_KEY = 'workshop.ledger.shiphub-reconnect-prompt'

// 仅本会话内存，不落盘：刷新后自动回到真实版本检查。
let mockedRemoteVersion = ''

/** 下一个公开版本号（含用户口径的进位：补丁位满 10 进 1）。 */
function nextPublicVersion(version) {
  const [major, minor, patch] = String(version).split('.').map((part) => Number.parseInt(part, 10))
  if (patch >= 9) return minor + 1 >= 10 ? `${major + 1}.0.0` : `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

/**
 * 给 window 上的请求入口装一层薄改写：只在「已武装」且命中版本端点时返回模拟
 * 版本，其余请求原样透传。安装点只在本面板（preview-only）里，生产环境永不安装。
 */
function installVersionMock() {
  if (window.__previewVersionMockInstalled) return
  const realRequest = window.fetch
  window.fetch = function mockedVersion(input, init) {
    try {
      if (mockedRemoteVersion) {
        const url = typeof input === 'string' ? input : (input && input.url) || ''
        if (url.includes(VERSION_ENDPOINT)) {
          return Promise.resolve(new Response(JSON.stringify({
            appVersion: mockedRemoteVersion,
            apiVersion: '1.0.0',
            environment: 'preview',
            platform: 'cloudflare-workers-d1'
          }), { status: 200, headers: { 'content-type': 'application/json' } }))
        }
      }
    } catch {
      // 模拟异常一律回退真实请求，绝不阻断业务。
    }
    return realRequest.apply(this, arguments)
  }
  window.__previewVersionMockInstalled = true
}

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
  const [values, setValues] = useState({ seen: '', remote: '', reconnect: '', mock: '' })
  const [notice, setNotice] = useState('')

  const refresh = useCallback(() => {
    setValues({
      seen: readKey(SEEN_VERSION_KEY),
      remote: readKey(DISMISSED_REMOTE_KEY),
      reconnect: readKey(RECONNECT_KEY),
      mock: mockedRemoteVersion
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

  const armVersionGate = useCallback(() => {
    mockedRemoteVersion = nextPublicVersion(APP_VERSION)
    installVersionMock()
    refresh()
    setNotice(`已模拟服务端发布 V${mockedRemoteVersion}。现在点工作台里的「检查闭店」，或闭店后的「导出日报图」，就会弹出版本闸门（被动更新公告可能也出现，属正常）。模拟仅本会话有效，刷新即失效；若在闸门里点了「立即刷新」，刷新后可能要再点掉一次更新公告。`)
  }, [refresh])

  const disarmVersionGate = useCallback(() => {
    mockedRemoteVersion = ''
    refresh()
    setNotice('已恢复真实版本检查。')
  }, [refresh])

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
            <button type="button" className="prompt-lab-action" onClick={armVersionGate}>
              模拟服务端已发新版（触发版本闸门）
            </button>
            <button type="button" className="prompt-lab-action" onClick={disarmVersionGate}>
              解除模拟（恢复真实版本检查）
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
            <div>
              <dt>preview-mock-remote-version</dt>
              <dd data-empty={values.mock ? 'false' : 'true'}>{values.mock || '（未启用）'}</dd>
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
