import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const app = readFileSync(new URL('../apps/web/src/App.jsx', import.meta.url), 'utf8')
const hook = readFileSync(new URL('../apps/web/src/hooks/useActiveScene.js', import.meta.url), 'utf8')
const css = readFileSync(new URL('../apps/web/src/styles/workshop-system.css', import.meta.url), 'utf8')

test('all six Workshop modules remain mounted in normal document order', () => {
  assert.match(app, /import useActiveScene from '.\/hooks\/useActiveScene\.js'/)
  assert.doesNotMatch(app, /useStoryScroll/)
  let cursor = -1
  for (const id of ['pulse', 'pickup', 'poster', 'repair', 'resale', 'sales']) {
    const next = app.indexOf(`<WorkshopModuleSection sceneId="${id}"`)
    assert.ok(next > cursor, `expected ${id} after prior module`)
    cursor = next
  }
})

test('dock navigation uses native section scrolling and reduced-motion fallback', () => {
  assert.match(hook, /document\.getElementById\(`module-\$\{id\}`\)/)
  assert.match(hook, /scrollIntoView\(\{ behavior: reducedMotion\(\)/)
  assert.match(hook, /prefers-reduced-motion: reduce/)
})

test('module CSS is an ordinary vertical flow without switching transforms or snap', () => {
  const marker = css.indexOf('Normal vertical module flow')
  assert.ok(marker >= 0)
  const flow = css.slice(marker)
  assert.match(flow, /\.workshop-module-stack \{[\s\S]*display: flex;/)
  assert.match(flow, /flex-direction: column;/)
  assert.match(flow, /\.workshop-module-panel \{[\s\S]*position: relative;/)
  assert.match(flow, /scroll-snap-align: none;/)
  assert.match(flow, /\.workshop-module-flow-inner \{[\s\S]*transform: none;/)
  assert.doesNotMatch(flow, /rotate\(|scale\(|translate[XYZ]?\(|position: (?:fixed|absolute)/)
})
