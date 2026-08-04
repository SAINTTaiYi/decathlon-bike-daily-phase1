import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const [systemCss, desktopCss, pickup, dock, sales] = await Promise.all([
  read('apps/web/src/styles/workshop-system.css'),
  read('apps/web/src/styles/desktop-workbench.css'),
  read('apps/web/src/components/pickup/PickupLedger.jsx'),
  read('apps/web/src/components/lookbook/ActionDock.jsx'),
  read('apps/web/src/scenes/SalesScene.jsx')
])

test('ordinary phone suppresses all three desktop-reference leak sources', () => {
  assert.match(systemCss, /\.pickup-ledger-table-head,\n\.dock-release-card \{ display: none; \}/u)
  assert.match(systemCss, /\.sales-input-summary > \.sales-reference-intro \{ display: none; \}/u)
  assert.match(pickup, /className="pickup-ledger-table-head"/u)
  assert.match(dock, /className="dock-release-card"/u)
  assert.match(sales, /className="sales-reference-intro"/u)
})

test('accepted desktop reference structures are restored only inside its breakpoint', () => {
  assert.match(desktopCss, /@media \(min-width: 768px\)/u)
  assert.match(desktopCss, /\.dock-release-card \{[\s\S]*?display: block;/u)
  assert.match(desktopCss, /\.pickup-ledger-table-head \{ display: grid;/u)
  assert.match(desktopCss, /\.sales-input-summary > \.sales-reference-intro \{ grid-column: 1 \/ -1; display: grid;/u)
})

test('mobile sales keeps the established compact KPI summary beneath the hidden reference intro', () => {
  assert.match(sales, /<div className="sales-input-summary"/u)
  assert.match(sales, /SALES · 销售车辆/u)
  assert.match(sales, /SAFETY · 安全检查/u)
  assert.match(sales, /USED SOLD · 二手售出/u)
  assert.match(sales, /USED IN · 收二手车/u)
  assert.doesNotMatch(systemCss, /@media \(max-width: 767px\)[\s\S]*?sales-input-summary[^}]*grid-template-columns:\s*repeat\(4/u)
})

test('desktop shell and scoped right-region transition remain frozen', () => {
  assert.match(desktopCss, /\.workshop-runtime \{[\s\S]*?width: 1536px;[\s\S]*?zoom: calc\(100vw \/ 1536px\);/u)
  assert.match(desktopCss, /\.desktop-scene-transition-viewport \{\n    position: fixed;\n    inset: 90px 0 0 262px;/u)
  assert.match(desktopCss, /\.look-dock \{[\s\S]*?left: 20px !important;[\s\S]*?top: 112px !important;/u)
})
