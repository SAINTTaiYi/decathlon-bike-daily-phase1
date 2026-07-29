import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync(new URL('../apps/web/src/App.jsx', import.meta.url), 'utf8')
const launch = readFileSync(new URL('../apps/web/src/hooks/useWorkspaceMotion.js', import.meta.url), 'utf8')
const motion = readFileSync(new URL('../apps/web/src/hooks/useMotionSystem.js', import.meta.url), 'utf8')
const flow = readFileSync(new URL('../apps/web/src/hooks/useModuleFlow.js', import.meta.url), 'utf8')
const transition = readFileSync(new URL('../apps/web/src/components/workshop/ModuleFlowTransition.jsx', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../apps/web/src/styles/workshop-system.css', import.meta.url), 'utf8')

function sourceOf(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

test('登录后的工作台入场只在真实登录且首屏数据稳定后启动', () => {
  assert.match(app, /auth\.source === 'login'/)
  assert.match(app, /loginAnimationDone && workflow\.hydrated && !workspaceAssemblyDone/)
  assert.match(app, /auth\.source === 'restore'/)
})

test('工作台入场可跳过并在完成后把焦点交回主内容', () => {
  assert.match(app, /跳过入场动画/)
  assert.match(app, /event\.key === 'Escape'/)
  assert.match(app, /onPointerDown=/)
  assert.match(app, /id="main-content" tabIndex="-1"/)
  assert.match(app, /main-content'\)\?\.focus/)
  assert.match(launch, /reducedMotion\(\)/)
  assert.match(launch, /duration: \.12/)
  assert.doesNotMatch(launch, /perspective|rotationX|blur/u)
})

test('六模块保持挂载但仅暴露当前模块，本地表单和列表状态不会因切换卸载', () => {
  for (const id of ['pulse', 'pickup', 'poster', 'repair', 'resale', 'sales']) {
    assert.match(app, new RegExp(`id="module-${id}"`, 'u'))
  }
  assert.match(app, /hidden=\{activeScene !== 'pickup'\}/u)
  assert.match(app, /inert=\{activeScene !== 'repair'/u)
  assert.match(app, /aria-hidden=\{activeScene !== 'sales'/u)
  assert.doesNotMatch(app, /useActiveScene/u)
})

test('模块边界手势保持内部原生滚动并要求二次确认', () => {
  assert.match(flow, /scrollableAncestorCanMove/u)
  assert.match(flow, /atDocumentBoundary/u)
  assert.match(flow, /WHEEL_THRESHOLD = 72/u)
  assert.match(flow, /TOUCH_THRESHOLD = 64/u)
  assert.match(flow, /boundaryHint\?\.target === targetId/u)
  assert.match(flow, /passive: false/u)
  assert.match(flow, /PageDown/u)
  assert.match(flow, /PageUp/u)
  assert.match(styles, /touch-action: pan-y/u)
})

test('Story Scroll 只影响模块交接并提供 reduced-motion 淡出', () => {
  assert.match(transition, /module-flow-chapter/u)
  assert.match(transition, /yPercent: direction > 0 \? 100 : -100/u)
  assert.match(transition, /module-flow-progress/u)
  assert.match(transition, /transition\.reduced/u)
  assert.match(transition, /duration: \.12/u)
  assert.doesNotMatch(transition, /ScrollTrigger/u)
})

test('模块内部 reveal 仅使用短距离位移和透明度，不恢复三维或模糊效果', () => {
  const ledger = sourceOf('../apps/web/src/components/lookbook/RecordLedger.jsx')
  assert.match(motion, /data-reveal-group/u)
  assert.match(motion, /IntersectionObserver/u)
  assert.match(motion, /MutationObserver/u)
  assert.match(motion, /stagger: targets\.length/u)
  assert.doesNotMatch(motion, /ScrollTrigger|perspective|rotationX|rotationY|filter:\s*['"]blur/u)
  assert.match(ledger, /data-reveal-group="records"/u)
})
