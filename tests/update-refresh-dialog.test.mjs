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
