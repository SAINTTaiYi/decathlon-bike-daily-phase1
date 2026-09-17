import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

// 桌面端顶面：页头 + 次页头 + 左栏必须读成一整块（2026-09-18 用户反馈）
//
// 用户原话：「桌面端取消背景黄色弥散光源」「导航栏，次页头，和页头之间的
// 间隔太割裂了，不够融合，有阶梯感」。
//
// 两条根因，两条断言：
//   1. 桌面被 Crextio 环境光斑铺成黄雾，页头磨砂把这层暖色吸进来，于是
//      「页头暖、页面冷」的横向色带把三块切成阶梯 → 桌面必须隐藏光斑，
//      移动端必须保留。
//   2. 页头磨砂的 L 形 mask 自带三条硬边 → 已换成单块全宽带（断言搬去
//      desktop-rail-occlusion.test.mjs，这里只守住「不得回潮」）。

const read = (name) => readFile(new URL(`../apps/web/src/styles/${name}`, import.meta.url), 'utf8')

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//gu, '')

const desktopBlock = (css) => {
  const start = css.indexOf('@media (min-width: 768px)')
  assert.ok(start >= 0, '找不到桌面断点块')
  let depth = 0
  for (let i = css.indexOf('{', start); i < css.length; i += 1) {
    if (css[i] === '{') depth += 1
    else if (css[i] === '}') {
      depth -= 1
      if (depth === 0) return css.slice(start, i + 1)
    }
  }
  return css.slice(start)
}

test('桌面端隐藏黄色弥散光源，移动端保留', async () => {
  const desktop = stripComments(await read('desktop-workbench.css'))
  const block = desktopBlock(desktop)
  assert.match(
    block,
    /\.workshop-runtime \.env-blob \{ display: none; \}/u,
    '桌面断点内必须隐藏 .env-blob（黄弥散光源）',
  )
  // 光斑的几何/令牌仍归 workshop-system.css 与 tokens.css，移动端照旧
  const sys = stripComments(await read('workshop-system.css'))
  assert.match(sys, /\.workshop-runtime \.env-blob \{/u, '移动端光斑基础规则必须保留')
  assert.match(sys, /\.workshop-runtime \.env-blob-a \{/u, '移动端光斑几何必须保留')
  assert.doesNotMatch(desktop, /^\.env-blob \{ display: none; \}/mu, '隐藏只能写在桌面断点内')
})

test('光斑不渲染时不再挂漂移/视差补间（桌面空转）', async () => {
  const hook = await readFile(new URL('../apps/web/src/hooks/useEnvironmentMotion.js', import.meta.url), 'utf8')
  assert.match(
    hook,
    /if \(getComputedStyle\(blobs\[0\]\)\.display === 'none'\) return undefined/u,
    '桌面隐藏光斑后必须提前退出，pointermove 上不该再跑 quickTo',
  )
})

test('桌面：dock 层必须高于导航层（否则 rail 第一项被磨砂糊住）', async () => {
  // 2026-09-18 用户截图「总览按钮被遮住了」：rail 的 .look-dock 层内 z-index 是 90，
  // 但它住在 dock 层里（原 z-index 1），而导航层是 80 —— 层内 z-index 出不了层的
  // 堆叠上下文，所以 rail 上移到 top:100px 后落进 156px 页头磨砂范围内被糊掉。
  // 实测：第一项（黄色选中态）最暗蓝通道 139、色散 84（被洗），修好后 89 / 148.7。
  const desktop = desktopBlock(stripComments(await read('desktop-workbench.css')))
  const raise = desktop.match(/\.workshop-runtime > \[data-workspace-layer='dock'\] \{ z-index: (\d+); \}/u)
  assert.ok(raise, '桌面断点内必须把 dock 层提到导航层之上')
  const navZ = Number((await read('workshop-system.css')).match(/\[data-workspace-layer='navigation'\] \{[^}]*z-index: (\d+)/u)[1])
  assert.ok(Number(raise[1]) > navZ, `dock 层 ${raise[1]} 必须高于导航层 ${navZ}`)
  // 层内 z-index 不算数：这条规则不能退化成只改 .look-dock 自己的 z-index
  assert.doesNotMatch(desktop, /\.look-dock \{[\s\S]{0,200}?z-index: 9\d/u, '提到层上，不是给 .look-dock 换 z-index')
})

test('桌面玻璃用页面底色（导航栏不得再有淡黄色），移动端保持暖白', async () => {
  // 用户 2026-09-18：「导航栏为什么感觉有一层淡淡的黄色背景」。
  // --glass-tint 的暖白是给移动端黄色环境光斑调的；桌面端光斑已隐藏，
  // 暖白就只剩下「冷灰页面上糊一层米黄」。
  const css = stripComments(await read('frosted.css'))
  const base = css.match(/:root \{\s*--glass-tint: ([\d ]+);\s*\}/u)
  assert.ok(base, '找不到 --glass-tint 的基础定义')
  assert.equal(base[1].trim(), '250 248 241', '移动端（暖色环境光斑之上）必须保持暖白玻璃')
  const desktop = desktopBlock(css)
  const override = desktop.match(/:root \{ --glass-tint: ([\d ]+); \}/u)
  assert.ok(override, '桌面断点内必须覆盖 --glass-tint')
  assert.equal(override[1].trim(), '244 245 247', '桌面玻璃必须用页面底色 #f4f5f7，否则又是一条淡黄色带')
  // 页面底色与玻璃底色必须同源，改一个忘一个就会露馅。
  // 桌面端 --ops-page 住在 flat-tokens.css（workshop-system 的 #f7f5ef 是移动端/基座值）。
  const flat = stripComments(await read('flat-tokens.css'))
  assert.match(flat, /--ops-page: #f4f5f7;/u, '--ops-page 变了就要同步 --glass-tint')
})

test('页头磨砂是单块全宽：无 L 形分臂、底部羽化、且不抢模块标题背板', async () => {
  const css = stripComments(await read('frosted.css'))
  // 只找桌面断点内那一份：frosted.css 前几节还有移动端同名的 ::before 背板
  const desktop = desktopBlock(css)
  const before = desktop.match(/\[data-workspace-layer='navigation'\]::before \{([^}]*)\}/u)
  assert.ok(before, '找不到桌面页头 ::before')
  const body = before[1].replace(/\s+/gu, ' ')
  assert.doesNotMatch(body, /262px/u, '不得再按 x=262 分臂')
  assert.match(body, /mask-image: linear-gradient\( to bottom,/u, '必须是单块纵向渐变 mask')
  const stops = [...body.matchAll(/#000 (\d+)%|rgb\(0 0 0 \/ \.(\d+)\) (\d+)%|transparent 100%/gu)]
  assert.ok(stops.length >= 4, '羽化至少要有 4 个停点，否则又会读成一条边')
  assert.match(body, /#000 0%, #000 80%/u, '80% 之前必须完全不透明（模块标题行的背板）')
  assert.match(body, /transparent 100%/u, '底边必须羽化到全透明')
})

test('桌面：队列工具整条嵌进次页头（搜索栏 + 计数 + 按钮），移动端保持原路径', async () => {
  // 用户 2026-09-18：「桌面端所有模块的搜索栏都要嵌进次页头」。
  // 当前有搜索栏的只有 pickup / poster / repair（都是 PickupLedger）。
  const header = await readFile(new URL('../apps/web/src/components/workshop/WorkshopShellHeader.jsx', import.meta.url), 'utf8')
  // 搜索槽必须双端常驻（此前只有 mobileLayout 才渲染，桌面根本没有落点）
  assert.doesNotMatch(header, /\{mobileLayout \? \(\s*<div className="workshop-module-search-slot">/u,
    '搜索槽不得再只在移动端渲染——桌面没有落点，Portal 必然回落到正文里')
  for (const scene of ['pickup', 'poster', 'repair']) {
    assert.match(header, new RegExp(`className="workshop-module-search" data-scene="${scene}"`, 'u'), `缺少 ${scene} 的搜索槽`)
  }

  const ledger = await readFile(new URL('../apps/web/src/components/pickup/PickupLedger.jsx', import.meta.url), 'utf8')
  // 桌面：整条 queueControls（含 QUEUE STATUS 计数）进页头
  assert.match(ledger, /: createPortal\(queueControls, headerSlot\)/u,
    '桌面必须把整条队列工具 Portal 进次页头')
  // 移动：仍是「搜索框 + 图标按钮进槽、工具按钮进 mobile-module-tools」的老路径
  assert.match(ledger, /createPortal\(<div className="pickup-module-toolbar">/u, '移动端路径不得被改写')
  // 挂载后必须再解析一次槽（首帧 header 还没进 DOM，读不到会先渲染在正文里再跳）
  assert.match(ledger, /resolveHeaderSlot\(1\)/u, '缺少挂载后的插槽再解析')

  const css = desktopBlock(stripComments(await read('desktop-workbench.css')))
  // 页头因此变高：66 → 96，整层 156 → 186
  assert.match(css, /--ops-header-height: 186px/u, '层高必须跟模块条一起长到 186')
  assert.match(css, /\.workshop-shell-header \{[^}]*height: 186px/u, '壳层高度必须同步')
  assert.match(css, /\.look-dock::after \{[^}]*top: 186px/u, '左栏分隔线必须跟着下移')
  assert.match(css, /\.workshop-module-header \{[\s\S]*?min-height: 96px;/u, '模块条必须容纳队列工具')
  // 槽按当前模块显示，且只有一格
  for (const scene of ['pickup', 'poster', 'repair']) {
    assert.match(css, new RegExp(`\\.workshop-shell-header\\[data-active-module='${scene}'\\] \\.workshop-module-search\\[data-scene='${scene}'\\]`, 'u'),
      `缺少 ${scene} 的桌面显示规则`)
  }
  assert.match(css, /\.workshop-module-header \.pickup-queue-controls \{[\s\S]*?grid-template-columns: 240px minmax\(0, 1fr\);/u,
    '嵌进页头的队列工具必须比正文里窄一档')
})
