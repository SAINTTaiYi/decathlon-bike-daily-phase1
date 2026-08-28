import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const read = (rel) => readFile(new URL(rel, import.meta.url), 'utf8')

const [shell, mobile, desktop, fields, mascot, characters, peeker, cssShared, cssMobile, cssDesktop, viewportHook, formHook] =
  await Promise.all([
    read('../apps/web/src/components/BootLoader.jsx'),
    read('../apps/web/src/components/boot/BootLoaderMobile.jsx'),
    read('../apps/web/src/components/boot/BootLoaderDesktop.jsx'),
    read('../apps/web/src/components/boot/BootLoginFields.jsx'),
    read('../apps/web/src/components/BootMascot.jsx'),
    read('../apps/web/src/components/BootCharacters.jsx'),
    read('../apps/web/src/components/BootPeeker.jsx'),
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

test('输入框聚焦不画任何外圈描边，只靠填充深浅表达（用户实拍两层框套嵌）', () => {
  for (const [name, css, cls] of [['移动端', cssMobile, 'bootm'], ['桌面端', cssDesktop, 'bootd']]) {
    const block = css.slice(css.indexOf('.' + cls + '-input-box:focus-within {'))
    const rule = block.slice(0, block.indexOf('}'))
    assert.doesNotMatch(rule, /border:/u, name + '聚焦态不得用 border')
    assert.match(rule, /background:\s*#fff/u, name + '聚焦态应靠填充变化表达')
    // 外圈品牌色环是用户明确要求去掉的那一层
    assert.doesNotMatch(
      rule,
      /box-shadow:[^;]*0 0 0 2px/u,
      name + '聚焦态不得再画 2px 外扩色环（外层那个框）',
    )
    assert.doesNotMatch(rule, /brand-primary|ffde59/u, name + '聚焦态不得用品牌色描边')

    // 全局 borderless.css 的黑色 outline 必须被定向取消（内层那个紧贴文字的框）
    const killed = css.match(
      new RegExp('\\.' + cls + '-input-box input:focus[\\s\\S]{0,200}?\\}', 'u'),
    )
    assert.ok(killed, name + '应显式取消 input 自身的 outline')
    assert.match(killed[0], /outline:\s*none\s*!important/u, name + '需 !important 才能压过全局规则')
  }
  // autofill 不得把输入框刷回浏览器默认淡蓝底（拆分双端时曾整体漏搬）
  assert.match(cssShared, /input:-webkit-autofill/u)
  assert.match(cssShared, /-webkit-box-shadow: 0 0 0 100px #f3f4f8 inset/u)
  assert.match(cssShared, /:focus-within input:-webkit-autofill/u)
})

test('桌面端登录卡纵向居中，不贴视口顶部', () => {
  const shellRule = cssDesktop.match(
    /\.boot-sequence\[data-viewport='desktop'\] \{([^}]*)\}/u,
  )
  assert.ok(shellRule, '应存在桌面端外壳规则')
  // 可滚动 flex 容器里靠 margin:auto 等分留白，内容超高时才退化为顶部对齐
  assert.match(
    cssDesktop,
    /\.boot-sequence\[data-viewport='desktop'\] > \* \{[^}]*margin-block:\s*auto/u,
    '桌面端应用 margin-block:auto 等分上下留白实现真正居中',
  )
  // 卡片高度上限必须和外壳 padding 对齐，否则矮视口会被裁
  const pad = shellRule[1].match(/padding:\s*([\d.]+)rem/u)
  assert.ok(pad, '桌面端外壳应声明纵向 padding')
  const expected = Number(pad[1]) * 2
  assert.match(
    cssDesktop,
    new RegExp('max-height:\\s*calc\\(100vh - ' + expected + 'rem\\)', 'u'),
    '卡片 max-height 需扣掉上下 padding 合计 ' + expected + 'rem',
  )
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

// -- 探头角色回归（2026-08-29 用户实拍两处问题）--------------------
// ①桌面端登录卡上还挂着黄色探头角色，压在 WORKSHOP OPS 标题上，且与右栏
//   四角色插画重复表达 —— 用户要求桌面端彻底不要它。
// ②角色本体与参考站（nortjobs 注册页）差得远：嘴被错放在左眼坐标上
//   （参考站那条 "M 100 95 Q 140 108 180 95" 其实是单只眼睛的弯月，不是嘴），
//   看起来像左眼下方多出一条孤立弧线；且通体品牌黄，糊进页面暖黄背景里。

test('桌面端不得渲染探头角色：角色只属于移动端与右栏插画', () => {
  assert.doesNotMatch(desktop, /BootPeeker/u, '桌面端不得引入探头角色组件')
  assert.doesNotMatch(desktop, /peeker/iu, '桌面端不得残留探头角色插槽')
  assert.doesNotMatch(cssDesktop, /peeker/iu, '桌面端样式不得残留探头角色规则')
  // 移动端仍然保留它，且右栏四角色插画只在桌面端
  assert.match(mobile, /BootPeeker/u, '移动端应继续渲染探头角色')
  assert.match(desktop, /BootCharacters/u, '桌面端右栏应保留四角色插画')
  assert.doesNotMatch(mobile, /BootCharacters/u, '移动端不渲染桌面端的四角色面板')
})

test('探头角色几何对齐参考站：双眼居中对称，嘴不得落在眼睛坐标上', () => {
  // 参考站实测：viewBox 400x200、半径 200 半圆身体、眼 cx 140/260 cy 95 r 46
  assert.match(peeker, /viewBox="0 0 400 200"/u)
  assert.match(peeker, /M 0 200 A 200 200 0 0 1 400 200/u)
  assert.match(peeker, /left: \{ cx: 140, cy: 95 \}/u)
  assert.match(peeker, /right: \{ cx: 260, cy: 95 \}/u)
  assert.match(peeker, /r: 46/u)
  // 嘴必须以 x=200 为中心、位于双眼下方（y > 眼睛的 95）
  const mouths = peeker.match(/M (\d+) (\d+) Q (\d+) (\d+) (\d+) (\d+)/gu) ?? []
  assert.ok(mouths.length > 0, '应存在嘴部路径')
  for (const d of mouths) {
    const [, x1, y1, , , x2] = d.match(/M (\d+) (\d+) Q (\d+) (\d+) (\d+)/u).map(Number)
    assert.equal((x1 + x2) / 2, 200, '嘴须左右对称居中于 x=200，不得挂在单只眼睛下: ' + d)
    assert.ok(y1 > 95, '嘴须在双眼下方: ' + d)
  }
})

test('探头角色改用品牌蓝，不得残留品牌黄糊进暖黄背景', () => {
  assert.doesNotMatch(peeker, /ffde59/iu, '角色不得再用品牌黄 #ffde59')
  assert.doesNotMatch(peeker, /f7c92e|e8c332|fff6d1/iu, '不得残留旧黄色系配色')
  assert.match(peeker, /#2f8bf4/iu, '身体应使用参考站蓝色渐变起点')
  assert.match(peeker, /#1d6fd8/iu, '身体应使用参考站蓝色渐变终点')
})
