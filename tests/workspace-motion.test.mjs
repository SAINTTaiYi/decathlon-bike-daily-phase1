import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync(new URL('../apps/web/src/App.jsx', import.meta.url), 'utf8')
const launch = readFileSync(new URL('../apps/web/src/hooks/useWorkspaceMotion.js', import.meta.url), 'utf8')
const motion = readFileSync(new URL('../apps/web/src/hooks/useMotionSystem.js', import.meta.url), 'utf8')
const activeScene = readFileSync(new URL('../apps/web/src/hooks/useActiveScene.js', import.meta.url), 'utf8')
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

test('六模块持续挂载并全部进入文档流，本地表单和列表状态不会因切换卸载', () => {
  for (const id of ['pulse', 'pickup', 'poster', 'repair', 'resale', 'sales']) {
    assert.match(app, new RegExp(`<WorkshopModuleSection sceneId=\"${id}\"`, 'u'))
  }
  assert.match(app, /id=\{`module-\$\{sceneId\}`\}/u)
  assert.equal((app.match(/<WorkshopModuleSection sceneId=/gu) || []).length, 6)
  assert.doesNotMatch(app, /hidden=\{activeScene|inert=\{activeScene|aria-hidden=\{activeScene/u)
})

test('模块导航使用原生连续滚动，不拦截滚轮、触摸或翻页键', () => {
  assert.match(activeScene, /scrollIntoView/u)
  assert.match(activeScene, /addEventListener\('scroll'/u)
  assert.doesNotMatch(activeScene, /addEventListener\('(?:wheel|touchmove|keydown)'/u)
  assert.doesNotMatch(activeScene, /preventDefault/u)
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
