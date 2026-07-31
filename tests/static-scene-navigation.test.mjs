import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('all scenes remain mounted and hash navigation follows the native vertical document', async () => {
  const [app, navigation] = await Promise.all([read('apps/web/src/App.jsx'), read('apps/web/src/hooks/useObsidianAssemblyScroll.js')])
  assert.match(app, /useObsidianAssemblyScroll/u)
  assert.doesNotMatch(app, /ActionDock|useStaticSceneNavigation/u)
  for (const id of ['pulse','pickup','poster','repair','resale','sales']) assert.match(app, new RegExp(`<ModuleSection sceneId="${id}"`, 'u'))
  assert.match(navigation, /history\.pushState/u)
  assert.match(navigation, /history\.replaceState/u)
  assert.match(navigation, /addEventListener\('popstate'/u)
  assert.match(navigation, /addEventListener\('scroll', sync, \{ passive: true \}\)/u)
  assert.doesNotMatch(navigation, /preventDefault|scroll-snap|ScrollTrigger/u)
})

test('Overview edge cards use intentional horizontal swipe thresholds with click fallback', async () => {
  const [overview, css] = await Promise.all([read('apps/web/src/components/overview/WorkshopOverviewPage.jsx'), read('apps/web/src/styles/mobile-overview.css')])
  assert.match(overview, /function SwipeSceneCard/u)
  assert.match(overview, /Math\.abs\(deltaX\) < 48/u)
  assert.match(overview, /Math\.abs\(deltaX\) <= Math\.abs\(deltaY\) \* 1\.25/u)
  assert.match(overview, /direction="right"[\s\S]*onJump\('repair'\)/u)
  assert.match(overview, /direction="left"[\s\S]*onJump\('pickup'\)/u)
  assert.match(overview, /onClick=\{\(\) =>/u)
  assert.match(css, /\.poster-photo \{ touch-action: pan-y; \}/u)
  assert.doesNotMatch(css, /transition|animation|@keyframes/u)
})

test('Figure 2 Pickup page uses real queue data in a static hero and keeps all ledger handlers', async () => {
  const [scene, ledger, css, app] = await Promise.all([read('apps/web/src/scenes/PickupScene.jsx'), read('apps/web/src/components/pickup/PickupLedger.jsx'), read('apps/web/src/styles/pickup-ledger.css'), read('apps/web/src/App.jsx')])
  assert.match(scene, /records\.filter\(\(record\) => !record\.pickedUpToday\)\.length/u)
  assert.match(scene, /String\(waiting\)\.padStart\(2, '0'\)/u)
  assert.match(scene, /String\(picked\)\.padStart\(2, '0'\)/u)
  assert.match(scene, /obsidian-orange-cut-900\.webp/u)
  for (const marker of ['pickup-reference-hero','pickup-chapter','pickup-hero-status','pickup-tool-row','pickup-ledger-intro','pickup-card-grid']) assert.match(scene + ledger + css, new RegExp(marker, 'u'))
  for (const prop of ['onAdd','onEdit','onRemove','onHistory','onPickup','onPickupNotificationChange']) assert.match(app + ledger, new RegExp(prop, 'u'))
  assert.match(ledger, /waitingDefault\(records\)/u)
  assert.doesNotMatch(ledger + css, /IntersectionObserver|data-entering|pickup-card-enter|@keyframes|animation\s*:|transition\s*:/u)
})
