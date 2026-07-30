import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const app = readFileSync(new URL('../apps/web/src/App.jsx', import.meta.url), 'utf8')
const launch = readFileSync(new URL('../apps/web/src/hooks/useWorkspaceMotion.js', import.meta.url), 'utf8')
const motion = readFileSync(new URL('../apps/web/src/hooks/useMotionSystem.js', import.meta.url), 'utf8')
const moduleStages = readFileSync(new URL('../apps/web/src/hooks/useModuleStages.js', import.meta.url), 'utf8')
const progress = readFileSync(new URL('../apps/web/src/utils/moduleStageProgress.js', import.meta.url), 'utf8')
const scenes = readFileSync(new URL('../apps/web/src/data/lookbookScenes.js', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../apps/web/src/styles/workshop-system.css', import.meta.url), 'utf8')
const stageSources = readFileSync(new URL('../apps/web/public/images/ops/stages/SOURCES.md', import.meta.url), 'utf8')

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
    assert.equal(app.includes('<ModuleStage sceneId="' + id + '"'), true)
  }
  assert.match(app, /data-module-stage-stack="true"/u)
  assert.match(app, /data-module-stage="true"/u)
  assert.match(app, /data-module-stage-content="true"/u)
  assert.doesNotMatch(app, /hidden=\{activeScene|inert=\{activeScene|aria-hidden=\{activeScene/u)
})

test('模块使用连续 rAF 进度而非阈值式假视差或输入劫持', () => {
  assert.match(moduleStages, /stageProgressForGeometry/u)
  assert.match(moduleStages, /stageMotionValues/u)
  assert.match(moduleStages, /stageWordFocus/u)
  assert.match(moduleStages, /requestAnimationFrame/u)
  assert.match(moduleStages, /addEventListener\('scroll', syncStages, \{ passive: true \}\)/u)
  assert.match(moduleStages, /setProperty\('--stage-title-2-y'/u)
  assert.match(moduleStages, /setProperty\('--stage-title-3-y'/u)
  assert.match(moduleStages, /setProperty\('--stage-backdrop-y'/u)
  assert.match(moduleStages, /setProperty\('--stage-object-scale'/u)
  assert.match(moduleStages, /setAttribute\('startOffset'/u)
  assert.match(progress, /\(-20 \+ safeProgress \* 40\)/u)
  assert.match(progress, /1 \+ safeProgress \* 0\.2/u)
  assert.doesNotMatch(moduleStages, /ScrollTrigger|gsap|ResizeObserver|pinSpacing|pin:|scrub:/u)
  for (const eventName of ['wheel', 'touchstart', 'touchend', 'keydown']) {
    assert.equal(moduleStages.includes("addEventListener('" + eventName + "'"), false)
  }
  assert.doesNotMatch(moduleStages, /preventDefault|WHEEL_THRESHOLD|TOUCH_THRESHOLD|boundaryHint/u)
})

test('六个舞台都具备 About-derived 多层排版、前景、曲线与逐词轨迹', () => {
  for (const marker of [
    'workshop-stage-backdrop',
    'workshop-stage-material',
    'workshop-stage-orbit',
    'workshop-stage-title',
    'workshop-stage-object',
    'workshop-stage-curve-copy',
    'workshop-stage-trail',
    'data-stage-curve-copy="true"',
    'data-stage-trail-word="true"'
  ]) assert.match(app, new RegExp(marker, 'u'))

  assert.match(styles, /\.workshop-module-stage-cover \{[\s\S]*?position: sticky;[\s\S]*?min-height: var\(--module-stage-height\);/u)
  assert.match(styles, /\.workshop-stage-material \{[\s\S]*?transform: translate3d\(0,var\(--stage-backdrop-y\),0\) scale\(1\.38\);/u)
  assert.match(styles, /\.workshop-stage-title-line-2 \{[\s\S]*?var\(--stage-title-2-y\)/u)
  assert.match(styles, /\.workshop-stage-title-line-3 \{[\s\S]*?var\(--stage-title-3-y\)/u)
  assert.match(styles, /\.workshop-stage-object \{[\s\S]*?var\(--stage-object-y\)[\s\S]*?var\(--stage-object-scale\)/u)
  assert.match(styles, /\.workshop-stage-trail span \{[\s\S]*?var\(--stage-word-focus\)/u)
  assert.match(styles, /transition-delay: var\(--stage-char-delay\)/u)
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?--stage-object-scale: 1 !important/u)
})

test('每个模块都有独立的原创透明车间物件且来源和哈希可追溯', () => {
  const assets = [
    'pulse-drivetrain.svg',
    'pickup-wheel-rack.svg',
    'handover-clipboard.svg',
    'repair-service-stand.svg',
    'resale-second-life.svg',
    'sales-counter-stack.svg'
  ]
  assert.equal(new Set(assets).size, 6)
  for (const asset of assets) {
    assert.match(scenes, new RegExp('/images/ops/stages/' + asset.replace('.', '\\.'), 'u'))
    const path = new URL('../apps/web/public/images/ops/stages/' + asset, import.meta.url)
    assert.equal(existsSync(path), true)
    const svg = readFileSync(path, 'utf8')
    assert.match(svg, /<svg[^>]+viewBox="0 0 720 880"/u)
    assert.match(svg, /data-original-workshop-object=/u)
    assert.match(stageSources, new RegExp(asset.replace('.', '\\.'), 'u'))
  }
  assert.match(stageSources, /No Obsidian Assembly image, logo, font, screenshot, silhouette, or proprietary asset is copied or traced/u)
})

test('模块内部业务 reveal 保持短距离且不恢复三维动画', () => {
  const ledger = sourceOf('../apps/web/src/components/lookbook/RecordLedger.jsx')
  assert.match(motion, /data-reveal-group/u)
  assert.match(motion, /IntersectionObserver/u)
  assert.match(motion, /MutationObserver/u)
  assert.match(motion, /stagger: targets\.length/u)
  for (const forbidden of ['ScrollTrigger', 'perspective', 'rotationX', 'rotationY']) {
    assert.equal(motion.includes(forbidden), false)
  }
  assert.match(ledger, /data-reveal-group="records"/u)
})
