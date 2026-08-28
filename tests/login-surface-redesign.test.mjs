import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const read = (rel) => readFile(new URL(rel, import.meta.url), 'utf8')

const [shell, mobile, desktop, fields, mascot, characters, cssShared, cssMobile, cssDesktop, viewportHook, formHook] =
  await Promise.all([
    read('../apps/web/src/components/BootLoader.jsx'),
    read('../apps/web/src/components/boot/BootLoaderMobile.jsx'),
    read('../apps/web/src/components/boot/BootLoaderDesktop.jsx'),
    read('../apps/web/src/components/boot/BootLoginFields.jsx'),
    read('../apps/web/src/components/BootMascot.jsx'),
    read('../apps/web/src/components/BootCharacters.jsx'),
    read('../apps/web/src/styles/boot-shared.css'),
    read('../apps/web/src/styles/boot-mobile.css'),
    read('../apps/web/src/styles/boot-desktop.css'),
    read('../apps/web/src/hooks/useViewportKind.js'),
    read('../apps/web/src/hooks/useBootLoginForm.js'),
  ])

// -- 架构规则（2026-08-28，用户明确要求）--------------------------
// 桌面端与移动端登录 UI 必须是两套彼此独立的实现，由运行时视口选择挂载其中
// 一套；禁止单套 DOM + @media 硬凑双端。旧做法导致移动竖屏角色穿透登录卡、
// 桌面断点卡片被挤出视口、右侧插画面板溢出。

test('登录页按运行时视口挂载两套独立实现，另一套不进 DOM', () => {
  assert.match(shell, /useViewportKind/u)
  assert.match(shell, /BootLoaderMobile/u)
  assert.match(shell, /BootLoaderDesktop/u)
  // 三元选择挂载，而不是两套同时渲染再用 CSS 藏一套
  assert.match(
    shell,
    /viewport === 'mobile' \? <BootLoaderMobile[\s\S]*?: <BootLoaderDesktop/u,
    '必须按视口择一挂载，不能两套都进 DOM 再靠 display:none 藏',
  )
  // 视口判定走 matchMedia 并监听变化，横竖屏切换要能换套
  assert.match(viewportHook, /matchMedia/u)
  assert.match(viewportHook, /addEventListener|addListener/u)
})

test('两端各有独立样式表，且不靠对方的类名', () => {
  assert.match(mobile, /bootm-/u)
  assert.match(desktop, /bootd-/u)
  assert.doesNotMatch(mobile, /className="[^"]*bootd-/u, '移动端不得引用桌面端类名')
  assert.doesNotMatch(desktop, /className="[^"]*bootm-/u, '桌面端不得引用移动端类名')
  assert.doesNotMatch(cssMobile, /\.bootd-[a-z-]+\s*\{/u)
  assert.doesNotMatch(cssDesktop, /\.bootm-[a-z-]+\s*\{/u)
})

test('业务逻辑与退场动画收在共用层，两端只写 UI', () => {
  assert.match(shell, /useBootLoginForm/u)
  assert.match(formHook, /initialError/u)
  assert.match(formHook, /if \(initialError\) setError\(initialError\)/u)
  assert.doesNotMatch(mobile, /useBootLoginForm/u, '移动端应消费外壳传入的 form，不自持状态机')
  assert.doesNotMatch(desktop, /useBootLoginForm/u, '桌面端应消费外壳传入的 form，不自持状态机')
  assert.match(shell, /gsap\.timeline/u)
})

test('登录页顶部品牌位显示 WORKSHOP OPS 与当前版本号', () => {
  for (const [name, source] of [['移动端', mobile], ['桌面端', desktop]]) {
    assert.match(source, /WORKSHOP OPS/u, name + '应显示 WORKSHOP OPS')
    assert.match(source, /import \{ APP_VERSION \} from '\.\.\/\.\.\/data\/releaseNotes\.js'/u)
    assert.match(source, /V\{APP_VERSION\}/u, name + '应显示当前版本号')
    assert.doesNotMatch(source, /BIKE OPS/u)
    assert.doesNotMatch(source, /boot-logo-box/u)
  }
})

test('输入框遵守无边线设计：不用描边，靠填充深浅与品牌黄标识表达聚焦', () => {
  for (const [name, css, cls] of [['移动端', cssMobile, 'bootm'], ['桌面端', cssDesktop, 'bootd']]) {
    const block = css.slice(css.indexOf('.' + cls + '-input-box:focus-within {'))
    const rule = block.slice(0, block.indexOf('}'))
    assert.doesNotMatch(rule, /border:/u, name + '聚焦态不得用 border')
    assert.match(rule, /background:/u, name + '聚焦态应靠填充变化表达')
  }
  // autofill 不得把输入框刷回浏览器默认淡蓝底（拆分双端时曾整体漏搬）
  assert.match(cssShared, /input:-webkit-autofill/u)
  assert.match(cssShared, /-webkit-box-shadow: 0 0 0 100px #f3f4f8 inset/u)
  assert.match(cssShared, /:focus-within input:-webkit-autofill/u)
})

test('吉祥物跟随指针转向，触屏降级为自动巡视，并尊重减弱动效偏好', () => {
  assert.match(mascot, /pointermove/u)
  assert.match(mascot, /quickTo/u)
  assert.match(mascot, /prefers-reduced-motion: reduce/u)
  assert.match(mascot, /pointer: fine/u)
  assert.doesNotMatch(mascot, /filter: blur/u)
})

// -- 溢出根因回归 -------------------------------------------------
// 用户实拍两处故障：①移动竖屏黄色角色身体穿透整个登录卡、盖住用户名/密码/按钮；
// ②桌面断点下卡片与右侧插画面板一起溢出视口右侧被切断。

test('移动端角色在文档流中排在卡片之上方，禁止绝对定位穿透表单', () => {
  const rowRule = cssMobile.match(/\.bootm-peeker-row \{([^}]*)\}/u)
  assert.ok(rowRule, '应存在移动端角色行规则')
  const decls = rowRule[1]
  assert.doesNotMatch(decls, /position:\s*(absolute|fixed)/u, '角色行必须留在文档流，不得绝对定位')
  assert.match(decls, /pointer-events: none/u, '角色不得拦截表单触摸')
  assert.match(decls, /margin-bottom:\s*-/u)
  const cardRule = cssMobile.match(/\.bootm-card \{([^}]*)\}/u)
  assert.ok(cardRule, '应存在移动端卡片规则')
  assert.match(cardRule[1], /z-index: 1/u)
  assert.match(cardRule[1], /overflow: hidden/u)
})

test('桌面端卡片受视口约束，插画栏不得溢出到视口外', () => {
  const cardRule = cssDesktop.match(/\.bootd-card \{([^}]*)\}/u)
  assert.ok(cardRule, '应存在桌面端卡片规则')
  const decls = cardRule[1]
  assert.match(decls, /max-width:/u, '卡片须有宽度上限')
  assert.match(decls, /max-height: calc\(100vh - /u, '卡片须受视口高度约束')
  assert.match(decls, /overflow: hidden/u)
  assert.match(decls, /grid-template-columns:\s*minmax\([^)]*\)\s*minmax\(0,\s*1fr\)/u)
  const posterRule = cssDesktop.match(/\.bootd-poster-side \{([^}]*)\}/u)
  assert.ok(posterRule, '应存在桌面端插画栏规则')
  assert.match(posterRule[1], /min-width: 0/u, '插画栏须允许收缩，否则撑爆网格')
  assert.match(posterRule[1], /overflow: hidden/u)
})

// BOOT_CHARACTERS_REGRESSION
test('角色缩放必须是无量纲数值，禁止 vh 与像素混算导致 clamp 整条失效', () => {
  const scaleDecls = [cssShared, cssMobile, cssDesktop]
    .flatMap((css) => css.match(/--boot-char-scale:[^;]+;/gu) ?? [])
  assert.ok(scaleDecls.length > 0, '应存在 --boot-char-scale 声明')
  for (const decl of scaleDecls) {
    assert.doesNotMatch(decl, /\d+(vh|vw|vmin|vmax|px)\s*\//u, '缩放声明不得做单位混算: ' + decl)
  }
})

test('取消密码闭眼：不得残留闭眼状态属性或样式', () => {
  for (const css of [cssShared, cssMobile, cssDesktop]) {
    assert.doesNotMatch(css, /data-shut/u)
    assert.doesNotMatch(css, /boot-char-lid/u)
  }
  assert.doesNotMatch(characters, /dataset\.shut/u)
  assert.doesNotMatch(characters, /data-shut/u)
})

test('字段组件只管字段：可见切换与无障碍标签共用，布局类名由调用方注入', () => {
  assert.match(fields, /type=\{showPassword \? 'text' : 'password'\}/u)
  assert.match(fields, /aria-label=\{showPassword \? '隐藏密码' : '显示密码'\}/u)
  assert.match(fields, /aria-invalid=\{Boolean\(error\)\}/u)
  // 类名前缀由 prefix 注入，字段组件自身不含任何断点或硬编码端前缀
  assert.match(fields, /\$\{prefix\}-input-box/u)
  assert.doesNotMatch(fields, /@media/u)
  assert.doesNotMatch(fields, /'bootm-|'bootd-/u, '字段组件不得硬编码某一端的类名前缀')
})

test('提交态锁定由两端各自的按钮承担，行为一致', () => {
  for (const [name, source, cls] of [['移动端', mobile, 'bootm'], ['桌面端', desktop, 'bootd']]) {
    const primary = new RegExp('type="submit" className="' + cls + '-btn-primary" disabled=\\{submitting\\}', 'u')
    assert.match(source, primary, name + '主按钮须在提交中禁用')
    assert.match(source, /className="[a-z]+-btn-secondary"[^>]*disabled=\{submitting\}/u, name + '次按钮须在提交中禁用')
  }
})
