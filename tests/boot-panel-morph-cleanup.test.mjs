import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const read = (rel) => readFile(new URL(rel, import.meta.url), 'utf8')

const [morph, loaderMobile, loaderDesktop] = await Promise.all([
  read('../apps/web/src/hooks/useAuthPanelMorph.js'),
  read('../apps/web/src/components/boot/BootLoaderMobile.jsx'),
  read('../apps/web/src/components/boot/BootLoaderDesktop.jsx'),
])

// 【背景 · 2026-09-08】注册页「选择门店」下拉菜单被后续字段盖住（桌面+移动端同现）。
// 根因：useAuthPanelMorph 的 GSAP y/autoAlpha 补间收尾残留内联 transform
//（恒等 translate(0,0)）。CSS 规范里 transform 恒等值依旧创建层叠上下文，
// 于是菜单 z:40 被困在所属字段（.bootm-item/.bootd-item）的上下文里，
// 被 DOM 顺序更靠后的字段（Profile/显示名/邮箱）按绘制顺序盖住。
// 修法 = 补间级 clearProps 在收尾交还内联样式；本文件锁死这一约定。
// 仓库源码无分号风格：断言用 indexOf 定位补间切片，不用跨语句正则。

test('useAuthPanelMorph: body 补间必须带 clearProps 交还 transform/opacity/visibility', () => {
  const i = morph.indexOf('tl.fromTo(body')
  assert.ok(i >= 0, 'body fromTo 补间必须存在')
  const chunk = morph.slice(i, i + 400)
  assert.match(
    chunk,
    /clearProps:\s*['"]transform,opacity,visibility['"]/,
    'body 补间收尾必须 clearProps（残留恒等 transform 会创建层叠上下文，困住卡内浮层）'
  )
})

test('useAuthPanelMorph: 字段 stagger 补间必须带 clearProps', () => {
  const i = morph.indexOf('tl.fromTo(\n        items')
  assert.ok(i >= 0, 'items fromTo 补间必须存在')
  const chunk = morph.slice(i, i + 400)
  assert.match(
    chunk,
    /clearProps:\s*['"]transform,opacity,visibility['"]/,
    '字段 stagger 收尾必须 clearProps（.bootm-item/.bootd-item 残留 transform 会逐字段建立层叠上下文）'
  )
})

test('clearProps 只允许清理内联补间样式，不得动 height/overflow 语义', () => {
  // 高度 FLIP 的收尾交还仍由 onComplete 负责（card 的 height/overflow）
  assert.match(morph, /onComplete:[\s\S]{0,300}?gsap\.set\(card,\s*\{\s*clearProps:\s*'height,overflow'/)
})

test('双端 BootLoader 仍接线 useAuthPanelMorph（断言锚点不漂移）', () => {
  assert.match(loaderMobile, /useAuthPanelMorph\(/)
  assert.match(loaderMobile, /itemSelector:\s*['"]\.bootm-item['"]/)
  assert.match(loaderDesktop, /useAuthPanelMorph\(/)
  assert.match(loaderDesktop, /itemSelector:\s*['"]\.bootd-item['"]/)
})
