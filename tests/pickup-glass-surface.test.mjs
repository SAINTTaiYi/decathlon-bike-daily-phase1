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

test('滚动的订单卡与输入控件不带 backdrop blur，只有板级容器带', () => {
  const tail = frosted.slice(frosted.indexOf('Pickup ledger:'))
  assert.match(tail, /backdrop-filter:\s*none/u, '缺少列表卡取消 blur 的规则')
  for (const sel of ['.pickup-card', '.pickup-search-field', '.pickup-sheet-tabs']) {
    assert.ok(tail.includes(sel), `${sel} 应在免 blur 名单内`)
  }
  // 板级容器保留 blur
  assert.match(pickup, /\.shiphub-pipeline\s*\{[^}]*backdrop-filter:\s*var\(--ops-card-glass-filter\)/u)
  assert.match(desktop, /\.pickup-ledger-board\s*\{[^}]*backdrop-filter:\s*var\(--ops-card-glass-filter\)/u)
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
