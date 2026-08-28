import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const boot = await readFile(new URL('../apps/web/src/components/BootLoader.jsx', import.meta.url), 'utf8')
const mascot = await readFile(new URL('../apps/web/src/components/BootMascot.jsx', import.meta.url), 'utf8')
const css = await readFile(new URL('../apps/web/src/styles/boot.css', import.meta.url), 'utf8')
const characters = await readFile(new URL('../apps/web/src/components/BootCharacters.jsx', import.meta.url), 'utf8')

test('登录页顶部品牌位显示 WORKSHOP OPS 与当前版本号', () => {
  assert.match(boot, /WORKSHOP OPS/u)
  assert.match(boot, /import \{ APP_VERSION \} from '\.\.\/data\/releaseNotes\.js'/u)
  assert.match(boot, /boot-brand-version">V\{APP_VERSION\}/u)
  // 旧的 DECATHLON / BIKE OPS 双行标识与黄色 logo 方块已退场
  assert.doesNotMatch(boot, /BIKE OPS/u)
  assert.doesNotMatch(boot, /boot-logo-box/u)
})

test('输入框遵守无边线设计：不用描边，靠填充深浅与品牌黄标识条表达聚焦', () => {
  const focusBlock = css.slice(css.indexOf('.boot-input-box:focus-within {'))
  const focusRule = focusBlock.slice(0, focusBlock.indexOf('}'))
  assert.doesNotMatch(focusRule, /box-shadow:\s*0 0 0 2px/u)
  assert.doesNotMatch(focusRule, /border:/u)
  assert.match(focusRule, /background:/u)
  // autofill 不得把输入框刷回浏览器默认淡蓝底
  assert.match(css, /input:-webkit-autofill/u)
  assert.match(css, /-webkit-box-shadow: 0 0 0 100px #f4f5f8 inset/u)
})

test('吉祥物跟随指针转向，触屏降级为自动巡视，并尊重减弱动效偏好', () => {
  assert.match(mascot, /pointermove/u)
  assert.match(mascot, /quickTo/u)
  assert.match(mascot, /prefers-reduced-motion: reduce/u)
  assert.match(mascot, /pointer: fine/u)
  // 大表面禁 filter blur（重栅格化卡顿）
  assert.doesNotMatch(css.slice(css.indexOf('.boot-mascot {')), /filter: blur/u)
  assert.doesNotMatch(mascot, /filter: blur/u)
})

test('移动端登录卡在矮视口逐级收缩，避免整页纵向滚动', () => {
  assert.match(css, /@media \(max-width: 860px\) and \(max-height: 720px\)/u)
  assert.match(css, /\.boot-title \{\s*font-size/u)
})

// BOOT_CHARACTERS_REGRESSION
test('四角色舞台缩放必须是无量纲数值，禁止 vh 与像素混算导致 clamp 整条失效', () => {
  const scaleDecls = css.match(/--boot-char-scale:[^;]+;/gu) ?? []
  assert.ok(scaleDecls.length > 0, '应存在 --boot-char-scale 声明')
  for (const decl of scaleDecls) {
    // vh/vw/px 除以裸数字会得到带单位量，scale() 上下文中整条 clamp 失效并回落 scale(1)
    assert.doesNotMatch(decl, /\d+(vh|vw|vmin|vmax|px)\s*\//u, `缩放声明不得做单位混算: ${decl}`)
  }
})

test('角色层必须渲染在 .boot-card 之外，否则被卡片包含块与 overflow 裁切', () => {
  // 根因回归：卡片带 GSAP transform/filter 残留 + overflow:hidden，
  // 角色层只要是它的子元素，就无法铺满视口做背景（曾连踩两轮）。
  const cardOpen = boot.indexOf('className="boot-card"')
  const posterIdx = boot.indexOf("className=\"boot-poster-side\"")
  assert.ok(cardOpen !== -1 && posterIdx !== -1, '应同时存在卡片与角色层节点')

  // 角色层必须在 </section> 之前、且缩进层级与 .boot-card 同级（6 空格）。
  // 卡片子元素缩进为 8 空格，据此可判定是否已被提出卡片。
  const posterLineStart = boot.lastIndexOf('\n', posterIdx) + 1
  const indent = boot.slice(posterLineStart, posterIdx).match(/^ */u)[0].length
  const cardLineStart = boot.lastIndexOf('\n', cardOpen) + 1
  const cardIndent = boot.slice(cardLineStart, cardOpen).match(/^ */u)[0].length
  assert.strictEqual(
    indent,
    cardIndent,
    '角色层缩进须与 .boot-card 同级，即 .boot-sequence 的直接子元素',
  )

  // 角色层与卡片同级后，桌面端靠绝对定位归位到右半区
  assert.match(
    css,
    /\.boot-poster-side\[data-variant='characters'\] \{[^}]*position: absolute/u,
  )
  assert.match(
    css,
    /\.boot-poster-side\[data-variant='characters'\] \{[^}]*padding-left: 52%/u,
  )
})

test('移动端四角色作为铺满视口的背景层，登录卡浮于其上而非裁切插画', () => {
  // 背景层：fixed 铺满、不拦截触摸、位于卡片之下
  const bgBlock = css.match(
    /@media \(max-width: 860px\) \{[^@]*?\.boot-poster-side\[data-variant='characters'\] \{([^}]*)\}/u,
  )
  assert.ok(bgBlock, '应存在移动端 characters 背景层规则')
  const decls = bgBlock[1]
  // 卡片带 GSAP 残留 transform，会成为 fixed 子元素的包含块 ——
  // 背景层必须用 absolute 锚到 boot-sequence，否则只铺满卡片并盖住表单
  assert.match(decls, /position: absolute/u)
  assert.doesNotMatch(decls, /position: fixed/u)
  assert.match(decls, /inset: 0/u)
  assert.match(decls, /pointer-events: none/u)
  assert.match(decls, /display: block/u)

  // 舞台等比放大到宽度铺满视口（340 为舞台固定坐标系宽度）
  // 缩放必须是纯数：用 tan(atan2()) 剥掉 vw 单位后再比值
  assert.match(css, /--boot-char-scale: calc\(tan\(atan2\(100vw, 1px\)\) \/ 340\)/u)
  assert.match(css, /@supports \(width: calc\(1px \* tan\(atan2\(1px, 1px\)\)\)\)/u)

  // 卡片必须抬到背景层之上
  assert.match(css, /\.boot-card \{[^}]*z-index: 1/u)

  // 表单侧显式抬层：登录框必须压在角色层前面（用户明确要求）
  const mobileBlock = css.slice(css.indexOf('@media (max-width: 860px)'))
  assert.match(mobileBlock, /\.boot-form-side \{[^}]*z-index: 2/u)

  // 移动端遮罩必须铺满视口：改成 relative 会让底部露出主界面
  const seqMobile = mobileBlock.match(/\.boot-sequence \{([^}]*)\}/u)
  assert.ok(seqMobile, '应存在移动端 boot-sequence 规则')
  assert.match(seqMobile[1], /position: fixed/u)
  assert.doesNotMatch(seqMobile[1], /position: relative/u)

  // 级联顺序：移动端铺满规则必须出现在桌面 0.92 缩放之后，否则被覆盖
  const desktopIdx = css.indexOf('--boot-char-scale: 0.92')
  const mobileIdx = css.indexOf('--boot-char-scale: calc(tan(atan2(100vw, 1px)) / 340)')
  assert.ok(desktopIdx !== -1 && mobileIdx !== -1)
  assert.ok(
    mobileIdx > desktopIdx,
    '移动端铺满缩放必须声明在桌面缩放之后，同特异性下靠顺序取胜',
  )
})

test('取消密码闭眼：不得残留闭眼状态属性或样式', () => {
  assert.doesNotMatch(css, /data-shut/u)
  assert.doesNotMatch(css, /boot-char-lid/u)
  assert.doesNotMatch(characters, /dataset\.shut/u)
  assert.doesNotMatch(characters, /data-shut/u)
})

