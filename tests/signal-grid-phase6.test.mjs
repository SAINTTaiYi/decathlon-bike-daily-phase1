import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('Phase 6 keeps a zoom-safe viewport, native landmarks and a functional skip link', async () => {
  const [html, app] = await Promise.all([read('apps/web/index.html'), read('apps/web/src/App.jsx')])
  assert.match(html, /width=device-width, initial-scale=1\.0, viewport-fit=cover/u)
  assert.doesNotMatch(html, /user-scalable=no|maximum-scale=1/u)
  assert.match(app, /className="skip-link" href="#main-content">跳到主内容/u)
  assert.match(app, /<main className="lookbook-shell signal-workspace-canvas" id="main-content" tabIndex="-1"/u)
  assert.match(app, /<footer className="closing-footer">/u)
})

test('Phase 6 source has no positive tabindex, interactive div buttons or images without alt', async () => {
  const files = [
    'apps/web/src/App.jsx',
    'apps/web/src/components/BootLoader.jsx',
    'apps/web/src/components/ProjectSelect.jsx',
    'apps/web/src/components/dialogs/AppDialog.jsx',
    'apps/web/src/components/lookbook/MainHeadImage.jsx',
    'apps/web/src/components/lookbook/RecordLedger.jsx'
  ]
  const source = (await Promise.all(files.map(read))).join('\n')
  assert.doesNotMatch(source, /(?:tabIndex=\{?[1-9]|tabindex=["'][1-9])/u)
  assert.doesNotMatch(source, /<(?:div|span)\b[^>]*(?:onClick|role=["']button["'])/u)
  assert.doesNotMatch(source, /<img\b(?![^>]*\balt=)[^>]*>/u)
  assert.match(source, /<dialog/u)
  assert.match(source, /aria-labelledby/u)
})

test('Phase 6 supports 320px, dynamic browser chrome and 44px touch targets', async () => {
  const [base, refinement, shell, responsive, primitives] = await Promise.all([
    read('apps/web/src/styles/base.css'),
    read('apps/web/src/styles/refinement.css'),
    read('apps/web/src/styles/signal-grid-shell.css'),
    read('apps/web/src/styles/responsive.css'),
    read('apps/web/src/styles/signal-grid-primitives.css')
  ])
  assert.match(base, /html \{ min-width: 320px/u)
  assert.match(primitives, /--sg-p-touch-min: 44px/u)
  assert.match(shell, /var\(--visual-viewport-height, 100dvh\)/u)
  assert.match(refinement, /var\(--visual-viewport-bottom\)/u)
  assert.match(responsive, /@media \(max-width: 374px\)/u)
  assert.match(shell, /grid-template-columns: repeat\(6, minmax\(0, 1fr\)\)/u)
})

test('Phase 6 provides reduced-motion, forced-colors, increased-contrast and print fallbacks', async () => {
  const [base, shell, modules, operations, quality] = await Promise.all([
    read('apps/web/src/styles/base.css'),
    read('apps/web/src/styles/signal-grid-shell.css'),
    read('apps/web/src/styles/signal-grid-modules.css'),
    read('apps/web/src/styles/signal-grid-operations.css'),
    read('apps/web/src/styles/signal-grid-quality.css')
  ])
  assert.match(base, /@media \(prefers-reduced-motion: reduce\)/u)
  assert.match(shell, /@media \(forced-colors: active\)/u)
  assert.match(modules, /@media \(forced-colors: active\)/u)
  assert.match(operations, /animation: none/u)
  assert.match(quality, /@media \(prefers-contrast: more\)/u)
  assert.match(quality, /@media print/u)
  assert.match(quality, /outline: 3px solid var\(--sg-color-focus\)/u)
})

test('Phase 6 statuses and active navigation pair color with text, icon and structure', async () => {
  const [state, dock, moduleCss] = await Promise.all([
    read('apps/web/src/components/lookbook/SignalStateMark.jsx'),
    read('apps/web/src/components/lookbook/ActionDock.jsx'),
    read('apps/web/src/styles/signal-grid-modules.css')
  ])
  assert.match(state, /tone/u)
  assert.match(state, /data-signal-icon/u)
  assert.match(dock, /aria-current=\{active \? 'page'/u)
  assert.match(dock, /aria-label=\{cn\}/u)
  assert.match(moduleCss, /border-style: dashed/u)
  assert.match(moduleCss, /signal-state-mark\[data-tone='complete'\] svg/u)
})

test('Preview browser audit preserves Sales contrast and 44px production targets', async () => {
  const quality = await read('apps/web/src/styles/signal-grid-quality.css')
  assert.match(quality, /\.signal-sales-primary > span,[\s\S]*color: var\(--sg-p-color-surface\)/u)
  assert.match(quality, /\.signal-sales-primary \.signal-state-mark\[data-tone='pending'\][\s\S]*background: var\(--sg-p-color-surface\)[\s\S]*color: var\(--sg-p-color-ink\)/u)
  assert.match(quality, /\.active-user-strip button,[\s\S]*\.summary-next button,[\s\S]*\.text-action,[\s\S]*\.record-history-mark,[\s\S]*min-height: var\(--sg-touch-target\)/u)
  assert.match(quality, /\.record-history-mark \{[\s\S]*min-width: var\(--sg-touch-target\)[\s\S]*width: var\(--sg-touch-target\) !important[\s\S]*height: var\(--sg-touch-target\) !important/u)
})
