import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const jsx = readFileSync(new URL('../apps/web/src/components/pickup/PickupLedger.jsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../apps/web/src/styles/pickup-ledger.css', import.meta.url), 'utf8')

test('expanded pickup card reuses Add Pickup yellow and diffuse glow', () => {
  assert.match(css, /\.pickup-ledger-global-actions button:last-child \{[^}]*background: var\(--pickup-yellow\)/s)
  assert.match(css, /\.pickup-card\[data-expanded="true"\] \{[^}]*background: var\(--pickup-yellow\)[^}]*0 0 22px var\(--pickup-glow\), 0 7px 18px rgb\(64 55 34 \/ \.1\)/s)
})

test('pickup detail remains mounted with a content-sized natural reveal', () => {
  assert.doesNotMatch(jsx, /\{expanded \? <div className="pickup-card-detail"/)
  assert.match(jsx, /className="pickup-card-reveal" data-expanded=\{expanded \? 'true' : undefined\} aria-hidden=\{!expanded\} inert=\{!expanded\}/)
  assert.match(css, /grid-template-rows: 0fr/)
  assert.match(css, /grid-template-rows 520ms cubic-bezier\(\.22, 1, \.36, 1\)/)
  assert.match(css, /pickup-card-reveal\[data-expanded="true"\][^{]*\{[^}]*grid-template-rows: 1fr/s)
  assert.match(css, /prefers-reduced-motion: reduce/)
})

test('search and queue tools share one restrained control surface', () => {
  assert.match(css, /\.pickup-tool-row \{[^}]*background: rgb\(255 253 248 \/ \.86\)[^}]*box-shadow:/s)
  assert.match(css, /\.pickup-tool-row > button:focus-visible[^}]*rgb\(255 195 26 \/ \.17\)/s)
})
