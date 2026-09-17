import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (name) => readFile(new URL(`../apps/web/src/styles/${name}`, import.meta.url), 'utf8')

const NAV_LAYER_HEIGHT = 186
const GLOBAL_HEADER_HEIGHT = 90

test('desktop rail sits in the freed left column and clears the global header', async () => {
  const css = await read('desktop-workbench.css')
  const base = await read('workshop-system.css')

  const shellHeader = css.match(/\.workshop-shell-header \{[^}]*height:\s*(\d+)px/u)
  assert.ok(shellHeader, '.workshop-shell-header must declare an explicit desktop height')
  assert.equal(Number(shellHeader[1]), NAV_LAYER_HEIGHT)

  const railTop = css.match(/\.look-dock \{[\s\S]*?top:\s*(\d+)px !important;/u)
  assert.ok(railTop, '.look-dock must pin an explicit desktop top')
  const top = Number(railTop[1])
  assert.ok(
    top >= GLOBAL_HEADER_HEIGHT,
    `rail top ${top}px would slide under the ${GLOBAL_HEADER_HEIGHT}px global header`,
  )

  if (top < NAV_LAYER_HEIGHT) {
    // The rail now occupies the 90-186 band: it must stack above the fixed
    // navigation layer (z-index 80), otherwise the frosted backdrop veils
    // the first destination (the old "overview disappeared" bug).
    const dockZ = base.match(/\.look-dock \{[^}]*z-index:\s*(\d+) !important;/u)
    assert.ok(dockZ, 'base .look-dock must declare an explicit z-index')
    assert.ok(
      Number(dockZ[1]) > 80,
      `dock z-index ${dockZ[1]} loses to the navigation layer (80); a rail above ${GLOBAL_HEADER_HEIGHT}px would be veiled`,
    )
  }

  const dividerTop = css.match(/\.look-dock::after \{[^}]*top:\s*(\d+)px/u)
  assert.ok(dividerTop, '.look-dock::after must pin an explicit top')
  assert.ok(
    Number(dividerTop[1]) >= NAV_LAYER_HEIGHT,
    'rail divider must not run through the navigation layer',
  )
})

test('mobile dock ul baselines cannot leak into the desktop rail', async () => {
  // 移动 dock 的 ul 基线（repeat(5) / height:58px / overflow:visible !important）
  // 一旦无作用域地命中桌面，会把桌面 rail 的 ul 压成 58px、打死 short-viewport
  // 的 overflow-y:auto 兜底，六个按钮从 ul 里漏出去垫在公告卡下面。
  for (const file of ['workshop-system.css', 'mobile-overview.css']) {
    // 先剥注释：选择器捕获窗口不能把注释里的文字当成选择器的一部分，
    // 否则「选择器必须含 data-mobile-scene」会被注释文本骗过。
    const text = (await read(file)).replace(/\/\*[\s\S]*?\*\//gu, '')
    const rules = [...text.matchAll(/(?:^|[{}])\s*([^{}]*\.look-dock ul[^{}]*)\{([^}]*)\}/gu)]
    for (const [, selector, body] of rules) {
      const leaks = /overflow:\s*visible !important|height:\s*58px/u.test(body)
      if (leaks) {
        assert.ok(
          selector.includes('data-mobile-scene'),
          `${file}: unscoped .look-dock ul leaks mobile baselines into desktop: ${selector.trim()}`,
        )
      }
    }
  }
})

test('desktop short-viewport scroll fallback stays live', async () => {
  const css = await read('desktop-workbench.css')
  const rule = css.match(/\[data-short-viewport='true'\] \.dock-scroll-region > ul \{[^}]*\}/u)
  assert.ok(rule, 'short-viewport ul rule must exist')
  assert.match(rule[0], /overflow-y:\s*auto/u)
  assert.match(rule[0], /min-height:\s*0/u)
})

test('no default-theme layer refills the rail active state with a solid fill', async () => {
  // 黑底曾有四个来源：components.css（基础层）、desktop-workbench.css（桌面层）、
  // frosted.css、endfield.css（独立主题）。前三个已删，只有 endfield 这套独立
  // 主题保留自己的实心态；默认主题任何一层都不得再刷实心背景。
  const files = [
    'components.css',
    'desktop-workbench.css',
    'frosted.css',
    'refinement.css',
    'workshop-system.css',
    'mobile-overview.css',
    'responsive.css',
  ]
  for (const file of files) {
    const text = await readFile(new URL(`../apps/web/src/styles/${file}`, import.meta.url), 'utf8')
    const blocks = text.match(/\.look-dock button\[data-active='true'\][^{]*\{[^}]*\}/gu) ?? []
    // transparent / none 是本次撤销黑块所写的声明，必须放行；
    // 只拦真正的实心色值（var(--ink) / var(--ops-black) / #hex / rgb() 等）。
    const solid = blocks.filter((block) => {
      const decl = block.match(/background(?:-color)?:\s*([^;}]+)/u)?.[1]?.trim()
      return decl !== undefined && !/^(?:transparent|none)\b/u.test(decl)
    })
    assert.deepStrictEqual(solid, [], `${file} 又给 rail 选中态刷了实心背景：${solid.join(' | ')}`)
  }
})

test('dock active state has a single source of truth and no filled pill', async () => {
  const files = ['workshop-system.css', 'mobile-overview.css', 'desktop-workbench.css', 'refinement.css', 'frosted.css']
  const fills = []

  for (const name of files) {
    const css = await read(name)
    const blocks = css.match(/[^{}]*\.look-dock button\[data-active='true'\][^{]*\{[^}]*\}/gu) ?? []
    for (const block of blocks) {
      if (!/(?:^|[;{\s])background(?:-color)?\s*:/u.test(block)) continue
      fills.push({ name, block: block.trim() })
    }
  }

  assert.equal(
    fills.length,
    1,
    `dock active fill must be declared exactly once, found ${fills.length}: ${fills.map((f) => f.name).join(', ')}`,
  )
  assert.equal(fills[0].name, 'frosted.css')
  assert.match(fills[0].block, /background:\s*transparent/u)

  for (const name of files) {
    const css = await read(name)
    assert.ok(
      !/\.look-dock button\[data-active='true'\][^{]*\{[^}]*background:\s*var\(--(?:ops-black|ink)\)/u.test(css),
      `${name} reintroduces the removed black pill on the dock active state`,
    )
    assert.ok(
      !/\.look-dock button\[data-active='true'\] small[^{]*\{[^}]*--ops-text-inverse/u.test(css),
      `${name} paints the dock active label with inverse text, which is unreadable on a transparent fill`,
    )
  }
})

test('dock active indicator stays off the desktop rail', async () => {
  // Root cause guarded here: mobile-overview.css lives inside
  // @media (min-width: 0px), so an unscoped `display: block !important`
  // there also matched desktop and beat desktop-workbench.css's weaker
  // `display: none`. The indicator then painted a filled box around the
  // selected rail item -- black originally, read as a white slab once the
  // fill became a soft yellow wash.
  const mobile = await read('mobile-overview.css')
  const desktop = await read('desktop-workbench.css')

  const showRule = /\.dock-active-indicator\s*\{[^}]*display:\s*block/u
  const mobileShow = mobile.match(showRule)
  assert.ok(mobileShow, 'mobile-overview.css must still show the dock indicator on phones')

  const upTo = mobile.slice(0, mobile.indexOf(mobileShow[0]))
  const guards = upTo.match(/@media[^{]*\)/gu) ?? []
  const nearest = guards.at(-1) ?? ''
  assert.match(
    nearest,
    /max-width:\s*767px/u,
    'the mobile indicator rule must sit behind a max-width guard so it cannot leak onto the desktop rail',
  )

  const hide = desktop.match(/[^{}]*\.dock-active-indicator[^{]*\{[^}]*display:\s*none[^}]*\}/u)
  assert.ok(hide, 'desktop-workbench.css must hide the dock indicator')
  assert.match(
    hide[0],
    /!important/u,
    'the desktop hide must carry !important to stay symmetric with the mobile show rule',
  )
  assert.match(
    hide[0],
    /\.workshop-runtime\[data-mobile-scene\] \.look-dock \.dock-active-indicator/u,
    'the desktop hide must match the mobile selector specificity (0,2,0), not rely on source order',
  )
})

test('dock indicator paint is declared once, in the base layer', async () => {
  // 旧形态：workshop-system.css 留着 background: var(--ops-black) 不删，
  // 由 frosted.css 用 !important 覆盖成浅黄渐变。两层同时存在，任何第三处
  // 声明都会再触发一轮特异性战争，因此 paint 只允许有一个来源。
  const files = [
    'workshop-system.css',
    'frosted.css',
    'desktop-workbench.css',
    'mobile-overview.css',
    'refinement.css',
    'components.css',
    'responsive.css',
  ]

  const paints = []
  for (const name of files) {
    const css = await read(name)
    const blocks = css.match(/[^{}]*\.dock-active-indicator[^{]*\{[^}]*\}/gu) ?? []
    for (const block of blocks) {
      if (!/(?:^|[;{\s])background(?:-color)?\s*:/u.test(block)) continue
      paints.push({ name, block: block.trim() })
    }
  }

  assert.equal(
    paints.length,
    1,
    `指示器 paint 必须只声明一次，实际 ${paints.length} 处：${paints.map((p) => p.name).join(', ')}`,
  )
  assert.equal(
    paints[0].name,
    'workshop-system.css',
    'paint 归属基础层；上层不得再刷一遍背景',
  )
  assert.ok(
    !/var\(--ops-black\)/u.test(paints[0].block),
    '实心黑底已按设计移除，不得回归',
  )
  assert.match(paints[0].block, /color-mix\(in srgb, var\(--ops-yellow\)/u)
  assert.ok(
    !/!important/u.test(paints[0].block),
    '单一来源不需要 !important；出现即说明又在打特异性战争',
  )
})

test('dock indicator paint reads brand tokens without fallbacks', async () => {
  // --ops-yellow 在 flat-tokens / workshop-system / mobile-overview 三处都有
  // 真实定义，fallback 只会在 token 断链时静默回退、把 bug 藏起来。
  const css = await read('workshop-system.css')
  const block = css.match(/\.dock-active-indicator\s*\{[^}]*\}/u)
  assert.ok(block, '.dock-active-indicator 基础规则必须存在')

  const yellowRefs = block[0].match(/var\(--ops-yellow[^)]*\)/gu) ?? []
  assert.ok(yellowRefs.length > 0, '指示器 paint 必须引用 --ops-yellow')
  for (const ref of yellowRefs) {
    assert.equal(ref, 'var(--ops-yellow)', `${ref} 带了 fallback，token 断链会被静默吞掉`)
  }

  assert.ok(
    !/box-shadow:\s*0 0 16px var\(--ops-black-glow\)/u.test(block[0]),
    '黑色外发光属于旧实心形态，已随黑底一起移除',
  )
})

test('header frosted paint is one full-width band, not an L footprint', async () => {
  // 2026-09-18 用户定案：页头/次页头/左栏之间「阶梯感」的根，就是这条
  // L 形 mask（90px 全宽 + 90-156 的 x>=262 第二臂）的三个硬边缘。
  // 现在必须是一整条全宽带 + 底部羽化。
  const css = (await read('frosted.css')).replace(/\/\*[\s\S]*?\*\//gu, '')
  const layer = css.match(/\[data-workspace-layer='navigation'\] \{[^}]*background: none !important;[^}]*backdrop-filter: none;[^}]*\}/u)
  assert.ok(layer, 'desktop navigation layer must hand fill+blur to a masked ::before')
  const blocks = css.match(/\[data-workspace-layer='navigation'\]::before \{[^}]*\}/gu) ?? []
  const band = blocks.find((block) => {
    const flat = block.replace(/\s+/gu, ' ')
    return flat.includes('backdrop-filter: blur(28px) saturate(180%)') && flat.includes('z-index: -1')
  })
  assert.ok(band, 'header ::before must carry the frosted fill + blur behind its own content')
  const flat = band.replace(/\s+/gu, ' ')
  assert.doesNotMatch(flat, /262px/u, '页头磨砂不得再按 x=262 分臂（那是台阶的来源）')
  assert.doesNotMatch(flat, /mask-position/u, '单块全宽不需要 mask-position 的第二层')
  assert.doesNotMatch(flat, /\[?:?-webkit-\]?mask-size: 100% 90px/u, '页头磨砂不得只铺 90px 高')
  assert.match(flat, /mask-image: linear-gradient\( to bottom, #000 0%, #000 80%/u,
    '页头磨砂必须是一条带底部羽化的全宽渐变（硬切边就是台阶）')
  assert.match(flat, /transparent 100%/u, '页头磨砂的底边必须羽化到全透明')
  // 羽化不能吃掉次页头标题行的背板（层高 186，内容从 186px 下方滚过页头）
  const firstFade = Number(flat.match(/#000 80%/u) ? 80 : NaN)
  assert.ok(firstFade >= 70, '羽化必须压在模块页头标题行中线以下')
})

test('header icon buttons are excluded from the rebuilt focus ring', async () => {
  // 菜单按钮的「白框」= borderless.css 重建的无障碍焦点环（!important）。
  // 用户 2026-09-05 要求去掉；排除写在环规则自身的选择器上，不写覆盖规则。
  const css = (await read('borderless.css')).replace(/\/\*[\s\S]*?\*\//gu, '')
  assert.match(
    css,
    /\[role='option'\]\):focus-visible:not\(\.workshop-header-action\) \{/u,
    'borderless focus ring must exclude .workshop-header-action',
  )
})

test('navigation layer hit-testing stays out of the rail column', async () => {
  // mask 只裁绘制不裁 hit-test：导航层盒子仍会吞掉 rail 首按钮的点击。
  const css = (await read('desktop-workbench.css')).replace(/\/\*[\s\S]*?\*\//gu, '')
  assert.match(css, /\[data-workspace-layer='navigation'\],\s*\.workshop-shell-header \{ pointer-events: none; \}/u)
  assert.match(css, /\.workshop-global-header-desktop,\s*\.workshop-module-header \{ pointer-events: auto; \}/u)
  assert.match(css, /\.workshop-global-header-desktop button:focus-visible \{ outline: none; \}/u)
})
