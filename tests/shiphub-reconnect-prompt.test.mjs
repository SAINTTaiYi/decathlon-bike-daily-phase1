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

test('互斥信号读公告的显示状态，不依赖关闭回调', async () => {
  const hook = await read(HOOK)
  // 公告有多个渲染点（登录前的引导页/恢复页/同步页），登录界面那些实例不接
  // 父级回调，所以 onDismissed 不是可靠信号。必须订阅模块级显示状态。
  assert.ok(
    /subscribeAnnouncementVisibility/u.test(hook),
    'hook 必须订阅公告的显示状态'
  )
  assert.ok(
    /const active = enabled && canManage && !announcementVisible/u.test(hook),
    '公告正在显示时不得激活提示；不显示即放行'
  )
  assert.ok(
    !/announcementCleared|clearAnnouncement/u.test(hook),
    '不得残留「等公告关闭事件」的旧编排'
  )

  const app = await read(APP)
  assert.ok(
    !/onDismissed=\{shiphubReconnectPrompt/u.test(app),
    'App 不得再把公告关闭事件接到重连提示上（旧设计）'
  )
})

test('公告的每个渲染点都登记显示状态，登录界面关掉也算', async () => {
  const dialog = await read(DIALOG)
  assert.ok(
    /registerVisibleAnnouncement\(\)/u.test(dialog),
    '公告显示期间必须登记到模块级广播'
  )
  // 登记必须在 effect 里按 open 生效，而不是塞进某个按钮的 handler，
  // 否则非工作台的渲染点仍然无法参与互斥。
  const effect = dialog.slice(dialog.indexOf('if (!open) return undefined'))
  assert.ok(
    effect.startsWith('if (!open) return undefined'),
    '需要一个以 open 为条件的登记 effect'
  )
  assert.ok(
    /return registerVisibleAnnouncement\(\)/u.test(effect.slice(0, 200)),
    '登记函数的返回值必须作为 effect 清理，保证配对注销'
  )
})

test('公告可见性是引用计数，多实例并存不会提前放行', async () => {
  const { registerVisibleAnnouncement, isAnnouncementVisible, resetAnnouncementVisibility } =
    await import('../apps/web/src/utils/announcementVisibility.js')
  resetAnnouncementVisibility()

  assert.equal(isAnnouncementVisible(), false, '初始应无公告')
  const releaseA = registerVisibleAnnouncement()
  const releaseB = registerVisibleAnnouncement()
  assert.equal(isAnnouncementVisible(), true, '有实例显示时应为可见')
  releaseA()
  assert.equal(isAnnouncementVisible(), true, '仍有一个实例显示，不得放行')
  releaseB()
  assert.equal(isAnnouncementVisible(), false, '全部注销后应放行')
  releaseB()
  assert.equal(isAnnouncementVisible(), false, '重复注销不得把计数压成负数')
  resetAnnouncementVisibility()
})

test('提示仅限已进入 ops 主工作台，登录界面不弹', async () => {
  const app = await read(APP)
  const call = app.slice(app.indexOf('useShipHubReconnectPrompt({'))
  const enabled = call.slice(call.indexOf('enabled:'), call.indexOf('\n', call.indexOf('enabled:')))
  for (const guard of ['authenticated', '!mustChangePassword', 'introDone', 'workflow.hydrated', '!workspaceLaunching']) {
    assert.ok(enabled.includes(guard), `enabled 必须包含 ${guard}，否则登录/中间页也会弹`)
  }
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
