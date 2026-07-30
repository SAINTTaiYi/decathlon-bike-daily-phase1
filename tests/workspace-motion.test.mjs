import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const app = readFileSync(new URL('../apps/web/src/App.jsx', import.meta.url), 'utf8')
const launch = readFileSync(new URL('../apps/web/src/hooks/useWorkspaceMotion.js', import.meta.url), 'utf8')
const motion = readFileSync(new URL('../apps/web/src/hooks/useMotionSystem.js', import.meta.url), 'utf8')
const canvas = readFileSync(new URL('../apps/web/src/hooks/useContinuousCanvas.js', import.meta.url), 'utf8')
const progress = readFileSync(new URL('../apps/web/src/utils/continuousCanvasProgress.js', import.meta.url), 'utf8')
const scenes = readFileSync(new URL('../apps/web/src/data/lookbookScenes.js', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../apps/web/src/styles/workshop-system.css', import.meta.url), 'utf8')
const stageSources = readFileSync(new URL('../apps/web/public/images/ops/stages/SOURCES.md', import.meta.url), 'utf8')

function sourceOf(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

test('top entry reveal is skippable and restored or deep-linked entry bypasses it', () => {
  assert.match(app, /auth\.source === 'login'/u)
  assert.match(app, /window\.scrollY <= 8/u)
  assert.match(app, /#module-\(pulse\|pickup\|poster\|repair\|resale\|sales\)/u)
  assert.match(app, /auth\.source === 'restore'/u)
  for (const eventName of ['keydown', 'pointerdown', 'wheel', 'touchstart']) {
    assert.match(app, new RegExp(`addEventListener\\('${eventName}'`, 'u'))
  }
  assert.match(app, /跳过入场动画/u)
  assert.match(app, /main-content'\)\?\.focus/u)
  assert.match(launch, /reducedMotion\(\)/u)
  assert.match(launch, /data-continuous-module/u)
})

test('six semantic modules remain mounted in one native continuous stack', () => {
  for (const id of ['pulse', 'pickup', 'poster', 'repair', 'resale', 'sales']) {
    assert.equal(app.includes('<ModuleSection sceneId="' + id + '"'), true)
  }
  assert.match(app, /data-continuous-stack="true"/u)
  assert.match(app, /data-continuous-module="true"/u)
  assert.match(app, /data-module-business="true"/u)
  assert.doesNotMatch(app, /hidden=\{activeScene|inert=\{activeScene|aria-hidden=\{activeScene/u)
  assert.doesNotMatch(app, /data-module-stage|module-stage-runway|module-stage-cover/u)
})

test('one passive rAF scroll runtime drives page, module and sparse motif progress', () => {
  for (const marker of ['pageProgressForGeometry', 'moduleProgressForGeometry', 'moduleMotionValues', 'objectMotionValues', 'narrativeMotionValues', 'continuousWordFocus']) {
    assert.match(canvas, new RegExp(marker, 'u'))
  }
  assert.match(canvas, /requestAnimationFrame/u)
  assert.match(canvas, /addEventListener\('scroll', onScroll, \{ passive: true \}\)/u)
  assert.match(canvas, /viewportHeight \* 0\.42/u)
  assert.match(canvas, /stackRect\.top \+ section\.offsetTop/u)
  assert.match(canvas, /section\.offsetHeight/u)
  assert.match(canvas, /behavior: 'auto'/u)
  assert.match(canvas, /down \? 0 : 40/u)
  assert.match(canvas, /history\.pushState/u)
  assert.match(canvas, /history\.replaceState/u)
  assert.match(canvas, /const stack = section\?\.closest\('\[data-continuous-stack\]'\)/u)
  assert.match(canvas, /const jumpFromHistory = \(\) =>/u)
  assert.match(canvas, /addEventListener\('popstate', jumpFromHistory\)/u)
  assert.doesNotMatch(canvas, /ScrollTrigger|gsap|ResizeObserver|pinSpacing|pin:|scrub:/u)
  assert.doesNotMatch(canvas, /preventDefault|WHEEL_THRESHOLD|TOUCH_THRESHOLD|boundaryHint/u)
  assert.doesNotMatch(styles, /position:\s*sticky/u)
})

test('continuous canvas uses warm fields, six cross-module objects and sparse memory motifs', () => {
  for (const marker of [
    'workshop-continuous-field-gray',
    'workshop-continuous-field-yellow',
    'workshop-continuous-object',
    'workshop-canvas-title',
    'workshop-continuous-curve',
    'workshop-continuous-trail',
    'data-continuous-curve-copy="true"',
    'data-continuous-trail-word="true"'
  ]) assert.match(app, new RegExp(marker, 'u'))
  assert.match(app, /const canvasMotifs = \[lookbookScenes\[0\], lookbookScenes\[3\]\]/u)
  assert.match(canvas, /motifVisibility\(local, \{ reduce \}\)/u)
  assert.match(styles, /--curve-opacity/u)
  assert.match(styles, /--trail-opacity/u)
  assert.match(app, /lookbookScenes\.filter/u)
  assert.match(styles, /\.workshop-continuous-canvas,[\s\S]*?position: fixed/u)
  assert.match(styles, /\.workshop-continuous-field-gray \{[\s\S]*?background: #eceae2/u)
  assert.match(styles, /\.workshop-continuous-field-yellow \{[\s\S]*?background: #fff0b4/u)
  assert.match(styles, /\.workshop-continuous-module \{[\s\S]*?min-height: 100dvh/u)
  assert.match(styles, /\.workshop-continuous-module \+ \.workshop-continuous-module \{ margin-top: -12dvh; \}/u)
  assert.doesNotMatch(styles, /background-color: #151515|workshop-slate-texture/u)
})

test('business interaction settles in 180-240ms and foreground objects cannot capture input', () => {
  assert.match(canvas, /root\.dataset\.canvasSettled = 'true'/u)
  assert.match(canvas, /pointerdown/u)
  assert.match(canvas, /focusin/u)
  assert.match(canvas, /control\.setPointerCapture\(event\.pointerId\)/u)
  assert.match(styles, /pointer-events: none/u)
  assert.match(styles, /transition: transform 220ms cubic-bezier/u)
  assert.match(styles, /\.workshop-runtime\[data-canvas-settled='true'\] \.workshop-continuous-foreground/u)
  assert.match(canvas, /dataset\.interactionSettled = 'true'/u)
  assert.match(canvas, /delete section\.dataset\.interactionSettled/u)
  assert.match(styles, /data-interaction-settled='true'/u)
  assert.match(styles, /\.workshop-shell \{[\s\S]*?background: transparent;/u)
  assert.match(styles, /\.workshop-runtime > \[data-workspace-layer='navigation'\] \{[\s\S]*?background: transparent;[\s\S]*?box-shadow: none;/u)
})

test('portrait keeps full motion layers and uses purpose-built trajectory geometry without overflow', () => {
  assert.match(progress, /viewportWidth < viewportHeight/u)
  assert.match(progress, /portrait \? 0\.64 : 0\.46/u)
  assert.match(progress, /viewportWidth < viewportHeight \? 0\.18 : 0\.12/u)
  assert.match(styles, /overflow-x: clip/u)
  assert.doesNotMatch(styles, /max-width: 390px/u)
  for (const marker of ['workshop-continuous-object', 'workshop-continuous-curve', 'workshop-continuous-trail', 'workshop-canvas-title']) {
    assert.match(styles, new RegExp(`\\.${marker}`, 'u'))
  }
})

test('six original transparent assets remain self-hosted and traceable', () => {
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

test('reduced motion and business reveal keep complete readable states', () => {
  const ledger = sourceOf('../apps/web/src/components/lookbook/RecordLedger.jsx')
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.workshop-continuous-module \{ opacity: 1; transform: none !important; \}/u)
  assert.match(styles, /\.workshop-continuous-foreground \{ display: none; \}/u)
  assert.match(motion, /data-reveal-group/u)
  assert.match(motion, /IntersectionObserver/u)
  assert.match(motion, /MutationObserver/u)
  assert.match(ledger, /data-reveal-group="records"/u)
  for (const forbidden of ['ScrollTrigger', 'perspective', 'rotationX', 'rotationY']) {
    assert.equal(motion.includes(forbidden), false)
  }
})
