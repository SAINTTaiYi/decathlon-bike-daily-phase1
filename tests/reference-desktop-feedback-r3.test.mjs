import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const css = await readFile(new URL('../apps/web/src/styles/desktop-workbench.css', import.meta.url), 'utf8')

test('desktop operations index uses full desktop line boxes', () => {
  assert.match(css, /\.ops-index button > span strong \{ font-size: 16px; line-height: 20px; \}/u)
  assert.match(css, /\.ops-index button > em \{[^}]*font-size: 13px; line-height: 18px;/u)
  assert.match(css, /\.ops-index button > b \{[^}]*font-size: 45px; line-height: 1;/u)
})

test('desktop left rail clears the complete navigation header stack', () => {
  assert.match(css, /--ops-header-height: 156px/u)
  assert.match(css, /\.look-dock \{[\s\S]*?top: 112px !important;/u)
  assert.match(css, /\.look-dock::after \{[^}]*top: 90px;[^}]*left: 261px;/u)
  assert.doesNotMatch(css, /\.workshop-runtime > \[data-workspace-layer='navigation'\] \{[^}]*box-shadow: 0 1px 0/u)
})

test('queue metrics have independent number and label rows', () => {
  assert.match(css, /\.pickup-module-count span \{ grid-template-rows: 34px 16px;[^}]*line-height: 16px; \}/u)
  assert.match(css, /\.pickup-module-count b \{ display: block; font-size: 34px; line-height: 34px; \}/u)
})

test('shared desktop ledger cards use compact actions and a continuous collapsed-row frame', () => {
  assert.match(css, /\.pickup-card-frame:not\(\[data-expanded='true'\]\) \{ overflow: hidden; border: 1px solid[^}]*border-radius: 8px; \}/u)
  assert.match(css, /\.pickup-card-frame:not\(\[data-expanded='true'\]\) \.pickup-card \{ height: auto; border: 0; border-radius: 0;/u)
  assert.match(css, /\.pickup-card-actions \{ display: flex; flex-wrap: wrap;[^}]*justify-content: flex-end;/u)
  assert.match(css, /\.pickup-card-actions > \.pickup-card-more \{ flex: 0 0 auto; width: auto; min-width: 148px; max-width: 220px; \}/u)
  assert.match(css, /\.pickup-card-actions \.pickup-primary-action \{ grid-column: auto; min-width: 190px; \}/u)
  assert.match(css, /\.pickup-notification-buttons \{ grid-column: 3; display: flex; justify-content: flex-end;/u)
})
