import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const app = readFileSync(new URL('../apps/web/src/App.jsx', import.meta.url), 'utf8')
const hook = readFileSync(new URL('../apps/web/src/hooks/useActiveScene.js', import.meta.url), 'utf8')
const baseCss = readFileSync(new URL('../apps/web/src/styles/workshop-system.css', import.meta.url), 'utf8')
const desktopCss = readFileSync(new URL('../apps/web/src/styles/desktop-workbench.css', import.meta.url), 'utf8')

test('five active Workshop modules remain mounted in mobile document order; Used is not an independent module', () => {
  assert.match(app, /import useActiveScene from '.\/hooks\/useActiveScene\.js'/)
  assert.doesNotMatch(app, /useStoryScroll/)
  let cursor = -1
  for (const id of ['pulse', 'pickup', 'poster', 'repair', 'sales']) {
    const next = app.indexOf(`<WorkshopModuleSection sceneId="${id}"`)
    assert.ok(next > cursor, `expected ${id} after prior module`)
    cursor = next
  }
  assert.equal((app.match(/<WorkshopModuleSection sceneId=/gu) || []).length, 5)
  assert.doesNotMatch(app, /<WorkshopModuleSection sceneId="resale"/u)
  assert.match(app, /['\/used', '\/resale']/u)
})

test('mobile navigation continues to use native section scrolling and reduced-motion fallback', () => {
  assert.match(hook, /document\.getElementById\(`module-\$\{id\}`\)/)
  assert.match(hook, /scrollIntoView\(\{ behavior: reducedMotion\(\)/)
  assert.match(hook, /prefers-reduced-motion: reduce/)
})

test('mobile flow stays ordinary and desktop switches boards only at the explicit reference breakpoint', () => {
  const marker = baseCss.indexOf('Normal vertical module flow')
  assert.ok(marker >= 0)
  const flow = baseCss.slice(marker)
  assert.match(flow, /\.workshop-module-stack \{[\s\S]*display: flex;/)
  assert.match(flow, /flex-direction: column;/)
  assert.match(flow, /\.workshop-module-panel \{[\s\S]*position: relative;/)
  assert.match(flow, /scroll-snap-align: none;/)
  assert.match(flow, /\.workshop-module-flow-inner \{[\s\S]*transform: none;/)
  assert.doesNotMatch(flow, /rotate\(|scale\(|translate[XYZ]?\(|position: (?:fixed|absolute)/)
  assert.match(desktopCss, /@media \(min-width: 1024px\)/u)
  assert.match(desktopCss, /workshop-shell\[data-desktop-scene='pickup'\]/u)
  assert.match(desktopCss, /\.workshop-module-panel \{ display: none !important;/u)
})
