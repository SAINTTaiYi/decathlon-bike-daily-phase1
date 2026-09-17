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
  assert.match(body, /#000 0%, #000 74%/u, '74% 之前必须完全不透明（模块标题行的背板）')
  assert.match(body, /transparent 100%/u, '底边必须羽化到全透明')
})
