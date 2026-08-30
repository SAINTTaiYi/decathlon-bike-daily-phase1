import test from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const SRC = fileURLToPath(new URL('../apps/web/src/', import.meta.url))

async function walk(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...await walk(full))
    else out.push(full)
  }
  return out
}

const files = await walk(SRC)
const code = files.filter((f) => /\.(jsx|js)$/.test(f))
const sheets = files.filter((f) => f.endsWith('.css'))

const codeText = (await Promise.all(code.map((f) => readFile(f, 'utf8')))).join('\n')
const cssText = (await Promise.all(sheets.map((f) => readFile(f, 'utf8')))).join('\n')

/**
 * 组件在 JSX style 属性或 setProperty 里注入的自定义属性，必须在 CSS 里被同名
 * 消费。重命名 CSS 侧（例如把 --pickup-pixel-size 收敛成 --ops-*）而漏改注入端
 * 会静默断链：动画不报错，只是尺寸算不出来。
 */
test('JS 注入的 CSS 变量都能在样式表里找到同名消费点', () => {
  const injected = new Set()
  for (const re of [/['"](--[a-z0-9-]+)['"]\s*:/g, /setProperty\(\s*['"](--[a-z0-9-]+)['"]/g]) {
    for (const m of codeText.matchAll(re)) injected.add(m[1])
  }
  assert.ok(injected.size > 0, '应至少发现一个注入变量，否则正则失效')

  const orphans = [...injected].filter((name) => !cssText.includes(`var(${name}`))
  assert.deepEqual(orphans, [], `这些变量被 JS 注入但没有 CSS 消费者：${orphans.join(', ')}`)
})

/** 反向：pickup 像素动画的两端必须同名（本轮 token 收敛的回归点）。 */
test('pickup 像素填充的注入端与消费端同名', () => {
  for (const name of ['--pickup-pixel-size', '--pickup-pixel-columns']) {
    assert.ok(codeText.includes(`'${name}'`), `${name} 应由组件注入`)
    assert.ok(cssText.includes(`var(${name})`), `${name} 应被 CSS 消费`)
  }
})
