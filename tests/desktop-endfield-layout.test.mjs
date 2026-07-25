import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const desktopStylesheet = new URL('../apps/web/src/styles/desktop-endfield.css', import.meta.url)
const stylesheetIndex = new URL('../apps/web/src/styles/index.css', import.meta.url)

test('桌面 Endfield 布局只使用既有 1080px 断点且在 Endfield 层之后加载', async () => {
  const [desktopCss, indexCss] = await Promise.all([
    readFile(desktopStylesheet, 'utf8'),
    readFile(stylesheetIndex, 'utf8')
  ])

  assert.equal((desktopCss.match(/@media \(min-width: 1080px\)/gu) || []).length, 1)
  assert.doesNotMatch(desktopCss, /@media \(max-width:/u)
  assert.match(desktopCss, /\.workspace-pointer-plane/u)
  assert.match(desktopCss, /\.look-section/u)
  assert.match(desktopCss, /\.record-actions/u)
  assert.match(indexCss, /@import '\.\/endfield\.css';\n@import '\.\/desktop-endfield\.css';/u)
})
