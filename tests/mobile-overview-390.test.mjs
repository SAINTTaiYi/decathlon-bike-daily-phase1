import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')
const hash = async (path) => createHash('sha256').update(await readFile(new URL(path, root))).digest('hex')

test('reference overview maps every visible business field to auth and workflow data', async () => {
  const [app, overview] = await Promise.all([
    read('apps/web/src/App.jsx'),
    read('apps/web/src/components/overview/WorkshopOverviewPage.jsx')
  ])
  assert.match(app, /workflow=\{workflow\}/u)
  assert.match(app, /storeName=\{currentStore\?\.storeName\}/u)
  assert.match(app, /roleLabel=\{roleLabels\[role\]\}/u)
  assert.match(app, /userName=\{currentUser\}/u)
  for (const field of ['dateKey', 'kpi', 'recordsByScene', 'closedAt', 'storageError']) assert.match(overview, new RegExp(`workflow\\.${field}`, 'u'))
  assert.doesNotMatch(overview, /CHUI3|粤A12345|张三|李四|王五/u)
})

test('reference overview keeps KPI, closing, history, refresh, export and scene navigation handlers', async () => {
  const [app, overview] = await Promise.all([
    read('apps/web/src/App.jsx'),
    read('apps/web/src/components/overview/WorkshopOverviewPage.jsx')
  ])
  for (const handler of [
    /onMenu=\{\(\) => setMenuOpen\(true\)\}/u,
    /onLog=\{\(\) => setLogOpen\(true\)\}/u,
    /onEditKpi=\{\(\) => setKpiOpen\(true\)\}/u,
    /onCompleteClosing=\{requestClose\}/u,
    /onRefresh=\{\(\) => void workflow\.refresh\(\)\}/u,
    /onReopenClosing=\{\(\) => void reopen\(\)\}/u,
    /onExportReport=\{exportClosingReport\}/u,
    /onJump=\{jumpFromOverview\}/u
  ]) assert.match(app, handler)
  assert.match(overview, /actions = \{ error: onRefresh, done: onHistory, ready: onCompleteClosing, due: onEditKpi \}/u)
  assert.match(overview, /onJump\('pickup'\)/u)
})

test('mobile composition follows the five-part reference rhythm with operational content', async () => {
  const [overview, css] = await Promise.all([
    read('apps/web/src/components/overview/WorkshopOverviewPage.jsx'),
    read('apps/web/src/styles/mobile-overview.css')
  ])
  for (const className of ['ops-reference-hero', 'ops-reference-floor', 'ops-reference-proof', 'ops-reference-connection', 'ops-reference-updates']) {
    assert.match(overview, new RegExp(`className="${className}`, 'u'))
    assert.match(css, new RegExp(`\\.${className}`, 'u'))
  }
  assert.match(overview, /Every Shift/u)
  assert.match(overview, /Explore<br \/>Today/u)
  assert.match(overview, /Today,<br \/>Measured/u)
  assert.match(overview, /The<br \/>Connection/u)
  assert.match(overview, /<OperationsIndex workflow=\{workflow\}/u)
  assert.match(overview, /<SalesVehiclesPanel dateKey=\{workflow\.dateKey\}/u)
})

test('mobile-first geometry supports 320 through desktop without horizontal scrolling', async () => {
  const css = await read('apps/web/src/styles/mobile-overview.css')
  for (const rule of [
    /min-height: 790px/u,
    /min-height: 870px/u,
    /min-height: 650px/u,
    /min-height: 44px/u,
    /repeat\(6,minmax\(0,1fr\)\)/u,
    /env\(safe-area-inset-bottom\)/u,
    /@media \(max-width: 374px\)/u,
    /@media \(min-width: 600px\)/u,
    /@media \(min-width: 840px\)/u,
    /@media \(min-width: 1200px\)/u,
    /repeat\(12,minmax\(0,1fr\)\)/u,
    /prefers-reduced-motion: reduce/u,
    /forced-colors: active/u
  ]) assert.match(css, rule)
  assert.doesNotMatch(css, /overflow-x:\s*auto/u)
})

test('closing hierarchy preserves unavailable, due, ready, closed and export states', async () => {
  const [overview, css] = await Promise.all([
    read('apps/web/src/components/overview/WorkshopOverviewPage.jsx'),
    read('apps/web/src/styles/mobile-overview.css')
  ])
  assert.match(overview, /今日闭店进度/u)
  assert.match(overview, /销售数据是唯一闭店要求/u)
  for (const tone of ["tone: 'error'", "tone: 'done'", "tone: 'ready'", "tone: 'due'"]) assert.match(overview, new RegExp(tone, 'u'))
  assert.match(overview, /progress === null \? '—' : progress/u)
  assert.match(overview, /导出日报图/u)
  assert.match(overview, /重新打开闭店/u)
  assert.match(css, /\.ops-status-value strong \{ font-size: 66px;/u)
})

test('operations index keeps five concise dynamic destinations', async () => {
  const [overview, css] = await Promise.all([
    read('apps/web/src/components/overview/WorkshopOverviewPage.jsx'),
    read('apps/web/src/styles/mobile-overview.css')
  ])
  assert.match(overview, /className="ops-index-label-cn">业务台账<\/span>/u)
  assert.match(css, /\.ops-index-label-cn \{[^}]*font-family: 'Noto Sans SC Variable';[^}]*transform: scaleX\(\.72\);/u)
  for (const label of ['待取车辆', '其它交接', '维修交接', '二手车台账', '销售数据']) assert.match(overview, new RegExp(`'${label}'`, 'u'))
  assert.match(overview, /workflow\.recordsByScene\[id\]\?\.length/u)
  assert.match(overview, /data-value=\{String\(value\)\.toLowerCase\(\)\}/u)
})

test('candidate remains inside the accepted palette, radius and font system', async () => {
  const [css, tokens, system] = await Promise.all([
    read('apps/web/src/styles/mobile-overview.css'),
    read('apps/web/src/styles/tokens.css'),
    read('apps/web/src/styles/workshop-system.css')
  ])
  for (const rule of [/--ops-page: #f7f5ef/u, /--ops-card: #fffdf8/u, /--ops-yellow: #ffc31a/u, /border-radius: 8px/u, /--ops-card-shadow:/u]) assert.match(css, rule)
  const runtimeCss = [css, tokens, system].join('\n')
  assert.match(runtimeCss, /--ops-body: 'Noto Sans SC Variable'/u)
  assert.match(runtimeCss, /--ops-display: 'Barlow Condensed Ops', 'Noto Sans SC Variable'/u)
  assert.doesNotMatch(css, /linear-gradient|radial-gradient|conic-gradient/u)
  assert.doesNotMatch(runtimeCss, /Arial|Helvetica|Segoe|BlinkMac|system-ui|sans-serif|monospace|ui-sans/u)
})

test('reference photography is self-hosted, responsive, licensed and integrity-pinned', async () => {
  const [overview, sources] = await Promise.all([
    read('apps/web/src/components/overview/WorkshopOverviewPage.jsx'),
    read('apps/web/public/images/ops/SOURCES.md')
  ])
  for (const asset of ['obsidian-oregon-760.webp', 'mechanic-workbench-960.webp', 'mechanic-workbench-1600.webp']) {
    assert.match(overview, new RegExp(asset.replace('.', '\\.'), 'u'))
    assert.match(sources, new RegExp(asset.replace('.', '\\.'), 'u'))
  }
  assert.match(overview, /<picture className=\{className\} aria-hidden="true">/u)
  assert.match(sources, /Wikimedia Commons/u)
  assert.match(sources, /Public domain/u)
  assert.match(sources, /CC0 1\.0/u)
  assert.equal(await hash('apps/web/public/images/ops/reference-home/obsidian-oregon-760.webp'), 'a15390725bdefa5851178dd80a5b5673c8f20ed016932bff028d46d6e9a314e5')
  assert.equal(await hash('apps/web/public/images/ops/reference-home/mechanic-workbench-960.webp'), '904828cb3488107082bf2356fe8692771b6a89a9dfe2cc9e4b17ab7c30f064f4')
  assert.equal(await hash('apps/web/public/images/ops/reference-home/mechanic-workbench-1600.webp'), '6c746d85ba41f7ac4e011cfbbcfb3b68969835ea27bfbdc7131347c53abef235')
})

test('bottom navigation remains six operational destinations without a separate status column', async () => {
  const [dock, scenes, css] = await Promise.all([
    read('apps/web/src/components/lookbook/ActionDock.jsx'),
    read('apps/web/src/data/lookbookScenes.js'),
    read('apps/web/src/styles/mobile-overview.css')
  ])
  assert.match(dock, /OVERVIEW/u)
  assert.match(dock, /PENDING/u)
  assert.match(dock, /dock-status/u)
  assert.match(scenes, /LOOK_TOTAL = 6/u)
  assert.match(css, /\.look-dock \.dock-status \{ display: none !important; \}/u)
})

test('reference imagery is decorative and accessibility fallbacks retain readable state', async () => {
  const [overview, css] = await Promise.all([
    read('apps/web/src/components/overview/WorkshopOverviewPage.jsx'),
    read('apps/web/src/styles/mobile-overview.css')
  ])
  assert.match(overview, /className="ops-reference-object"[^>]*alt=""/u)
  assert.match(overview, /<picture className=\{className\} aria-hidden="true">/u)
  assert.match(overview, /aria-labelledby="ops-reference-title"/u)
  assert.match(overview, /aria-labelledby="ops-floor-title"/u)
  assert.match(overview, /aria-labelledby="ops-proof-title"/u)
  assert.match(overview, /aria-labelledby="ops-connection-title"/u)
  assert.match(css, /:focus-visible/u)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/u)
  assert.match(css, /@media \(forced-colors: active\)/u)
})

test('release disclosure still avoids the fixed dock and public version is unchanged', async () => {
  const [overview, html] = await Promise.all([
    read('apps/web/src/components/overview/WorkshopOverviewPage.jsx'),
    read('apps/web/index.html')
  ])
  assert.match(overview, /onToggle=\{revealReleaseAboveDock\}/u)
  assert.match(overview, /querySelector\('\.look-dock'\)/u)
  assert.match(overview, /--ops-header-height/u)
  assert.match(overview, /window\.scrollBy/u)
  assert.match(overview, /prefers-reduced-motion: reduce/u)
  assert.doesNotMatch(html, /albert/iu)
})
