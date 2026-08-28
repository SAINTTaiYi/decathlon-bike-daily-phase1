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

test('移动端四角色作为铺满视口的背景层，登录卡浮于其上而非裁切插画', () => {
  // 背景层：fixed 铺满、不拦截触摸、位于卡片之下
  const bgBlock = css.match(
    /@media \(max-width: 860px\) \{[^@]*?\.boot-poster-side\[data-variant='characters'\] \{([^}]*)\}/u,
  )
  assert.ok(bgBlock, '应存在移动端 characters 背景层规则')
  const decls = bgBlock[1]
  assert.match(decls, /position: fixed/u)
  assert.match(decls, /inset: 0/u)
  assert.match(decls, /pointer-events: none/u)
  assert.match(decls, /display: block/u)

  // 舞台等比放大到宽度铺满视口（340 为舞台固定坐标系宽度）
  // 缩放必须是纯数：用 tan(atan2()) 剥掉 vw 单位后再比值
  assert.match(css, /--boot-char-scale: calc\(tan\(atan2\(100vw, 1px\)\) \/ 340\)/u)
  assert.match(css, /@supports \(width: calc\(1px \* tan\(atan2\(1px, 1px\)\)\)\)/u)

  // 卡片必须抬到背景层之上
  assert.match(css, /\.boot-card \{[^}]*z-index: 1/u)

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

