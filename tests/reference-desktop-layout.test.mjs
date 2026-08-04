import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const app = await readFile(new URL('../apps/web/src/App.jsx', import.meta.url), 'utf8')
const css = await readFile(new URL('../apps/web/src/styles/desktop-workbench.css', import.meta.url), 'utf8')
const scenes = await readFile(new URL('../apps/web/src/data/lookbookScenes.js', import.meta.url), 'utf8')
const overview = await readFile(new URL('../apps/web/src/components/overview/WorkshopOverviewPage.jsx', import.meta.url), 'utf8')
const ledger = await readFile(new URL('../apps/web/src/components/pickup/PickupLedger.jsx', import.meta.url), 'utf8')

test('1536 reference workbench starts at 1024px and gives the desktop a fixed rail plus selected board', () => {
  assert.match(css, /@media \(min-width: 1024px\)/u)
  assert.match(css, /grid-template-columns: 84px 230px minmax\(0, 1fr\)/u)
  assert.match(css, /margin: 0 26px 0 278px/u)
  assert.match(css, /data-desktop-scene='pickup'/u)
  assert.match(app, /data-desktop-scene=\{desktopScene\}/u)
  assert.match(app, /const navigateToScene/u)
})

test('independent Used destination is removed while used-car sales and acquisition KPI fields remain', () => {
  assert.doesNotMatch(scenes, /id: 'resale'/u)
  assert.match(scenes, /LOOK_TOTAL = 6/u)
  assert.match(app, /['\/used', '\/resale']/u)
  assert.match(app, /window.history.replaceState\(\{\}, '', '\/'\)/u)
  assert.match(overview, /usedSold/u)
  assert.match(overview, /usedReceived/u)
})

test('overview and ledger include the supplied desktop reference component geometry', () => {
  assert.match(overview, /OverviewAnalytics/u)
  assert.match(css, /grid-column: span 5/u)
  assert.match(css, /grid-column: span 7/u)
  assert.match(css, /ops-analytics-grid/u)
  assert.match(ledger, /pickup-ledger-table-head/u)
  assert.match(ledger, /data-ledger-mode=\{ledgerMode\}/u)
  assert.match(css, /grid-template-columns: 96px minmax\(310px, 1.5fr\) minmax\(280px, 1fr\) 160px/u)
})
