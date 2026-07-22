import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

const luminance = (hex) => {
  const channels = hex.match(/[0-9a-f]{2}/giu).map((channel) => Number.parseInt(channel, 16) / 255)
  const [red, green, blue] = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

const contrast = (foreground, background) => {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
  return (values[0] + 0.05) / (values[1] + 0.05)
}

test('Signal Grid defines primitive, semantic and component token layers', async () => {
  const [primitive, semantic, component, index] = await Promise.all([
    read('../apps/web/src/styles/signal-grid-primitives.css'),
    read('../apps/web/src/styles/signal-grid-semantic.css'),
    read('../apps/web/src/styles/signal-grid-components.css'),
    read('../apps/web/src/styles/index.css')
  ])
  assert.match(primitive, /--sg-p-module-overview:\s*#d7ff3f;/u)
  assert.match(primitive, /--sg-p-module-repair:\s*#18d8ff;/u)
  assert.match(primitive, /--sg-p-module-pickup:\s*#ffe247;/u)
  assert.match(primitive, /--sg-p-module-sales:\s*#7657ff;/u)
  assert.match(primitive, /--sg-p-module-resale:\s*#ff3d96;/u)
  assert.match(primitive, /--sg-p-module-closing:\s*#ff5a24;/u)
  assert.match(primitive, /--sg-p-signal-danger-strong:\s*#c9142b;/u)
  assert.ok(contrast('c9142b', 'ffffff') >= 4.5)
  assert.match(semantic, /--sg-color-focus:\s*var\(--sg-p-signal-sync\);/u)
  assert.match(semantic, /--sg-module-color:\s*var\(--sg-p-module-overview\);/u)
  assert.match(component, /--sg-c-action-primary-background:\s*var\(--sg-module-color\);/u)
  assert.match(component, /--sg-c-action-danger-background:\s*var\(--sg-color-danger-surface\);/u)
  assert.ok(index.indexOf("signal-grid-primitives.css") < index.indexOf("signal-grid-semantic.css"))
  assert.ok(index.indexOf("signal-grid-semantic.css") < index.indexOf("signal-grid-components.css"))
})

test('module theme registry covers all six modules plus neutral Other Handover', async () => {
  const [registry, scenes, dock] = await Promise.all([
    read('../apps/web/src/design/signalGrid.js'),
    read('../apps/web/src/data/lookbookScenes.js'),
    read('../apps/web/src/components/lookbook/ActionDock.jsx')
  ])
  for (const module of ['overview', 'pickup', 'other', 'repair', 'resale', 'sales', 'closing']) {
    assert.match(registry, new RegExp(`\\b${module}: moduleTheme\\(`, 'u'))
  }
  assert.match(registry, /other: moduleTheme\('other', 'Cool White \+ Voltage Lime', '--sg-p-color-surface'/u)
  assert.match(registry, /neutralStructure: true/u)
  assert.match(scenes, /signalModule: 'other'/u)
  assert.match(dock, /data-signal-module=\{signalModule\}/u)
})

test('Iconoir is one family with outline and filled state rules', async () => {
  const [registry, vite, dock, closing, ledger] = await Promise.all([
    read('../apps/web/src/design/signalGrid.js'),
    read('../apps/web/vite.config.js'),
    read('../apps/web/src/components/lookbook/ActionDock.jsx'),
    read('../apps/web/src/components/lookbook/ClosingSummary.jsx'),
    read('../apps/web/src/components/lookbook/RecordLedger.jsx')
  ])
  assert.match(vite, /'@iconoir-solid'.*dist\/esm\/solid/u)
  assert.match(registry, /navigation: Object\.freeze\(\{ variant: 'outline'/u)
  assert.match(registry, /navigationActive: Object\.freeze\(\{ variant: 'filled'/u)
  assert.match(registry, /semanticStatus: Object\.freeze\(\{ variant: 'filled'/u)
  assert.match(registry, /destructiveAction: Object\.freeze\(\{ variant: 'filled'/u)
  assert.match(dock, /const DockIcon = active \? ActiveNavIcon : NavIcon/u)
  assert.match(closing, /@iconoir-solid\/WarningTriangle\.mjs/u)
  assert.match(ledger, /@iconoir-solid\/CheckCircle\.mjs/u)
})

test('font foundation is self-hosted, license-tracked and avoids the legacy serif runtime import', async () => {
  const [fonts, semantic, sources, index] = await Promise.all([
    read('../apps/web/src/styles/signal-grid-fonts.css'),
    read('../apps/web/src/styles/signal-grid-semantic.css'),
    read('../apps/web/public/fonts/SOURCES.md'),
    read('../apps/web/src/styles/index.css')
  ])
  assert.match(fonts, /\/fonts\/albert-sans\/albert-sans-variable\.woff2/u)
  assert.match(fonts, /font-display:\s*swap/u)
  assert.doesNotMatch(semantic, /Barlow Condensed|Noto Sans SC/u)
  assert.match(sources, /685123f02baf3d077e46af89c765789e47ae9e6a4a873ddccfe713f3a189eac1/u)
  assert.match(sources, /SIL Open Font License 1\.1/u)
  assert.doesNotMatch(index, /noto-serif-sc\.css/u)
})
