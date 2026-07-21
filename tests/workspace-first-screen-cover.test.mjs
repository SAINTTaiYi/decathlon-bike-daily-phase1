import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const app = await readFile(new URL('../apps/web/src/App.jsx', import.meta.url), 'utf8')
const css = await readFile(new URL('../apps/web/src/styles/refinement.css', import.meta.url), 'utf8')

test('首屏封面只包裹刊头、身份、闭店摘要和版本说明', () => {
  const coverStart = app.indexOf('<section className="workspace-first-screen" data-workspace-cover')
  const coverEnd = app.indexOf('</section>\n            <MainHeadImage />', coverStart)
  assert.ok(coverStart >= 0)
  assert.ok(coverEnd > coverStart)
  const cover = app.slice(coverStart, coverEnd)
  assert.match(cover, /<LookbookHeader \/>/u)
  assert.match(cover, /className="active-user-strip"/u)
  assert.match(cover, /<ClosingSummary /u)
  assert.match(cover, /<ReleaseNotes \/>/u)
  assert.doesNotMatch(cover, /<MainHeadImage \/>|<PulseScene|<PickupScene|<RepairScene|<ResaleScene|<SalesScene/u)
})

test('首屏封面使用抽象工程构图、稀疏黄点和 Forced Colors 回退', () => {
  assert.match(css, /\.workspace-first-screen\[data-workspace-cover\]/u)
  assert.match(css, /--cover-signal-yellow: #ece000/u)
  assert.match(css, /radial-gradient\(circle at 75% 61%/u)
  assert.match(css, /@media \(forced-colors: active\)/u)
  assert.doesNotMatch(css, /workspace-first-screen[^\n]*url\(/u)
})
