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
