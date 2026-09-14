import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const read = (rel) => readFile(new URL(rel, import.meta.url), 'utf8')

const [app, storeApp, siteMode, appSelectMobile, appSelectDesktop, menuDialog, appSelectCss, shellCss, styleIndex, sw, toolHtml, toolEmbed, toolApp, toolEngine, borderlessCss] = await Promise.all([
  read('../apps/web/src/App.jsx'),
  read('../apps/web/src/components/storedesign/StoreDesignApp.jsx'),
  read('../apps/web/src/utils/siteMode.js'),
  read('../apps/web/src/components/appselect/AppSelectMobile.jsx'),
  read('../apps/web/src/components/appselect/AppSelectDesktop.jsx'),
  read('../apps/web/src/components/dialogs/MenuDialog.jsx'),
  read('../apps/web/src/styles/food-ledger.css'),
  read('../apps/web/src/styles/store-design.css'),
  read('../apps/web/src/styles/index.css'),
  read('../apps/web/public/sw.js'),
  read('../apps/web/public/store-design/index.html'),
  read('../apps/web/public/store-design/embed.js'),
  read('../apps/web/public/store-design/app.js'),
  read('../apps/web/public/store-design/engine.js'),
  read('../apps/web/src/styles/borderless.css')
])

// 断言一律基于剥掉注释后的源码：命中的可能是注释里的字样（2026-09-13 假绿事故）。
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '')

// ── 2026-09-15 门店设计渲染接入（mass.workshop.skin）────────────────────

test('站点分流：门店设计站用精确主机名判定，且不得靠前缀判据', async () => {
  const mode = await import('../apps/web/src/utils/siteMode.js')
  assert.equal(mode.MASS_SITE_HOST, 'mass.workshop.skin')
  assert.equal(mode.massSiteUrl(), 'https://mass.workshop.skin/')
  assert.equal(mode.isMassOnlySite('mass.workshop.skin'), true, '正式域名必须判定为门店设计站')
  assert.equal(mode.isMassOnlySite('MASS.WORKSHOP.SKIN'), true, '主机名判定需大小写无关')
  assert.equal(mode.isMassOnlySite('mass.workshop.skin.evil.com'), false, '前缀/后缀拼接的域名不得通过')
  assert.equal(mode.isMassOnlySite('eat.workshop.skin'), false)
  assert.equal(mode.isMassOnlySite('workshop.skin'), false)
  assert.equal(mode.isMassOnlySite('bike-ops-preview.geeklightonefish.workers.dev'), false, '预览站是单站模式')
  // Ops 生产站判定必须把两个子站排除掉（旧写法 /(^|\.)workshop\.skin$/ 会把 mass 判成 Ops）
  assert.equal(mode.isOpsProductionSite('workshop.skin'), true)
  assert.equal(mode.isOpsProductionSite('www.workshop.skin'), true)
  assert.equal(mode.isOpsProductionSite('mass.workshop.skin'), false, '门店设计站不得被当成 Ops 生产站')
  assert.equal(mode.isOpsProductionSite('eat.workshop.skin'), false)
  // 源码层面禁止前缀判据（evilsite 事故）
  const body = siteMode.slice(siteMode.indexOf('export function isMassOnlySite'))
  const fn = body.slice(0, body.indexOf('}'))
  assert.ok(fn.includes('=== MASS_SITE_HOST'), '必须用 === 精确比对')
  assert.doesNotMatch(fn, /startsWith|endsWith|RegExp|\/\^/u, '不得使用前缀/正则判据')
})

test('App 接线：三选一、生产站整页跳转、站点内退回到 Ops', () => {
  assert.match(app, /const APP_CHOICES = \['ops', 'food', 'mass'\]/u, 'sessionStorage 持久化必须认识 mass')
  assert.match(app, /const effectiveApp = foodOnlySite \? 'food' : \(massOnlySite \? 'mass' : appChoice\)/u, 'mass 独立站必须直接进入门店设计')
  const choose = app.slice(app.indexOf('const chooseApp = useCallback'))
  const chooseBody = choose.slice(0, choose.indexOf('}, ['))
  assert.ok(chooseBody.includes("appId === 'mass' && opsProductionSite"), '生产站必须走整页跳转分支')
  assert.ok(chooseBody.includes('window.location.assign(massSiteUrl())'), '跳转必须整页导航到 mass 站点')
  const exit = app.slice(app.indexOf('const exitMassApp = useCallback'))
  const exitBody = exit.slice(0, exit.indexOf('}, ['))
  assert.ok(exitBody.includes('massOnlySite'), '站点判定必须参与退出分支')
  assert.ok(exitBody.includes('window.location.assign(opsSiteUrl())'), 'mass 站点上退出必须能回到 Ops 站点')
  assert.ok(exitBody.includes('clearAppChoice()'), '单站（预览/本地）退出要回到应用选择屏')
})

test('App 接线：非 Ops 场景不渲染 Ops 容器，也不拉门店业务数据', () => {
  assert.match(app, /const renderOps = introDone && effectiveApp === 'ops'/u, 'Ops 容器只认 ops')
  // 门店设计同食品台账：没有任何 ops 节点，结构上不可能滚动泄露
  assert.match(app, /const opsDataNeeded = effectiveApp !== 'food' && effectiveApp !== 'mass'/u, '门店设计站不得拉 bootstrap/shiphub')
  assert.match(app, /useRemoteClosingWorkflow\(authenticated && !introLocked && opsDataNeeded\)/u)
  assert.match(app, /useShipHub\(authenticated && !introLocked && opsDataNeeded\)/u)
  assert.match(app, /\{ enabled: authenticated && !introLocked && opsDataNeeded \}/u)
  // 删旧不覆盖：旧门控（只排除 food）必须整体消失，不能两套并存
  assert.doesNotMatch(stripComments(app), /introLocked && effectiveApp !== 'food'/u, '旧门控残留=两套判据打架')
  // 非 Ops 应用不拉 bootstrap ⇒ workflow.hydrated 恒为 false，SYNCING DATABASE 占位
  // 必须同样只认 opsDataNeeded，否则门店设计/食品台账会永久停在该屏
  // （2026-09-15 无头冒烟实测：选完门店设计就卡住）。
  assert.match(
    stripComments(app),
    /if \(authenticated && opsDataNeeded && !workflow\.hydrated && \(auth\.source === 'restore' \|\| loginAnimationDone\)\)/u,
    '业务数据加载占位必须只在需要 Ops 数据的场景出现'
  )
  const unguarded = [...stripComments(app).matchAll(/if \(authenticated && ([^)]*workflow\.hydrated[^)]*)\)/gu)]
  for (const match of unguarded) {
    assert.ok(match[1].includes('opsDataNeeded') || match[1].includes("effectiveApp === 'ops'"), `加载占位缺少应用判断：${match[0]}`)
  }
})

test('App 接线：宿主外壳渲染在 Ops 容器之外，且按登录门/门卡收口', () => {
  assert.match(
    app,
    /\{introDone && !introLocked && effectiveApp === 'mass' \? <StoreDesignApp exitMode=\{massOnlySite \? 'ops' : 'back'\} onExit=\{exitMassApp\} \/> : null\}/u,
    '门店设计壳必须条件渲染并透传退出模式'
  )
  // 兄弟节点约束：应用层必须在 Ops 容器闭合之后（放进容器里 → 卡片/整屏层被容器 transform 与滚动作祟）
  const opsClose = app.indexOf('{renderOps ? <div ref={workspaceRootRef}')
  const shell = app.indexOf('effectiveApp === \'mass\' ? <StoreDesignApp')
  assert.ok(opsClose > 0 && shell > opsClose, '门店设计壳必须渲染在 Ops 容器之外（兄弟节点）')
})

test('宿主外壳：iframe 尺寸/退出消息/同源校验/清理齐全', () => {
  const src = stripComments(storeApp)
  assert.ok(src.includes('const frameSrc = `/store-design/index.html?embed=1&exit='), 'iframe 必须指向工具页并带嵌入参数')
  assert.ok(src.includes("exitMode === 'back' ? 'back' : 'ops'"), '退出模式必须收敛为 ops/back 两值')
  assert.ok(src.includes('src={frameSrc}'), 'iframe 必须使用构建出的地址')
  assert.ok(src.includes("exitMode === 'back' ? 'back' : 'ops'"), '退出模式缺省必须落到 ops')
  assert.ok(src.includes("event.origin !== window.location.origin"), '退出消息必须校验同源')
  assert.ok(src.includes("'store-design:exit'"), '必须识别工具页的退出消息类型')
  assert.ok(src.includes('window.addEventListener(\'message\''), '必须监听 message')
  assert.ok(src.includes('window.removeEventListener(\'message\''), '卸载必须解绑监听')
  assert.ok(src.includes("prefers-reduced-motion"), 'reduced-motion 必须有短路')
  assert.ok(src.includes('clearProps') === false && src.includes('autoAlpha: 0'), '遮罩淡出用 GSAP（大表面只用透明度）')
  assert.ok(storeApp.includes('export default function StoreDesignApp'), '必须是实际组件（非占位）')
})

test('工具页：本地工具原样发布 + 嵌入钩子（标题/退出按钮/postMessage）', () => {
  assert.match(toolHtml, /<title>门店设计 · 布局与 3D 渲染<\/title>/u, '标题必须是生产文案，不得留「本地预览」')
  assert.doesNotMatch(toolHtml, /本地预览/u, '工具页不得再出现「本地预览」字样')
  assert.match(toolHtml, /<script src="engine\.js\?v=[\d.]+"><\/script>/u, '必须按版本引用引擎')
  assert.match(toolHtml, /<script src="app\.js\?v=[\d.]+"><\/script>/u, '必须按版本引用应用脚本')
  assert.match(toolHtml, /<script src="embed\.js\?v=\d+"><\/script>/u, '必须加载嵌入钩子')
  assert.match(toolHtml, /<button id="btnExit"[^>]*hidden/u, '退出按钮默认隐藏（直接打开工具页时不显示）')
  // 钩子：只在 embed=1 显示；两种文案；同源 postMessage
  assert.ok(toolEmbed.includes("params.get('embed') !== '1'"), '未嵌入时必须直接返回')
  assert.ok(toolEmbed.includes("'去 Workshop Ops ↗'") && toolEmbed.includes("'返回应用选择'"), '两种退出文案都要有')
  assert.ok(toolEmbed.includes('window.parent.postMessage'), '退出必须通知父页面')
  assert.ok(toolEmbed.includes('window.location.origin'), 'postMessage 目标必须限定同源')
  assert.doesNotMatch(toolEmbed, /workshop\.skin/u, '工具页不得硬编码站点地址（去向由父页面决定）')
  assert.ok(toolApp.includes('window.Engine'), 'app.js 必须使用引擎（副本完整）')
  // CSP 是 script-src 'self'：工具页不得有内联脚本（会被浏览器拒绝执行），
  // 页面错误钩子因此抽成 boot.js（2026-09-15）。
  assert.match(toolHtml, /<script src="boot\.js\?v=\d+"><\/script>/u, '必须加载页面错误钩子')
  assert.equal(toolHtml.match(/<script(?![^>]*src=)[^>]*>/gu), null, '工具页不得再有内联脚本（CSP script-src \'self\'）')
})

test('工具引擎：副本可 require，默认方案校验与渲染全部通过（真功能断言）', async () => {
  // 仓库根 package.json 是 type:module，public/ 下的 UMD 引擎不能用 require 直接加载
  // （require 会把 .js 当 ESM，`this` 为 undefined → 引擎挂不上）。用 vm 起一个
  // CommonJS 上下文加载同一份源码，等价于工具自己的 `node test.js`。
  const vm = await import('node:vm')
  const sandbox = vm.createContext({ module: { exports: {} }, exports: {}, console })
  vm.runInContext(toolEngine, sandbox, { filename: 'store-design/engine.js' })
  const engine = sandbox.module.exports
  const config = engine.defaultConfig()
  const checks = engine.computeChecks(config)
  assert.equal(checks.sumDouble, 26, '双面货架总长必须 26m')
  assert.equal(checks.okStudio, true, '工作室 ≥4×4m 且背靠网面')
  assert.equal(checks.okAisle, true, '货道间距 ≥5m')
  assert.equal(checks.okEntrance, true, '出入口净空不得被占用')
  // 跨 realm 数组原型不同，deepEqual 会误判 —— 只比长度与元素（2026-09-15 实测）
  assert.equal(checks.warnings.length, 0, '默认方案不应该有告警')
  const svg = engine.render3D(config, { az: 90, el: 33, zoom: 1, vw: 1000, vh: 700 })
  for (const text of ['双面货架', '工作室', '商场出入口', '骑行试用区']) {
    assert.ok(svg.includes(text), `3D 渲染必须包含「${text}」`)
  }
  assert.doesNotMatch(svg, /NaN|undefined/u, '渲染输出不得含 NaN/undefined')
  assert.ok(engine.VERSION, '引擎必须有版本号')
})

test('样式：宿主壳类名全部落地，整屏约束与单一来源齐备', () => {
  const css = stripComments(shellCss)
  for (const [name, pattern] of [
    ['.store-design-app', /\.store-design-app\s*\{[^}]*position:\s*fixed/u],
    ['.store-design-app', /\.store-design-app\s*\{[^}]*inset:\s*0/u],
    ['.store-design-frame', /\.store-design-frame\s*\{[^}]*width:\s*100%/u],
    ['.store-design-frame', /\.store-design-frame\s*\{[^}]*height:\s*100%/u],
    ['.store-design-frame', /\.store-design-frame\s*\{[^}]*border:\s*0/u],
    ['.store-design-loading', /\.store-design-loading\s*\{[^}]*position:\s*absolute/u]
  ]) {
    assert.match(css, pattern, `${name} 缺少整屏约束`)
  }
  // 整屏层若漏了 fixed/inset，就会留在文档流里把页面撑高 —— 与食品台账「ops 泄露」同源
  assert.doesNotMatch(css, /\.store-design-frame\s*\{[^}]*padding:\s*(?!0)/u, 'iframe 不得有内边距（工具页自带布局）')
  assert.ok(styleIndex.includes("@import './store-design.css';"), '样式入口必须引入宿主壳样式')
  // 单一来源：类名只在 store-design.css 里声明，别处不得再写一遍（不许「用新规则覆盖旧规则」）
  for (const other of [appSelectCss, borderlessCss]) {
    assert.doesNotMatch(stripComments(other), /\.store-design-(app|frame|loading)/u, '宿主壳样式只允许有一个来源')
  }
  const shellUses = shellCss.match(/\.store-design-app\s*\{/gu) ?? []
  assert.equal(shellUses.length, 1, '根容器样式只允许声明一次')
})

test('应用选择屏：第三张卡（门店设计）双端齐备，桌面三列唯一来源', () => {
  const mobile = stripComments(appSelectMobile)
  const desktop = stripComments(appSelectDesktop)
  for (const [label, source] of [['移动端', mobile], ['桌面端', desktop]]) {
    assert.ok(source.includes('data-app-card="mass"'), `${label}必须有门店设计卡`)
    assert.ok(source.includes('data-tone="mass"'), `${label}必须有门店设计色调`)
    assert.ok(source.includes('门店设计'), `${label}卡名`)
    assert.ok(source.includes("statusLine('mass'"), `${label}必须走统一状态行`)
  }
  assert.ok(mobile.includes("if (app === 'mass') return '本机图纸 · 自动保存'"), '移动端状态行必须说明图纸存在本机')
  assert.ok(desktop.includes("if (app === 'mass') return '本机图纸 · 自动保存'"), '桌面端状态行必须说明图纸存在本机')
  // 三列布局：全仓库只能有一处声明，且必须是 repeat(3, minmax(0, 1fr))（memory 27 同族规则）
  const declarations = appSelectCss.match(/\.appselect-d-cards\s*\{[^}]*\}/gu) ?? []
  assert.equal(declarations.length, 1, '桌面卡片容器只允许声明一次')
  assert.match(declarations[0], /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/u, '三卡必须三列等宽（minmax(0,…) 防内容撑破）')
  assert.match(appSelectCss, /\.appselect-m-card\[data-tone='mass'\]\s*\{/u, '移动端门店设计色调必须有样式')
  assert.match(appSelectCss, /\.appselect-d-card\[data-tone='mass'\]\s*\{/u, '桌面端门店设计色调必须有样式')
})

test('日报菜单：门店设计入口接线完整（组件入口 + 父级透传）', () => {
  assert.ok(stripComments(menuDialog).includes('onOpenMassDesign'), '菜单组件必须提供门店设计入口')
  assert.ok(menuDialog.includes('门店设计'), '入口文案')
  assert.ok(app.includes("onOpenMassDesign={() => chooseApp('mass')}"), 'App 必须把入口接到应用选择逻辑上')
})

test('Service Worker：只有根路径导航才刷新离线兜底副本', () => {
  const src = stripComments(sw)
  assert.ok(src.includes("const isShellNavigation = url.pathname === '/'"), '必须区分根路径导航')
  // 无条件 put('/') 会让 /store-design/ 的 iframe 导航顶替工作台外壳
  assert.match(src, /if \(isShellNavigation && response\.ok\)/u, '写缓存必须被根路径判定守卫')
  assert.doesNotMatch(src, /if \(event\.request\.mode === 'navigate'\) \{\n\s*event\.respondWith\(fetch\(event\.request\)\.then\(\(response\) => \{\n\s*const copy/u, '不得退回无条件写 / 的旧写法')
})
