import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('Ark Endfield scope is limited to the authenticated Overview and Pickup scene roots', async () => {
  const [pulse, pickup] = await Promise.all([
    read('../apps/web/src/scenes/PulseScene.jsx'),
    read('../apps/web/src/scenes/PickupScene.jsx')
  ])
  assert.match(pulse, /ark-endfield-overview/u)
  assert.match(pickup, /ark-endfield-pickup/u)
  for (const source of [pulse, pickup]) {
    assert.match(source, /data-ark-theme="endfield"/u)
    assert.match(source, /data-ark-depth="moderate"/u)
  }
})

test('Endfield surface is original, scoped, and has no external asset dependency', async () => {
  const [css, index] = await Promise.all([
    read('../apps/web/src/styles/ark-endfield-overview-pickup.css'),
    read('../apps/web/src/styles/index.css')
  ])
  assert.match(index, /ark-endfield-overview-pickup\.css/u)
  assert.ok(css.includes('--ark-signal: var(--sg-p-module-pickup)'))
  assert.match(css, /ark-endfield-overview .*signal-overview-primary/su)
  assert.match(css, /ark-endfield-pickup .*signal-record-ledger/su)
  assert.doesNotMatch(css, /url\(/u)
  assert.doesNotMatch(css, /animation:/u)
})

test('Pickup keeps the existing confirmation flow while its task layer protects entered values', async () => {
  const [dialog, pickupConfirm, css] = await Promise.all([
    read('../apps/web/src/components/dialogs/AppDialog.jsx'),
    read('../apps/web/src/components/dialogs/PickupConfirmDialog.jsx'),
    read('../apps/web/src/styles/ark-endfield-overview-pickup.css')
  ])
  assert.match(dialog, /data-signal-module=\{signalModule\}/u)
  assert.match(pickupConfirm, /signalModule="pickup"/u)
  assert.match(pickupConfirm, /onConfirm\(record, pickupCode\)/u)
  assert.match(css, /data-signal-module='pickup'.*dialog-panel/su)
})

test('Endfield presentation keeps forced-colors and reduced-motion fallbacks', async () => {
  const [css, glitchPrototype] = await Promise.all([
    read('../apps/web/src/styles/ark-endfield-overview-pickup.css'),
    read('../apps/web/src/styles/signal-grid-glitch-prototype.css')
  ])
  assert.match(css, /@media \(forced-colors: active\)/u)
  assert.match(css, /CanvasText/u)
  assert.match(glitchPrototype, /@media \(prefers-reduced-motion: reduce\)/u)
})
