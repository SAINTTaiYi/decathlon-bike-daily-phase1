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

test('两端模块转场为文字安全的 Amicro fade-up：大面板只动 x/y/opacity', () => {
  for (const hook of [desktopHook, activeScene]) {
    assert.match(hook, /ease: 'expo\.out'/u)
    assert.match(hook, /stagger/u)
    assert.match(hook, /clearProps: 'transform,opacity,visibility'/u)
    assert.ok(!hook.includes('scaleX: 1'))
    // 文字载体（面板/入场目标）禁止 scale/rotateX/filter——分数缩放与逐帧 blur
    // 都会让文字重栅格化，动画结束移除 transform 时“跳回清晰”即抽搐
    assert.doesNotMatch(hook, /rotateX:|transformPerspective:|scale: \.9/u)
  }
  // 面板入场 from 必须只含位移与透明度
  assert.match(desktopHook, /gsap\.fromTo\(panel,\n            \{ autoAlpha: \.01, x: direction \* 34, y: 14 \}/u)
  assert.match(activeScene, /gsap\.fromTo\(nextPanel,\n            \{ autoAlpha: \.01, x: direction \* 22, y: 10 \}/u)
  // 页头行（小面积、少文字）保留 Amicro blur 质感
  assert.match(desktopHook, /filter: 'blur\(5px\)'/u)
  assert.match(activeScene, /filter: 'blur\(4px\)'/u)
  // 卡片帧有自己的 CSS 入场动画（data-entering），不得进入 GSAP 目标（注释提及不算）
  for (const hook of [desktopHook, activeScene]) {
    assert.doesNotMatch(hook, /['"]\.pickup-card-frame['"]/u)
  }
})

test('移动端模块页头子项（含搜索框 Portal 插槽）在转场中先退场后必须恢复', () => {
  // 回归：上一版移动端只退场不恢复，导致搜索框插槽永久停留在 opacity:0
  assert.match(activeScene, /const nextHeaderItems = /u)
  const reveal = activeScene.split('const reveal = (animate) =>')[1]?.split('const timeline =')[0] || ''
  assert.match(reveal, /gsap\.fromTo\(item/u)
  assert.match(reveal, /autoAlpha: 1/u)
  // 2026-08-28 三修：不再做转场前的防御性 clearProps——被打断的 tween 处于中间值时
  // 清 props 会瞬间跳位（抽搐）；改为退场 .to() 从当前值续接 + interrupted 标记清理
  assert.doesNotMatch(activeScene, /gsap\.set\(\[currentPanel/u)
  assert.match(activeScene, /delete shell\.dataset\.mobileSceneTransitioning/u)
})

test('reduced-motion 下移动端只做结构切换，不播任何 tween', () => {
  assert.match(activeScene, /if \(reducedMotion\(\)\) \{\n      reveal\(false\)\n      return\n    \}/u)
  const revealBody = activeScene.split('const reveal = (animate) =>')[1]?.split('timelineRef.current = timeline')[0] || ''
  assert.match(revealBody, /if \(!animate\) \{/u)
  assert.match(revealBody, /gsap\.set\(\[nextPanel, \.\.\.nextHeaderItems\]/u)
})

test('入场 tween 被单独跟踪，快速连续切换时可被打断复位', () => {
  for (const hook of [desktopHook, activeScene]) {
    assert.match(hook, /enterTweensRef/u)
    assert.match(hook, /enterTweensRef\.current\?\.forEach\(\(tween\) => tween\.kill\(\)\)/u)
  }
})

test('转场期间旧面板先退场，reduced-motion 直接切换且不残留内联样式', () => {
  assert.match(desktopHook, /prefersReducedMotion\(\)/u)
  assert.match(activeScene, /reducedMotion\(\)/u)
  for (const hook of [desktopHook, activeScene]) {
    assert.match(hook, /power2\.in/u)
  }
  // reduced-motion 路径用 gsap.set 清残留，保证切换后无内联样式
  assert.match(activeScene, /gsap\.set\(\[nextPanel, \.\.\.nextHeaderItems\], \{ clearProps/u)
  // 被打断的时间线不触发 onComplete，须手动清理转场标记
  assert.match(desktopHook, /delete root\.dataset\.desktopSceneTransitioning/u)
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

test('对话框进/出场均为 GSAP 时间线：无 CSS keyframes，退场完成才真正关闭', () => {
  // 2026-08-28 四修：所有操作必须进场+退场动效（用户指令），统一 GSAP、删除旧 CSS 动画
  assert.match(dialog, /from 'gsap'/u)
  // 入场：面板 fade-up（仅位移+透明度，文字安全）+ backdrop CSS 变量淡入
  assert.match(dialog, /fromTo\(panel,\n            \{ autoAlpha: 0, y: 18 \}/u)
  assert.match(dialog, /'--dialog-backdrop-o': 0[\s\S]*?'--dialog-backdrop-o': 1/u)
  // 退场：先播动画，onComplete 才 dialog.close()
  assert.match(dialog, /gsap\.timeline\(\{ onComplete: \(\) => dialog\.close\(\) \}\)/u)
  assert.match(dialog, /to\(panel, \{ autoAlpha: 0, y: 14, duration: \.2, ease: 'power2\.in' \}, 0\)/u)
  // 退场途中重开：打断退场（kill 后 close 回调不再触发）
  assert.match(dialog, /timelineRef\.current\?\.kill\(\)/u)
  // reduced-motion 直开直关
  assert.match(dialog, /prefers-reduced-motion: reduce/u)
  // CSS 侧不再有任何对话框动画：keyframes 全删，backdrop 透明度交给变量
  const wsCss = readFileSync(new URL('../apps/web/src/styles/workshop-system.css', import.meta.url), 'utf8')
  assert.doesNotMatch(wsCss, /dialog-panel-in/u)
  assert.doesNotMatch(componentsCss, /dialog-backdrop-in|dialog-panel-out/u)
  assert.match(wsCss, /\.app-dialog::backdrop \{[^}]*opacity: var\(--dialog-backdrop-o, 1\);/u)
  // 面板动画禁 scale（文字安全）
  assert.doesNotMatch(dialog, /scale: \./u)
})

test('Portal 抽屉（筛选/成员选择）有 GSAP 进出场：退场完成才卸载', () => {
  const sheetHook = readFileSync(new URL('../apps/web/src/hooks/usePortalSheetMotion.js', import.meta.url), 'utf8')
  const ledger = readFileSync(new URL('../apps/web/src/components/pickup/PickupLedger.jsx', import.meta.url), 'utf8')
  const member = readFileSync(new URL('../apps/web/src/components/dialogs/MemberSelectSheet.jsx', import.meta.url), 'utf8')
  // hook：挂载后播入场；open=false 播退场，完成后才 setMounted(false)
  assert.match(sheetHook, /setMounted\(true\)/u)
  assert.match(sheetHook, /onComplete: \(\) => \{ if \(!openRef\.current\) setMounted\(false\) \}/u)
  assert.match(sheetHook, /fromTo\(panel, \{ autoAlpha: 0, yPercent: 9 \}/u)
  assert.match(sheetHook, /reducedMotion\(\)/u)
  // 两个抽屉都接入 hook 并用 mounted 门控
  assert.match(ledger, /usePortalSheetMotion\(\{ open \}\)/u)
  assert.match(ledger, /if \(!mounted\) return null/u)
  assert.match(member, /usePortalSheetMotion\(\{ open \}\)/u)
  assert.match(member, /if \(!mounted\) return null/u)
})

test('取车卡片入场为 GSAP（无 CSS keyframes），桌面端与 reduced-motion 跳过', () => {
  const ledger = readFileSync(new URL('../apps/web/src/components/pickup/PickupLedger.jsx', import.meta.url), 'utf8')
  const pickupCss = readFileSync(new URL('../apps/web/src/styles/pickup-ledger.css', import.meta.url), 'utf8')
  const desktopCss = readFileSync(new URL('../apps/web/src/styles/desktop-workbench.css', import.meta.url), 'utf8')
  assert.match(ledger, /gsap\.set\(frame, \{ autoAlpha: 0, y: 28 \}\)/u)
  assert.match(ledger, /ease: 'expo\.out', clearProps: 'transform,opacity,visibility' \}\)/u)
  assert.match(ledger, /min-width: 768px/u)
  assert.ok(!pickupCss.includes('pickup-card-enter'))
  assert.ok(!pickupCss.includes('.pickup-card-frame[data-entering]'))
  assert.ok(!desktopCss.includes('.pickup-card-frame[data-entering]'))
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
