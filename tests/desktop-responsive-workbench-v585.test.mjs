import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const css = await readFile(new URL('../apps/web/src/styles/desktop-workbench.css', import.meta.url), 'utf8')
const app = await readFile(new URL('../apps/web/src/App.jsx', import.meta.url), 'utf8')
const targetViewports = ['768×1024', '1024×768', '1280×720', '1366×768', '1440×900', '1536×864', '1920×1080']

test('V5.8.5 governs all requested desktop and tablet viewport classes without canvas zoom', () => {
  assert.equal(targetViewports.length, 7)
  assert.doesNotMatch(css, /zoom\s*:/u)
  assert.doesNotMatch(css, /width:\s*1536px/u)
  assert.doesNotMatch(app, /desktop-workbench-fit/u)
  for (const breakpoint of [768, 900, 1024, 1200, 1280, 1360, 1400, 1500]) {
    assert.match(css, new RegExp(`@media \\(min-width: ${breakpoint}px\\)`, 'u'))
  }
})

test('fixed responsive chrome leaves a native independently scrolling business viewport', () => {
  assert.match(css, /--ops-desktop-rail-width: 84px/u)
  assert.match(css, /inset: 156px 0 0 var\(--ops-desktop-rail-width\)/u)
  assert.match(css, /overflow-y: auto/u)
  assert.match(css, /overscroll-behavior: contain/u)
  assert.match(css, /@media \(min-width: 1024px\)[\s\S]*?--ops-desktop-rail-width: 262px/u)
  assert.match(css, /\.look-dock button span, \.look-dock button small \{ display: none; \}/u)
  assert.match(css, /@media \(min-width: 1024px\)[\s\S]*?\.look-dock button span \{ display: block;/u)
})

test('all six module families have governed responsive reflow rules', () => {
  assert.match(css, /ops-mobile-overview[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/u)
  assert.match(css, /ops-index ol[\s\S]*?repeat\(auto-fit, minmax\(168px, 1fr\)\)/u)
  assert.match(css, /pickup-queue-controls[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/u)
  assert.match(css, /pickup-ledger-table-head \{ display: none;/u)
  assert.match(css, /data-ledger-mode='pickup'[\s\S]*?grid-template-areas: 'index core status operation' 'index contact appointment operation'/u)
  assert.match(css, /closing-look \.sales-input-summary[\s\S]*?repeat\(2, minmax\(0, 1fr\)\)/u)
  assert.match(css, /record-row-head[\s\S]*?minmax\(130px, 34%\)/u)
})
