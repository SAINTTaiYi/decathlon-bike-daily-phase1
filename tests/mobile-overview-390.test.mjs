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

test('frosted overview: ambient wash stays visible and overview cards are translucent, not opaque', async () => {
  const [mobileCss, desktopCss, tokensCss, frostedCss] = await Promise.all([
    read('apps/web/src/styles/mobile-overview.css'),
    read('apps/web/src/styles/desktop-workbench.css'),
    read('apps/web/src/styles/tokens.css'),
    read('apps/web/src/styles/frosted.css'),
  ])

  // The mobile overview used to hide .workspace-environment outright, which
  // made the ambient yellow wash impossible to see through any card. It must
  // stay displayed; the paper-grain layers are the ones that stay off.
  assert.match(mobileCss, /\.workspace-environment\s*\{\s*display:\s*block;\s*\}/u)
  assert.doesNotMatch(mobileCss, /\.workspace-environment,\s*\n\s*\.workspace-depth-plane/u)
  assert.match(mobileCss, /\.workspace-paper-scratches\s*\{\s*display:\s*none;\s*\}/u)

  // Translucent surface tokens must exist and actually be translucent. They
  // now live in tokens.css, not here: while they sat in this file they read as
  // mobile-only and the desktop rule referenced them through a fallback, which
  // is how the whole treatment silently stayed opaque on desktop.
  // The tint is NEUTRAL white driven by --ops-glass-alpha, not the cream
  // rgb(255 253 248) it started as. A warm tint at high opacity paints its own
  // colour over the environment glow instead of letting it through, which is
  // the "forced warm white" the glass pass was supposed to remove. Every knob
  // is a variable so PaletteLab can drive it live.
  const translucent = tokensCss.match(/--ops-card-translucent:\s*([^;]+);/u)
  assert.ok(translucent, '--ops-card-translucent must be defined in tokens.css')
  assert.match(translucent[1], /rgb\(255 255 255 \/ var\(--ops-glass-alpha\)\)/u)
  assert.match(tokensCss, /--ops-card-hairline:\s*rgb\(255 255 255 \/ var\(--ops-glass-hairline-alpha\)\)/u)
  assert.match(tokensCss, /--ops-card-edge:\s*rgb\(120 104 58 \/ var\(--ops-glass-edge-alpha\)\)/u)
  for (const knob of ['--ops-glass-alpha', '--ops-glass-blur', '--ops-glass-saturate', '--ops-glass-edge-alpha', '--ops-glass-hairline-alpha']) {
    assert.strictEqual(
      (tokensCss.match(new RegExp(`${knob}:`, 'gu')) || []).length,
      1,
      `${knob} must be defined exactly once, in tokens.css`,
    )
  }
  assert.doesNotMatch(
    mobileCss,
    /--ops-card-translucent\s*:/u,
    'the glass tokens moved to tokens.css; a copy here is the duplicate that caused the desktop regression',
  )

  // The frosted fill is declared once, in frosted.css, for every card that
  // wants glass — mobile overview cards and desktop panels alike.
  const frostedBlock = frostedCss.match(/\.ops-closing-card,[^{]*\{[^}]+\}/u)
  assert.ok(frostedBlock, 'frosted cards must share one rule in frosted.css')
  assert.match(frostedBlock[0], /background:\s*var\(--ops-card-translucent\)/u)
  assert.match(frostedBlock[0], /inset 0 1px 0 var\(--ops-card-hairline\)/u)
  assert.match(frostedBlock[0], /inset 0 0 0 1px var\(--ops-card-edge\)/u)
  for (const card of ['ops-sales-panel', 'ops-index', 'ops-pickup-board', 'ops-analytics-panel']) {
    assert.match(
      frostedBlock[0],
      new RegExp(`\\.${card}\\b`, 'u'),
      `${card} must be in the shared frosted rule, not carry its own copy`,
    )
  }

  // Desktop no longer paints .ops-analytics-panel itself, and no longer hides
  // a missing token behind a solid fallback.
  const panel = desktopCss.match(/\.ops-analytics-panel \{[^}]+\}/u)
  if (panel) {
    assert.doesNotMatch(
      panel[0],
      /background:\s*var\(--ops-card-translucent, var\(--ops-card\)\)/u,
      'drop the solid fallback: a missing token should show up, not quietly render opaque',
    )
  }

  // Cards now DO blur: a tint alone reads as flat paper, and the blur is what
  // makes the glow behind the card look like it is being refracted rather than
  // just showing through. The CJK-softening concern from the earlier pass is
  // handled by keeping the radius on a live token (--ops-glass-blur) that
  // PaletteLab can drag to 0px, instead of by banning blur outright.
  assert.match(frostedBlock[0], /backdrop-filter:\s*var\(--ops-card-glass-filter\)/u)
  assert.doesNotMatch(frostedBlock[0], /backdrop-filter:\s*blur\(\d/u, 'radius must stay adjustable')
  // Desktop still must not paint its own frost on top of the shared rule.
  if (panel) assert.doesNotMatch(panel[0], /backdrop-filter/u)
})

test('frosted navigation is tinted warm so it carries the ambient yellow instead of cancelling it', async () => {
  const css = await read('apps/web/src/styles/frosted.css')

  // The tint is a token, not 19 copies of a literal.
  const tint = css.match(/--glass-tint:\s*([\d\s]+);/u)
  assert.ok(tint, '--glass-tint must be defined')
  const [r, g, b] = tint[1].trim().split(/\s+/u).map(Number)
  assert.ok(r > b, `glass tint must be warm (r ${r} > b ${b}), a cool tint desaturates the yellow wash`)

  // No declaration may reintroduce the old cool grey.
  assert.doesNotMatch(css, /rgb\(244 245 247 \//u)
  assert.ok(css.match(/rgb\(var\(--glass-tint\) \//gu).length >= 19)

  // The header/dock frost itself must survive: real blur on a ::before
  // backdrop, with a mask so the edge ramps out instead of hard-clipping.
  assert.match(css, /backdrop-filter:\s*blur\(30px\) saturate\(180%\)/u)
  assert.match(css, /-webkit-mask-image:\s*linear-gradient/u)
})
