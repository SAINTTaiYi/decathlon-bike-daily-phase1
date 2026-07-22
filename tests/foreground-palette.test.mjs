import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('foreground palette keeps the established page backgrounds while defining the approved five-color system', async () => {
  const tokens = await read('../apps/web/src/styles/tokens.css')
  assert.match(tokens, /--void:\s*#141616;/u)
  assert.match(tokens, /--iridium:\s*#3d3c38;/u)
  assert.match(tokens, /--artillery:\s*#746d67;/u)
  assert.match(tokens, /--equilibrium:\s*#a49f9d;/u)
  assert.match(tokens, /--falu-red:\s*#7f1d1a;/u)
  assert.match(tokens, /--paper:\s*#f4f5f0;/u)
  assert.match(tokens, /--paper-cool:\s*#e7e9de;/u)
  assert.match(tokens, /--accent:\s*var\(--falu-red\);/u)
  assert.match(tokens, /--critical:\s*var\(--falu-red\);/u)
})

test('primary actions are tonal Falu Red while destructive commitment remains stronger', async () => {
  const styles = await read('../apps/web/src/styles/refinement.css')
  assert.match(styles, /Business CTAs are tonal red/u)
  assert.match(styles, /\.record-actions \.record-primary-action \{[\s\S]*?background: var\(--primary-tint\) !important;/u)
  assert.match(styles, /\.danger-action,[\s\S]*?background: var\(--falu-red\) !important;/u)
  assert.match(styles, /\.record-swipe-delete-action \{[\s\S]*?background: var\(--falu-red\);/u)
  assert.doesNotMatch(styles, /--action-blue/u)
})

test('core-module state marks use the Signal Grid pending, active, complete and danger grammar', async () => {
  const [ledger, state, styles] = await Promise.all([
    read('../apps/web/src/components/lookbook/RecordLedger.jsx'),
    read('../apps/web/src/components/lookbook/SignalStateMark.jsx'),
    read('../apps/web/src/styles/signal-grid-modules.css')
  ])
  assert.match(ledger, /function statusTone\(value\)/u)
  assert.match(ledger, /<SignalStateMark tone=\{stateTone\}>/u)
  assert.match(state, /data-tone=\{tone\}/u)
  assert.match(state, /@iconoir-solid\/CheckCircle\.mjs/u)
  assert.match(styles, /\.signal-state-mark\[data-tone='pending'\]/u)
  assert.match(styles, /\.signal-state-mark\[data-tone='active'\]/u)
  assert.match(styles, /\.signal-state-mark\[data-tone='complete'\]/u)
  assert.match(styles, /\.signal-state-mark\[data-tone='danger'\]/u)
})

test('legacy blue, orange, green and warm error literals are absent from active web styles', async () => {
  const styles = await Promise.all([
    read('../apps/web/src/styles/tokens.css'),
    read('../apps/web/src/styles/components.css'),
    read('../apps/web/src/styles/refinement.css')
  ])
  const joined = styles.join('\n').toLowerCase()
  for (const legacy of ['#075dff', '#b53b18', '#17613c', '#ff9b78', '#ffb298', '#ffb4a2']) {
    assert.doesNotMatch(joined, new RegExp(legacy, 'u'))
  }
})
