import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const app = await readFile(new URL('../apps/web/src/App.jsx', import.meta.url), 'utf8')
const css = await readFile(new URL('../apps/web/src/styles/refinement.css', import.meta.url), 'utf8')

for (const layer of ['workspace-paper-film', 'workspace-paper-fibre', 'workspace-paper-scratches']) {
  test(`主工作台拥有 ${layer} 装饰层`, () => {
    assert.ok(app.includes(`<div className="${layer}" aria-hidden="true" />`))
  })
}

test('旧纸背景和标题磨损纹理只在就绪的登录工作台启用', () => {
  assert.match(css, /\.app-runtime\[data-ready='true'\] \{\n  --workspace-aged-paper: #EFEEEC;/u)
  assert.match(css, /\.app-runtime\[data-ready='true'\] \.workspace-paper-film/u)
  assert.match(css, /\.app-runtime\[data-ready='true'\] \.workspace-paper-fibre/u)
  assert.match(css, /\.app-runtime\[data-ready='true'\] \.workspace-paper-scratches/u)
  assert.match(css, /\.lookbook-shell :is\(h1, h2, \.title-translation, \.look-number, \.summary-copy > span/u)
  assert.match(css, /@media \(forced-colors: active\)/u)
  assert.doesNotMatch(css, /body\.is-booting[^\n]*workspace-paper/u)
})
