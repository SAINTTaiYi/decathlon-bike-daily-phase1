import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('390 mobile overview maps every visible business field to auth and workflow data', async () => {
  const [app, overview] = await Promise.all([
    read('apps/web/src/App.jsx'),
    read('apps/web/src/components/overview/WorkshopOverviewPage.jsx')
  ])
  assert.match(app, /workflow=\{workflow\}/u)
  assert.match(app, /currentStore=\{currentStore\}/u)
  assert.match(app, /currentUser=\{currentUser\}/u)
  assert.match(app, /writeLocked=\{writeLocked\}/u)
  assert.match(overview, /workflow\.dateKey/u)
  assert.match(overview, /workflow\.kpi/u)
  assert.match(overview, /workflow\.recordsByScene/u)
  assert.match(overview, /workflow\.closedAt/u)
  assert.match(overview, /workflow\.storageError/u)
  assert.doesNotMatch(overview, /CHUI3|粤A12345|张三|李四|王五/u)
})

test('mobile overview keeps existing KPI, closing, menu, history, pickup edit and scene jump handlers', async () => {
  const app = await read('apps/web/src/App.jsx')
  assert.match(app, /onMenu=\{\(\) => setMenuOpen\(true\)\}/u)
  assert.match(app, /onLog=\{\(\) => setLogOpen\(true\)\}/u)
  assert.match(app, /onEditKpi=\{\(\) => setKpiOpen\(true\)\}/u)
  assert.match(app, /onCompleteClosing=\{requestClose\}/u)
  assert.match(app, /setHistoryTarget\(\{ scene: 'pulse', record: null \}\)/u)
  assert.match(app, /setRecordEditor\(\{ scene: 'pickup', record: null \}\)/u)
  assert.match(app, /setRecordEditor\(\{ scene: 'pickup', record \}\)/u)
  assert.match(app, /onJump=\{jumpFromOverview\}/u)
})

test('mobile geometry, responsive widths, fixed safe-area navigation and reduced motion are explicit', async () => {
  const css = await read('apps/web/src/styles/mobile-overview.css')
  for (const rule of [
    /max-width: 519px/u,
    /height: 48px/u,
    /height: 50px/u,
    /height: 152px/u,
    /height: 196px/u,
    /height: 124px/u,
    /height: 105px/u,
    /min-height: 23px/u,
    /repeat\(6, minmax\(0,1fr\)\)/u,
    /env\(safe-area-inset-bottom\)/u,
    /max-width: 374px/u,
    /min-width: 400px/u,
    /prefers-reduced-motion: reduce/u,
    /forced-colors: active/u
  ]) assert.match(css, rule)
  assert.doesNotMatch(css, /overflow-x:\s*auto/u)
})

test('sales blueprint and condensed fonts are local, documented, and brand-neutral', async () => {
  const [overview, svg, imageSources, fontSources] = await Promise.all([
    read('apps/web/src/components/overview/WorkshopOverviewPage.jsx'),
    read('apps/web/public/images/ops/bicycle-workshop-blueprint.svg'),
    read('apps/web/public/images/ops/SOURCES.md'),
    read('apps/web/public/fonts/SOURCES.md')
  ])
  assert.match(overview, /\/images\/ops\/bicycle-workshop-blueprint\.svg/u)
  assert.match(svg, /Generic workshop bicycle engineering line drawing/u)
  assert.doesNotMatch(svg, /decathlon|endfield|hypergryph|brand|logo/ui)
  assert.match(imageSources, /original project artwork/u)
  assert.match(fontSources, /SIL Open Font License 1\.1/u)
  assert.match(fontSources, /self-hosted/u)
})

test('bottom navigation remains six operational destinations without a separate open/closed column', async () => {
  const [dock, scenes] = await Promise.all([
    read('apps/web/src/components/lookbook/ActionDock.jsx'),
    read('apps/web/src/data/lookbookScenes.js')
  ])
  assert.match(dock, /OVERVIEW/u)
  assert.match(dock, /PENDING/u)
  assert.match(dock, /dock-status/u)
  const css = await read('apps/web/src/styles/mobile-overview.css')
  assert.match(css, /\.look-dock \.dock-status \{ display: none !important; \}/u)
  assert.match(scenes, /LOOK_TOTAL = 6/u)
})
