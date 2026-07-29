import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync(new URL('../apps/web/src/App.jsx', import.meta.url), 'utf8')
const launch = readFileSync(new URL('../apps/web/src/hooks/useWorkspaceMotion.js', import.meta.url), 'utf8')
const motion = readFileSync(new URL('../apps/web/src/hooks/useMotionSystem.js', import.meta.url), 'utf8')
const moduleStages = readFileSync(new URL('../apps/web/src/hooks/useModuleStages.js', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../apps/web/src/styles/workshop-system.css', import.meta.url), 'utf8')

function sourceOf(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

test('登录后的工作台入场只在真实登录且首屏数据稳定后启动', () => {
  assert.match(app, /auth\.source === 'login'/)
  assert.match(app, /loginAnimationDone && workflow\.hydrated && !workspaceAssemblyDone/)
  assert.match(app, /auth\.source === 'restore'/)
})

test('工作台入场可跳过、使用无透视的遮罩揭示并在完成后把焦点交回主内容', () => {
  assert.match(app, /跳过入场动画/)
  assert.match(app, /event\.key === 'Escape'/)
  assert.match(app, /onPointerDown=/)
  assert.match(app, /id="main-content" tabIndex="-1"/)
  assert.match(app, /main-content'\)\?\.focus/)
  assert.match(launch, /reducedMotion\(\)/)
  assert.match(launch, /clipPath: 'inset\(0 0 100% 0\)'/)
  assert.doesNotMatch(launch, /perspective|rotationX|blur/u)
})

test('六模块持续挂载并全部进入文档流，本地表单和列表状态不会因切换卸载', () => {
  for (const id of ['pulse', 'pickup', 'poster', 'repair', 'resale', 'sales']) {
    assert.match(app, new RegExp('<ModuleStage sceneId=\"' + id + '\"', 'u'))
  }
  assert.match(app, /data-module-stage-stack="true"/u)
  assert.match(app, /data-module-stage="true"/u)
  assert.doesNotMatch(app, /hidden=\{activeScene|inert=\{activeScene|aria-hidden=\{activeScene/u)
})

test('模块切换使用原生连续滚动和被动观测，不创建 pin、滚动补偿或输入劫持', () => {
  assert.match(moduleStages, /IntersectionObserver/u)
  assert.match(moduleStages, /addEventListener\('scroll', syncActiveStage, \{ passive: true \}\)/u)
  assert.match(moduleStages, /window\.scrollTo/u)
  assert.doesNotMatch(moduleStages, /ScrollTrigger|gsap|ResizeObserver|pinSpacing|pin:|scrub:/u)
  for (const eventName of ['wheel', 'touchstart', 'touchend', 'keydown']) assert.equal(moduleStages.includes("addEventListener('" + eventName + "'"), false)
  assert.doesNotMatch(moduleStages, /preventDefault|WHEEL_THRESHOLD|TOUCH_THRESHOLD|boundaryHint/u)
  assert.doesNotMatch(styles, /module-transitioning|module-boundary-hint|module-flow-transition/u)
})

test('每个模块都有短生命周期的原生 sticky 覆盖舞台，随后释放为普通业务内容流', () => {
  assert.match(app, /data-module-stage-runway="true"/u)
  assert.match(app, /data-module-stage-cover="true"/u)
  assert.match(app, /data-module-stage-content="true"/u)
  assert.match(styles, /\.workshop-module-stage-runway \{[\s\S]*?min-height: calc\(var\(--module-stage-height\) \+ var\(--module-stage-hold\)\);/u)
  assert.match(styles, /\.workshop-module-stage-cover \{[\s\S]*?position: sticky;[\s\S]*?top: var\(--ops-header-height\);/u)
  assert.match(styles, /\.workshop-module-stage-content \{[\s\S]*?position: relative;[\s\S]*?min-height: calc\(100dvh - var\(--ops-header-height\) - 12px\);/u)
  assert.match(styles, /\.workshop-module-stage-content \{[\s\S]*?margin-top: calc\(0px - var\(--module-stage-overlap\)\);/u)
  assert.match(styles, /\.workshop-module-stage:first-child \.workshop-module-stage-content \{ margin-top: 0; \}/u)
  assert.match(styles, /animation-timeline: view\(\);/u)
  assert.match(styles, /workshop-slate-texture\.png/u)
  assert.match(moduleStages, /prefers-reduced-motion: reduce/u)
})

test('模块内部 reveal 仅使用短距离位移和透明度，不恢复三维或模糊效果', () => {
  const ledger = sourceOf('../apps/web/src/components/lookbook/RecordLedger.jsx')
  assert.match(motion, /data-reveal-group/u)
  assert.match(motion, /IntersectionObserver/u)
  assert.match(motion, /MutationObserver/u)
  assert.match(motion, /stagger: targets\.length/u)
  for (const forbidden of ['ScrollTrigger', 'perspective', 'rotationX', 'rotationY', 'filter: blur']) assert.equal(motion.includes(forbidden), false)
  assert.match(ledger, /data-reveal-group="records"/u)
})
