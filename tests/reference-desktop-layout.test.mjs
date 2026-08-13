import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const app = await readFile(new URL('../apps/web/src/App.jsx', import.meta.url), 'utf8')
const css = await readFile(new URL('../apps/web/src/styles/desktop-workbench.css', import.meta.url), 'utf8')
const scenes = await readFile(new URL('../apps/web/src/data/lookbookScenes.js', import.meta.url), 'utf8')
const dock = await readFile(new URL('../apps/web/src/components/lookbook/ActionDock.jsx', import.meta.url), 'utf8')
const overview = await readFile(new URL('../apps/web/src/components/overview/WorkshopOverviewPage.jsx', import.meta.url), 'utf8')
const ledger = await readFile(new URL('../apps/web/src/components/pickup/PickupLedger.jsx', import.meta.url), 'utf8')

test('1536x1024 board scales as a single physical-pixel canvas on desktop-mode tablets', () => {
  assert.match(css, /@media \(min-width: 768px\)/u)
  assert.match(css, /width: 1536px/u)
  assert.match(css, /min-height: 1024px/u)
  assert.match(css, /zoom: calc\(100vw \/ 1536px\)/u)
  assert.match(css, /grid-template-columns: 84px 230px minmax\(0, 1fr\)/u)
  assert.match(css, /margin-left: 262px/u)
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

test('short desktop viewports keep the release announcement in a scrollable navigation flow', () => {
  assert.match(dock, /className="dock-scroll-region"/u)
  assert.match(dock, /firstButton\.getBoundingClientRect\(\)\.height \/ 72/u)
  assert.match(dock, /releaseBottom = dockTop \+ \(764 \+ 116\) \* scale/u)
  assert.match(dock, /dock\.dataset\.shortViewport = releaseBottom > viewportBottom - 12/u)
  assert.match(css, /\.look-dock\[data-short-viewport='true'\] \.dock-scroll-region \{[\s\S]*?grid-template-rows: minmax\(0, 1fr\) auto;[\s\S]*?height: var\(--dock-available-height, 880px\);[\s\S]*?overflow: hidden;/u)
  assert.match(css, /\.look-dock\[data-short-viewport='true'\] \.dock-scroll-region > ul \{[\s\S]*?overflow-y: auto;/u)
  assert.match(css, /\.look-dock\[data-short-viewport='true'\] \.dock-release-card \{[\s\S]*?position: relative;[\s\S]*?top: auto;[\s\S]*?left: auto;/u)
  assert.match(css, /\.look-dock\[data-short-viewport='true'\] \.dock-release-details \{[\s\S]*?position: static;[\s\S]*?max-height: min\(310px, calc\(var\(--dock-available-height, 880px\) - 160px\)\);[\s\S]*?overflow-y: auto;/u)
  assert.match(css, /\.dock-release-card \{[\s\S]*?position: absolute;[\s\S]*?top: 764px;/u)
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
