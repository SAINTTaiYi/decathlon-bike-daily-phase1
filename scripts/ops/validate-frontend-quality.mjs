import { readFile, readdir, stat } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import path from 'node:path'

const root = process.cwd()
const read = (relative) => readFile(path.join(root, relative), 'utf8')
const fail = (message) => { throw new Error(`FRONTEND QUALITY ERROR · ${message}`) }

const distAssets = path.join(root, 'apps/web/dist/assets')
const files = await readdir(distAssets)
const measure = async (extension) => {
  const names = files.filter((name) => name.endsWith(extension))
  if (!names.length) fail(`missing built ${extension} asset`)
  const rows = await Promise.all(names.map(async (name) => {
    const payload = await readFile(path.join(distAssets, name))
    return { name, bytes: payload.length, gzip: gzipSync(payload).length }
  }))
  return rows.sort((a, b) => b.gzip - a.gzip)[0]
}

const js = await measure('.js')
const css = await measure('.css')
if (js.gzip > 145 * 1024) fail(`largest JS gzip ${js.gzip} exceeds 145 KiB`)
if (css.gzip > 60 * 1024) fail(`largest CSS gzip ${css.gzip} exceeds 60 KiB`)

const distImages = path.join(root, 'apps/web/dist/images')
const imageNames = await readdir(distImages)
const forbiddenOverviewMedia = imageNames.filter((name) => /^workshop-head-/u.test(name) || name === 'signal-media-manifest.json')
if (forbiddenOverviewMedia.length) fail(`legacy figurative Overview media remains in build: ${forbiddenOverviewMedia.join(', ')}`)
const mediaBytes = 0

const html = await read('apps/web/index.html')
const app = await read('apps/web/src/App.jsx')
const base = await read('apps/web/src/styles/base.css')
const quality = await read('apps/web/src/styles/signal-grid-quality.css')
const sourceFiles = []
const walk = async (directory) => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) await walk(target)
    else if (/\.(?:jsx?|css|html)$/u.test(entry.name)) sourceFiles.push(target)
  }
}
await walk(path.join(root, 'apps/web/src'))
const source = (await Promise.all(sourceFiles.map((file) => readFile(file, 'utf8')))).join('\n')

if (/user-scalable\s*=\s*no|maximum-scale\s*=\s*1/iu.test(html)) fail('viewport blocks zoom')
if (!app.includes('className="skip-link" href="#main-content"')) fail('skip link does not target main content')
if (!app.includes('id="main-content" tabIndex="-1"')) fail('main content is not programmatically focusable')
if (/(?:tabIndex=\{?[1-9]|tabindex=["'][1-9])/u.test(source)) fail('positive tabindex found')
if (/<(?:div|span)\b[^>]*(?:onClick|role=["']button["'])/u.test(source)) fail('non-native interactive div/span found')
if (/<img\b(?![^>]*\balt=)[^>]*>/u.test(source)) fail('image without alt found')
if (!base.includes('prefers-reduced-motion: reduce')) fail('global reduced-motion fallback missing')
if (!quality.includes('prefers-contrast: more')) fail('high-contrast/strong-light layer missing')
if (!source.includes('forced-colors: active')) fail('forced-colors fallback missing')
if (!source.includes('--sg-p-touch-min: 44px')) fail('44px touch target token missing')
if (!source.includes('--visual-viewport-height')) fail('dynamic VisualViewport sizing missing')

console.log(JSON.stringify({
  ok: true,
  budgets: { js, css, signalMediaBytes: mediaBytes },
  audits: ['zoom', 'skip-link', 'tabindex', 'native-controls', 'image-alt', 'reduced-motion', 'high-contrast', 'forced-colors', 'touch-target', 'visual-viewport']
}, null, 2))
