import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync(new URL('../apps/web/src/App.jsx', import.meta.url), 'utf8')
const ledger = readFileSync(new URL('../apps/web/src/components/lookbook/RecordLedger.jsx', import.meta.url), 'utf8')
const workflow = readFileSync(new URL('../apps/web/src/hooks/useRemoteClosingWorkflow.js', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../apps/web/src/styles/refinement.css', import.meta.url), 'utf8')

test('维修完毕只在服务端成功后启动白色像素向左消散', () => {
  assert.match(app, /workflow\.completeRepair\(record\.id, \{ apply: false, sync: 'none' \}\)/)
  assert.match(app, /if \(!result\.ok\) \{\s+clearPrimaryConfirmation\(record\.id\)/)
  assert.match(app, /setRepairPixelDissolveId\(record\.id\)/)
  assert.match(app, /deferredRepairResultRef\.current = \{ id: record\.id, result, title: record\.title \}/)
  assert.match(app, /workflow\.commitDeferredResult\(pending\.result\)/)
  assert.match(app, /setRepairPixelDissolveId\(''\)/)
})

test('维修消散以完整白色像素格向左离场，且 reduced motion 直接提交最终状态', () => {
  assert.match(ledger, /function RepairPixelDissolve/)
  assert.match(ledger, /data-repair-pixel/)
  assert.match(ledger, /x: \(index\) => -\(32/)
  assert.match(ledger, /stagger: \{ grid: \[grid\.rows, grid\.columns\], from: 'end', amount: \.78 \}/)
  assert.match(ledger, /data-repair-pixel-dissolving/)
  assert.match(ledger, /onRepairPixelDissolveComplete/)
  assert.match(styles, /V5\.6\.8 repair completion/)
  assert.match(styles, /background: #fff/)
  assert.match(styles, /record-row\[data-repair-pixel-dissolving='true'\]/)
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\) \{\s+\.repair-pixel-dissolve/)
})

test('远端维修完成支持延迟提交，使消散期间不产生乐观完成态', () => {
  assert.match(workflow, /completeRepair: \(id, options = \{\}\) =>/)
  assert.match(workflow, /const apply = options\.apply \?\? true/)
  assert.match(workflow, /if \(apply\) applyServerResult\(\{ record: completion\.record \}\)/)
  assert.match(workflow, /\}, \{ sync, apply \}\)/)
})
