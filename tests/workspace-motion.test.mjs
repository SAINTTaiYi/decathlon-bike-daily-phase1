import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync(new URL('../apps/web/src/App.jsx', import.meta.url), 'utf8')
const launch = readFileSync(new URL('../apps/web/src/hooks/useWorkspaceMotion.js', import.meta.url), 'utf8')
const motion = readFileSync(new URL('../apps/web/src/hooks/useMotionSystem.js', import.meta.url), 'utf8')
const boot = readFileSync(new URL('../apps/web/src/components/BootLoader.jsx', import.meta.url), 'utf8')

function sourceOf(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

test('登录后的工作台入场只在真实登录且首屏数据稳定后启动', () => {
  assert.match(app, /auth\.source === 'login'/)
  assert.match(app, /loginAnimationDone && workflow\.hydrated && !workspaceAssemblyDone/)
  assert.match(app, /auth\.source === 'restore'/)
})

test('工作台入场提供遮罩点击、显式按钮和 Escape 跳过，并把焦点交回主内容', () => {
  assert.match(app, /跳过入场动画/)
  assert.match(app, /event\.key === 'Escape'/)
  assert.match(app, /onPointerDown=/)
  assert.match(app, /id="main-content" tabIndex="-1"/)
  assert.match(app, /main-content'\)\?\.focus/)
})

test('入场按环境、结构、导航、焦点与模块分层，并为 reduced motion 走短淡入', () => {
  assert.match(launch, /data-workspace-layer="environment"/)
  assert.match(launch, /data-workspace-layer="structure"/)
  assert.match(launch, /data-workspace-layer="navigation"/)
  assert.match(launch, /data-workspace-layer="focus"/)
  assert.match(launch, /gsap\.set\(structure, \{ perspective: 1180/)
  assert.match(launch, /reducedMotion\(\)/)
  assert.match(launch, /duration: 0\.2/)
  assert.match(launch, /addLabel\('focus', 0\.72\)/)
  assert.match(launch, /to\(overlay, \{ autoAlpha: 0, duration: 0\.26/)
})

test('常驻空间响应使用 GSAP group-level ScrollTrigger，不转化滚动壳，并保持 touch 原生连续滑动', () => {
  assert.match(motion, /ScrollTrigger\.create/)
  assert.match(motion, /data-workspace-layer=\"depth-far\"/)
  assert.match(motion, /data-workspace-layer=\"depth-near\"/)
  assert.doesNotMatch(motion, /scrollPlane/)
  assert.doesNotMatch(motion, /addEventListener\('scroll'/)
  assert.match(motion, /quietRef\.current \? \.22 : 1/)
  assert.match(motion, /event\.pointerType === 'touch'/)
  assert.match(motion, /distance < 8/)
})

test('移动端深度使用独立平面、可见区块位移和 pan-y，而不是减弱成桌面附属效果', () => {
  const app = sourceOf('../apps/web/src/App.jsx')
  const styles = sourceOf('../apps/web/src/styles/refinement.css')
  assert.match(app, /data-workspace-layer=\"depth-far\"/)
  assert.match(app, /data-workspace-layer=\"depth-near\"/)
  assert.match(motion, /compact \? 1\.34 : 1/)
  assert.match(styles, /touch-action: pan-y/)
  assert.doesNotMatch(styles, /\.app-runtime \{[^}]*perspective:/)
  assert.match(styles, /look-section\[data-depth-section\]/)
  assert.match(styles, /workspace-depth-plane-near/)
})

test('现有首页首屏组件成为空间编排对象，且登录品牌开屏缩短后交给工作台入场', () => {
  assert.match(sourceOf('../apps/web/src/components/lookbook/ReleaseNotes.jsx'), /data-workspace-module="true"/)
  assert.match(sourceOf('../apps/web/src/components/lookbook/MainHeadImage.jsx'), /data-depth-card="true"/)
  assert.match(sourceOf('../apps/web/src/scenes/PulseScene.jsx'), /data-workspace-module="true"/)
  assert.match(boot, /duration: 0\.74/)
  assert.match(boot, /0\.72\)/)
})
