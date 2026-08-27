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

test('两端模块转场统一为 Amicro zoom-in：退场 + 3D 入场 + stagger，大面板不用 filter blur', () => {
  for (const hook of [desktopHook, activeScene]) {
    assert.match(hook, /ease: 'expo\.out'/u)
    assert.match(hook, /transformPerspective/u)
    assert.match(hook, /rotateX/u)
    assert.match(hook, /stagger/u)
    assert.match(hook, /clearProps: 'transform,opacity,visibility,filter'/u)
    assert.ok(!hook.includes('scaleX: 1'))
    // 大面板（panel/targets）动画禁止 filter blur：逐帧重栅格化会卡顿；
    // blur 只允许出现在小面积的页头行子项上
    const panelTween = hook.split(/gsap\.fromTo\(panel|gsap\.fromTo\(nextPanel/u)[1]?.split(')')[0] || ''
    assert.doesNotMatch(panelTween, /filter:\s*'blur/u)
  }
  // 页头行（小面积）保留 Amicro blur 质感
  assert.match(desktopHook, /filter: 'blur\(5px\)'/u)
  assert.match(activeScene, /filter: 'blur\(4px\)'/u)
})

test('移动端模块页头子项（含搜索框 Portal 插槽）在转场中先退场后必须恢复', () => {
  // 回归：上一版移动端只退场不恢复，导致搜索框插槽永久停留在 opacity:0
  assert.match(activeScene, /nextHeaderItems/u)
  assert.match(activeScene, /const nextHeaderItems = /u)
  const reveal = activeScene.split('const reveal = (animate) =>')[1]?.split('const timeline =')[0] || ''
  assert.match(reveal, /gsap\.fromTo\(item/u)
  assert.match(reveal, /autoAlpha: 1/u)
  // 每轮转场开始时防御性复位残留样式
  assert.match(activeScene, /gsap\.set\(\[currentPanel, \.\.\.headerItems\]\.filter\(Boolean\), \{ clearProps/u)
})

test('reduced-motion 下移动端只做结构切换，不播任何 tween', () => {
  assert.match(activeScene, /if \(reducedMotion\(\)\) \{\n      reveal\(false\)\n      return\n    \}/u)
  const revealBody = activeScene.split('const reveal = (animate) =>')[1]?.split('timelineRef.current = timeline')[0] || ''
  assert.match(revealBody, /if \(!animate\) return/u)
})

test('入场 tween 被单独跟踪，快速连续切换时可被打断复位', () => {
  for (const hook of [desktopHook, activeScene]) {
    assert.match(hook, /enterTweensRef/u)
    assert.match(hook, /enterTweensRef\.current\?\.forEach\(\(tween\) => tween\.kill\(\)\)/u)
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

test('对话框有 Amicro 风格入场与退场，backdrop 走 opacity 合成器动画', () => {
  assert.match(componentsCss, /dialog-panel-in \.45s/u)
  assert.match(componentsCss, /dialog-panel-out \.2s/u)
  assert.match(componentsCss, /dialog-backdrop-in/u)
  // backdrop 动画必须基于 opacity，禁止逐帧重绘 background
  assert.match(componentsCss, /@keyframes dialog-backdrop-in \{ from \{ opacity: 0; \} to \{ opacity: 1; \} \}/u)
  assert.doesNotMatch(componentsCss, /@keyframes dialog-backdrop-in \{ from \{ background/u)
  assert.match(componentsCss, /dialog-backdrop-out/u)
  assert.match(dialog, /dataset\.closing/u)
  assert.match(dialog, /dialog\.close\(\)/u)
  assert.match(componentsCss, /prefers-reduced-motion: reduce[\s\S]*?\.dialog-panel\[data-closing='true'\] \{ animation: none; \}/u)
})

test('运动令牌齐备：easeOutExpo 与 spring 曲线进入 tokens', () => {
  assert.match(tokens, /--ease-out: cubic-bezier\(\.16, 1, \.3, 1\)/u)
  assert.match(tokens, /--ease-spring: cubic-bezier\(\.3, 1\.36, \.4, 1\)/u)
  assert.match(desktopCss, /\.look-dock button \{ transition: background-color 180ms var\(--ease-out\)/u)
})

test('滚动 reveal 与首屏入场走 transform/opacity（大面积不用 blur），保留 reduced-motion 路径', () => {
  assert.match(motionSystem, /ease: 'expo\.out'/u)
  assert.doesNotMatch(motionSystem, /filter:\s*'blur/u)
  assert.match(motionSystem, /clearProps: 'transform,opacity,visibility,filter,willChange'/u)
  const launch = readFileSync(new URL('../apps/web/src/hooks/useWorkspaceMotion.js', import.meta.url), 'utf8')
  assert.doesNotMatch(launch, /filter:\s*'blur/u)
  assert.match(launch, /duration: \.12/u)
})

test('移动端滚动直通路未被转场改造破坏', () => {
  assert.match(activeScene, /scrollIntoView/u)
  assert.match(activeScene, /addEventListener\('scroll'/u)
  assert.match(activeScene, /\['wheel', 'keydown'\]\.forEach/u)
  assert.doesNotMatch(activeScene, /preventDefault/u)
})
