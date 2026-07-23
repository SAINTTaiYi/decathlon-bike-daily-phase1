import test from 'node:test'
import assert from 'node:assert/strict'
import { access, readFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

const luminance = (hex) => {
  const channels = hex.match(/[0-9a-f]{2}/giu).map((channel) => Number.parseInt(channel, 16) / 255)
  const [red, green, blue] = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

const verifyManifest = async (directory) => {
  const root = new URL(`../apps/web/public/fonts/${directory}/`, import.meta.url)
  const manifest = await readFile(new URL('SHA256SUMS', root), 'utf8')
  const entries = manifest.trim().split('\n').map((line) => {
    const [hash, file] = line.trim().split(/\s+/, 2)
    return { hash, file }
  })
  for (const { hash, file } of entries) {
    const content = await readFile(new URL(file, root))
    assert.equal(createHash('sha256').update(content).digest('hex'), hash, `${directory}/${file}`)
  }
  return entries
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
  assert.match(dock, /<b>\{label\}<\/b>/u)
  assert.doesNotMatch(dock, /NavIcon|ActiveNavIcon|DockIcon/u)
  assert.match(closing, /@iconoir-solid\/WarningTriangle\.mjs/u)
  assert.match(ledger, /@iconoir-solid\/CheckCircle\.mjs/u)
})

test('font foundation is self-hosted, license-tracked and removes the inactive serif payload', async () => {
  const [fonts, notoCss, semantic, sources, index, html, legacyTokens, reportSource, albertEntries, barlowEntries, notoEntries] = await Promise.all([
    read('../apps/web/src/styles/signal-grid-fonts.css'),
    read('../apps/web/src/styles/signal-grid-noto-sans-sc.css'),
    read('../apps/web/src/styles/signal-grid-semantic.css'),
    read('../apps/web/public/fonts/SOURCES.md'),
    read('../apps/web/src/styles/index.css'),
    read('../apps/web/index.html'),
    read('../apps/web/src/styles/tokens.css'),
    read('../apps/web/src/utils/closingReportImage.js'),
    verifyManifest('albert-sans'),
    verifyManifest('barlow-condensed'),
    verifyManifest('noto-sans-sc')
  ])
  assert.match(fonts, /\/fonts\/albert-sans\/albert-sans-latin-wght-normal\.woff2/u)
  assert.match(fonts, /barlow-condensed-latin-900-italic\.woff2/u)
  assert.match(fonts, /Barlow Condensed Local/u)
  assert.equal((fonts.match(/font-display:\s*swap/gu) || []).length, 7)
  assert.equal((notoCss.match(/@font-face/gu) || []).length, 101)
  assert.match(notoCss, /font-family:\s*'Noto Sans SC Variable'/u)
  assert.match(notoCss, /\/fonts\/noto-sans-sc\/noto-sans-sc-/u)
  assert.doesNotMatch(notoCss, /url\(\.\/files\//u)
  assert.match(semantic, /--sg-font-display-latin:\s*'Barlow Condensed Local'/u)
  assert.match(semantic, /--sg-font-ui:.*'Noto Sans SC Variable'/u)
  assert.match(sources, /@fontsource-variable\/albert-sans@5\.3\.0/u)
  assert.match(sources, /@fontsource\/barlow-condensed@5\.3\.0/u)
  assert.match(sources, /@fontsource-variable\/noto-sans-sc@5\.3\.0/u)
  assert.match(sources, /e58cf04e6c49037815a6c608c9961bb23195662eaa98c06cf8951d61b4b8ac28/u)
  assert.match(sources, /759fcdd25df64b4ef41653808d849cdb9ba0a520999032ceb137ce035a17e2ea/u)
  assert.match(sources, /3191e5a03a66f62d46064d1eabb6749366a5f2a142c0c901c59c69425c4d2f20/u)
  assert.equal(albertEntries.length, 3)
  assert.equal(barlowEntries.length, 6)
  assert.equal(notoEntries.length, 102)
  assert.doesNotMatch(index, /noto-serif-sc\.css/u)
  assert.match(html, /\/fonts\/albert-sans\/albert-sans-latin-wght-normal\.woff2/u)
  assert.doesNotMatch(legacyTokens, /Noto Serif SC Variable/u)
  assert.match(reportSource, /Noto Sans SC Variable/u)
  assert.match(reportSource, /Barlow Condensed Local/u)
  assert.doesNotMatch(reportSource, /Noto Serif SC Variable|noto-serif-sc/u)
  await assert.rejects(access(new URL('../apps/web/src/styles/noto-serif-sc.css', import.meta.url)))
  await assert.rejects(readdir(new URL('../apps/web/public/fonts/noto-serif-sc/', import.meta.url)))
})
