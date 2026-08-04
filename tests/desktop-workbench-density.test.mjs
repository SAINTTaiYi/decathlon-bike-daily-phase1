import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const css = await readFile(new URL('../apps/web/src/styles/desktop-workbench.css', import.meta.url), 'utf8')
const indexCss = await readFile(new URL('../apps/web/src/styles/index.css', import.meta.url), 'utf8')
const ledger = await readFile(new URL('../apps/web/src/components/pickup/PickupLedger.jsx', import.meta.url), 'utf8')

test('desktop workbench uses available width without stretching peer cards', () => {
  assert.match(indexCss, /@import '\.\/desktop-workbench\.css';/u)
  assert.match(css, /@media \(min-width: 840px\)[\s\S]*?\.pickup-card-grid \{[\s\S]*?grid-template-columns: repeat\(3/u)
  assert.match(css, /\.pickup-card-grid \{[\s\S]*?grid-auto-rows: auto;[\s\S]*?align-items: start;/u)
  assert.match(css, /\.pickup-card-frame:not\(\[data-expanded='true'\]\) \.pickup-card \{ height: auto;/u)
  assert.match(css, /@media \(min-width: 1280px\)[\s\S]*?grid-template-columns: repeat\(4/u)
})

test('desktop handover details receive independent rows instead of overlapping', () => {
  assert.match(ledger, /data-card-mode=\{handoverMode \? 'handover' : repairMode \? 'repair' : 'pickup'\}/u)
  assert.match(css, /\.pickup-card\[data-card-mode='handover'\] \.pickup-card-detail \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);/u)
  assert.match(css, /\.pickup-card\[data-card-mode='handover'\] \.pickup-card-detail > \.pickup-detail-wide \{[\s\S]*?grid-row: auto;/u)
  assert.match(css, /\.pickup-card\[data-card-mode='handover'\] \.pickup-card-detail > section:nth-child\(2\) \{[\s\S]*?display: block;/u)
})
