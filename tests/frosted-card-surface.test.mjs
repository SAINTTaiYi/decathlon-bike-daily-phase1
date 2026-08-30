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

// 本轮九张玻璃卡。frosted.css 第 8 节是它们填充色的唯一所有者。
// 上一轮漏了后四个：.ops-analytics-panel 只是网格里的一层容器，真正带背景的
// 是数据健康度 / 业务趋势外框与趋势内卡，所以它们在整轮玻璃化里始终是实心的。
const GLASS_CARDS = [
  'ops-closing-card',
  'ops-sales-panel',
  'ops-index',
  'ops-pickup-board',
  'ops-release-strip',
  'ops-analytics-panel',
  'ops-health-panel',
  'ops-trends-panel',
  'ops-trend-card',
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

test('除 frosted.css 外，无人再给这九张卡刷背景或阴影', () => {
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

test('模糊必须走可调 token（能一键归零），大面积表面仍禁 scale', () => {
  // 本轮起卡面带 backdrop-filter：模糊是玻璃质感的本体，用户要求先看一版。
  // 但 memory 22 ② 的顾虑（大表面模糊糊中文字形）依然成立，所以约束从
  // 「禁止模糊」改成「模糊必须可调」——半径走 --ops-glass-blur，PaletteLab
  // 能实时拖到 0px 关掉，不必改代码重新部署一轮。
  // 第 8 节标题写在块注释内部，必须回退到注释起始的 "/*" 再切，
  // 否则残留的 "*/" 会让注释剥离失配、把说明文字当成规则读。
  const headingAt = frosted.indexOf('8. Frosted content cards')
  const sectionAt = frosted.lastIndexOf('/*', headingAt)
  const section = frosted.slice(sectionAt).replace(/\/\*[\s\S]*?\*\//gu, '')

  assert.match(
    section,
    /backdrop-filter:\s*var\(--ops-card-glass-filter\)/u,
    '模糊必须引用可调 token，不能写死 blur(20px)',
  )
  const hardCoded = section.match(/backdrop-filter:\s*blur\(/gu) ?? []
  assert.equal(hardCoded.length, 0, '不允许硬编码模糊半径，否则 PaletteLab 调不动')
  assert.match(tokens, /--ops-card-glass-filter:\s*blur\(var\(--ops-glass-blur\)\)/u)
  assert.equal((section.match(/scale\(/gu) ?? []).length, 0, '大面积表面禁 scale')
})

test('endfield 主题与强制高对比模式各自退出玻璃', () => {
  const section = frosted.slice(frosted.indexOf('8. Frosted content cards'))
  assert.match(section, /\[data-theme='endfield'\][\s\S]*?background:\s*var\(--ops-card\)/u, 'endfield 深色主题需退回实心')
  assert.match(section, /@media \(forced-colors: active\)/u, '强制高对比模式需退出玻璃')
})

// ---------------------------------------------------------------------------
// 第 9 节：环境黄光的可见性链路
//
// 事故回顾：.workspace-environment 曾是 z-index:-1，被 .workshop-runtime 的实心
// --ops-page 背景 + isolation:isolate 压在下面，整片弥散光斑完全不可见，卡片的
// backdrop-filter 采样不到暖色所以看着像实心，PaletteLab 调玻璃参数也毫无反应。
// 一个根因造成四条独立的视觉投诉。
//
// 更棘手的是「实心底色」有四个来源，且用词不统一（--ops-page 三处、--paper 一处），
// 按单一关键词 grep 必然漏。这里按选择器枚举全部内容容器，杜绝第五处。
// ---------------------------------------------------------------------------

const [layoutCss, flatTokens, refinement] = await Promise.all([
  read('../apps/web/src/styles/layout.css'),
  read('../apps/web/src/styles/flat-tokens.css'),
  read('../apps/web/src/styles/refinement.css'),
])

const ALL_STYLE_SOURCES = [
  ['workshop-system.css', workshopSystem],
  ['layout.css', layoutCss],
  ['flat-tokens.css', flatTokens],
  ['refinement.css', refinement],
  ['mobile-overview.css', mobileOverview],
  ['desktop-workbench.css', desktopWorkbench],
]

// 注释里出现的 CSS 片段（例如说明文档里引用的选择器）会被正则当成真规则，
// 所以先剥掉 /* ... */ 再解析。用等长空白替换以保持偏移可读。
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))

const declBlocks = (css) => {
  const out = []
  const re = /([^{}]+)\{([^{}]*)\}/g
  let m
  while ((m = re.exec(stripComments(css)))) out.push({ selector: m[1].trim(), body: m[2] })
  return out
}

test('环境层不得使用负 z-index（否则被祖先背景盖死）', () => {
  const blocks = declBlocks(workshopSystem).filter(
    (b) => b.selector.includes('.workspace-environment') && /z-index\s*:/.test(b.body),
  )
  assert.ok(blocks.length > 0, '.workspace-environment 必须显式声明 z-index')
  for (const b of blocks) {
    const value = /z-index\s*:\s*(-?\d+)/.exec(b.body)?.[1]
    assert.ok(value != null, `无法解析 z-index: ${b.selector}`)
    assert.ok(
      Number(value) >= 0,
      `${b.selector} 的 z-index 为 ${value}；负值会把环境层推到祖先背景之下，黄光将不可见`,
    )
  }
})

test('内容容器不得有不透明底色（会挡住背后的环境黄光）', () => {
  // 这些容器都在环境层之上。它们刷任何不透明色都会把弥散光完全遮死。
  const CONTENT_SHELLS = ['.workshop-runtime', '.lookbook-shell', '.workshop-shell']
  const OPAQUE = /background(?:-color)?\s*:\s*(var\(--(?:ops-page|paper|ops-card|card)\)|#[0-9a-f]{3,8}|rgb\(|white|hsl\()/i

  const offenders = []
  for (const [file, css] of ALL_STYLE_SOURCES) {
    for (const { selector, body } of declBlocks(css)) {
      const targets = selector.split(',').map((s) => s.trim())
      // 只看容器自身（可带属性/伪类限定），不看后代 —— 后代如模块工具条本就该有底色
      const hitsShell = targets.some((target) =>
        CONTENT_SHELLS.some((shell) => {
          if (!target.startsWith(shell)) return false
          const rest = target.slice(shell.length)
          return rest === '' || /^[[:.]/.test(rest.split(' ')[0]) && !rest.includes(' ')
        }),
      )
      if (!hitsShell) continue
      const match = OPAQUE.exec(body)
      if (match) offenders.push(`${file} :: ${selector} -> ${match[0]}`)
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `内容容器带不透明底色，环境黄光会被遮住：\n${offenders.join('\n')}`,
  )
})


/* 2026-08-30：此处原有两条断言要求桌面左侧栏选中项「必须保留实心黑底」，
 * 是对 bug 的误诊。「总览」看不见的真因是几何遮挡：.workshop-shell-header
 * 桌面高 156px、z-index 80，而 .look-dock 是 z-index 2 且 top 只有 112px，
 * 第一格被磨砂背板整块盖住。当时给它补黑底，只是把被遮的那块画成了可见黑条。
 * 真修法是把 rail 推到 156px 之下，选中态回归「黄图标 + 黄文字」的双端共享设计。
 * 几何约束与单一来源现由 tests/desktop-rail-occlusion.test.mjs 保护。 */

test("销售车辆卡上半区不得刷不透明底色（否则整卡看起来是实心的）", () => {
  // 2026-08-30 回归：玻璃收敛只处理了 .ops-sales-panel 外壳，卡内上半区
  // .ops-sales-primary 仍有两处无条件实心填充（mobile-overview.css 的
  // var(--ops-black) 与后面覆盖它的 var(--ops-card)），刷在半透明外壳之上，
  // 于是这张卡在任何视口都渲染成实心奶白。两处已删除，不是被覆盖。
  const OPAQUE = /background(?:-color)?\s*:\s*(var\(--(?:ops-black|ops-card|ops-page|paper|card)\)|#[0-9a-f]{3,8}|rgb\(|white|hsl\()/i
  const offenders = []
  for (const [file, css] of [["mobile-overview.css", mobileOverview], ["desktop-workbench.css", desktopWorkbench], ["workshop-system.css", workshopSystem], ["frosted.css", frosted]]) {
    for (const { selector, body } of declBlocks(css)) {
      const targets = selector.split(",").map((s) => s.trim())
      // 只看 .ops-sales-primary 自身，后代（黄点 .ops-sales-label i 等）不算
      const hitsSelf = targets.some((target) => {
        const idx = target.indexOf(".ops-sales-primary")
        if (idx === -1) return false
        return !target.slice(idx + ".ops-sales-primary".length).includes(" ")
      })
      if (!hitsSelf) continue
      const match = OPAQUE.exec(body)
      if (match) offenders.push(`${file} :: ${selector} -> ${match[0]}`)
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `.ops-sales-primary 带不透明底色，销售车辆卡会渲染成实心：\n${offenders.join("\n")}`,
  )
})
