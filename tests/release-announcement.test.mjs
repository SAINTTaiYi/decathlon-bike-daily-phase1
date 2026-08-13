import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { APP_VERSION, currentRelease } from '../apps/web/src/data/releaseNotes.js'

const dialog = readFileSync(new URL('../apps/web/src/components/dialogs/UpdateRefreshDialog.jsx', import.meta.url), 'utf8')
const client = readFileSync(new URL('../apps/web/src/api/client.js', import.meta.url), 'utf8')
const index = readFileSync(new URL('../apps/worker/src/index.ts', import.meta.url), 'utf8')

test('更新弹窗检测到新版本后拉取 /api/release/info 并展示逐条更新内容', () => {
  assert.match(client, /\/api\/release\/info/)
  assert.match(dialog, /fetchReleaseInfo/)
  assert.match(client, /fetchReleaseInfo/)
  assert.match(dialog, /update-refresh-changes/)
  assert.match(dialog, /notes\.changes\.map/)
})

test('业务 API 响应头 X-App-Version 直接触发版本检测，不等轮询心跳', () => {
  assert.match(client, /x-app-version/)
  assert.match(client, /onServerVersion/)
  assert.match(dialog, /onServerVersion\(handleServerVersion\)/)
  assert.match(index, /X-App-Version/)
  assert.match(index, /Access-Control-Expose-Headers/)
})

test('立即刷新把目标版本记为已见，刷新后不再重复弹窗', () => {
  assert.match(dialog, /writeSeenVersion\(availableVersion\)/)
})

test('Worker 挂载发布公告路由且为公共端点', () => {
  assert.match(index, /releaseRoutes\(\)/)
  assert.match(index, /path === '\/api\/release\/info'/)
  assert.match(index, /'\/api\/release\/info'/, )
})

test('发布公告事实源结构完整', () => {
  assert.equal(typeof APP_VERSION, 'string')
  assert.match(APP_VERSION, /^\d+\.\d+\.\d+$/)
  assert.equal(currentRelease.version, APP_VERSION)
  assert.ok(Array.isArray(currentRelease.changes) && currentRelease.changes.length > 0)
  assert.ok(currentRelease.title && currentRelease.summary)
})
