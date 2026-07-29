import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const ledger = readFileSync(new URL('../apps/web/src/components/lookbook/RecordLedger.jsx', import.meta.url), 'utf8')
const app = readFileSync(new URL('../apps/web/src/App.jsx', import.meta.url), 'utf8')
const motion = readFileSync(new URL('../apps/web/src/hooks/useMotionSystem.js', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../apps/web/src/styles/workshop-system.css', import.meta.url), 'utf8')

test('可删除台账仅在未完成且未锁定时采用左滑删除容器，卡片内不保留删除按钮', () => {
  assert.match(ledger, /const deletable = !resolved && !closedAt/)
  assert.match(ledger, /<SwipeDeleteRecord key=\{record\.id\}/)
  assert.doesNotMatch(ledger, /className="record-delete"/)
  assert.match(ledger, /左滑记录，点按删除/)
})

test('左滑仅在确认横向意图后接管，纵向移动继续交给原生滚动', () => {
  assert.match(ledger, /Math\.abs\(deltaY\) >= Math\.abs\(deltaX\)/)
  assert.match(ledger, /gesture\.axis = 'vertical'/)
  assert.match(ledger, /gesture\.axis = 'horizontal'/)
  assert.match(ledger, /setPointerCapture/)
  assert.match(ledger, /event\.key === 'ArrowLeft'/)
  assert.match(ledger, /actionRef\.current\?\.focus/)
  assert.match(styles, /touch-action: pan-y/)
  assert.match(styles, /--swipe-offset/)
})

test('删除无二次确认，成功走电子退场，失败恢复原卡片与删除面', () => {
  assert.doesNotMatch(app, /window\.confirm/)
  assert.match(ledger, /await playDeleteExit\(\)/)
  assert.match(ledger, /onRemove\(record\)/)
  assert.doesNotMatch(ledger, /disabled=\{!open/)
  assert.match(ledger, /restoreAfterFailure\(\)/)
  assert.match(ledger, /--swipe-glitch/)
})

test('左滑表面与空间系统分层，避免与卡片倾斜和批量滚动 reveal 争抢 transform', () => {
  assert.match(ledger, /className="record-swipe-surface"/)
  assert.match(styles, /Gesture separation and confirmed completion feedback remain functional/)
  assert.doesNotMatch(motion, /data-swipe-delete/)
  assert.doesNotMatch(motion, /rotationX|rotationY|perspective/)
})


test('所有主操作与编辑操作在同一行，编辑始终位于左侧、主操作位于右侧', () => {
  assert.match(ledger, /const primaryAction =/)
  assert.match(ledger, /className="record-edit-action"/)
  assert.match(ledger, /\{primaryAction\}/)
  assert.match(styles, /\.record-actions \.record-edit-action \{ order: 0; \}/)
  assert.match(styles, /\.record-actions \.record-primary-action \{\s+order: 1;/)
  assert.match(ledger, /data-has-primary=\{primaryAction \? 'true' : undefined\}/)
  assert.match(styles, /\.record-actions\[data-has-primary='true'\] \.record-primary-action \{ flex: 1 1 calc\(50% - 4px\) !important; \}/)
})

const workflow = readFileSync(new URL('../apps/web/src/hooks/useRemoteClosingWorkflow.js', import.meta.url), 'utf8')

test('确认取车独享像素填黑，延迟落入既有黑色保留卡；其它完成操作不改', () => {
  assert.match(ledger, /function PickupPixelFill/)
  assert.match(ledger, /data-pickup-pixel-filling/)
  assert.match(ledger, /record\.scene === 'pickup' && !pickedUp/)
  assert.match(ledger, /pickupPixelFillId === record\.id/)
  assert.match(ledger, /const deletable = !resolved && !closedAt/)
  assert.match(ledger, /disabled=\{Boolean\(closedAt\) \|\| primaryProcessing\}/)
  assert.match(app, /completePickupWithPixelFill/)
  assert.match(app, /primaryProcessingRef\.current/)
  assert.match(app, /workflow\.completePickup\(record\.id, pickupCode, \{ apply: false, sync: 'none' \}\)/)
  assert.match(app, /workflow\.commitDeferredResult\(pending\.result\)/)
  assert.match(workflow, /commitDeferredResult/)
  assert.match(styles, /V5\.6\.6 pickup completion/)
  assert.match(styles, /--pickup-pixel-size/)
})
