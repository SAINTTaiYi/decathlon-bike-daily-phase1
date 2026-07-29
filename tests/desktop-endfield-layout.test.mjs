import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const stylesheet = new URL('../apps/web/src/styles/workshop-system.css', import.meta.url)
const stylesheetIndex = new URL('../apps/web/src/styles/index.css', import.meta.url)

test('桌面与平板使用同一 Workshop 主题并按断点重排，不加载第二套 Endfield 主题', async () => {
  const [css, indexCss] = await Promise.all([readFile(stylesheet, 'utf8'), readFile(stylesheetIndex, 'utf8')])
  assert.match(css, /@media \(min-width: 600px\)/u)
  assert.match(css, /@media \(min-width: 840px\)/u)
  assert.match(css, /@media \(min-width: 1200px\)/u)
  assert.match(css, /grid-template-columns: minmax\(220px,280px\) minmax\(0,1fr\)/u)
  assert.match(css, /\.record-actions/u)
  assert.match(indexCss, /@import '\.\/workshop-system\.css';/u)
  assert.doesNotMatch(indexCss, /endfield\.css|desktop-endfield\.css/u)
})
