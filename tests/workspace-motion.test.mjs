import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync(new URL('../apps/web/src/App.jsx', import.meta.url), 'utf8')
const launch = readFileSync(new URL('../apps/web/src/hooks/useWorkspaceMotion.js', import.meta.url), 'utf8')
const motion = readFileSync(new URL('../apps/web/src/hooks/useMotionSystem.js', import.meta.url), 'utf8')
const activeScene = readFileSync(new URL('../apps/web/src/hooks/useActiveScene.js', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../apps/web/src/styles/workshop-system.css', import.meta.url), 'utf8')
const desktop = readFileSync(new URL('../apps/web/src/styles/desktop-workbench.css', import.meta.url), 'utf8')

function sourceOf(path) { return readFileSync(new URL(path, import.meta.url), 'utf8') }

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

test('mobile flow stays intact and the desktop reference adds its Used board without story effects', () => {
  for (const id of ['pulse', 'pickup', 'poster', 'repair', 'resale', 'sales']) assert.match(app, new RegExp(`<WorkshopModuleSection sceneId="${id}"`, 'u'))
  assert.equal((app.match(/<WorkshopModuleSection sceneId=/gu) || []).length, 6)
  assert.match(app, /desktopLayout \? <WorkshopModuleSection sceneId="resale"/u)
  assert.match(app, /const visibleScene = desktopLayout \? desktopScene : activeScene/u)
  assert.match(app, /data-desktop-scene=\{desktopScene\}/u)
  assert.match(desktop, /@media \(min-width: 768px\)/u)
  assert.match(desktop, /workshop-shell\[data-desktop-scene='sales'\]/u)
})

test('mobile module navigation uses native continuous scroll and does not intercept wheel, touch, or paging keys', () => {
  assert.match(activeScene, /scrollIntoView/u)
  assert.match(activeScene, /addEventListener\('scroll'/u)
  assert.match(activeScene, /\['wheel', 'keydown'\]\.forEach/u)
  assert.doesNotMatch(activeScene, /preventDefault/u)
})

test('module reveal only uses short distance and opacity, without three-dimensional or blur effects', () => {
  const ledger = sourceOf('../apps/web/src/components/lookbook/RecordLedger.jsx')
  assert.match(motion, /data-reveal-group/u)
  assert.match(motion, /IntersectionObserver/u)
  assert.match(motion, /MutationObserver/u)
  assert.match(motion, /stagger: targets\.length/u)
  assert.doesNotMatch(motion, /ScrollTrigger|perspective|rotationX|rotationY|filter:\s*['"]blur/u)
  assert.match(ledger, /data-reveal-group="records"/u)
  assert.match(styles, /Normal vertical module flow/u)
})
