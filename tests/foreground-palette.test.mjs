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

test('status pills use pending, active and complete tonal grammar with a completed checkmark', async () => {
  const source = await read('../apps/web/src/components/lookbook/RecordLedger.jsx')
  const styles = await read('../apps/web/src/styles/refinement.css')
  assert.match(source, /function statusTone\(value\)/u)
  assert.match(source, /data-tone=\{tone\}/u)
  assert.match(source, /IconCheck width=\{12\}/u)
  assert.match(styles, /\.record-state\[data-tone='pending'\],[\s\S]*?--status-pending-border/u)
  assert.match(styles, /Pending labels are small text[\s\S]*?color: var\(--iridium\);/u)
  assert.match(styles, /\.record-state\[data-tone='active'\],[\s\S]*?--status-active-fill/u)
  assert.match(styles, /\.record-state\[data-tone='complete'\],[\s\S]*?--status-complete-fill/u)
})

test('legacy blue, orange, green and warm error literals are absent from active web styles', async () => {
  const styles = await Promise.all([
    read('../apps/web/src/styles/tokens.css'),
    read('../apps/web/src/styles/boot.css'),
    read('../apps/web/src/styles/components.css'),
    read('../apps/web/src/styles/refinement.css')
  ])
  const joined = styles.join('\n').toLowerCase()
  for (const legacy of ['#075dff', '#b53b18', '#17613c', '#ff9b78', '#ffb298', '#ffb4a2']) {
    assert.doesNotMatch(joined, new RegExp(legacy, 'u'))
  }
})
