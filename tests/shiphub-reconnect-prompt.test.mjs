import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'

const HOOK = 'apps/web/src/hooks/useShipHubReconnectPrompt.js'
const APP = 'apps/web/src/App.jsx'
const DIALOG = 'apps/web/src/components/dialogs/UpdateRefreshDialog.jsx'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('提示只针对需要人工重连的状态，正常连接不打扰', async () => {
  const { shouldPromptReconnect } = await import(`../${HOOK}`)
  const base = { storeId: 'S1', seenKey: '', now: new Date('2026-09-01T02:00:00') }

  for (const status of ['reauth_required', 'degraded']) {
    assert.equal(shouldPromptReconnect({ ...base, connectionStatus: status }), true, `${status} 应提示`)
  }
  for (const status of ['connected', 'fixture', 'disconnected', '']) {
    assert.equal(shouldPromptReconnect({ ...base, connectionStatus: status }), false, `${status} 不应提示`)
  }
})

test('每店每天仅一次：当天已记账后不再提示，跨天恢复提示', async () => {
  const { shouldPromptReconnect, buildPromptKey } = await import(`../${HOOK}`)
  const day1 = new Date('2026-09-01T02:00:00')
  const day2 = new Date('2026-09-02T02:00:00')
  const seen = buildPromptKey('S1', day1)

  assert.equal(shouldPromptReconnect({ connectionStatus: 'degraded', storeId: 'S1', seenKey: seen, now: day1 }), false, '同日同店应静默')
  assert.equal(shouldPromptReconnect({ connectionStatus: 'degraded', storeId: 'S1', seenKey: seen, now: day2 }), true, '次日应重新提示')
  assert.equal(shouldPromptReconnect({ connectionStatus: 'degraded', storeId: 'S2', seenKey: seen, now: day1 }), true, '另一门店应独立提示')
})

test('enabled=false 时完全不提示', async () => {
  const { shouldPromptReconnect } = await import(`../${HOOK}`)
  assert.equal(
    shouldPromptReconnect({ connectionStatus: 'degraded', storeId: 'S1', seenKey: '', enabled: false }),
    false
  )
})

test('日期键用本地时区，不用 UTC', async () => {
  const source = await read(HOOK)
  assert.ok(/getFullYear\(\)/u.test(source), '应使用 getFullYear（本地时区）')
  assert.ok(!/toISOString\(\)/u.test(source), '不得用 toISOString 派生日期键（会跨时区错日）')
})

test('公告先行：弹窗排在更新公告关闭之后', async () => {
  const dialog = await read(DIALOG)
  assert.ok(/onDismissed\?\.\(\)/u.test(dialog), '公告 dismiss 必须回调 onDismissed')

  const app = await read(APP)
  assert.ok(
    /<UpdateRefreshDialog[^>]*onDismissed=\{shiphubReconnectPrompt\.clearAnnouncement\}/u.test(app),
    '工作台内的公告必须把关闭事件接到重连提示上'
  )
  const hook = await read(HOOK)
  assert.ok(/announcementCleared/u.test(hook), 'hook 必须显式跟踪公告是否已让路')
  assert.ok(
    /const active = enabled && canManage && announcementCleared/u.test(hook),
    '公告未关闭前不得激活提示'
  )
})

test('公告不会出现时直接放行，避免永久等待', async () => {
  const hook = await read(HOOK)
  assert.ok(/SEEN_VERSION_KEY/u.test(hook), '需读取公告已读键判断公告是否会出现')
  assert.ok(
    /readVersionSeen\(\) === appVersion/u.test(hook),
    '当前版本已确认过则公告不弹，必须直接放行'
  )
})

test('先记账再开弹窗，关闭后当天不复现', async () => {
  const hook = await read(HOOK)
  const effect = hook.slice(hook.indexOf('if (!active || typeof window'))
  const writeAt = effect.indexOf('writeStorage(key)')
  const openAt = effect.indexOf('setShouldOpen(true)')
  assert.ok(writeAt > -1 && openAt > -1, '应同时存在记账与开弹窗')
  assert.ok(writeAt < openAt, '必须先写 localStorage 再打开弹窗')
})

test('仅门店管理者收到提示，普通操作员不打扰', async () => {
  const app = await read(APP)
  const call = app.slice(app.indexOf('useShipHubReconnectPrompt({'), app.indexOf('appVersion: APP_VERSION'))
  assert.ok(
    /canManage: role === 'manager' \|\| role === 'admin'/u.test(call),
    '必须限定 manager/admin'
  )
})

test('复用既有 Shiphub 设置弹窗，不新增第二套 UI', async () => {
  const app = await read(APP)
  assert.ok(
    /<ShipHubSettingsDialog open=\{shiphubSettingsOpen \|\| shiphubReconnectPrompt\.shouldOpen\}/u.test(app),
    '应复用 ShipHubSettingsDialog 而非新建组件'
  )
  assert.ok(
    /onClose=\{\(\) => \{ setShiphubSettingsOpen\(false\); shiphubReconnectPrompt\.dismiss\(\) \}\}/u.test(app),
    '关闭时必须同时清掉提示态，否则无法手动关闭'
  )
})
