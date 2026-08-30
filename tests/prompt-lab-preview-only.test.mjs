import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

/**
 * PromptLab 是 preview-only 调试面板：能重放更新公告与 Shiphub 重连弹窗。
 * 两条底线：绝不出现在 workshop.skin；类名必须有样式落地（否则渲染成裸按钮，
 * 与 memory 里 shiphub-pipeline-sync 零声明是同一类事故）。
 */
const LAB = new URL('../apps/web/src/components/PromptLab.jsx', import.meta.url)
const CSS = new URL('../apps/web/src/styles/prompt-lab.css', import.meta.url)
const INDEX_CSS = new URL('../apps/web/src/styles/index.css', import.meta.url)
const APP = new URL('../apps/web/src/App.jsx', import.meta.url)

test('仅 preview / localhost 渲染，绝不出现在生产域名', async () => {
  const source = await readFile(LAB, 'utf8')
  assert.ok(/isPreviewHost/u.test(source), '必须复用共享的 preview 门控')
  assert.ok(
    /if \(!isPreviewHost\(\)\) return null/u.test(source),
    '门控必须是提前 return null，不能只是隐藏样式'
  )
})

test('只碰 localStorage 记账键，不调接口、不伪造版本号', async () => {
  const source = await readFile(LAB, 'utf8')
  assert.ok(!/fetch\(/u.test(source), '调试面板不得发起网络请求')
  assert.ok(!/setItem\(/u.test(source), '不得写入伪造值，只允许清除记账键')
  assert.ok(/removeItem\(/u.test(source), '需要通过 removeItem 清空记账键')
  for (const key of [
    'workshop.ledger.seen-app-version',
    'workshop.ledger.dismissed-remote-version',
    'workshop.ledger.shiphub-reconnect-prompt'
  ]) {
    assert.ok(source.includes(key), `需覆盖记账键 ${key}`)
  }
})

test('清掉当天记账后能重放：需重置 hook 的会话内记账', async () => {
  const lab = await readFile(LAB, 'utf8')
  assert.ok(/onResetReconnect\?\.\(\)/u.test(lab), '清键后必须通知 hook 重置')

  const app = await readFile(APP, 'utf8')
  assert.ok(
    /<PromptLab onResetReconnect=\{shiphubReconnectPrompt\.reset\}/u.test(app),
    'App 必须把 hook 的 reset 接给调试面板'
  )

  const hook = await readFile(
    new URL('../apps/web/src/hooks/useShipHubReconnectPrompt.js', import.meta.url),
    'utf8'
  )
  const reset = hook.slice(hook.indexOf('const reset = useCallback'))
  assert.ok(
    /markedRef\.current = ''/u.test(reset.slice(0, 220)),
    'reset 必须清掉 markedRef，否则本会话无法重放'
  )
})

test('每个类名都有样式落地，不渲染成裸元素', async () => {
  const jsx = await readFile(LAB, 'utf8')
  const css = await readFile(CSS, 'utf8')

  const classNames = new Set()
  for (const match of jsx.matchAll(/className="([^"]+)"/gu)) {
    for (const name of match[1].split(/\s+/u)) if (name) classNames.add(name)
  }
  assert.ok(classNames.size >= 8, `应至少有 8 个类名，实际 ${classNames.size}`)

  // 只用 includes 会被后代选择器蒙过去：删掉 `.x {}` 但留着 `.x dt {}`，
  // 字符串仍然命中，而元素其实已经没有自己的样式。要求类名作为选择器
  // 复合项的末段出现（允许尾随属性/伪类），才算它本体被定型。
  const selectorText = css.replace(/\/\*[\s\S]*?\*\//gu, '')
  const styledSelf = new Set()
  for (const match of selectorText.matchAll(/([^{}]+)\{/gu)) {
    for (const selector of match[1].split(',')) {
      const trimmed = selector.trim()
      if (!trimmed || trimmed.startsWith('@')) continue
      const last = trimmed.split(/[\s>+~]+/u).filter(Boolean).pop()
      if (!last) continue
      for (const cls of last.matchAll(/\.([A-Za-z0-9_-]+)/gu)) styledSelf.add(cls[1])
    }
  }

  const missing = [...classNames].filter((name) => !styledSelf.has(name))
  assert.deepEqual(missing, [], `以下类名没有自己的样式规则：${missing.join(', ')}`)
})

test('样式表已在 index.css 注册', async () => {
  const index = await readFile(INDEX_CSS, 'utf8')
  assert.ok(/@import '\.\/prompt-lab\.css';/u.test(index), 'prompt-lab.css 必须被导入')
})

test('面板与 PaletteLab 触发按钮不重叠', async () => {
  const css = await readFile(CSS, 'utf8')
  const palette = await readFile(new URL('../apps/web/src/styles/palette-lab.css', import.meta.url), 'utf8')

  const bottomOf = (source, selector) => {
    const at = source.indexOf(`${selector} {`)
    if (at === -1) return null
    const block = source.slice(at, source.indexOf('}', at))
    const match = /bottom:\s*calc\((\d+)px/u.exec(block) || /bottom:\s*(\d+)px/u.exec(block)
    return match ? Number(match[1]) : null
  }

  const promptBottom = bottomOf(css, '.prompt-lab-trigger')
  const paletteBottom = bottomOf(palette, '.palette-lab-trigger')
  assert.ok(promptBottom !== null && paletteBottom !== null, '两个触发按钮都应声明 bottom')
  assert.notEqual(promptBottom, paletteBottom, '两个悬浮按钮不得处于同一高度')
})

test('单列容器声明可收缩轨道（横向溢出防线）', async () => {
  const css = await readFile(CSS, 'utf8')
  const blocks = css.split('}')
  for (const block of blocks) {
    if (!/display:\s*grid/u.test(block)) continue
    assert.ok(
      /grid-template-columns:\s*minmax\(0/u.test(block),
      `grid 容器缺少 minmax(0,…) 轨道：${block.trim().slice(0, 60)}`
    )
  }
})
