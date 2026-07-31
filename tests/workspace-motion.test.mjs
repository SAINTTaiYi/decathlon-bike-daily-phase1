import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync(new URL('../apps/web/src/App.jsx', import.meta.url), 'utf8')
const launch = readFileSync(new URL('../apps/web/src/hooks/useWorkspaceMotion.js', import.meta.url), 'utf8')
const navigation = readFileSync(new URL('../apps/web/src/hooks/useStaticSceneNavigation.js', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../apps/web/src/styles/workshop-system.css', import.meta.url), 'utf8')

test('top entry remains skippable while the authenticated workspace launches in static mode', () => {
  assert.match(app, /auth\.source === 'login'/u)
  assert.match(app, /staticMode: true/u)
  assert.match(app, /跳过入场动画/u)
  assert.match(launch, /if \(staticMode\)/u)
})

test('only the active semantic scene is mounted', () => {
  for (const id of ['pulse','pickup','poster','repair','resale','sales']) assert.match(app, new RegExp(`activeScene === '${id}'`, 'u'))
  assert.match(app, /workshop-scene-stage/u)
  assert.match(app, /workshop-scene-panel/u)
  assert.doesNotMatch(app, /ModuleSection|data-continuous-stack|data-continuous-module/u)
})

test('static navigation is hash-addressable and never derives scene from vertical scroll', () => {
  assert.match(app, /useStaticSceneNavigation/u)
  assert.match(navigation, /history\.pushState/u)
  assert.match(navigation, /history\.replaceState/u)
  assert.match(navigation, /addEventListener\('popstate'/u)
  assert.match(navigation, /behavior: 'auto'/u)
  assert.doesNotMatch(navigation, /addEventListener\('scroll'|IntersectionObserver|ResizeObserver|smooth/u)
})

test('continuous canvas, motion system and persistent dock are not mounted', () => {
  assert.doesNotMatch(app, /ContinuousCanvas|useContinuousCanvas|useMotionSystem|ActionDock|data-workspace-layer="dock"/u)
  assert.match(styles, /\[data-workspace-layer='dock'\],[\s\S]*\.look-dock \{ display: none !important; \}/u)
})

test('static scene panels have no negative runway, transform or transition contract', () => {
  const block = styles.slice(styles.indexOf('/* Static scene architecture:'), styles.length)
  assert.match(block, /\.workshop-scene-stage/u)
  assert.match(block, /\.workshop-scene-panel/u)
  assert.doesNotMatch(block, /margin-top:\s*-12dvh|transform:|transition:|animation:/u)
})
