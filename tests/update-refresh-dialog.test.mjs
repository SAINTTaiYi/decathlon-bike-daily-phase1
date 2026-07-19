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

test('更新提示提供立即刷新与稍后手动刷新，并在版本变化时弹出', () => {
  assert.match(source, /立即刷新/)
  assert.match(source, /稍后手动刷新/)
  assert.match(source, /location\.reload\(\)/)
  assert.match(source, /seen === APP_VERSION/)
  assert.match(source, /setOpen\(true\)/)
})

test('App 根树挂载 UpdateRefreshDialog，覆盖登录后主路径', () => {
  assert.match(appSource, /import UpdateRefreshDialog from '\.\/components\/dialogs\/UpdateRefreshDialog\.jsx'/)
  assert.match(appSource, /<UpdateRefreshDialog \/>/)
})
