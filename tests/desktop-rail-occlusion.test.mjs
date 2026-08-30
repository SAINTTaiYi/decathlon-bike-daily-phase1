import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (name) => readFile(new URL(`../apps/web/src/styles/${name}`, import.meta.url), 'utf8')

const NAV_LAYER_HEIGHT = 156

test('desktop left rail clears the fixed navigation layer', async () => {
  const css = await read('desktop-workbench.css')

  const shellHeader = css.match(/\.workshop-shell-header \{[^}]*height:\s*(\d+)px/u)
  assert.ok(shellHeader, '.workshop-shell-header must declare an explicit desktop height')
  assert.equal(Number(shellHeader[1]), NAV_LAYER_HEIGHT)

  const railTop = css.match(/\.look-dock \{[\s\S]*?top:\s*(\d+)px !important;/u)
  assert.ok(railTop, '.look-dock must pin an explicit desktop top')
  assert.ok(
    Number(railTop[1]) >= NAV_LAYER_HEIGHT,
    `rail top ${railTop[1]}px sits inside the ${NAV_LAYER_HEIGHT}px navigation layer (z-index 80) and would hide the first destination`,
  )

  const dividerTop = css.match(/\.look-dock::after \{[^}]*top:\s*(\d+)px/u)
  assert.ok(dividerTop, '.look-dock::after must pin an explicit top')
  assert.ok(
    Number(dividerTop[1]) >= NAV_LAYER_HEIGHT,
    'rail divider must not run through the navigation layer',
  )
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
