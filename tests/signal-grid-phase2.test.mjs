import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('登录、初始化和强制改密共享 Signal Access 外壳', async () => {
  const [frame, boot, setup, password] = await Promise.all([
    read('../apps/web/src/components/SignalAccessFrame.jsx'),
    read('../apps/web/src/components/BootLoader.jsx'),
    read('../apps/web/src/components/InitialSetup.jsx'),
    read('../apps/web/src/components/PasswordChangeGate.jsx')
  ])
  assert.match(frame, /WORKSHOP SIGNAL GRID/u)
  assert.match(frame, /门店作业信号系统/u)
  for (const source of [boot, setup, password]) {
    assert.match(source, /SignalAccessBrand/u)
    assert.match(source, /SignalAccessHeading/u)
    assert.match(source, /signal-access-shell/u)
  }
  assert.match(boot, /autoComplete="username"/u)
  assert.match(boot, /autoComplete="current-password"/u)
  assert.match(setup, /setupAdminAccount/u)
  assert.match(password, /onChangePassword/u)
})

test('同一模块导航在桌面变为左侧轨道，在移动端变为底部 Dock', async () => {
  const [dock, css, scenes] = await Promise.all([
    read('../apps/web/src/components/lookbook/ActionDock.jsx'),
    read('../apps/web/src/styles/signal-grid-shell.css'),
    read('../apps/web/src/data/lookbookScenes.js')
  ])
  assert.match(dock, /lookbookScenes\.map/u)
  assert.match(dock, /data-signal-module=\{signalModule\}/u)
  assert.match(dock, /<small>\{no\}<\/small>/u)
  assert.match(scenes, /LOOK_TOTAL = 6/u)
  assert.match(css, /@media \(min-width: 960px\)[\s\S]*position: fixed;[\s\S]*left: \.75rem/u)
  assert.match(css, /@media \(max-width: 959px\)[\s\S]*bottom: calc\(max\(\.45rem/u)
  assert.match(css, /grid-template-columns: repeat\(6, minmax\(0, 1fr\)\)/u)
})

test('认证工作台采用平面冷中性画布、Voltage Lime 总览与模块色业务地图', async () => {
  const [app, pulse, css, index] = await Promise.all([
    read('../apps/web/src/App.jsx'),
    read('../apps/web/src/scenes/PulseScene.jsx'),
    read('../apps/web/src/styles/signal-grid-shell.css'),
    read('../apps/web/src/styles/index.css')
  ])
  assert.match(app, /className="app-runtime signal-workspace"/u)
  assert.match(app, /className="lookbook-shell signal-workspace-canvas"/u)
  assert.match(pulse, /signal-overview-primary/u)
  assert.match(pulse, /signal-business-map/u)
  assert.match(pulse, /data-signal-module=\{module\.signalModule\}/u)
  assert.match(css, /background: var\(--sg-p-module-overview\)/u)
  assert.match(css, /background: var\(--sg-module-color\)/u)
  assert.match(index, /signal-grid-shell\.css/u)
})

test('Phase 2 does not change API, database or business action wiring', async () => {
  const app = await read('../apps/web/src/App.jsx')
  assert.match(app, /workflow\.completePickup/u)
  assert.match(app, /workflow\.completeRepair/u)
  assert.match(app, /workflow\.completeResaleListing/u)
  assert.match(app, /workflow\.sellResale/u)
  assert.match(app, /workflow\.completeHandover/u)
  assert.match(app, /workflow\.completeClosing/u)
})
