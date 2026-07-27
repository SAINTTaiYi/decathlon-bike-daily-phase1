import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('所有登录用户都可请求闭店，但重新打开仍由经理或管理员保护', async () => {
  const [app, closing] = await Promise.all([
    read('apps/web/src/App.jsx'),
    read('apps/worker/src/routes/closing.ts')
  ])
  assert.doesNotMatch(app, /canManageClosing/u)
  assert.match(app, /const canReopenClosing = role === 'manager' \|\| role === 'admin'/u)
  assert.match(app, /onClick=\{requestClose\} disabled=\{writeLocked\}/u)
  assert.match(closing, /app\.post\('\/api\/v1\/daily-closing\/current\/close', \.\.\.write, async/u)
  assert.match(closing, /current\/reopen', \.\.\.write, auth\.requireRole\('manager', 'admin'\)/u)
})

test('添加车辆对话框和固定底栏会使用动态可视视口避开浏览器底栏', async () => {
  const [app, hook, dialog, refinement] = await Promise.all([
    read('apps/web/src/App.jsx'),
    read('apps/web/src/hooks/useVisualViewportMetrics.js'),
    read('apps/web/src/components/dialogs/AppDialog.jsx'),
    read('apps/web/src/styles/refinement.css')
  ])
  assert.match(app, /useVisualViewportMetrics/u)
  assert.match(hook, /window\.visualViewport/u)
  assert.match(dialog, /data-dialog-panel/u)
  assert.match(refinement, /--visual-viewport-top/u)
  assert.match(refinement, /--visual-viewport-bottom/u)
  assert.match(refinement, /touch-action: pan-y/u)
  assert.match(refinement, /overscroll-behavior: contain/u)
  assert.match(refinement, /inset:[\s\S]*var\(--visual-viewport-top\)[\s\S]*env\(safe-area-inset-right\)[\s\S]*var\(--visual-viewport-bottom\)[\s\S]*env\(safe-area-inset-left\)/u)
  assert.match(refinement, /bottom: calc\(max\(\.6rem, env\(safe-area-inset-bottom\)\) \+ var\(--visual-viewport-bottom\)\)/u)
  assert.match(refinement, /padding-bottom: calc\(var\(--dock-space\) \+ var\(--visual-viewport-bottom\)\)/u)
})

test('维修完成写入主记录和维修详情的精确完成状态，完成后编辑不再使用 D1 兼容绕路', async () => {
  const [worker, repair] = await Promise.all([
    read('apps/worker/src/routes/work-items.ts'),
    read('apps/web/src/data/repairRecord.js')
  ])
  assert.match(worker, /UPDATE work_items SET kind = 'pickup', status = \?/u)
  assert.match(worker, /UPDATE repair_details SET repair_status = \?, repair_completed_at = \?/u)
  assert.match(worker, /validateRepairStatusContext\(fields\.status, completedRepairPickup\)/u)
  assert.doesNotMatch(worker, /persistedRepairStatus/u)
  assert.match(repair, /'已开付款单': '维修完成-已开付款单'/u)
  assert.match(repair, /'快速服务免费': '维修完成-快速服务免费'/u)
})
