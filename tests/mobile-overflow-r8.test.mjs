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

test('ordinary phone suppresses desktop-reference leak sources', () => {
  assert.match(systemCss, /\.pickup-ledger-table-head,\n\.dock-release-card \{ display: none; \}/u)
  assert.match(pickup, /className="pickup-ledger-table-head"/u)
  assert.match(dock, /className="dock-release-card"/u)
  // 销售场景已换血为 BI，旧参考 intro 不再渲染（无泄漏源）
  assert.doesNotMatch(sales, /sales-reference-intro/u)
  assert.doesNotMatch(sales, /sales-input-summary/u)
})

test('accepted desktop reference structures are restored only inside its breakpoint', () => {
  assert.match(desktopCss, /@media \(min-width: 768px\)/u)
  assert.match(desktopCss, /\.dock-release-card \{[\s\S]*?display: block;/u)
  assert.match(desktopCss, /\.pickup-ledger-table-head \{ display: grid;/u)
  assert.match(desktopCss, /\.closing-look \.sales-bi-slot \{[^}]*min-height: 542px/u)
})

test('mobile sales shows BI module (single column) instead of the old 4-col KPI grid', () => {
  assert.match(sales, /sales-bi-slot/u)
  assert.match(sales, /BiSalesMobile/u)
  assert.match(sales, /useViewportKind/u)
  assert.doesNotMatch(desktopCss, /\.closing-look \.sales-bi-slot[^}]*grid-template-columns:\s*repeat\(4/u)
})

test('desktop shell and scoped right-region transition remain frozen', () => {
  assert.match(desktopCss, /\.workshop-runtime \{[\s\S]*?width: 1536px;[\s\S]*?zoom: calc\(100vw \/ 1536px\);/u)
  // 2026-08-28 黄色 wipe 已移除，模块转场改为退场 + zoom-in 入场
  assert.ok(!desktopCss.includes('.desktop-scene-transition-viewport'))
  assert.ok(!desktopCss.includes('.desktop-scene-transition-wipe'))
  assert.match(desktopCss, /\.look-dock \{[\s\S]*?left: 20px !important;[\s\S]*?top: 168px !important;/u)
})
