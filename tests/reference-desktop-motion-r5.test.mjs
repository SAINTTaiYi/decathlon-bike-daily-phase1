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
  assert.match(css, /top: 168px !important/u)
  assert.match(css, /top: 764px;\n    left: 18px;/u)
})

test('desktop scene changes use Amicro zoom-in entrances without the full-screen yellow wipe', () => {
  assert.ok(app.includes('useDesktopSceneTransition'))
  // 2026-08-28 黄色 wipe 已按用户要求移除
  assert.ok(!app.includes('desktop-scene-transition-viewport'))
  assert.ok(!app.includes('desktop-scene-transition-wipe'))
  assert.match(app, /if \(desktopLayout\) \{\n      transitionToDesktopScene\(sceneId\)/u)
  assert.match(hook, /gsap\.timeline/u)
  assert.ok(!hook.includes('scaleX: 1'))
  assert.ok(!hook.includes('clipPath'))
  // 旧面板退场 + 新面板 blur/3D zoom-in 入场 + stagger
  assert.match(hook, /autoAlpha: 0, x: direction \* -24/u)
  // 文字安全 fade-up：面板只动 x/y/opacity（scale/rotateX/blur 会让文字重栅格化抽搐）
  assert.match(hook, /\{ autoAlpha: \.01, x: direction \* 34, y: 14 \}/u)
  assert.doesNotMatch(hook, /rotateX:|transformPerspective:/u)
  assert.match(hook, /stagger: \.04/u)
  assert.match(hook, /ease: 'expo\.out'/u)
  assert.ok(!css.includes('background: var(--ops-yellow);\n    box-shadow: 18px 0 0 var(--ops-black)'))
})

test('desktop motion is reduced-motion safe and the mobile scroll path remains direct', () => {
  assert.match(hook, /prefersReducedMotion\(\)/u)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/u)
  assert.match(app, /jumpTo\(sceneId\)/u)
  assert.doesNotMatch(hook, /preventDefault|wheel|touchmove/u)
})

test('every desktop card action row and both notice controls are compact at the far right', () => {
  assert.match(css, /\.pickup-card-actions \{ display: flex; flex-wrap: nowrap; align-items: center; justify-content: flex-start;/u)
  assert.match(css, /\.pickup-notification-buttons \{ grid-column: 3; display: flex; justify-content: flex-end;/u)
  assert.match(css, /\.pickup-notification-buttons button \{ flex: 0 0 auto; width: auto; min-width: 142px; max-width: 170px;/u)
})


test('scene transition CSS leaves no wipe surface while the right business region keeps its geometry', () => {
  assert.ok(!css.includes('.desktop-scene-transition-viewport'))
  assert.ok(!css.includes('.desktop-scene-transition-wipe'))
  assert.match(css, /\.workshop-runtime\[data-desktop-scene-transitioning='true'\] :is\(\.workshop-module-header, \.workshop-module-panel\) \{[\s\S]*?will-change: transform, opacity;/u)
  assert.match(css, /\.workshop-module-header \{[\s\S]*?margin-left: 262px;/u)
  assert.match(css, /\.look-dock::after \{[^}]*top: 156px;[^}]*left: 261px;/u)
})


test('global header and complete left rail remain spatially fixed during scene changes', () => {
  assert.doesNotMatch(hook, /activeButton|look-dock button\[data-active/u)
  assert.doesNotMatch(css, /look-dock button\[data-active='true'\] \{ transform:/u)
  assert.doesNotMatch(css, /data-desktop-scene-transitioning='true'[^}]*look-dock/u)
  assert.ok(hook.includes("const headerItems = [...root.querySelectorAll('.workshop-module-header > *')]") )
  assert.doesNotMatch(hook, /workshop-global-header/u)
})
