import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sourceOf = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const app = sourceOf('../apps/web/src/App.jsx')
const launch = sourceOf('../apps/web/src/hooks/useWorkspaceMotion.js')
const motion = sourceOf('../apps/web/src/hooks/useMotionSystem.js')
const activeScene = sourceOf('../apps/web/src/hooks/useActiveScene.js')
const shellStyles = sourceOf('../apps/web/src/styles/signal-grid-shell.css')

test('登录后的工作台入场只在真实登录且首屏数据稳定后启动', () => {
  assert.match(app, /auth\.source === 'login'/u)
  assert.match(app, /loginAnimationDone && workflow\.hydrated && !workspaceAssemblyDone/u)
  assert.match(app, /auth\.source === 'restore'/u)
})

test('工作台入场提供遮罩点击、显式跳过和 Escape，并把焦点交回主内容', () => {
  assert.match(app, /data-workspace-launch-overlay/u)
  assert.match(app, />跳过 <small>ESC<\/small><\/button>/u)
  assert.match(app, /event\.key === 'Escape'/u)
  assert.match(app, /onPointerDown=/u)
  assert.match(app, /id="main-content" tabIndex="-1"/u)
  assert.match(app, /main-content'\)\?\.focus/u)
})

test('Signal Grid 入场是短促硬切层级，不含旧 3D、模糊或持续空间编排', () => {
  assert.match(launch, /data-workspace-layer="environment"/u)
  assert.match(launch, /data-workspace-layer="structure"/u)
  assert.match(launch, /data-workspace-layer="navigation"/u)
  assert.match(launch, /data-workspace-layer="focus"/u)
  assert.match(launch, /duration: 0\.34/u)
  assert.match(launch, /duration: 0\.16/u)
  assert.match(launch, /reducedMotion\(\)/u)
  assert.doesNotMatch(launch, /perspective|rotationX|rotationY|filter:|blur\(|scale:/u)
})

test('常驻交互只保留按钮按压反馈，不监听滚动或操控内容 transform', () => {
  assert.match(motion, /button:not\(:disabled\)/u)
  assert.match(motion, /scale: \.985/u)
  assert.match(motion, /prefers-reduced-motion/u)
  assert.doesNotMatch(motion, /ScrollTrigger|addEventListener\('scroll'|data-spatial-tilt|depth-far|depth-near/u)
})

test('当前模块使用 IntersectionObserver 跟踪，导航跳转保留 reduced-motion 降级', () => {
  assert.match(activeScene, /new IntersectionObserver/u)
  assert.match(activeScene, /observer\.observe/u)
  assert.match(activeScene, /observer\.disconnect/u)
  assert.match(activeScene, /scrollIntoView/u)
  assert.match(activeScene, /prefers-reduced-motion/u)
  assert.doesNotMatch(activeScene, /addEventListener\('scroll'/u)
})

test('平面画布显式禁用旧景深、纸张层和 transform 遗留', () => {
  assert.doesNotMatch(app, /workspace-depth-plane|workspace-paper-film|workspace-paper-fibre|workspace-paper-scratches/u)
  assert.match(shellStyles, /flat canvas/u)
  assert.match(shellStyles, /\.signal-workspace :is\(\.workspace-depth-plane, \.workspace-paper-film/u)
  assert.match(shellStyles, /\[data-depth-section\].*transform: none !important/su)
  assert.match(shellStyles, /touch-action: pan-y/u)
})
