import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const app = await readFile(new URL('../apps/web/src/App.jsx', import.meta.url), 'utf8')
const css = await readFile(new URL('../apps/web/src/styles/desktop-workbench.css', import.meta.url), 'utf8')
const scenes = await readFile(new URL('../apps/web/src/data/lookbookScenes.js', import.meta.url), 'utf8')
const dock = await readFile(new URL('../apps/web/src/components/lookbook/ActionDock.jsx', import.meta.url), 'utf8')
const overview = await readFile(new URL('../apps/web/src/components/overview/WorkshopOverviewPage.jsx', import.meta.url), 'utf8')
const ledger = await readFile(new URL('../apps/web/src/components/pickup/PickupLedger.jsx', import.meta.url), 'utf8')

test('desktop and tablet reflow at native CSS pixels with fixed chrome and independent business scrolling', () => {
  assert.match(css, /@media \(min-width: 768px\)/u)
  assert.doesNotMatch(css, /zoom\s*:/u)
  assert.doesNotMatch(app, /desktop-workbench-fit/u)
  assert.match(css, /--ops-desktop-rail-width: 84px/u)
  assert.match(css, /@media \(min-width: 1024px\)[\s\S]*?--ops-desktop-rail-width: 262px/u)
  assert.match(css, /position: fixed;[\s\S]*?inset: 156px 0 0 var\(--ops-desktop-rail-width\)/u)
  assert.match(css, /overflow-y: auto/u)
  assert.match(app, /data-desktop-scene=\{desktopScene\}/u)
  assert.match(app, /min-width: 768px/u)
})
test('reference navigation retains all six destinations and the lower release card', () => {
  assert.match(scenes, /id: 'resale'/u)
  assert.match(scenes, /LOOK_TOTAL = 6/u)
  assert.match(app, /ResaleScene/u)
  assert.match(app, /sceneId="resale"/u)
  assert.match(dock, /dock-release-card/u)
  assert.match(dock, /currentRelease/u)
  assert.match(overview, /id: 'resale'/u)
})

test('five target pages expose reference geometry without replacing live components', () => {
  assert.match(css, /grid-template-columns: minmax\(0, \.94fr\) minmax\(0, 1fr\)/u)
  assert.match(css, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/u)
  assert.match(css, /grid-template-columns: 312px minmax\(0, 1fr\)/u)
  assert.match(css, /data-desktop-scene='poster'/u)
  assert.match(css, /min-height: 542px/u)
  assert.match(ledger, /pickup-ledger-table-head/u)
  assert.match(ledger, /data-ledger-mode=\{ledgerMode\}/u)
})
