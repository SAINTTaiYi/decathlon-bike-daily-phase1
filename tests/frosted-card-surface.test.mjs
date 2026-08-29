import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const read = (rel) => readFile(new URL(rel, import.meta.url), 'utf8')

const [tokens, frosted, mobileOverview, desktopWorkbench, workshopSystem, styleIndex] = await Promise.all([
  read('../apps/web/src/styles/tokens.css'),
  read('../apps/web/src/styles/frosted.css'),
  read('../apps/web/src/styles/mobile-overview.css'),
  read('../apps/web/src/styles/desktop-workbench.css'),
  read('../apps/web/src/styles/workshop-system.css'),
  read('../apps/web/src/styles/index.css'),
])

// 本轮六张玻璃卡。frosted.css 第 8 节是它们填充色的唯一所有者。
const GLASS_CARDS = [
  'ops-closing-card',
  'ops-sales-panel',
  'ops-index',
  'ops-pickup-board',
  'ops-release-strip',
  'ops-analytics-panel',
]

// 除 frosted.css 外的所有样式表：任何一处重新给这些卡片刷背景/阴影，
// 都会因为在层叠中更晚或特异性更高而把玻璃盖掉。
const OTHER_SHEETS = [
  ['mobile-overview.css', mobileOverview],
  ['desktop-workbench.css', desktopWorkbench],
  ['workshop-system.css', workshopSystem],
]

// 只取"以卡片本体为目标"的规则块。给卡片内部的后代元素（例如
// .ops-pickup-board > header > span 那个黑底徽章）上色是正常的，不算盖玻璃；
// 会盖玻璃的是选择器落在卡片自身上的那些块，包含裸类名与 :is() 组两种写法。
const bodyRulesFor = (sheet, card) => {
  const blocks = sheet.match(/[^{}]+\{[^}]*\}/gu) ?? []
  return blocks.filter((block) => {
    const selector = block.slice(0, block.indexOf('{'))
    if (!new RegExp(`\\.${card}\\b`, 'u').test(selector)) return false
    // 逐个逗号分支看：只要有一个分支正好以该卡片结尾（无后代/子元素），
    // 这条规则就作用在卡片本体上。
    return selector.split(',').some((branch) => {
      const trimmed = branch.trim().replace(/\)$/u, '')
      return new RegExp(`\\.${card}(?::[a-z-]+(?:\\([^)]*\\))?)?$`, 'u').test(trimmed)
    })
  })
}

// -- 事故背景（2026-08-29，同一根因第三次复发）-----------------------
// 上一轮报告「六项全部落地」，依据是产物 CSS 里三个玻璃 token 存在。
// token 确实在，但没有任何有效选择器用到它们：定义写在 mobile-overview.css
// 的 @media (min-width:0px) 块内，读起来像移动端专属，桌面规则于是挂了
// var(--token, var(--ops-card)) 的 fallback；同时另有七处无条件
// background: var(--ops-card)（实心）与一处 box-shadow 重置活在层叠更晚处。
// 结果桌面端玻璃从未生效。
//
// 所以下面的断言一律检查「有效选择器覆盖到目标元素 + 没有第二处声明能盖掉」，
// 而不是检查 token 是否存在。用户规则：改 UI 必须删旧样式，不许覆盖。

test('玻璃 token 定义在全局 token 层，且全仓库只有一处', () => {
  for (const token of ['--ops-card-translucent', '--ops-card-hairline', '--ops-card-edge']) {
    const declaration = new RegExp(`${token}\\s*:`, 'gu')
    assert.match(tokens, declaration, `${token} 必须定义在 tokens.css（全局层）`)

    for (const [name, sheet] of OTHER_SHEETS) {
      assert.equal(
        (sheet.match(declaration) ?? []).length,
        0,
        `${token} 不得在 ${name} 重复定义：多处定义就是上一轮桌面端拿到 fallback 的根因`,
      )
    }
  }

  // 定义必须在无条件 :root 里，不能再被裹进任何 @media。
  // 取真实声明行（而非注释里提到的词）所在位置，回看它前面的括号收支：
  // 若声明处仍在某个 @media 块内，未闭合的 { 会多于 }。
  const declAt = tokens.search(/^\s*--ops-card-translucent\s*:/mu)
  assert.ok(declAt > 0, '--ops-card-translucent 必须有真实声明行')
  const before = tokens.slice(0, declAt)
  const depth = (before.match(/\{/gu) ?? []).length - (before.match(/\}/gu) ?? []).length
  assert.equal(
    depth,
    1,
    '玻璃 token 必须直接写在顶层 :root 内（嵌套深度 1）；被裹进 @media 正是它读起来像移动端专属、桌面挂 fallback 的原因',
  )
})

test('token 引用不带 fallback，缺失就该暴露而不是静默回退成实心', () => {
  const sheets = [['frosted.css', frosted], ...OTHER_SHEETS]
  for (const [name, sheet] of sheets) {
    assert.equal(
      (sheet.match(/var\(--ops-card-translucent,/gu) ?? []).length,
      0,
      `${name} 不得给 --ops-card-translucent 挂 fallback：上一轮就是 fallback 把实心色伪装成正常渲染`,
    )
  }
})

test('六张卡的玻璃填充由 frosted.css 声明，且每个类名都真的被选中', () => {
  const section = frosted.slice(frosted.indexOf('8. Frosted content cards'))
  assert.ok(section.length > 0, 'frosted.css 必须有第 8 节玻璃卡规则')

  const glassRule = section.match(/\.ops-closing-card,[\s\S]*?\}/u)
  assert.ok(glassRule, '玻璃规则必须存在')
  const rule = glassRule[0]

  for (const card of GLASS_CARDS) {
    assert.match(rule, new RegExp(`\\.${card}\\b`, 'u'), `${card} 必须在玻璃选择器组里，否则该卡片拿不到玻璃`)
  }

  assert.match(rule, /background:\s*var\(--ops-card-translucent\)/u, '必须用半透明 token 作背景')
  assert.match(rule, /inset 0 1px 0 var\(--ops-card-hairline\)/u, '顶部高光是"磨砂"的观感来源')
  assert.match(rule, /inset 0 0 0 1px var\(--ops-card-edge\)/u, '暖色内描边')
})

test('除 frosted.css 外，无人再给这六张卡刷背景或阴影', () => {
  // 这条是本轮的核心回归：上两轮都是「新规则写了但被旧规则盖掉」。
  for (const [name, sheet] of OTHER_SHEETS) {
    for (const card of GLASS_CARDS) {
      for (const block of bodyRulesFor(sheet, card)) {
        const paintsBackground = /background\s*:/u.test(block)
        const paintsShadow = /box-shadow\s*:/u.test(block)
        assert.ok(
          !paintsBackground,
          `${name} 的 .${card} 又出现 background 声明，会盖掉玻璃：\n${block}\n必须删掉，不是靠 !important 压过去`,
        )
        assert.ok(
          !paintsShadow,
          `${name} 的 .${card} 又出现 box-shadow 声明，会抹掉高光与暖边：\n${block}\n必须删掉`,
        )
      }
    }
  }
})

test('实心 --ops-card 不再被用作这六张卡的背景', () => {
  for (const [name, sheet] of OTHER_SHEETS) {
    for (const card of GLASS_CARDS) {
      for (const block of bodyRulesFor(sheet, card)) {
        assert.ok(
          !/var\(--ops-card\)/u.test(block),
          `${name} 的 .${card} 仍引用实心 --ops-card：\n${block}`,
        )
      }
    }
  }
})

test('frosted.css 在样式入口里晚于两端样式表导入', () => {
  const order = (needle) => styleIndex.indexOf(needle)
  const frostedAt = order('frosted.css')
  assert.ok(frostedAt > 0, 'frosted.css 必须在 index.css 里被导入')
  assert.ok(frostedAt > order('mobile-overview.css'), 'frosted.css 应晚于 mobile-overview.css')
  assert.ok(frostedAt > order('desktop-workbench.css'), 'frosted.css 应晚于 desktop-workbench.css')
})

test('玻璃不靠 backdrop-filter，大面积滚动表面禁模糊', () => {
  // 只看规则本身，不看注释：注释里出现 "backdrop-filter" 是在解释为何不用它。
  // 第 8 节标题写在块注释内部，必须回退到注释起始的 "/*" 再切，
  // 否则残留的 "*/" 会让注释剥离失配、把说明文字当成规则读。
  const headingAt = frosted.indexOf('8. Frosted content cards')
  const sectionAt = frosted.lastIndexOf('/*', headingAt)
  const section = frosted.slice(sectionAt).replace(/\/\*[\s\S]*?\*\//gu, '')
  assert.equal(
    (section.match(/backdrop-filter/gu) ?? []).length,
    0,
    'blur 会让大表面每帧重栅格化并糊掉中文字形（动效规则第 ② 条）',
  )
  assert.equal((section.match(/scale\(/gu) ?? []).length, 0, '大面积表面禁 scale')
})

test('endfield 主题与强制高对比模式各自退出玻璃', () => {
  const section = frosted.slice(frosted.indexOf('8. Frosted content cards'))
  assert.match(section, /\[data-theme='endfield'\][\s\S]*?background:\s*var\(--ops-card\)/u, 'endfield 深色主题需退回实心')
  assert.match(section, /@media \(forced-colors: active\)/u, '强制高对比模式需退出玻璃')
})
