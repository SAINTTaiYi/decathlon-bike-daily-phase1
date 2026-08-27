import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const css = await readFile(new URL('../apps/web/src/styles/desktop-workbench.css', import.meta.url), 'utf8')
const indexCss = await readFile(new URL('../apps/web/src/styles/index.css', import.meta.url), 'utf8')
const ledger = await readFile(new URL('../apps/web/src/components/pickup/PickupLedger.jsx', import.meta.url), 'utf8')

test('reference workbench uses its fixed rail and full-width operational ledger instead of peer-stretching cards', () => {
  assert.match(indexCss, /@import '\.\/desktop-workbench\.css';/u)
  assert.match(css, /\.look-dock \{[\s\S]*?left: 20px !important;/u)
  assert.match(css, /\.pickup-ledger-board \{[\s\S]*?margin-top: 16px;/u)
  assert.match(css, /\.pickup-card-grid \{ grid-template-columns: minmax\(0, 1fr\); gap: 7px;/u)
  // 2026-08-28：卡片入场转 GSAP 后 CSS 不再持有初始隐藏态，此处仅保留桌面布局约束
  assert.match(css, /\.pickup-card-frame \{ min-height: auto; overflow: visible; \}/u)
})

test('desktop handover details retain one independent content row without overlapping pickup positions', () => {
  assert.match(ledger, /data-card-mode=\{handoverMode \? 'handover' : repairMode \? 'repair' : 'pickup'\}/u)
  assert.match(ledger, /const ledgerMode = handoverMode \? 'handover' : repairMode \? 'repair' : 'pickup'/u)
  assert.match(css, /pickup-ledger-board\[data-ledger-mode='handover'\] \.pickup-card-summary/u)
  assert.match(css, /pickup-ledger-board\[data-ledger-mode='handover'\] \.pickup-ledger-table-head \{ grid-template-columns: 96px minmax\(0, 1fr\) 240px 180px 42px;/u)
  assert.match(css, /pickup-ledger-board\[data-ledger-mode='handover'\] \.pickup-card-summary \{ grid-template-columns: 96px minmax\(0, 1fr\) 240px 180px; grid-template-areas: 'index core scan status';/u)
  assert.match(ledger, /\['队列号', '交接事项', '联系电话', '状态', '操作'\]/u)
  assert.match(css, /pickup-card-detail > \.pickup-detail-wide:not\(\.pickup-notification-control\) \{ grid-column: 1 \/ -1; grid-row: auto;/u)
})

test('desktop handover shares the compact pickup and repair control geometry', () => {
  assert.match(css, /\.pickup-queue-summary \{ min-height: 72px;/u)
  assert.match(css, /\.pickup-tool-row \{[\s\S]*?min-height: 72px;/u)
  assert.match(css, /\.pickup-tool-row \.pickup-search-field \{ min-height: 60px;/u)
  assert.match(css, /\.pickup-tool-row > button \{ height: 60px;/u)
  assert.doesNotMatch(css, /data-desktop-scene='poster'\] \.pickup-queue-controls/u)
  assert.doesNotMatch(css, /data-desktop-scene='poster'\] :is\(\.pickup-queue-summary, \.pickup-tool-row\)/u)
  assert.doesNotMatch(css, /data-desktop-scene='poster'\] \.pickup-tool-row (?:\.pickup-search-field|> button)/u)
})
