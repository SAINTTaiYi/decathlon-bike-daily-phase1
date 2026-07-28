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

test('reference geometry is mobile-first and explicitly rearranges for tablet and desktop', async () => {
  const css = await read('apps/web/src/styles/mobile-overview.css')
  for (const rule of [
    /@media \(min-width: 0px\)/u,
    /width: min\(100%, 426px\)/u,
    /max-width: 390px/u,
    /height: 44px/u,
    /height: 154px/u,
    /height: 214px/u,
    /height: 130px/u,
    /height: 120px/u,
    /min-height: 26px/u,
    /repeat\(6, minmax\(0,1fr\)\)/u,
    /env\(safe-area-inset-bottom\)/u,
    /max-width: 374px/u,
    /min-width: 600px/u,
    /min-width: 840px/u,
    /min-width: 1200px/u,
    /repeat\(12,minmax\(0,1fr\)\)/u,
    /prefers-reduced-motion: reduce/u,
    /forced-colors: active/u
  ]) assert.match(css, rule)
  assert.doesNotMatch(css, /overflow-x:\s*auto/u)
})

test('reference hierarchy uses real identity, binary closing status and stable metric sizing', async () => {
  const [overview, css] = await Promise.all([
    read('apps/web/src/components/overview/WorkshopOverviewPage.jsx'),
    read('apps/web/src/styles/mobile-overview.css')
  ])
  assert.match(overview, /ops-store-mark/u)
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



test('operations index uses a condensed Chinese label and concise module subtitles', async () => {
  const [overview, css] = await Promise.all([
    read('apps/web/src/components/overview/WorkshopOverviewPage.jsx'),
    read('apps/web/src/styles/mobile-overview.css')
  ])
  assert.match(overview, /className="ops-index-label-cn">业务台账<\/span>/u)
  assert.match(css, /@font-face \{[\s\S]*?font-family: 'Noto Sans SC Operations';[\s\S]*?noto-sans-sc-operations-index-subset\.ttf/u)
  assert.match(css, /\.ops-index-label-cn \{[^}]*font-family: 'Noto Sans SC Operations', 'Noto Sans SC', sans-serif;[^}]*font-weight: 700;[^}]*transform: scaleX\(\.72\);/u)
  for (const label of ['待取车辆', '其它交接', '维修交接', '二手车台账', '销售数据']) {
    assert.match(overview, new RegExp(`'${label}'`, 'u'))
  }
  const operationsIndex = overview.slice(overview.indexOf('function OperationsIndex'), overview.indexOf('function compactContact'))
  assert.doesNotMatch(operationsIndex, /跨日保留|唯一闭店要求/u)
  assert.match(operationsIndex, /<em>\{cn\}<\/em>/u)
})

test('feedback material removes ledger lines and uses warm surfaces with restrained yellow glow', async () => {
  const css = await read('apps/web/src/styles/mobile-overview.css')
  for (const rule of [
    /--ops-page: #f7f5ef/u,
    /--ops-card: #fffdf8/u,
    /--ops-yellow-glow: rgb\(255 195 26 \/ \.32\)/u,
    /--ops-card-shadow: 0 5px 18px/u,
    /\.ops-store-context \{[\s\S]*?border: 0;[\s\S]*?box-shadow: none;/u,
    /\.ops-closing-main \{[\s\S]*?height: 84px;/u,
    /\.ops-closing-next \{[^}]*height: 68px;/u,
    /text-shadow: 0 0 8px var\(--ops-yellow-glow\)/u,
    /--ops-black-glow: rgb\(12 14 12 \/ \.22\)/u,
    /text-shadow: 0 0 7px var\(--ops-black-glow\)/u,
    /filter: drop-shadow\(0 0 3px var\(--ops-black-glow\)\)/u,
    /box-shadow: 0 0 16px var\(--ops-black-glow\)/u,
    /filter: drop-shadow\(0 0 4px var\(--ops-yellow-glow\)\)/u
  ]) assert.match(css, rule)
  assert.doesNotMatch(css, /border-(?:top|right|bottom): 1px solid #e2e1db/u)
  assert.doesNotMatch(css, /border: 1px solid var\(--ops-border\)/u)
  assert.doesNotMatch(css, /border: 1px solid var\(--ops-border-strong\)/u)
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


test('feedback alignment uses top-anchored content and removes only sales KPI icons', async () => {
  const [overview, css] = await Promise.all([
    read('apps/web/src/components/overview/WorkshopOverviewPage.jsx'),
    read('apps/web/src/styles/mobile-overview.css')
  ])
  assert.doesNotMatch(overview, /item\.glyph/u)
  assert.doesNotMatch(overview, /<i aria-hidden="true">\{item\.glyph\}<\/i>/u)
  assert.match(css, /\.ops-sales-primary > b \{ position: absolute; top: 38px;/u)
  assert.match(css, /\.ops-kpi-grid button > b \{ position: absolute; top: 45px;/u)
  assert.match(css, /\.ops-kpi-grid button > b[^}]*font-size: 29px/u)
  assert.match(css, /\.ops-index button > span \{ position: absolute; top: 19px;/u)
  assert.match(css, /\.ops-index button > b \{ position: absolute; top: 50px;/u)
  assert.match(css, /\.ops-index button > \.ops-arrow \{ position: absolute; top: 55px; right: 7px;/u)
  assert.match(css, /\.ops-pickup-card strong \{ top: 4px;/u)
  assert.match(css, /\.ops-pickup-card em \{ top: 44px;/u)
})
