import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const dir = new URL('../apps/web/src/styles/', import.meta.url)
const read = (f) => readFile(new URL(f, dir), 'utf8')

const [frosted, pickup, desktop, system, tokens] = await Promise.all([
  read('frosted.css'), read('pickup-ledger.css'),
  read('desktop-workbench.css'), read('workshop-system.css'), read('tokens.css'),
])
const all = { frosted, pickup, desktop, system }

// 待取车面上所有该穿玻璃的容器
const GLASS = [
  '.pickup-card', '.pickup-ledger-intro', '.pickup-empty-state',
  '.pickup-completed-today', '.pickup-queue-summary', '.pickup-search-field',
  '.pickup-filter-sheet', '.pickup-sheet-tabs', '.pickup-ledger-board',
]

test('玻璃填充只由 frosted.css 一处持有，其余文件不得再刷实心卡背景', () => {
  for (const sel of GLASS) {
    // frosted 必须选中它
    const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    assert.match(frosted, new RegExp(esc + '[,\\s]', 'u'), `frosted.css 未覆盖 ${sel}`)

    // 其它文件不得给同一选择器再赋实心卡背景
    for (const [name, css] of Object.entries(all)) {
      if (name === 'frosted') continue
      const dupe = new RegExp(esc + '\\s*(,[^{]*)?\\{[^}]*background:\\s*var\\(--ops-(card|page)\\)', 'u')
      assert.doesNotMatch(css, dupe, `${name}.css 又给 ${sel} 刷了实心背景，会盖掉玻璃`)
    }
  }
})

test('待取车相关 CSS 不得引用未定义的遗留 token', () => {
  // 这四个 token 全仓库没有定义，靠 fallback 静默回退实心是 memory 28 的病根
  for (const dead of ['--ops-ink', '--ops-muted', '--ops-paper', '--ops-surface-sunken']) {
    for (const [name, css] of Object.entries(all)) {
      assert.doesNotMatch(css, new RegExp('var\\(' + dead + '[\\s,)]', 'u'),
        `${name}.css 仍在引用未定义 token ${dead}`)
    }
  }
})

test('玻璃 token 单一定义在 tokens.css，且引用处不得带 fallback', () => {
  for (const t of ['--ops-card-translucent', '--ops-card-hairline', '--ops-card-edge']) {
    const defs = (tokens.match(new RegExp('^\\s*' + t + ':', 'gmu')) || []).length
    assert.equal(defs, 1, `${t} 应在 tokens.css 恰好定义一次，实际 ${defs}`)
    for (const [name, css] of Object.entries(all)) {
      assert.doesNotMatch(css, new RegExp('var\\(' + t + '\\s*,', 'u'),
        `${name}.css 给 ${t} 加了 fallback，token 缺失会被静默掩盖`)
    }
  }
})

test('待取车面上任何容器都不带 backdrop blur，板级容器也不例外', () => {
  // 板级容器曾保留 blur（"只有大容器带、滚动卡不带"），但待取车板本身就在
  // 滚动流里，滚动时同样逐帧重栅格。玻璃感全部由半透明 + 高光 + 暖边承担。
  for (const [name, css] of Object.entries(all)) {
    const hits = (css.match(/backdrop-filter:\s*var\(--ops-card-glass-filter\)/gu) || []).length
    assert.equal(hits, 0, `${name}.css 仍有 ${hits} 处卡面 backdrop-filter`)
  }
  for (const sel of ['.shiphub-pipeline', '.pickup-ledger-board']) {
    const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    for (const [name, css] of Object.entries(all)) {
      const rule = css.match(new RegExp(esc + '\\s*(,[^{]*)?\\{[^}]*\\}', 'u'))
      if (rule) assert.doesNotMatch(rule[0], /backdrop-filter/u, `${name}.css 的 ${sel} 仍带 blur`)
    }
  }
})

test('workshop-system.css 不得把 box-shadow 重置掉玻璃的高光与暖边', () => {
  const block = system.slice(system.indexOf('.pickup-card,'), system.indexOf('.pickup-card,') + 400)
  assert.doesNotMatch(block, /box-shadow:\s*var\(--ops-card-shadow\)/u,
    'pickup 容器组又把 box-shadow 重置成纯投影，玻璃内高光会消失')
})

test('endfield 与 forced-colors 都有完整退出路径', () => {
  for (const sel of GLASS) {
    const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    assert.match(frosted, new RegExp("\\[data-theme='endfield'\\]\\s*" + esc + '[,\\s]', 'u'),
      `${sel} 缺 endfield 退出`)
  }
  const fc = frosted.slice(frosted.indexOf('@media (forced-colors: active)'))
  for (const sel of GLASS) assert.ok(fc.includes(sel), `${sel} 缺 forced-colors 退出`)
})

// 回归：卡面是 --ops-card-translucent 半透明后，任何铺在它下层的绝对定位面
// 都不能再靠「被不透明卡片盖住」来隐藏，必须自带显式隐藏。
// 事故：左滑删除层 .pickup-delete-reveal 整块红底常显于移动端与桌面端。
test('半透明卡下的左滑删除层必须自带显式隐藏，不靠卡片遮盖', () => {
  const decl = pickup.match(/\.pickup-delete-reveal\s*\{[^}]*\}/u)
  assert.ok(decl, '.pickup-delete-reveal 声明缺失')
  const body = decl[0]

  assert.match(body, /opacity:\s*0/u, '删除层默认必须 opacity:0')
  assert.match(body, /visibility:\s*hidden/u,
    '删除层默认必须 visibility:hidden，否则不可见时仍会被键盘 Tab 聚焦')
  assert.match(body, /pointer-events:\s*none/u, '删除层默认必须 pointer-events:none')

  // 卡面确实是半透明的 —— 前提成立才谈得上这条约束
  const card = pickup.match(/\.pickup-card\s*\{[^}]*\}/u)
  assert.ok(card, '.pickup-card 声明缺失')
  assert.match(card[0], /background:\s*var\(--ops-card-translucent\)/u,
    '卡面应为半透明 token；若改回实心需重新评估本约束')
})

test('删除层仅在 data-delete-open 时显现', () => {
  const open = pickup.match(
    /\.pickup-card-frame\[data-delete-open='true'\]\s+\.pickup-delete-reveal\s*\{[^}]*\}/u)
  assert.ok(open, '缺少 [data-delete-open=true] 下的显现规则，删除层将永久不可见')
  assert.match(open[0], /opacity:\s*1/u)
  assert.match(open[0], /visibility:\s*visible/u)
  assert.match(open[0], /pointer-events:\s*auto/u)
})
