import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const ledger = readFileSync(new URL('../apps/web/src/components/lookbook/RecordLedger.jsx', import.meta.url), 'utf8')
const app = readFileSync(new URL('../apps/web/src/App.jsx', import.meta.url), 'utf8')
const motion = readFileSync(new URL('../apps/web/src/hooks/useMotionSystem.js', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../apps/web/src/styles/refinement.css', import.meta.url), 'utf8')

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
  assert.match(ledger, /restoreAfterFailure\(\)/)
  assert.match(ledger, /--swipe-glitch/)
})

test('左滑表面与空间系统分层，避免与卡片倾斜和批量滚动 reveal 争抢 transform', () => {
  assert.match(ledger, /className="record-swipe-surface"/)
  assert.match(styles, /only its nested surface moves horizontally/)
  assert.match(motion, /\[data-swipe-delete\]/)
})
