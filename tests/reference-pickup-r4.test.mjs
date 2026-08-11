import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const css = await readFile(new URL('../apps/web/src/styles/desktop-workbench.css', import.meta.url), 'utf8')
const ledger = await readFile(new URL('../apps/web/src/components/pickup/PickupLedger.jsx', import.meta.url), 'utf8')
const dock = await readFile(new URL('../apps/web/src/components/lookbook/ActionDock.jsx', import.meta.url), 'utf8')

test('pickup target starts without legacy section air and exposes six independent columns', () => {
  assert.ok(css.includes(".workshop-shell[data-desktop-scene='pickup'] .pickup-operations-section { padding-top: 0; border-top: 0; }"))
  assert.ok(ledger.includes("['队列号', '车辆 / 业务类型', '联系方式', '预约时间', '状态', '操作']"))
  assert.ok(css.includes(".pickup-ledger-board[data-ledger-mode='pickup'] .pickup-ledger-table-head { grid-template-columns: 96px 290px 260px 235px minmax(170px, 1fr) 42px; }"))
  assert.ok(css.includes("grid-template-areas: 'index core contact appointment status operation'"))
  assert.ok(ledger.includes('pickup-card-contact'))
  assert.ok(ledger.includes('pickup-card-appointment'))
  assert.ok(ledger.includes('未指定预约时间'))
})

test('pickup waiting statuses retain the muted reference pill while repair-origin statuses stay black', () => {
  assert.ok(css.includes('.pickup-card-status b { padding: 7px 13px; border: 0; background: rgb(12 14 12 / .07); color: var(--ops-text-muted);'))
  assert.ok(css.includes(".pickup-card-status b[data-repair='true'] { background: var(--ops-black); color: var(--ops-text-inverse); }"))
})

test('release announcement is one native interactive card with an upward details panel', () => {
  assert.ok(dock.includes('<details className="dock-release-card">'))
  assert.ok(dock.includes('<summary aria-label={`查看 V${APP_VERSION} 更新公告`}>'))
  assert.ok(dock.includes('dock-release-details'))
  assert.ok(dock.includes('currentRelease.changes.map'))
  assert.ok(css.includes('.dock-release-details { position: absolute; right: -30px; bottom: calc(100% + 8px);'))
  assert.ok(css.includes('.dock-release-card > summary { display: grid; grid-template-columns: auto 1fr auto; gap: 8px; width: 100%; min-height: 114px; padding: 12px; cursor: pointer;'))
})

test('pickup search copy follows the approved reference', () => {
  assert.ok(ledger.includes('搜索车型、电话、车主姓名…'))
})
