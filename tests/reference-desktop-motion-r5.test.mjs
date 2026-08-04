import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const app = await readFile(new URL('../apps/web/src/App.jsx', import.meta.url), 'utf8')
const hook = await readFile(new URL('../apps/web/src/hooks/useDesktopSceneTransition.js', import.meta.url), 'utf8')
const dock = await readFile(new URL('../apps/web/src/components/lookbook/ActionDock.jsx', import.meta.url), 'utf8')
const css = await readFile(new URL('../apps/web/src/styles/desktop-workbench.css', import.meta.url), 'utf8')

test('desktop navigation uses the full reference labels while mobile keeps existing dock labels', () => {
  for (const label of ['待取车辆', '其它交接', '维修交接', '二手台账', '销售数据']) assert.ok(dock.includes(label))
  assert.ok(dock.includes('desktopLayout ? desktopLabels[id] : dock'))
  assert.match(css, /top: 112px !important/u)
  assert.match(css, /top: 764px;\n    left: 18px;/u)
})

test('desktop scene changes use one bold branded wipe and staggered directional entrances', () => {
  assert.ok(app.includes('useDesktopSceneTransition'))
  assert.ok(app.includes('desktop-scene-transition-wipe'))
  assert.match(app, /if \(desktopLayout\) \{\n      transitionToDesktopScene\(sceneId\)/u)
  assert.match(hook, /gsap\.timeline/u)
  assert.match(hook, /scaleX: 1/u)
  assert.match(hook, /clipPath/u)
  assert.match(hook, /stagger: \.055/u)
  assert.match(css, /background: var\(--ops-yellow\)/u)
  assert.match(css, /box-shadow: 18px 0 0 var\(--ops-black\)/u)
})

test('desktop motion is reduced-motion safe and the mobile scroll path remains direct', () => {
  assert.match(hook, /prefersReducedMotion\(\)/u)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/u)
  assert.match(app, /jumpTo\(sceneId\)/u)
  assert.doesNotMatch(hook, /preventDefault|wheel|touchmove/u)
})

test('every desktop card action row and both notice controls are compact at the far right', () => {
  assert.match(css, /\.pickup-card-actions \{ display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end;/u)
  assert.match(css, /\.pickup-notification-buttons \{ grid-column: 3; display: flex; justify-content: flex-end;/u)
  assert.match(css, /\.pickup-notification-buttons button \{ flex: 0 0 auto; width: auto; min-width: 142px; max-width: 170px;/u)
})
