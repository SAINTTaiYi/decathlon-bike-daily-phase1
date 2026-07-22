import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const app = await readFile(new URL('../apps/web/src/App.jsx', import.meta.url), 'utf8')
const css = await readFile(new URL('../apps/web/src/styles/signal-grid-shell.css', import.meta.url), 'utf8')

for (const layer of ['workspace-paper-film', 'workspace-paper-fibre', 'workspace-paper-scratches', 'workspace-depth-plane']) {
  test(`Phase 2 运行时不再渲染 ${layer}`, () => {
    assert.doesNotMatch(app, new RegExp(layer, 'u'))
  })
}

test('主工作台使用冷中性平面网格画布并保留 forced-colors 降级', () => {
  assert.match(css, /background-color: var\(--sg-color-canvas\)/u)
  assert.match(css, /background-size: 32px 32px/u)
  assert.match(css, /perspective: none/u)
  assert.match(css, /transform-style: flat/u)
  assert.match(css, /@media \(forced-colors: active\)/u)
})
