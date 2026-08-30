import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { APP_VERSION } from '../apps/web/src/data/releaseNotes.js'

const source = readFileSync(new URL('../apps/web/src/components/dialogs/UpdateRefreshDialog.jsx', import.meta.url), 'utf8')
const appSource = readFileSync(new URL('../apps/web/src/App.jsx', import.meta.url), 'utf8')

test('更新提示使用稳定 localStorage key，并绑定当前 APP_VERSION', () => {
  assert.match(source, /workshop\.ledger\.seen-app-version/)
  assert.match(source, /APP_VERSION/)
  assert.equal(typeof APP_VERSION, 'string')
  assert.match(APP_VERSION, /^\d+\.\d+\.\d+$/)
})

test('未确认当前版本时弹出，已确认同版本不弹，并提供立即刷新', () => {
  assert.match(source, /seen === APP_VERSION/)
  assert.match(source, /setOpen\(true\)/)
  assert.doesNotMatch(source, /if \(!seen\) \{\s*writeSeenVersion\(APP_VERSION\)/)
  assert.match(source, /立即刷新/)
  assert.match(source, /稍后手动刷新/)
  assert.match(source, /location\.reload\(\)/)
})

test('App 根树挂载 UpdateRefreshDialog，覆盖登录后主路径', () => {
  assert.match(appSource, /import UpdateRefreshDialog from '\.\/components\/dialogs\/UpdateRefreshDialog\.jsx'/)
  assert.match(appSource, /<UpdateRefreshDialog \/>/)
})

test('已打开页面通过前台聚焦、定时轮询与交互节流检查服务端版本', () => {
  assert.match(source, /\/api\/v1\/meta\/version/)
  assert.match(source, /cache:\s*['"]no-store['"]/)
  assert.match(source, /addEventListener\('focus'/)
  assert.match(source, /visibilitychange/)
  assert.match(source, /setInterval/)
  assert.match(source, /POLL_INTERVAL_MS/)
  assert.match(source, /INTERACTION_THROTTLE_MS/)
  assert.match(source, /pointerdown/)
  assert.match(source, /keydown/)
  assert.match(source, /input/)
  assert.match(source, /scroll/)
  assert.match(source, /dismissed-remote-version/)
  assert.match(source, /document\.visibilityState/)
})


test('工作台入场期间可延迟版本弹窗，避免抢占跳过动画的焦点', () => {
  // 绑行为而非参数列表：enabled 仍是可延迟开关，但允许新增其它 props。
  assert.match(source, /function UpdateRefreshDialog\(\{[^}]*\benabled = true\b[^}]*\}\)/)
  assert.match(source, /if \(!enabled \|\| typeof window === 'undefined'\) return undefined/)
  assert.match(appSource, /deferUpdatePrompt = auth\.source === 'login'/)
  assert.match(appSource, /<UpdateRefreshDialog enabled=\{!deferUpdatePrompt && !workspaceLaunching\}/)
})

test('登录界面不得卸载版本公告：主渲染树的挂载点不能被 introDone 条件门包裹', () => {
  // 回归 2026-08-31：主 return 里写成 {introDone ? <UpdateRefreshDialog … /> : null}，
  // 而 introDone 要求 authenticated，于是未登录时组件整体缺席。
  // 重载登录页会先经 auth.status === 'restoring' 分支（那里有挂载）弹出公告，
  // 随后切到主分支被卸载，内部 useState(open) 一并丢弃 —— 表现为「一闪而过」。
  const conditionalMount = new RegExp('introDone[^\\n]{0,40}\\\\?[^\\n]{0,40}<UpdateRefreshDialog')
  assert.doesNotMatch(appSource, conditionalMount)

  // introDone 的定义必须仍然依赖 authenticated，否则上面的断言失去意义。
  assert.match(appSource, /const introDone = authenticated &&/)

  // 未登录路径同样要能弹：enabled 只在 auth.source === 'login' 时才延迟。
  assert.match(appSource, /deferUpdatePrompt = auth\.source === 'login'/)

  // enabled 只用于抑制检查，不得反向关闭已打开的公告。
  assert.doesNotMatch(source, /if \(!enabled\)[^\n]{0,40}setOpen\(false\)/)
})
