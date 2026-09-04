import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const [app, header, mobileHeader, desktopHeader, overview, systemCss, desktopCss, dock] = await Promise.all([
  read('apps/web/src/App.jsx'),
  read('apps/web/src/components/workshop/WorkshopShellHeader.jsx'),
  read('apps/web/src/components/workshop/WorkshopGlobalHeaderMobile.jsx'),
  read('apps/web/src/components/workshop/WorkshopGlobalHeaderDesktop.jsx'),
  read('apps/web/src/components/overview/WorkshopOverviewPage.jsx'),
  read('apps/web/src/styles/workshop-system.css'),
  read('apps/web/src/styles/desktop-workbench.css'),
  read('apps/web/src/components/lookbook/ActionDock.jsx')
])

test('ordinary phone uses the compact mobile header and never exposes desktop tools', () => {
  assert.match(header, /mobileLayout[\s\S]*WorkshopGlobalHeaderMobile[\s\S]*WorkshopGlobalHeaderDesktop/u)
  assert.match(mobileHeader, /workshop-header-mobile-log/u)
  assert.doesNotMatch(mobileHeader, /workshop-header-desktop-tools/u)
  assert.doesNotMatch(desktopHeader, /workshop-header-mobile-log|workshop-mobile-user/u)
  assert.match(systemCss, /\.workshop-header-menu > svg \{ width: 21px; height: 21px; \}/u)
  assert.match(systemCss, /\.workshop-module-header > svg \{ width: 20px; height: 20px;/u)
})

test('accepted desktop header is frozen and restores desktop-only tools and icon sizes', () => {
  assert.match(desktopCss, /@media \(min-width: 768px\)/u)
  assert.match(desktopCss, /\.workshop-header-desktop-tools \{ display: flex;/u)
  assert.match(desktopHeader, /workshop-header-desktop-tools/u)
  assert.match(desktopCss, /\.workshop-header-menu > svg \{ width: 28px; height: 28px; \}/u)
  assert.match(desktopCss, /\.workshop-module-header > svg \{ width: 26px; height: 26px;/u)
  // 2026-08-28 黄色 wipe 已移除，模块转场改为退场 + zoom-in 入场
  assert.ok(!desktopCss.includes('.desktop-scene-transition-viewport'))
  assert.ok(!desktopCss.includes('.desktop-scene-transition-wipe'))
})

test('desktop analytics and Used stay out of the ordinary phone DOM', () => {
  assert.match(app, /showUsed=\{desktopLayout\}/u)
  assert.match(app, /showAnalytics=\{desktopLayout\}/u)
  assert.match(overview, /showUsed = false, showAnalytics = false/u)
  assert.match(overview, /\{showAnalytics \? <OverviewAnalytics workflow=\{workflow\}(?: shiphubSummary=\{shiphubSummary\})? \/> : null\}/u)
  assert.match(overview, /operations\.filter\(\(\{ id \}\) => showUsed \|\| id !== 'resale'\)/u)
})

test('ordinary phone keeps five continuous modules and five fixed dock destinations', () => {
  assert.match(app, /desktopLayout \? <WorkshopModuleSection sceneId="resale"/u)
  assert.match(dock, /id !== 'resale'/u)
  assert.match(dock, /desktopLayout \? lookbookScenes/u)
  assert.match(systemCss, /grid-template-columns: repeat\(5,minmax\(0,1fr\)\) !important/u)
  assert.match(app, /jumpTo\(sceneId\)/u)
})
