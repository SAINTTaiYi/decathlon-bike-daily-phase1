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
  assert.match(css, /@media \(max-width: 860px\) and \(max-height: 600px\)/u)
  assert.match(css, /\.boot-mascot-mobile \{\s*width: clamp\(/u)
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

test('移动端窄屏为四角色舞台显式收缩，避免原尺寸被容器裁切', () => {
  const mobileBlock = css.slice(css.indexOf('@media (max-width: 860px)'))
  assert.match(mobileBlock, /--boot-char-scale:/u)
})

test('密码输入时四角色闭眼，密码清空或显示明文后恢复眨眼', () => {
  // 闭眼状态由密码是否隐藏驱动
  assert.match(characters, /isHidingPassword/u)
  // 闭眼与随机眨眼互斥，且退出闭眼后重新排程
  assert.match(characters, /if \(isHidingPassword\) return undefined/u)
  assert.match(characters, /\}, \[isHidingPassword\]\)/u)
  // 橙/黄角色只有瞳孔没有眼白，必须有独立闭眼线支撑
  assert.match(css, /data-shut/u)
})
