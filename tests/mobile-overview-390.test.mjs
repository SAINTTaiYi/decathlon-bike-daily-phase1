import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')
const hash = async (path) => createHash('sha256').update(await readFile(new URL(path, root))).digest('hex')

test('static poster maps visible metrics to workflow data and no fabricated values', async () => {
  const [app, overview] = await Promise.all([read('apps/web/src/App.jsx'), read('apps/web/src/components/overview/WorkshopOverviewPage.jsx')])
  for (const field of ['dateKey', 'kpi', 'recordsByScene', 'closedAt', 'storageError']) assert.match(overview, new RegExp('workflow\\.' + field, 'u'))
  assert.match(overview, /workflow\.hydrated && workflow\.hasSnapshot/u)
  assert.match(overview, /return '—'/u)
  assert.match(overview, /recordsForOverview\(workflow\.recordsByScene\)/u)
  assert.match(overview, /overviewRecords\.filter\(isCompletedRecord\)\.length/u)
  assert.doesNotMatch(overview, /CHUI3|粤A12345|张三|李四|王五/u)
  assert.match(app, /workflow=\{workflow\}/u)
})

test('menu log KPI closing reporting and navigation handlers remain wired', async () => {
  const [app, overview, header] = await Promise.all([read('apps/web/src/App.jsx'), read('apps/web/src/components/overview/WorkshopOverviewPage.jsx'), read('apps/web/src/components/workshop/WorkshopShellHeader.jsx')])
  for (const handler of [/onMenu=\{\(\) => setMenuOpen\(true\)\}/u,/onLog=\{\(\) => setLogOpen\(true\)\}/u,/onEditKpi=\{\(\) => setKpiOpen\(true\)\}/u,/onCompleteClosing=\{requestClose\}/u,/onRefresh=\{\(\) => void workflow\.refresh\(\)\}/u,/onReopenClosing=\{\(\) => void reopen\(\)\}/u,/onExportReport=\{exportClosingReport\}/u,/onJump=\{jumpFromOverview\}/u]) assert.match(app, handler)
  for (const prop of ['onEditKpi','onCompleteClosing','onHistory','onRefresh','onReopenClosing','onExportReport','onJump']) assert.match(overview, new RegExp(prop, 'u'))
  assert.match(header, /scene\.id === 'pulse'/u)
  assert.match(header, /onClick=\{onMenu\}/u)
  assert.match(header, /onClick=\{onLog\}/u)
})

test('overview is one industrial poster composition rather than five page sections', async () => {
  const [overview, css] = await Promise.all([read('apps/web/src/components/overview/WorkshopOverviewPage.jsx'), read('apps/web/src/styles/mobile-overview.css')])
  for (const name of ['workshop-poster','poster-opening','poster-title-block','poster-ore','poster-plinth','poster-kpi','poster-workzone','poster-overview-card','poster-footer']) { assert.match(overview, new RegExp(name, 'u')); assert.match(css, new RegExp('\\.' + name, 'u')) }
  for (const oldName of ['ops-reference-hero','ops-reference-floor','ops-reference-proof','ops-reference-connection','ops-reference-updates']) assert.doesNotMatch(overview, new RegExp(oldName, 'u'))
  assert.match(overview, /WORKSHOP/u)
  assert.match(overview, /Today KPI/u)
  assert.match(overview, /TODAY'S<br \/>OVERVIEW/u)
})

test('390 poster uses one normalized 852 by 1876 coordinate field and stays static', async () => {
  const [overview, css, system] = await Promise.all([read('apps/web/src/components/overview/WorkshopOverviewPage.jsx'), read('apps/web/src/styles/mobile-overview.css'), read('apps/web/src/styles/workshop-system.css')])
  for (const rule of [/aspect-ratio: 852 \/ 1876/u,/position: absolute; inset: 0/u,/container-type: inline-size/u,/@media \(max-width: 374px\)/u,/@media \(min-width: 600px\)/u,/@media \(min-width: 840px\)/u,/@media \(min-width: 1200px\)/u,/repeat\(6,minmax\(0,1fr\)\)/u,/@media \(prefers-reduced-motion: reduce\)/u,/@media \(forced-colors: active\)/u]) assert.match(css, rule)
  assert.ok(system.includes(".workshop-runtime[data-active-scene='pulse'] .workshop-overview-module { display: block; width: 100%; min-height: 0; margin: 0; padding: 0;"))
  assert.doesNotMatch(css, /min-height:\s*(?:970|285|590|180)px|overflow-x:\s*auto|font-size:\s*clamp|font-size:[^;]*(?:vw|dvw)|letter-spacing:\s*-/u)
  assert.doesNotMatch(css, /gradient|@keyframes|animation\s*:|transition\s*:|transform\s*:/u)
  assert.doesNotMatch(overview, /requestAnimationFrame|addEventListener|behavior:\s*'smooth'|poster-operation-links/u)
  assert.match(overview, /viewBox="0 0 852 1876"/u)
  assert.match(overview, /behavior: 'auto'/u)
})

test('static Overview is isolated from every global motion runtime', async () => {
  const [app, canvas, motion, workspace, system] = await Promise.all([
    read('apps/web/src/App.jsx'),
    read('apps/web/src/hooks/useContinuousCanvas.js'),
    read('apps/web/src/hooks/useMotionSystem.js'),
    read('apps/web/src/hooks/useWorkspaceMotion.js'),
    read('apps/web/src/styles/workshop-system.css')
  ])
  assert.ok(app.includes('data-active-scene={activeScene}'))
  assert.ok(app.includes('staticMode: staticOverviewLaunch'))
  assert.ok(canvas.includes("isStaticOverview = section.dataset.sceneId === 'pulse'"))
  assert.ok(canvas.includes('? { x: 0, y: 0, scale: 1, opacity: 1, progress }'))
  assert.ok(canvas.includes("staticBoundary = activeRef.current === 'pulse' || targetId === 'pulse'"))
  assert.ok(motion.includes("pressed.closest('.workshop-overview-module')"))
  assert.ok(workspace.includes('if (staticMode)'))
  assert.ok(system.includes(".workshop-runtime[data-active-scene='pulse'] .workshop-continuous-canvas"))
  assert.ok(system.includes(".workshop-runtime:has(.workshop-overview-module[data-module-inview='true']) .workshop-continuous-canvas"))
  const staticBlock = system.slice(system.indexOf('.workshop-overview-module {'), system.indexOf('.workshop-continuous-module +'))
  for (const declaration of ['animation: none !important;', 'transform: none !important;', 'transition: none !important;', 'will-change: auto !important;']) assert.ok(staticBlock.includes(declaration))
})

test('poster colors, type and geometry follow the design system', async () => {
  const [css, tokens, system] = await Promise.all([read('apps/web/src/styles/mobile-overview.css'),read('apps/web/src/styles/tokens.css'),read('apps/web/src/styles/workshop-system.css')])
  for (const rule of [/--ops-page: #f7f5ef/u,/--ops-card: #fffdf8/u,/--ops-black: #0c0e0c/u,/--ops-orange: #ff6a00/u,/--ops-yellow: #ffc31a/u,/clip-path: polygon/u,/--ops-radius: 8px/u]) assert.match(css + system, rule)
  assert.match(css, /--ops-display: 'Barlow Condensed Ops', 'Noto Sans SC Variable'/u)
  assert.match(css, /--ops-body: 'Noto Sans SC Variable'/u)
  assert.doesNotMatch(css, /linear-gradient|radial-gradient|conic-gradient/u)
  assert.doesNotMatch([css,tokens,system].join('\n'), /Albert/iu)
})

test('self-hosted imagery is licensed and integrity pinned', async () => {
  const [overview, sources] = await Promise.all([read('apps/web/src/components/overview/WorkshopOverviewPage.jsx'), read('apps/web/public/images/ops/SOURCES.md')])
  for (const asset of ['obsidian-orange-cut-900.webp','mechanic-workbench-960.webp','mechanic-workbench-1600.webp']) { assert.match(overview, new RegExp(asset.replace('.', '\\.'), 'u')); assert.match(sources, new RegExp(asset.replace('.', '\\.'), 'u')) }
  assert.match(sources, /Wikimedia Commons/u); assert.match(sources, /Public domain/u); assert.match(sources, /CC0 1\.0/u); assert.match(sources, /transparent background/u)
  assert.equal(await hash('apps/web/public/images/ops/reference-home/obsidian-orange-cut-900.webp'), '306c82097e6b912d2cc4da5a907a4d052ca330d532ed44ce3c546229f522e258')
  assert.equal(await hash('apps/web/public/images/ops/reference-home/mechanic-workbench-960.webp'), '904828cb3488107082bf2356fe8692771b6a89a9dfe2cc9e4b17ab7c30f064f4')
  assert.equal(await hash('apps/web/public/images/ops/reference-home/mechanic-workbench-1600.webp'), '6c746d85ba41f7ac4e011cfbbcfb3b68969835ea27bfbdc7131347c53abef235')
})

test('release disclosure and six-item dock remain accessible above safe area', async () => {
  const [overview, dock, scenes, css] = await Promise.all([read('apps/web/src/components/overview/WorkshopOverviewPage.jsx'),read('apps/web/src/components/lookbook/ActionDock.jsx'),read('apps/web/src/data/lookbookScenes.js'),read('apps/web/src/styles/mobile-overview.css')])
  assert.match(overview, /onToggle=\{revealReleaseAboveDock\}/u); assert.match(overview, /querySelector\('\.look-dock'\)/u); assert.match(overview, /window\.scrollBy/u)
  assert.match(dock, /OVERVIEW/u); assert.match(scenes, /LOOK_TOTAL = 6/u); assert.match(css, /\.look-dock \.dock-status \{ display: none !important; \}/u); assert.match(css, /min-height: 44px/u)
})
