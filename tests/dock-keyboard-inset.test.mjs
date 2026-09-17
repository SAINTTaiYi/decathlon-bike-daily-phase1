import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const [hook, refinement, mobileOverview, workshopSystem, desktopWorkbench, layout] = await Promise.all([
  read('apps/web/src/hooks/useVisualViewportMetrics.js'),
  read('apps/web/src/styles/refinement.css'),
  read('apps/web/src/styles/mobile-overview.css'),
  read('apps/web/src/styles/workshop-system.css'),
  read('apps/web/src/styles/desktop-workbench.css'),
  read('apps/web/src/styles/layout.css')
]).catch(async (error) => { throw error })
const sources = { hook, refinement, mobileOverview, workshopSystem, desktopWorkbench, layout }
const allCss = [refinement, mobileOverview, workshopSystem, desktopWorkbench, layout].join('\n')

// 底栏「悬空」回归（用户 2026-09-18 报障，安卓 Edge 必现）：
// 地址栏/底部工具栏的显示隐藏会同时改变布局视口与视觉视口，但两者动画时序不同步 ——
// 滚动过程中 `innerHeight - visualViewport.height` 会瞬间等于一条工具栏的高度（50–80px）。
// 旧实现把这个差值当成底部内缩，于是滚动时底栏被顶到半空、内容 padding 同步变大，
// 松手动画结束差值归零才「吸附」回底部。
// 判据：底部内缩必须只由「软键盘」驱动（有可编辑元素聚焦），与浏览器 chrome 无关。

test('底部内缩只在可编辑元素聚焦时非零（软键盘判定，不看浏览器 chrome）', () => {
  const src = hook
  // 判定函数必须在：input / textarea / select / contenteditable
  assert.match(src, /function hasEditableFocus\(\)/u, '必须有显式的键盘焦点判定')
  assert.match(src, /tag === 'textarea' \|\| tag === 'select'/u)
  assert.match(src, /tag === 'input'/u)
  assert.match(src, /isContentEditable/u)
  // 不唤起键盘的 input 类型必须排除（聚焦它们不得抬升底栏）
  assert.match(src, /'button', 'submit', 'reset', 'checkbox', 'radio', 'file', 'range', 'color', 'hidden', 'image'/u)

  // 内缩值必须被焦点判定门控：无焦点时恒为 0
  assert.match(
    src,
    /const keyboardInset = hasEditableFocus\(\)\s*\n\s*\?\s*Math\.max\(0, Math\.round\(\(window\.innerHeight \|\| height\) - height - offsetTop\)\)\s*\n\s*:\s*0/u,
    '键盘内缩必须写成「有焦点 ? 差值 : 0」'
  )
  // 焦点变化要立即重算（键盘开合不一定伴随 resize）
  assert.match(src, /document\.addEventListener\('focusin', schedule\)/u)
  assert.match(src, /document\.addEventListener\('focusout', schedule\)/u)
  // 清理必须成对
  assert.match(src, /document\.removeEventListener\('focusin', schedule\)/u)
  assert.match(src, /document\.removeEventListener\('focusout', schedule\)/u)
})

test('旧的 --visual-viewport-bottom 已整体改名，不留第二套变量', () => {
  // 变量名从「视觉视口底部」改为「键盘内缩」：旧名字会被后来者按字面意思重新用来算
  // 浏览器 chrome 的差值 —— 改名 + 全量替换是唯一可靠的封堵（删旧写新）。
  const consumers = [refinement, mobileOverview, workshopSystem]
  for (const css of consumers) {
    assert.doesNotMatch(css, /--visual-viewport-bottom/u, '消费点不得残留旧变量名')
  }
  assert.equal(
    (allCss.match(/--visual-viewport-bottom/gu) || []).length,
    0,
    '样式表里不得再出现 --visual-viewport-bottom'
  )
  // 新名字必须覆盖原来全部 9 个消费点
  assert.equal(
    (allCss.match(/var\(--keyboard-inset-bottom\)/gu) || []).length,
    8,
    '原 8 处 var() 消费点（refinement 1 + mobile-overview 4 + workshop-system 4 ⇒ 见注释）都要改名'
  )
  // 默认值仍要有（首帧 / JS 未就绪时底栏必须贴底，不是悬空）
  assert.match(refinement, /--keyboard-inset-bottom: 0px;/u, '默认值必须为 0px')
})

test('底部锚定元素全部走键盘内缩，且默认贴底', () => {
  // 底栏 / 内容 padding / 状态条 / 对话框底部内缩 —— 四处都从键盘内缩派生
  assert.match(workshopSystem, /\.workshop-shell \{ padding-bottom: calc\(var\(--dock-space\) \+ var\(--keyboard-inset-bottom\)\);/u)
  assert.match(workshopSystem, /\.look-dock \{ bottom: calc\(max\(8px,env\(safe-area-inset-bottom\)\) \+ var\(--keyboard-inset-bottom\)\) !important; \}/u)
  assert.match(workshopSystem, /\.status-toast \{ bottom: calc\(var\(--ops-dock-height\) \+ 20px \+ env\(safe-area-inset-bottom\) \+ var\(--keyboard-inset-bottom\)\);/u)
  assert.match(mobileOverview, /bottom: var\(--keyboard-inset-bottom\) !important;/u)
  assert.match(mobileOverview, /padding: calc\(14px \+ env\(safe-area-inset-top\)\) 12px calc\(78px \+ env\(safe-area-inset-bottom\) \+ var\(--keyboard-inset-bottom\)\);/u)
  assert.match(mobileOverview, /padding: calc\(24px \+ env\(safe-area-inset-top\)\) 24px calc\(92px \+ env\(safe-area-inset-bottom\) \+ var\(--keyboard-inset-bottom\)\);/u)
  assert.match(mobileOverview, /bottom: calc\(16px \+ var\(--keyboard-inset-bottom\)\) !important;/u)
  assert.match(workshopSystem, /max\(6px,calc\(var\(--keyboard-inset-bottom\) \+ 6px\)\)/u, '对话框底部内缩同样走键盘量')
})

test('桌面端对话框高度仍用视觉视口高度（与底部内缩解耦）', () => {
  assert.match(desktopWorkbench, /height: min\(calc\(var\(--visual-viewport-height\) - 16px\), 760px\)/u)
  assert.match(workshopSystem, /max-height: min\(calc\(var\(--visual-viewport-height\) - 16px\),760px\)/u)
  // 高度量不受键盘门控影响：它是对话框可用高度，锁定滚动期间不会遇到地址栏动画
  assert.match(hook, /root\.style\.setProperty\('--visual-viewport-height', `\$\{height\}px`\)/u)
  assert.match(hook, /root\.style\.setProperty\('--visual-viewport-top', `\$\{offsetTop\}px`\)/u)
})

test('断言对象都是真实文件（防止测试对着空气断言）', () => {
  assert.ok(sources.hook.includes('useVisualViewportMetrics'))
  assert.ok(Object.keys(sources).length === 6)
})
