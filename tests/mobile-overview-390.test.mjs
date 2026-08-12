import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const read = (file) => readFile(new URL(file, root), 'utf8')

test('390 mobile overview maps visible business fields to auth and workflow data', async () => {
  const [app, overview] = await Promise.all([read('apps/web/src/App.jsx'), read('apps/web/src/components/overview/WorkshopOverviewPage.jsx')])
  assert.match(app, /workflow=\{workflow\}/u)
  assert.match(app, /storeName=\{currentStore\?\.storeName\}/u)
  assert.match(app, /roleLabel=\{roleLabels\[role\]\}/u)
  assert.match(app, /userName=\{currentUser\}/u)
  assert.match(overview, /workflow\.dateKey/u)
  assert.match(overview, /workflow\.kpi/u)
  assert.match(overview, /workflow\.recordsByScene/u)
  assert.match(overview, /workflow\.closedAt/u)
  assert.match(overview, /workflow\.storageError/u)
  assert.doesNotMatch(overview, /CHUI3|粤A12345|张三|李四|王五/u)
})

test('mobile overview keeps KPI, closing, history and jump handlers while pickup remains a dedicated module', async () => {
  const app = await read('apps/web/src/App.jsx')
  assert.match(app, /onMenu=\{\(\) => setMenuOpen\(true\)\}/u)
  assert.match(app, /onLog=\{\(\) => setLogOpen\(true\)\}/u)
  assert.match(app, /onEditKpi=\{\(\) => setKpiOpen\(true\)\}/u)
  assert.match(app, /onCompleteClosing=\{requestClose\}/u)
  assert.match(app, /setHistoryTarget\(\{ scene: 'pulse', record: null \}\)/u)
  assert.match(app, /<PickupScene \{\.\.\.recordProps\('pickup'\)\} \/>/u)
  assert.match(app, /<ActionDock activeScene=\{visibleScene\} onJump=\{jumpFromOverview\}/u)
  assert.match(app, /const visibleScene = desktopLayout \? desktopScene : activeScene/u)
  assert.match(app, /onJump=\{jumpFromOverview\}/u)
})

test('reference geometry remains mobile-first and explicitly adds a separate physical-pixel desktop/tablet workbench', async () => {
  const [mobileCss, desktopCss] = await Promise.all([read('apps/web/src/styles/mobile-overview.css'), read('apps/web/src/styles/desktop-workbench.css')])
  for (const rule of [/@media \(min-width: 0px\)/u, /width: min\(100%, 426px\)/u, /max-width: 390px/u, /height: 44px/u, /height: 154px/u, /height: 214px/u, /height: 130px/u, /height: 120px/u, /min-height: 26px/u, /repeat\(5, minmax\(0,1fr\)\)/u, /env\(safe-area-inset-bottom\)/u, /max-width: 374px/u, /min-width: 600px/u, /min-width: 840px/u, /min-width: 1200px/u, /repeat\(12,minmax\(0,1fr\)\)/u, /prefers-reduced-motion: reduce/u, /forced-colors: active/u]) assert.match(mobileCss, rule)
  assert.match(desktopCss, /@media \(min-width: 768px\)/u)
  assert.doesNotMatch(mobileCss, /overflow-x:\s*auto/u)
})

test('reference hierarchy uses real identity, binary closing status and stable metric sizing', async () => {
  const [overview, css, header] = await Promise.all([read('apps/web/src/components/overview/WorkshopOverviewPage.jsx'), read('apps/web/src/styles/mobile-overview.css'), read('apps/web/src/components/workshop/WorkshopShellHeader.jsx')])
  assert.match(header, /workshop-global-header/u)
  assert.match(header, /workshop-module-header/u)
  assert.match(overview, /今日闭店进度/u)
  assert.match(overview, /销售数据是唯一闭店要求/u)
  assert.match(overview, /salesValue === '—' \? 'unavailable'/u)
  assert.match(overview, /data-value=\{String\(value\)\.toLowerCase\(\)\}/u)
  assert.match(css, /\.ops-sales-primary \{ height: 128px; background: var\(--ops-card\); color: var\(--ops-text\); \}/u)
  assert.match(css, /\.ops-closing-card \{ height: 154px;/u)
  assert.match(overview, /<StatusValue value=\{progress\} available=\{available && !error\}/u)
  assert.doesNotMatch(overview, /StatusRing|ops-status-ring|<p>\{explanation\}<\/p>/u)
  assert.match(css, /\.ops-status-value strong \{ font-size: 68px; \}/u)
})

test('operations index keeps concise labels and gates Used to the desktop reference', async () => {
  const [overview, css] = await Promise.all([read('apps/web/src/components/overview/WorkshopOverviewPage.jsx'), read('apps/web/src/styles/mobile-overview.css')])
  assert.match(overview, /className="ops-index-label-cn">业务台账<\/span>/u)
  assert.match(css, /\.ops-index-label-cn \{[^}]*font-family: 'Noto Sans SC Variable';[^}]*font-weight: 700;[^}]*transform: scaleX\(\.72\);/u)
  for (const label of ['待取车辆', '其它交接', '维修交接', '销售数据']) assert.match(overview, new RegExp(`'${label}'`, 'u'))
  assert.match(overview, /二手台账/u)
  assert.match(overview, /showUsed/u)
  assert.match(overview, /usedSold/u)
  assert.match(overview, /usedReceived/u)
})

test('bottom navigation remains five-item on mobile and exposes Used only in the desktop reference', async () => {
  const [dock, scenes] = await Promise.all([read('apps/web/src/components/lookbook/ActionDock.jsx'), read('apps/web/src/data/lookbookScenes.js')])
  assert.match(dock, /OVERVIEW/u)
  assert.match(dock, /PENDING/u)
  assert.match(dock, /dock-status/u)
  assert.match(dock, /id !== 'resale'/u)
  assert.match(dock, /desktopLayout \? lookbookScenes/u)
  assert.match(scenes, /LOOK_TOTAL = 6/u)
  assert.match(scenes, /id: 'resale'/u)
})

test('closed closing actions reserve their own row instead of overlapping the sales card', async () => {
  const [overview, mobileCss, desktopCss, systemCss] = await Promise.all([read('apps/web/src/components/overview/WorkshopOverviewPage.jsx'), read('apps/web/src/styles/mobile-overview.css'), read('apps/web/src/styles/desktop-workbench.css'), read('apps/web/src/styles/workshop-system.css')])
  assert.match(overview, /data-closed=\{closed \? 'true' : 'false'\}/u)
  assert.match(overview, /className="ops-closing-actions"/u)
  assert.match(mobileCss, /\.ops-closing-card \{ height: 154px;/u)
  assert.match(mobileCss, /\.ops-closing-card\[data-closed='true'\] \{ height: 206px; \}/u)
  assert.match(systemCss, /\.ops-closing-actions button \{ min-height: 42px;/u)
  assert.match(desktopCss, /\.ops-closing-card\[data-closed='true'\] \{ grid-template-rows: minmax\(0, 1fr\) 104px 52px; \}/u)
})
