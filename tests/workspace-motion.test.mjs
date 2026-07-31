import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync(new URL('../apps/web/src/App.jsx', import.meta.url), 'utf8')
const hook = readFileSync(new URL('../apps/web/src/hooks/useObsidianAssemblyScroll.js', import.meta.url), 'utf8')
const launch = readFileSync(new URL('../apps/web/src/hooks/useWorkspaceMotion.js', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../apps/web/src/styles/workshop-system.css', import.meta.url), 'utf8')

test('top entry is skippable and restores the animated assembly profile', () => {
  assert.match(app, /auth\.source === 'login'/u)
  assert.match(app, /staticMode: false/u)
  assert.match(app, /跳过入场动画/u)
  assert.match(launch, /if \(staticMode\)/u)
})

test('all six semantic modules remain mounted in one native vertical stack', () => {
  for (const id of ['pulse','pickup','poster','repair','resale','sales']) assert.match(app, new RegExp(`<ModuleSection sceneId="${id}"`, 'u'))
  assert.match(app, /data-assembly-stack="true"/u)
  assert.match(app, /data-assembly-module="true"/u)
  assert.doesNotMatch(app, /activeScene === '(?:pulse|pickup|poster|repair|resale|sales)' \?/u)
})

test('one passive requestAnimationFrame runtime derives active scene from native scrolling', () => {
  assert.match(app, /useObsidianAssemblyScroll/u)
  assert.match(hook, /requestAnimationFrame/u)
  assert.match(hook, /addEventListener\('scroll', sync, \{ passive: true \}\)/u)
  assert.match(hook, /viewportHeight \* 0\.42/u)
  assert.match(hook, /history\.pushState/u)
  assert.match(hook, /history\.replaceState/u)
  assert.doesNotMatch(hook, /preventDefault|ScrollTrigger|scroll-snap|position:\s*sticky/u)
})

test('the full-page S trajectory and Overview mineral share bounded scroll variables', () => {
  assert.match(app, /workshop-assembly-line-layer/u)
  assert.match(app, /assembly-s-line-base/u)
  assert.match(app, /assembly-s-line-tracer/u)
  for (const variable of ['--assembly-line-x','--assembly-line-y','--assembly-line-dash','--assembly-ore-x','--assembly-ore-y','--assembly-ore-rotation','--assembly-ore-scale']) assert.match(hook + styles, new RegExp(variable, 'u'))
  assert.match(styles, /stroke-dasharray: \.15 \.85/u)
  assert.match(styles, /prefers-reduced-motion: reduce/u)
})

test('deterministic Obsidian Assembly characters reveal while the persistent dock stays absent', () => {
  assert.match(app, /AssemblyText/u)
  assert.match(hook, /IntersectionObserver/u)
  assert.match(styles, /data-assembly-char/u)
  assert.match(styles, /skew\(10deg,18deg\) scale\(1\.38\)/u)
  assert.doesNotMatch(app, /ActionDock|data-workspace-layer="dock"/u)
})
