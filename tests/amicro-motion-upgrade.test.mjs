import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync(new URL('../apps/web/src/App.jsx', import.meta.url), 'utf8')
const desktopHook = readFileSync(new URL('../apps/web/src/hooks/useDesktopSceneTransition.js', import.meta.url), 'utf8')
const activeScene = readFileSync(new URL('../apps/web/src/hooks/useActiveScene.js', import.meta.url), 'utf8')
const motionSystem = readFileSync(new URL('../apps/web/src/hooks/useMotionSystem.js', import.meta.url), 'utf8')
const toast = readFileSync(new URL('../apps/web/src/components/StatusToast.jsx', import.meta.url), 'utf8')
const dialog = readFileSync(new URL('../apps/web/src/components/dialogs/AppDialog.jsx', import.meta.url), 'utf8')
const tokens = readFileSync(new URL('../apps/web/src/styles/tokens.css', import.meta.url), 'utf8')
const motionCss = readFileSync(new URL('../apps/web/src/styles/motion.css', import.meta.url), 'utf8')
const componentsCss = readFileSync(new URL('../apps/web/src/styles/components.css', import.meta.url), 'utf8')
const desktopCss = readFileSync(new URL('../apps/web/src/styles/desktop-workbench.css', import.meta.url), 'utf8')
const mobileCss = readFileSync(new URL('../apps/web/src/styles/mobile-overview.css', import.meta.url), 'utf8')
const pkg = JSON.parse(readFileSync(new URL('../apps/web/package.json', import.meta.url), 'utf8'))

test('黄色整屏 wipe 在 DOM、hooks 与两端 CSS 中全部移除', () => {
  for (const source of [app, desktopHook, activeScene, desktopCss, mobileCss]) {
    assert.ok(!source.includes('desktop-scene-transition-viewport'), 'viewport 残留')
    assert.ok(!source.includes('desktop-scene-transition-wipe'), 'wipe 残留')
  }
})

test('两端模块转场统一为 Amicro zoom-in：退场 + blur/3D 入场 + stagger', () => {
  for (const hook of [desktopHook, activeScene]) {
    assert.match(hook, /ease: 'expo\.out'/u)
    assert.match(hook, /filter: 'blur\(\d+px\)'/u)
    assert.match(hook, /transformPerspective/u)
    assert.match(hook, /rotateX/u)
    assert.match(hook, /stagger/u)
    assert.match(hook, /clearProps: 'transform,opacity,visibility,filter'/u)
    assert.ok(!hook.includes('scaleX: 1'))
  }
})

test('转场期间旧面板先退场且新面板重置上轮内联样式，reduced-motion 直接切换', () => {
  assert.match(desktopHook, /prefersReducedMotion\(\)/u)
  assert.match(activeScene, /reducedMotion\(\)/u)
  for (const hook of [desktopHook, activeScene]) {
    assert.match(hook, /power2\.in/u)
    assert.match(hook, /gsap\.set\((?:panel|nextPanel), \{ clearProps/u)
  }
})

test('framer-motion 已引入并驱动 Toast：AnimatePresence + snappy spring', () => {
  assert.equal(pkg.dependencies['framer-motion'], '^12')
  assert.match(toast, /AnimatePresence/u)
  assert.match(toast, /stiffness: 400, damping: 28, mass: \.8/u)
  assert.match(toast, /status-toast-live/u)
  assert.match(toast, /aria-live=/u)
  assert.match(motionCss, /\.status-toast-live \{ position: fixed;/u)
  // framer-motion 接管动画后，CSS 不再持有 toast 的 transform/transition
  assert.doesNotMatch(motionCss, /\.status-toast \{[^}]*transition:/u)
})

test('对话框有 Amicro 风格入场与退场，reduced-motion 关闭动画', () => {
  assert.match(componentsCss, /dialog-panel-in \.45s/u)
  assert.match(componentsCss, /dialog-panel-out \.2s/u)
  assert.match(componentsCss, /dialog-backdrop-in/u)
  assert.match(dialog, /dataset\.closing/u)
  assert.match(dialog, /dialog\.close\(\)/u)
  assert.match(componentsCss, /prefers-reduced-motion: reduce[\s\S]*?\.dialog-panel\[data-closing='true'\] \{ animation: none; \}/u)
})

test('运动令牌齐备：easeOutExpo 与 spring 曲线进入 tokens', () => {
  assert.match(tokens, /--ease-out: cubic-bezier\(\.16, 1, \.3, 1\)/u)
  assert.match(tokens, /--ease-spring: cubic-bezier\(\.3, 1\.36, \.4, 1\)/u)
  assert.match(desktopCss, /\.look-dock button \{ transition: background-color 180ms var\(--ease-out\)/u)
})

test('滚动 reveal 与首屏入场升级为 blur 深度感并保留 reduced-motion 路径', () => {
  assert.match(motionSystem, /ease: 'expo\.out'/u)
  assert.match(motionSystem, /filter: 'blur\(9px\)'/u)
  const launch = readFileSync(new URL('../apps/web/src/hooks/useWorkspaceMotion.js', import.meta.url), 'utf8')
  assert.match(launch, /filter: 'blur\(14px\)'/u)
  assert.match(launch, /duration: \.12/u)
})

test('移动端滚动直通路未被转场改造破坏', () => {
  assert.match(activeScene, /scrollIntoView/u)
  assert.match(activeScene, /addEventListener\('scroll'/u)
  assert.match(activeScene, /\['wheel', 'keydown'\]\.forEach/u)
  assert.doesNotMatch(activeScene, /preventDefault/u)
})
