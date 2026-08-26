import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const jsx = readFileSync(new URL('../apps/web/src/components/pickup/PickupLedger.jsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../apps/web/src/styles/pickup-ledger.css', import.meta.url), 'utf8')

test('Add Pickup and the entire expanded card share one opaque action yellow', () => {
  assert.match(css, /--pickup-action-yellow: var\(--ops-yellow, #ff5a28\)/)
  assert.match(css, /pickup-ledger-global-actions button:last-child,\s*\n\.pickup-ledger \.pickup-card-frame\[data-expanded='true'\] \.pickup-card \{[^}]*background-color: var\(--pickup-action-yellow\)[^}]*background-image: none[^}]*opacity: 1/s)
  assert.match(css, /pickup-card-frame\[data-expanded='true'\] \.pickup-card-(?:summary|detail)[^{]*[\s\S]*background: transparent/)
  assert.match(css, /0 0 22px var\(--pickup-glow\), 0 7px 18px rgb\(64 55 34 \/ \.1\)/)
})

test('pickup detail uses intrinsic grid interpolation instead of measured pixel height', () => {
  assert.doesNotMatch(jsx, /detail\.scrollHeight/)
  assert.doesNotMatch(jsx, /transitionend/)
  assert.match(jsx, /ref=\{revealRef\} className="pickup-card-reveal"/)
  assert.match(jsx, /className="pickup-card-reveal-inner"/)
  assert.match(jsx, /ref=\{detailRef\} className="pickup-card-detail"/)
  assert.match(css, /grid-template-rows 360ms cubic-bezier\(\.16, 1, \.3, 1\)/)
  assert.match(css, /\.pickup-card-reveal \{[\s\S]*?grid-template-rows: 0fr;/)
  assert.match(css, /prefers-reduced-motion: reduce/)
})

test('search and queue tools retain the cohesive shared control surface', () => {
  assert.match(css, /\.pickup-tool-row \{[^}]*background: rgb\(255 253 248 \/ \.86\)[^}]*box-shadow:/s)
})


test('collapse keeps detail composition stable and synchronizes summary geometry', () => {
  assert.ok(css.includes('nth-child(-n + 2)'))
  assert.ok(css.includes('section:nth-child(2) { display: none; }'))
  assert.doesNotMatch(css, /data-expanded='true'\] \.pickup-card-detail section:first-child/)
  assert.match(css, /\.pickup-card-summary \{[^}]*min-height 360ms cubic-bezier\(\.16, 1, \.3, 1\)[^}]*padding-bottom 360ms cubic-bezier\(\.16, 1, \.3, 1\)/s)
})


test('every expanded Pickup and repair card has the Add Pickup-style outer halo', () => {
  assert.match(css, /\.pickup-ledger \.pickup-card-frame\[data-expanded='true'\] \{[\s\S]*drop-shadow\(0 0 18px[\s\S]*drop-shadow\(0 0 42px/u)
  assert.match(css, /\.pickup-ledger \.pickup-card-frame\[data-expanded='true'\]::after \{[\s\S]*box-shadow:[\s\S]*0 0 54px 18px/u)
  assert.match(css, /\.pickup-ledger \.pickup-card\[data-expanded='true'\] \{[\s\S]*background: var\(--pickup-action-yellow[\s\S]*box-shadow: none/u)
  assert.match(css, /\.pickup-ledger \.pickup-card\[data-expanded='true'\]::before \{[\s\S]*content: none/u)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*pickup-card-frame\[data-expanded='true'\]::after/u)
})
