import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const read = (rel) => readFile(new URL(rel, import.meta.url), 'utf8')

const [app, storeApp, siteMode, appSelectMobile, appSelectDesktop, menuDialog, appSelectCss, shellCss, styleIndex, sw, toolHtml, toolEmbed, toolApp, toolEngine, borderlessCss, stagingWorkflow, productionWorkflow, workerSession, workerMiddleware, workerAuthRoute, webClient, toolSchema, toolBaseCss, toolMobileCss, toolDesktopCss, toolBoot, toolUiMobile, toolUiDesktop] = await Promise.all([
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
  read('../apps/web/src/styles/borderless.css'),
  read('../.github/workflows/deploy-cloudflare-staging.yml'),
  read('../.github/workflows/deploy-production.yml'),
  read('../apps/worker/src/auth/session.ts'),
  read('../apps/worker/src/auth/middleware.ts'),
  read('../apps/worker/src/routes/auth.ts'),
  read('../apps/web/src/api/client.js'),
  read('../apps/web/public/store-design/sd-schema.js'),
  read('../apps/web/public/store-design/sd-base.css'),
  read('../apps/web/public/store-design/sd-mobile.css'),
  read('../apps/web/public/store-design/sd-desktop.css'),
  read('../apps/web/public/store-design/sd-boot.js'),
  read('../apps/web/public/store-design/sd-ui-mobile.js'),
  read('../apps/web/public/store-design/sd-ui-desktop.js')
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
  // 退出按钮默认隐藏在宿主钩子侧（两个界面实现各自渲染），见下方「双端实现」用例
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

// ── 2026-09-15 三站共享会话（用户：「第一次登录后，选择进入食品登记模块就不要再一次登录了」）

test('来源白名单：三个正式站点都要能调 API（缺谁谁被 ORIGIN_NOT_ALLOWED 拦下）', () => {
  // 线上三站（workshop.skin / eat / mass）都由 bike-ops-staging 这个 Worker 提供服务，
  // 所以它的来源白名单必须三站齐全；生产工作流另绑 www 与独立域名，同样列出两个子站。
  for (const host of ['workshop.skin', 'eat.workshop.skin', 'mass.workshop.skin']) {
    assert.ok(stagingWorkflow.includes(`https://${host}`), `staging 的 CORS 来源必须包含 ${host}`)
  }
  for (const host of ['www.workshop.skin', 'eat.workshop.skin', 'mass.workshop.skin']) {
    assert.ok(productionWorkflow.includes(`https://${host}`), `production 的 CORS 来源必须包含 ${host}`)
  }
})

test('会话 cookie：跨子域共享（__Secure- + Domain），且只对正式域名放开', () => {
  const session = stripComments(workerSession)
  // `__Host-` 前缀在规范上禁止 Domain —— 留着它就等于放弃跨子域共享
  assert.doesNotMatch(session, /__Host-\$\{/u, '会话 cookie 不得再使用 __Host- 前缀')
  assert.ok(session.includes("`__Secure-${SESSION_COOKIE_BASE}`"), 'HTTPS 环境必须带 __Secure- 前缀')
  assert.ok(session.includes("return isProductionHost ? `; Domain=${SHARED_COOKIE_DOMAIN}` : ''"), 'Domain 必须收敛到正式域名判定')
  assert.ok(session.includes("host.endsWith(SHARED_COOKIE_DOMAIN)"), '子域共享必须按后缀匹配')
  assert.ok(session.includes("host === 'workshop.skin'"), '裸域必须显式列出（endsWith 匹配不到 workshop.skin 本身）')
  // 旧名兼容：换名后不能把已登录用户踢出去
  assert.ok(workerMiddleware.includes('readCookie(c, LEGACY_SESSION_COOKIE)'), '过渡期必须仍能读取旧名 cookie')
  assert.ok(session.includes('LEGACY_SESSION_COOKIE}=;'), '登出必须同时清理旧名 cookie')
  assert.ok(workerAuthRoute.includes('sessionCookieName(c.get(\'config\'))'), '会话名端点必须返回当前名')
})

test('CSRF 自愈：INVALID_CSRF 就地补票重放，且沿用同一幂等键', () => {
  const client = stripComments(webClient)
  assert.ok(client.includes("payload?.error === 'INVALID_CSRF'"), '必须识别 INVALID_CSRF')
  assert.ok(client.includes('retriedCsrf: true'), '必须带重试标记（只补一次）')
  assert.ok(client.includes('idempotencyKey: key || undefined'), '重放必须沿用同一幂等键，避免重复执行')
  assert.ok(client.includes('refreshCsrfToken'), '必须有补票实现')
  assert.ok(client.includes("fetch(`${API_BASE}/api/v1/auth/me?_=${Date.now()}`"), '补票走 /auth/me（服务端每次轮换 CSRF）')
})

// ── 2026-09-15 无边线改造 + 双端拆分（用户要求：ops 同款无边线、着重清理底部杂乱数据、双端分开）──

test('双端实现：两套独立实现 + 互斥加载，运行时按视口二选一', () => {
  // 两套实现各自成文件，各自有完整样式；任何一端都不靠媒体查询去兼容另一端
  for (const [name, source] of [['移动端', toolUiMobile], ['桌面端', toolUiDesktop]]) {
    assert.ok(source.includes('window.SDUI = {'), `${name} 必须导出 SDUI 接口`)
    for (const fn of ['mount', 'renderStatus', 'renderPanel', 'selBarHTML', 'refreshSelVals', 'onSelectionChange', 'revealSelection']) {
      assert.ok(source.includes(fn + ':'), `${name} 必须实现 ${fn}`)
    }
  }
  assert.match(toolUiMobile, /id: 'mobile'/u)
  assert.match(toolUiDesktop, /id: 'desktop'/u)
  // 互斥加载：两端样式里不得出现对方类名，也不得写媒体查询（因为根本不会同时存在）
  const mobileCssNoComments = toolMobileCss.replace(/\/\*[\s\S]*?\*\//gu, '')
  const desktopCssNoComments = toolDesktopCss.replace(/\/\*[\s\S]*?\*\//gu, '')
  assert.equal((mobileCssNoComments.match(/\.sd-d-[a-z]/gu) || []).length, 0, '移动端样式不得包含桌面端类名')
  assert.equal((desktopCssNoComments.match(/\.sd-m-[a-z]/gu) || []).length, 0, '桌面端样式不得包含移动端类名')
  assert.equal((mobileCssNoComments.match(/@media/gu) || []).length, 0, '互斥加载的样式不需要媒体查询')
  assert.equal((desktopCssNoComments.match(/@media/gu) || []).length, 0, '互斥加载的样式不需要媒体查询')
  // 选择器：运行时按视口决定加载哪一套
  assert.match(toolBoot, /matchMedia\('\(max-width: ' \+ NARROW_MAX \+ 'px\)'\)/u, '必须按视口选择实现')
  assert.ok(toolBoot.includes("'sd-' + impl + '.css"), '按视口注入样式')
  assert.ok(toolBoot.includes("'sd-ui-' + impl + '.js"), '按视口注入实现脚本')
  assert.ok(toolBoot.includes("window.dispatchEvent(new Event('sd-ui-ready'))"), '就绪后通知 app.js')
  // 页面本身不得直接引入 UI 实现（否则等于两套都加载）
  // 只看 <script src>：注释里会提到这两个文件名（说明性文字，不算引入）
  assert.doesNotMatch(
    toolHtml.replace(/<!--[\s\S]*?-->/gu, ''),
    /<script[^>]*sd-ui-(mobile|desktop)/u,
    'index.html 不得直接引入界面实现（否则等于两套都加载）'
  )
  assert.ok(toolHtml.includes('sd-boot.js'), 'index.html 必须由选择器接管')
});

test('无边线：三份样式表里没有一处可见描边', () => {
  for (const [name, source] of [['基础', toolBaseCss], ['移动端', toolMobileCss], ['桌面端', toolDesktopCss]]) {
    const decls = [...source.matchAll(/border(?:-(?:top|right|bottom|left|width|style|color))?\s*:\s*([^;]+);/gu)].map((m) => m[1].trim());
    const visible = decls.filter((value) => !/^(0|none)/u.test(value));
    assert.deepEqual(visible, [], `${name}样式仍有可见描边：${visible.join(' | ')}`);
  }
  // 层次必须来自底色：三档底色令牌都在
  for (const token of ['--sd-page', '--sd-card', '--sd-sunken', '--sd-accent']) {
    assert.ok(toolBaseCss.includes(token + ':'), `缺少底色令牌 ${token}`);
  }
});

test('每个类名都有样式落地（JS 与样式不得脱节）', () => {
  // memory 26/27 教训：只断言结构不断言样式，会做出「类名齐了但样式全缺」的白板页面
  const classNames = (source, re) => {
    const found = new Set();
    for (const match of source.matchAll(/class="([^"]*)"/gu)) {
      for (const name of match[1].split(/\s+/u)) if (re.test(name)) found.add(name);
    }
    for (const match of source.matchAll(/'([a-z0-9-]*sd-[md]-[a-z0-9-]+)[^']*'/gu)) {
      for (const name of match[1].split(/\s+/u)) if (re.test(name)) found.add(name);
    }
    return found;
  };
  const missing = [];
  for (const [js, css, re, label] of [
    [toolUiMobile, toolMobileCss, /^sd-m-/u, '移动端'],
    [toolUiDesktop, toolDesktopCss, /^sd-d-/u, '桌面端']
  ]) {
    const cssBody = css.replace(/\/\*[\s\S]*?\*\//gu, '');
    for (const name of classNames(js, re)) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
      if (!new RegExp('\\.' + escaped + '(?![\\w-])[^{}]*\\{', 'u').test(cssBody)) missing.push(`${label}:${name}`);
    }
  }
  assert.deepEqual(missing, [], `以下类名没有任何样式：${missing.join(', ')}`);
});

test('数据模型：只有「选中的那一个」带字段，底部不再全量铺开', async () => {
  // 旧版把 15 组段落里每个元素的所有字段一次性铺在页面底部（默认就 200+ 个输入框）。
  // 现在元素清单是「清单 + 当前选中项的字段」，其余项只有标题与摘要。
  const vm = await import('node:vm')
  const sandbox = vm.createContext({ module: { exports: {} }, exports: {}, console, window: {} })
  vm.runInContext(toolEngine, sandbox, { filename: 'engine.js' })
  sandbox.window.Engine = sandbox.module.exports
  sandbox.module = { exports: {} }
  vm.runInContext(toolSchema, sandbox, { filename: 'sd-schema.js' })
  const schema = sandbox.window.SD_SCHEMA
  assert.ok(schema && typeof schema.buildVM === 'function', 'sd-schema 必须导出 buildVM')

  const engine = sandbox.window.Engine
  const cfg = engine.defaultConfig()

  const bare = schema.buildVM(cfg, {})
  assert.equal(bare.selection, null, '未选中时不应有选中卡片')
  // 跨 vm realm 的数组原型不同，deepEqual 会误判 —— 只比长度（memory 21 的老坑）
  const withFields = bare.elements.flatMap((g) => g.items).filter((it) => (it.fields || []).length > 0)
  assert.equal(withFields.length, 0, '未选中时元素清单不应携带任何字段（否则又变成全量铺开）')
  assert.ok(bare.elements.length >= 5, '元素清单必须按类型分组')
  assert.ok(bare.elements.flatMap((g) => g.items).length >= 10, '元素清单必须列出全部元素')
  assert.equal(bare.checks.length, 6, '检查页固定六项')

  const shelfId = 'sh:' + cfg.shelves[0].id
  const picked = schema.buildVM(cfg, { sel: shelfId })
  assert.ok(picked.selection, '选中货架后必须有选中卡片')
  assert.equal(picked.selection.fields.length, 9, '货架字段数（名称/类型/朝向/长度/高度 + 地架/挂钩 + x/y）')
  assert.ok(picked.selection.fields.every((f) => f.path.startsWith('shelves.')), '字段路径必须指向该货架')
  const stillBare = picked.elements.flatMap((g) => g.items).filter((it) => (it.fields || []).length > 0)
  assert.equal(stillBare.length, 1, '只有选中的那一个元素携带字段')

  // 设置页：结构级参数（空间/外墙/内隔墙）
  assert.equal(picked.settings.map((g) => g.key).join(','), 'space,walls,segs', '设置页分组')
  const pathCount = picked.selection.fields.length
    + picked.settings.reduce((acc, g) => acc + g.items.reduce((n, it) => n + it.fields.length, 0), 0)
  assert.ok(pathCount < 80, `字段总数应远小于旧版全量清单（当前 ${pathCount}）`);
});

test('删旧不覆盖：旧的面板构建器与旧样式已从源码移除', () => {
  // 用户明确要求：改 UI 时直接删掉旧实现，不许用新规则去覆盖旧规则。
  // 注意：buildSheet / ADD_LIST 是「添加组件」面板（仍然需要，只是换了皮肤），不在删除之列。
  // 扫描范围是全部工具脚本（不只是 app.js）：旧的全量铺开实现不得从任何文件里复活。
  const legacy = ['function shelvesBody', 'function studioBody', 'function zonesBody', 'function chkLines',
    'function helpBody', 'function sec(', '<details data-sec=', 'els.chips.innerHTML',
    "bar.innerHTML = '<div class=\"selrow\">", 'function spaceBody', 'function wallsBody',
    'function backupsBody', 'function markersBody', 'function meshesBody']
  for (const [name, source] of [['app.js', toolApp], ['sd-schema.js', toolSchema], ['sd-ui-mobile.js', toolUiMobile], ['sd-ui-desktop.js', toolUiDesktop]]) {
    for (const gone of legacy) {
      assert.ok(!source.includes(gone), `${name} 仍残留旧实现：${gone}`)
    }
  }
  // 旧的单文件样式（内联 <style> + 媒体查询适配双端）必须整段消失
  assert.doesNotMatch(toolHtml, /<style>/u, 'index.html 不得再内联 <style>（样式已拆到两份实现文件）')
  assert.ok(toolHtml.includes('sd-base.css'), 'index.html 必须引入基础样式')
});

// ── 2026-09-15 三栏工作台（建模软件布局）+ 平面缩放修复 ──────────────────

test('桌面端：三栏工作台（左工具栏 / 中视觉窗口 / 右属性栏），右栏可收起可拖宽', () => {
  const css = toolDesktopCss.replace(/\/\*[\s\S]*?\*\//gu, '')
  const ui = stripComments(toolUiDesktop)
  // 三栏栅格：左固定、中吃掉剩余、右由变量控制（可拖宽）
  // 连选择器一起抓：收起态那条规则的前缀是 #sdApp[data-collapsed='true']
  const grids = css.match(/[^{}]*\.sd-d-workbench\s*\{[^}]*\}/gu) || []
  assert.equal(grids.length, 2, '工作台栅格只允许两处（默认 + 收起态）')
  assert.match(grids[0], /grid-template-columns:\s*152px minmax\(0, 1fr\) var\(--sd-props-w/u, '默认三栏：左工具栏固定、中自适应、右可调')
  assert.match(grids[1], /#sdApp\[data-collapsed='true'\]/u, '收起态必须由 data-collapsed 驱动')
  assert.match(grids[1], /56px/u, '收起后右栏只留图标条')
  // 交互：拖宽手柄 + 收起按钮 + 宽度持久化
  assert.ok(ui.includes("data-sd-resize=\"1\""), '必须有拖宽手柄')
  assert.ok(ui.includes("data-sd-collapse=\"1\""), '必须有收起按钮')
  assert.ok(ui.includes("localStorage.setItem(PREFS_KEY"), '右栏宽度/收起状态必须持久化')
  assert.ok(ui.includes('dblclick'), '手柄双击复位')
  // 视觉窗口必须是主要空间：中栏 minmax(0, 1fr) 且视口容器占满剩余高度
  assert.match(css, /\.sd-d-viewport\s*\{[^}]*min-height:\s*0/u, '视觉窗口需要 min-height:0 才能撑满')
  assert.match(css, /\.sd-d-canvas\s*\{[^}]*flex:\s*1 1 auto/u, '画布必须吃掉窗口剩余高度')
  // 工具清单来自数据层（两端共用），不允许各自硬编码
  assert.ok(toolSchema.includes('TOOL_GROUPS'), '工具清单必须在 sd-schema（数据层）里')
  assert.ok(ui.includes('vm.tools') || ui.includes('vm && vm.tools'), '桌面端工具从视图模型取')
  assert.ok(toolUiMobile.includes('vm.tools') || toolUiMobile.includes('vm && vm.tools'), '移动端工具从视图模型取')
});

test('平面缩放：SVG 保持固有尺寸（不得被 CSS 拉伸），且滚轮/双指可缩放', () => {
  const base = toolBaseCss.replace(/\/\*[\s\S]*?\*\//gu, '')
  // 根因：把 #viewplan svg 也写成 width:100% 会让「改 z」只改内部坐标、外观不变
  const planRule = base.match(/#viewplan svg\s*\{[^}]*\}/u)
  assert.ok(planRule, '#viewplan svg 必须有独立规则')
  assert.doesNotMatch(planRule[0], /width:\s*100%/u, '平面 SVG 不得被拉伸（那正是「无法缩放」的根因）')
  assert.match(base, /#view3d svg\s*\{[^}]*width:\s*100%/u, '3D 视角仍应自适应容器宽度')
  // 交互：滚轮 / 双指 / 中键，且缩放以指针为锚点
  const app = stripComments(toolApp)
  assert.ok(app.includes('function zoomPlanAt('), '必须有以指针为锚点的缩放函数')
  // 断言「行首的语句」而不是「字符串出现过」：把调用塞进 if (false) 也必须变红
  assert.match(app, /\n\s*sc\.addEventListener\('wheel'/u, '平面必须真正注册滚轮缩放（不能是死分支）')
  assert.ok(app.includes('pinch'), '平面必须支持双指捏合缩放')
  assert.ok(app.includes('e.button === 1'), '平面必须支持中键平移')
  assert.ok(app.includes('bindPlanZoom();'), '初始化时必须绑定缩放')
  assert.ok(app.includes('zoomPlanAt(currentPlanZ() * 1.3)'), '＋按钮也要走同一缩放函数（保持锚点一致）')
});

test('工具栏接线：点工具即添加并进入摆放模式（旧悬浮面板已删除）', () => {
  const app = stripComments(toolApp)
  assert.ok(app.includes('add: function(ds)'), '必须有 add 动作')
  assert.ok(app.includes('addComponent(ds.kind)'), 'add 动作必须调用 addComponent')
  // 旧的悬浮面板整段删除，不能再复活
  for (const gone of ['ADD_LIST', 'buildSheet', 'openSheet', '#fab', 'addsheet', 'sheetgrid']) {
    assert.ok(!app.includes(gone), `app.js 仍残留旧悬浮面板实现：${gone}`)
  }
  // 工具栏按钮不在 #editors/#selbar 子树里 → 必须有文档级委托
  assert.match(app, /\n\s*document\.addEventListener\('click'/u, '工具栏需要真正注册全局动作委托（不能是死分支）')
  assert.ok(app.includes("b.closest('#editors') || b.closest('#selbar')"), '子树内按钮必须跳过，避免重复触发')
  // 移动端：摆放时要能看到「完成」，因此自动展开属性面板；选工具后收起抽屉让出画布
  const mob = stripComments(toolUiMobile)
  assert.match(mob, /\n\s*if \(ctx && ctx\.placing\)\s*\{/u, '移动端摆放模式必须真正自动展开属性面板（不能是死分支）')
  // 用正则而不是字符串拼接：这里的引号嵌套极易写坏（本轮踩过）
  assert.match(mob, /closest\('\[data-act="add"\]'\)/u, '移动端选工具后应收起抽屉')
});

// ── 2026-09-15 货架自行车托臂 / 地架 / 挂钩（门店实际陈列规格）────────────────
// 用户口径：货架高 3.3m；托臂分短托臂（伸出 0.5m）与长托臂（伸出 1m），两者可分别
// 放置、每排高度可在货架上调整；1m 货架放 3 个地架；挂钩 1m 4 个；
// 每排位宽：成人车 2m、16″ 童车 4/3m（2m 货架 1 台/排；4m 货架 3 台童车/排）。

async function loadToolEngine() {
  const vm = await import('node:vm')
  const sandbox = vm.createContext({ module: { exports: {} }, exports: {}, console })
  vm.runInContext(toolEngine, sandbox, { filename: 'store-design/engine.js' })
  return sandbox.module.exports
}
function shelfWith(engine, acc, len) {
  const c = engine.defaultConfig()
  c.bikes = []
  c.shelves = [Object.assign({}, c.shelves[0], { id: 's1', len: len ?? 4, acc: acc })]
  return c
}

test('托臂：短/长两种长度与门店口径一致（0.5m / 1m），货架默认高 3.3m', async () => {
  const engine = await loadToolEngine()
  assert.equal(engine.SHELF_H_DEFAULT, 3.3, '门店货架高度默认 3.3m')
  assert.equal(engine.defaultConfig().shelves[0].h, 3.3, '默认方案货架高 3.3m')
  assert.equal(engine.ARM_LEN.short, 0.5, '短托臂伸出 0.5m')
  assert.equal(engine.ARM_LEN.long, 1.0, '长托臂伸出 1m')
  // 每排台数：2m 货架 1 台成人车；4m 货架 3 台 16″ 童车
  const two = shelfWith(engine, { armRows: [{ id: 'a1', z: 0.9, len: 'short', size: 'adult' }] }, 2)
  assert.equal(engine.accBikesOf(two).filter((b) => b.acc === 'arm').length, 1, '2m 货架 1 台成人车/排')
  const four = shelfWith(engine, { armRows: [{ id: 'a1', z: 0.9, len: 'short', size: 'kids' }] }, 4)
  assert.equal(engine.accBikesOf(four).filter((b) => b.acc === 'arm').length, 3, '4m 货架 3 台童车/排')
  // 地架 3 个/m、挂钩 4 个/m
  const r1 = shelfWith(engine, { rack: 'kids', hook: 'on' }, 1)
  assert.equal(engine.rackCount(r1.shelves[0]), 3, '1m 地架 3 个')
  assert.equal(engine.hookCount(r1.shelves[0]), 4, '1m 挂钩 4 个')
  // 默认方案不装任何附件
  const d = engine.defaultConfig()
  assert.equal(engine.accOn(d.shelves[0]), false, '默认货架不装附件')
  assert.equal(engine.accOf(d.shelves[0]).rows.length, 0, '默认没有托臂排')
})

test('托臂：短 / 长可分别放置，每排高度与范围独立（含左右混排）', async () => {
  const engine = await loadToolEngine()
  // 两排：下层短托臂挂童车 + 上层长托臂挂成人车，高度各自独立
  const c = shelfWith(engine, { armRows: [
    { id: 'a1', z: 0.9, len: 'short', size: 'kids', u0: 0, u1: 4 },
    { id: 'a2', z: 2.15, len: 'long', size: 'adult', u0: 0, u1: 4 }
  ] }, 4)
  const bikes = engine.accBikesOf(c).filter((b) => b.acc === 'arm')
  assert.equal(bikes.length, 5, '4m 货架：童车排 3 台 + 成人车排 2 台（各排独立计算）')
  const lifts = bikes.map((b) => b.lift)
  assert.deepEqual(lifts.filter((z) => z === 0.9).length, 3, '三台童车在 0.9m 层')
  assert.deepEqual(lifts.filter((z) => z === 2.15).length, 2, '两台成人车在 2.15m 层')
  // 长托臂把车挂得更靠外（伸出 1m → 车离货架 0.90m），短托臂 0.5m → 0.40m
  const shelfY = c.shelves[0].y, depth = engine.shelfDepth(c.shelves[0])
  const kid = bikes.find((b) => b.lift === 0.9), adult = bikes.find((b) => b.lift === 2.15)
  assert.ok(Math.abs((kid.y - (shelfY + depth)) - 0.40) < 0.02, '短托臂：车离货架面 0.40m')
  assert.ok(Math.abs((adult.y - (shelfY + depth)) - 0.90) < 0.02, '长托臂：车离货架面 0.90m')
  // 每排两根托臂（前后轮），长度与排规格一致
  const hw = engine.armHardwareOf(c, c.shelves[0])
  assert.equal(hw.length, 10, '5 台车 × 2 根托臂 = 10 根')
  const shortArms = hw.filter((h) => h.len === 'short'), longArms = hw.filter((h) => h.len === 'long')
  assert.equal(shortArms.length, 6, '童车排 3 台 × 2 根 = 6 根短托臂')
  assert.equal(longArms.length, 4, '成人车排 2 台 × 2 根 = 4 根长托臂')
  for (const h of shortArms) {
    assert.equal(h.armLen, 0.5, '短托臂伸出 0.5m')
    assert.ok(Math.abs(Math.abs(h.tip.y - h.inner.y) - 0.48) < 0.01, '短托臂管身 0.48m（内端留 0.02 贴面）')
  }
  for (const h of longArms) {
    assert.equal(h.armLen, 1.0, '长托臂伸出 1m')
    assert.ok(Math.abs(Math.abs(h.tip.y - h.inner.y) - 0.98) < 0.01, '长托臂管身 0.98m')
  }
  // 高度可调：改 z 后排内车与托臂跟着走
  const c2 = shelfWith(engine, { armRows: [{ id: 'a1', z: 1.4, len: 'short', size: 'kids', u0: 0, u1: 4 }] }, 4)
  assert.equal(engine.accBikesOf(c2)[0].lift, 1.4, '托臂排高度直接决定挂车高度')
  // 范围：只占货架一段时台数与位置随之变化
  const c3 = shelfWith(engine, { armRows: [{ id: 'a1', z: 0.9, len: 'short', size: 'kids', u0: 0, u1: 2.7 }] }, 4)
  const b3 = engine.accBikesOf(c3).filter((b) => b.acc === 'arm')
  assert.equal(b3.length, 2, '2.7m 范围内 2 台童车')
  assert.ok(Math.max.apply(null, b3.map((b) => b.x - c3.shelves[0].x)) <= 2.7, '车不超出该排范围')
})

test('托臂：3D 与平面渲染落地（装置 + 挂车，无 NaN/undefined）', async () => {
  const engine = await loadToolEngine()
  const c = shelfWith(engine, { armRows: [
    { id: 'a1', z: 0.9, len: 'short', size: 'kids', u0: 0, u1: 4 },
    { id: 'a2', z: 2.15, len: 'long', size: 'adult', u0: 0, u1: 4 }
  ], rack: 'kids', hook: 'on' }, 4)
  const svg3 = engine.render3D(c, { az: 90, el: 33, zoom: 1, vw: 1000, vh: 700 })
  const svgP = engine.renderPlan(c, { sel: null })
  assert.ok(!/NaN|undefined/u.test(svg3), '3D 渲染不得含 NaN/undefined')
  assert.ok(!/NaN|undefined/u.test(svgP), '平面渲染不得含 NaN/undefined')
  assert.equal((svg3.match(/data-acc="arm"/gu) ?? []).length, 5, '3D 托臂挂车 5 台')
  assert.equal((svgP.match(/data-acc="arm"/gu) ?? []).length, 5, '平面托臂挂车 5 台')
  assert.equal((svg3.match(/data-acc="rack"/gu) ?? []).length, 12, '3D 地架车 12 台')
  assert.match(svgP, /data-id="acc:s1:arm:/u, '平面挂车用 acc: 前缀 id（点它映射到所属货架）')
  // 长托臂挂得远：平面里这排车的 y 明显更靠外
  const longBike = engine.accBikesOf(c).filter((b) => b.acc === 'arm').find((b) => b.lift === 2.15)
  const shortBike = engine.accBikesOf(c).filter((b) => b.acc === 'arm').find((b) => b.lift === 0.9)
  assert.ok(longBike.y > shortBike.y, '长托臂挂车比短托臂更远离货架')
})

test('托臂：交互接线（双端按钮 + 排管理 + 面板字段 + 点击映射）', () => {
  const app = stripComments(toolApp)
  for (const fn of ['function addArmRow(', 'function delArmRow(', 'function clearArms(', 'function nextArmRowId(']) {
    assert.ok(app.includes(fn), 'app.js 必须实现 ' + fn)
  }
  assert.ok(app.includes("addArm: function(ds){ var p = String(ds.id).split(':'); addArmRow(p[0], p[1]); }"), 'acts 必须接 addArm')
  assert.ok(app.includes("delArmRow: function(ds){ var p = String(ds.id).split(':'); delArmRow(p[0], +p[1]); }"), 'acts 必须接 delArmRow')
  assert.ok(app.includes("clearArms: function(ds){ clearArms(ds.id); }"), 'acts 必须接 clearArms')
  assert.ok(app.includes("act === 'addArm'"), 'selbar 必须处理「＋短/长托臂」')
  assert.ok(app.includes("if (id && id.slice(0, 4) === 'acc:') id = 'sh:' + id.split(':')[1];"), '点击挂车 / 附件车必须映射到所属货架')
  assert.ok(app.includes('function renderSelBar(force)'), 'renderSelBar 必须支持强制重建（按钮态随点随变）')
  assert.ok(app.includes("if (/^shelves\\.\\d+\\.acc\\./.test(p))"), '属性面板改附件要刷新快捷条')
  // 双端各自实现（桌面经 accBtnDesktop 风格的原生按钮；移动端直接拼字符串）
  const dtUi = stripComments(toolUiDesktop)
  for (const arm of ['short', 'long']) {
    assert.ok(dtUi.includes(`data-bact="addArm" data-arm="${arm}"`), `桌面端必须有 ＋${arm} 托臂按钮`)
  }
  assert.ok(dtUi.includes('data-bact="clearArms"'), '桌面端必须有清空托臂按钮')
  assert.ok(!dtUi.includes("accBtnDesktop('accArm'"), '桌面端旧托臂循环按钮必须删除（删旧不覆盖）')
  const mbUi = stripComments(toolUiMobile)
  for (const arm of ['short', 'long']) {
    assert.ok(mbUi.includes(`data-bact="addArm" data-arm="${arm}"`), `移动端必须有 ＋${arm} 托臂按钮`)
  }
  assert.ok(mbUi.includes('data-bact="clearArms"'), '移动端必须有清空托臂按钮')
  assert.ok(!mbUi.includes('data-bact="accArm"'), '移动端旧托臂循环按钮必须删除')
  // 属性面板：每排 5 个字段（高度 / 托臂长度 / 车型 / 起始 / 结束）
  const schema = stripComments(toolSchema)
  for (const field of ['armRows.', '.z', '.len', '.size', '.u0', '.u1']) {
    assert.ok(schema.includes("'shelves.' + i + '.acc.armRows.' + ri + '" + field) || schema.includes(field), '属性面板托臂排字段：' + field)
  }
  assert.ok(schema.includes("['short','短托臂 0.5m'],['long','长托臂 1m']"), '托臂长度选项必须写明 0.5m / 1m')
  assert.ok(schema.includes("action('addArm', s.id + ':short', '＋短托臂 0.5m')"), '元素清单必须有 ＋短托臂')
  assert.ok(schema.includes("action('addArm', s.id + ':long', '＋长托臂 1m')"), '元素清单必须有 ＋长托臂')
  assert.ok(schema.includes("action('delArmRow'"), '元素清单必须能删单排托臂')
  assert.ok(schema.includes("action('clearArms'"), '元素清单必须能清空托臂')
})

test('事件委托：面板按钮在重建后面板时不得被重复触发（删一排托臂只删一排）', () => {
  const app = stripComments(toolApp)
  // 事故（2026-09-15 实机复现）：点「删托臂排」→ acts.delArmRow → afterStruct 重建面板 →
  // 按钮脱离文档 → 文档级委托里 closest('#editors') 失效 → 同一动作执行两次（3 排→1 排）。
  assert.ok(app.includes('if (!b.isConnected) return;'), '文档级委托必须用 isConnected 判定按钮是否还在树上')
  const guard = app.indexOf('if (!b.isConnected) return;')
  const skip = app.indexOf("if (b.closest('#editors') || b.closest('#selbar')) return;")
  assert.ok(guard > 0 && guard < skip, 'isConnected 判定必须在 closest 跳过之前')
  // 面板内的按钮处理器（onEditClick）不得依赖「按钮仍在文档里」
  assert.ok(app.includes('function onEditClick(e){'), '面板按钮仍由 onEditClick 处理')
  assert.ok(app.includes('var fn = acts[b.getAttribute(\'data-act\')];\n  if (fn) fn(b.dataset || {});'),
    'onEditClick 必须用 dataset 快照分发（重建后依然可用）')
})

test('托臂：旧数据迁移（单条托臂 → 托臂排；货架高度 1.5m → 3.3m，只做一次）', async () => {
  const engine = await loadToolEngine()
  const legacy = engine.defaultConfig()
  legacy.v = 1
  legacy.shelves = [{ id: 'z1', name: '', kind: 'double', orient: 'h', x: 2, y: 2, len: 7.5, h: 1.5, acc: { arm: 'kids', rack: 'kids', hook: 'on' } }]
  const mig = engine.migrateLegacy(legacy)
  assert.equal(mig.shelves[0].h, 3.3, '旧默认 1.5m 货架一次性升到 3.3m')
  assert.equal(mig.shelves[0].acc.arm, undefined, '旧 acc.arm 必须清掉')
  assert.equal(mig.shelves[0].acc.armRows.length, 1, '旧单条托臂迁移成一排')
  assert.equal(mig.shelves[0].acc.armRows[0].size, 'kids', '车型沿用旧值')
  assert.equal(mig.shelves[0].acc.armRows[0].len, 'short', '旧版按短托臂迁移')
  assert.equal(mig.shelves[0].acc.rack, 'kids', '地架 / 挂钩不受影响')
  // 重复迁移不叠加
  const mig2 = engine.migrateLegacy(mig)
  assert.equal(mig2.shelves[0].acc.armRows.length, 1, '迁移幂等')
  // 用户自己把高度改回去后不会被再覆盖（v>=2）
  mig.shelves[0].h = 1.5
  assert.equal(engine.migrateLegacy(mig).shelves[0].h, 1.5, '一次性迁移不得反复覆盖用户设定')
  // 矮货架保持 0.9m
  const low = engine.defaultConfig()
  low.v = 1
  low.shelves = [{ id: 'z2', name: '', kind: 'low', orient: 'h', x: 2, y: 2, len: 4, h: 0.9, acc: {} }]
  assert.equal(engine.migrateLegacy(low).shelves[0].h, 0.9, '矮货架高度不动')
})

// ── 2026-09-15 穿模修复（挂车不得被货架面盖住）+ 货架正面视角 ──────────────────

test('穿模：挂车 / 附件在货架面之后绘制（按所属货架的深度区间排序）', async () => {
  const engine = await loadToolEngine()
  const c = engine.defaultConfig()
  c.bikes = []
  c.shelves = [Object.assign({}, c.shelves[0], {
    id: 's1', len: 7.5, h: 3.3,
    acc: { armRows: [
      { id: 'a1', z: 0.9, len: 'short', size: 'adult', u0: 0, u1: 7.5 },
      { id: 'a2', z: 2.15, len: 'short', size: 'adult', u0: 0, u1: 7.5 }
    ] }
  })]
  // 45°（用户截图的角度）：修复前挂车被货架正面面的平均深度压住 → 整台车看不见
  const svg = engine.render3D(c, { az: 45, el: 33, zoom: 1, vw: 1000, vh: 700 })
  const firstBike = svg.indexOf('data-acc="arm"')
  assert.ok(firstBike > 0, '3D 里必须有挂车')
  // 货架正面面填充色（PAL.shelfD.t）最后出现的位置 = 该面绘制的位置
  const lastFace = Math.max(svg.lastIndexOf('fill="#f5e6ca"'), svg.lastIndexOf('fill="#ecd7ae"'))
  assert.ok(lastFace > 0, '3D 里必须有货架的正面面')
  assert.ok(firstBike > lastFace, '挂车必须在货架面之后绘制（否则就是穿模：被货架吃掉）')
  // 下层与上层都要可见（修复前只有上层可见）
  const keys = []
  const re = /data-acc="arm"/gu
  let m
  while ((m = re.exec(svg))) keys.push(m.index)
  assert.equal(keys.length, 6, '两排共 6 台挂车')
  for (const k of keys) assert.ok(k > lastFace, '每一台挂车都必须在货架面之后')
  // 结构护栏：附件走所属货架的深度区间（相机在附件一侧 → 之后；否则 → 之前）
  const eng = stripComments(toolEngine)
  assert.ok(eng.includes('function boxKeyRange('), '引擎必须有盒子深度区间工具')
  assert.ok(eng.includes('function cameraOnSide('), '引擎必须能判断相机在货架哪一侧')
  assert.ok(eng.includes('var attachKeyOf = null;'), '货架循环必须建立附件排序上下文')
  assert.ok(eng.includes('return sOnSide ? (k > sRange.max + 0.02 ? k : sRange.max + 0.02)'), '附件在一侧时画在货架之后')
  assert.ok(eng.includes('(k < sRange.min - 0.02 ? k : sRange.min - 0.02)'), '附件在另一侧时画在货架之前')
  assert.ok(eng.includes('function boxAdd(bx, pal, op, keyOf){'), 'boxAdd 必须支持自定义深度键')
  const ownerIdx = eng.indexOf('var bikeOwner = {};')
  const concatIdx = eng.indexOf('(cfg.bikes || []).concat(accBikesOf(cfg)).forEach(function(bk){')
  assert.ok(ownerIdx > 0 && ownerIdx < concatIdx, '挂车排序表必须在渲染前建立')
  // 散车（非挂车）紧邻货架时同样按该货架排序：否则站在 3.3m 高货架旁的车会被货架面盖住
  assert.ok(eng.includes('function objectSideOf('), '引擎必须能判断物件在货架哪一侧')
  assert.ok(eng.includes('if (!own){'), '散车必须走「就近货架」排序分支')
  assert.ok(eng.includes('var near = null, nearD = 2.0;'), '就近判定阈值 2m')
  assert.ok(eng.includes("own = { rng: boxKeyRange(shelfBox(near), d3), onSide: nSide === cSide };"), '散车按就近货架的深度区间排序')
  // 行为断言：货架越长、车越靠近货架端头，画家算法的平均深度误差越大
  //（结构断言挡不住「分支被写死成 if (false)」，必须用真实渲染的绘制顺序验证）
  const c2 = engine.defaultConfig()
  c2.bikes = [{ id: 'loose1', type: 'adult', pose: 'stand', x: 5.2, y: 7.6, rot: 0, steer: 45 }]
  c2.shelves = [Object.assign({}, c2.shelves[0], { id: 's1', kind: 'double', orient: 'h', x: 4, y: 6, len: 12, h: 3.3, acc: {} })]
  const svg2 = engine.render3D(c2, { az: 45, el: 33, zoom: 1, vw: 1000, vh: 700 })
  const bikeIdx = svg2.indexOf('data-bike="loose1"')
  assert.ok(bikeIdx > 0, '散车必须渲染')
  assert.ok(bikeIdx > Math.max(svg2.lastIndexOf('fill="#f5e6ca"'), svg2.lastIndexOf('fill="#ecd7ae"')),
    '12m 货架旁的散车必须画在货架面之后（否则被货架吃掉）')
  // 对照：同一台车在同角度下、货架另一侧（远离相机）时，仍应被货架正确遮挡
  const c3 = engine.defaultConfig()
  c3.bikes = [{ id: 'loose1', type: 'adult', pose: 'stand', x: 5.2, y: 4.9, rot: 0, steer: 45 }]
  c3.shelves = [Object.assign({}, c3.shelves[0], { id: 's1', kind: 'double', orient: 'h', x: 4, y: 6, len: 12, h: 3.3, acc: {} })]
  const svg3 = engine.render3D(c3, { az: 45, el: 33, zoom: 1, vw: 1000, vh: 700 })
  const bikeIdx3 = svg3.indexOf('data-bike="loose1"')
  assert.ok(bikeIdx3 < Math.max(svg3.lastIndexOf('fill="#f5e6ca"'), svg3.lastIndexOf('fill="#ecd7ae"')),
    '货架另一侧的散车必须被货架遮住（画在货架面之前）')
})

test('穿模：附件装在货架另一面时前后不得颠倒（贴南墙 = 附件朝北）', async () => {
  const engine = await loadToolEngine()
  const scene = (y) => {
    const c = engine.defaultConfig()
    c.bikes = []
    c.shelves = [Object.assign({}, c.shelves[0], {
      id: 's1', kind: 'double', orient: 'h', x: 8, y, len: 7.5, h: 3.3,
      acc: { armRows: [{ id: 'a1', z: 0.9, len: 'short', size: 'adult', u0: 0, u1: 7.5 }] }
    })]
    return c
  }
  const drawnAfterShelf = (c, az) => {
    const svg = engine.render3D(c, { az, el: 33, zoom: 1, vw: 1000, vh: 700 })
    const bike = svg.indexOf('data-acc="arm"')
    const lastSide = Math.max(svg.lastIndexOf('fill="#e2ca9b"'), svg.lastIndexOf('fill="#e9d3aa"'))
    return { bike, lastSide, after: bike > lastSide }
  }
  // 贴南墙：附件朝北（'neg' 面）→ 相机在北侧（az=270）才看得见
  const south = scene(15.5)
  assert.equal(engine.accFace(south.shelves[0], south), 'neg', '贴南墙的货架附件应朝北（neg 面）')
  assert.ok(drawnAfterShelf(south, 270).after, '附件侧（az=270）挂车必须画在货架之后（可见）')
  assert.ok(!drawnAfterShelf(south, 90).after, '背面（az=90）挂车必须画在货架之前（被挡住）')
  // 贴北墙：附件朝南（'pos' 面）→ 相机在南侧（az=90）才看得见
  const north = scene(2.5)
  assert.equal(engine.accFace(north.shelves[0], north), 'pos', '贴北墙的货架附件应朝南（pos 面）')
  assert.ok(drawnAfterShelf(north, 90).after, '附件侧（az=90）挂车必须画在货架之后（可见）')
  assert.ok(!drawnAfterShelf(north, 270).after, '背面（az=270）挂车必须画在货架之前（被挡住）')
  // 结构护栏：可见性必须比较「附件所在面 vs 相机侧」，不能只看相机侧
  const eng = stripComments(toolEngine)
  assert.ok(eng.includes('function attachFacesCamera(s, cfg, d3){'), '引擎必须有「附件是否朝向相机」判定')
  assert.ok(eng.includes("return (accFace(s, cfg) === 'pos') === cameraOnSide(s, d3);"), '判定必须比较附件面与相机侧')
  assert.ok(eng.includes('var sOnSide = attachFacesCamera(s, cfg, d3);'), '附件排序上下文必须用该判定')
  assert.ok(eng.includes('var rng = boxKeyRange(shelfBox(s), d3), onSide = attachFacesCamera(s, cfg, d3);'),
    '挂车排序表必须用该判定（此前只看相机侧，导致附件装反时前后颠倒）')
})

test('货架正面视角：引擎渲染（立面 / 托臂排 / 挂车 / 手柄 / 空态）', async () => {
  const engine = await loadToolEngine()
  const c = engine.defaultConfig()
  c.bikes = []
  c.shelves = [Object.assign({}, c.shelves[0], {
    id: 's1', name: '童车区', len: 7.5, h: 3.3,
    acc: { armRows: [
      { id: 'a1', z: 0.9, len: 'short', size: 'kids', u0: 0, u1: 7.5 },
      { id: 'a2', z: 2.15, len: 'long', size: 'adult', u0: 1.5, u1: 5.5 }
    ] }
  })]
  const r = engine.renderShelfFront(c, 's1', { vw: 1000, vh: 640, selRow: 'a2' })
  assert.ok(r.svg.includes('<svg'), '必须返回 SVG')
  assert.ok(!/NaN|undefined/u.test(r.svg), '正面视图不得含 NaN/undefined')
  assert.equal((r.svg.match(/data-rowgroup=/gu) ?? []).length, 2, '两排托臂各一组')
  assert.equal((r.svg.match(/data-rowhandle=/gu) ?? []).length, 2, '选中排两端各一个手柄')
  assert.equal((r.svg.match(/data-row=/gu) ?? []).length, 2, '每排都有可拖动命中区')
  assert.ok(r.svg.includes('长托臂 1m'), '选中排必须标注托臂长度')
  assert.ok(r.svg.includes('离地 2.15m'), '选中排必须标注高度')
  const r1 = engine.renderShelfFront(c, 's1', { vw: 1000, selRow: 'a1' })
  assert.ok(r1.svg.includes('短托臂 0.5m') && r1.svg.includes('16″ 童车'), '换成另一排时标注随之更新')
  assert.ok(r.svg.includes('data-scale=') && r.svg.includes('data-mx=') && r.svg.includes('data-my='), 'SVG 必须带交互所需的 meta（data-*）')
  // 立面坐标换算：mx + u*scale = 屏幕 x；my - z*scale = 屏幕 y
  assert.equal(r.meta.len, 7.5)
  assert.equal(r.meta.h, 3.3)
  assert.ok(r.meta.scale >= 10 && r.meta.scale <= 220, '缩放必须在合理区间')
  // 挂车数量：童车排 5 台 + 成人排 2 台 = 7 台；每台 2 个轮 × (轮胎圈 + 花鼓圈) = 4 个圆
  assert.equal((r.svg.match(/<circle/gu) ?? []).length, 7 * 4 + 2, '挂车轮圈（胎 + 花鼓）+ 选中排两端手柄')
  // 空货架：提示添加，不报错
  const empty = engine.renderShelfFront(Object.assign({}, c, { shelves: [Object.assign({}, c.shelves[0], { acc: {} })] }), 's1', { vw: 800 })
  assert.ok(empty.svg.includes('还没有托臂排'), '无托臂排时必须给出提示')
  // 找不到货架 → 空结果（调用方回退到提示态）
  assert.equal(engine.renderShelfFront(c, 'nope', {}).svg, '')
  // 窄容器必须自动缩小，不产生横向溢出
  const narrow = engine.renderShelfFront(c, 's1', { vw: 360 })
  assert.ok(narrow.meta.scale < r.meta.scale, '窄容器自动缩小')
  assert.ok(narrow.meta.mx + narrow.meta.len * narrow.meta.scale + 30 <= 360 + 1, '宽度必须落在容器内')
})

test('货架正面视角：双端页签 + 入口 + 交互接线', () => {
  for (const [label, src] of [['桌面端', stripComments(toolUiDesktop)], ['移动端', stripComments(toolUiMobile)]]) {
    assert.ok(src.includes('<button data-tab="tfront">货架正面</button>'), `${label}必须有第三个页签`)
    assert.ok(src.includes('id="tabfront"'), `${label}必须有正面视图面板`)
    assert.ok(src.includes('id="frontScroll"') && src.includes('id="viewfront"'), `${label}必须有滚动容器与画布`)
    assert.ok(src.includes('id="frontBar"'), `${label}必须有正面视图工具栏`)
    assert.ok(src.includes('slots.viewfront') && src.includes('slots.frontScroll') && src.includes('slots.frontBar'), `${label}必须把挂载点交给 app.js`)
    assert.ok(src.includes('data-bact="openFront"'), `${label}快捷条必须有「正面视角」入口`)
  }
  // 移动端三个页签 → 三列（原来写死两列，会挤在左半边）
  const mcss = stripComments(toolMobileCss)
  const vs = mcss.match(/\.sd-m-vswitch\s*\{[^}]*\}/gu) ?? []
  assert.equal(vs.length, 1, '移动端页签样式只允许一处声明')
  assert.match(vs[0], /repeat\(3,\s*minmax\(0,\s*1fr\)\)/u, '三个页签必须三列等宽')
  const app = stripComments(toolApp)
  for (const fn of ['function renderFrontNow(', 'function bindFront(', 'function renderFrontBar(', 'function frontZoom(', 'function frontMeta(', 'function toFrontUZ(', 'function frontShelfOf(', 'function frontRowGet(', 'function materializeRow(']) {
    assert.ok(app.includes(fn), 'app.js 必须实现 ' + fn)
  }
  assert.ok(app.includes("openFront: function(ds){"), 'acts 必须接 openFront')
  assert.ok(app.includes("if (tab === 'tfront') renderFrontNow();"), 'setTab 必须处理正面视图')
  assert.ok(app.includes("render3DNow(); renderPlanNow(); renderFrontNow(); }"), '结构变化后必须刷新正面视图')
  assert.ok(app.includes("if (/^sh:/.test(String(ui.sel || ''))) ui.frontShelf = String(ui.sel).slice(3);"), '选中货架必须同步正面视图')
  assert.ok(app.includes("if (ui.tab !== 'tfront') setTab('tfront'); else renderFrontNow();"), '入口必须切到正面视图')
  // 拖拽语义：移动 = 改高度 + 整排平移；手柄 = 改起止范围
  assert.ok(app.includes("mode = (hp[1] === '0') ? 'left' : 'right';"), '手柄拖动必须区分左右端')
  assert.ok(app.includes("r.u0 = E.clamp(Math.round((start.u0 + du) / 0.1) * 0.1, 0, Math.max(0, start.u1 - 0.4));"), '左端手柄必须改起点并留出最小宽度')
  assert.ok(app.includes("r.u1 = E.clamp(Math.round((start.u1 + du) / 0.1) * 0.1, Math.min(m.len, start.u0 + 0.4), m.len);"), '右端手柄必须改终点并留出最小宽度')
  assert.ok(app.includes('var slack = Math.max(0, m.len - w);'), '整排平移必须先算出可移动余量')
  assert.ok(app.includes('var u0 = E.clamp(Math.round((start.u0 + du) / 0.1) * 0.1, 0, slack);'), '整排平移必须夹在货架内')
  assert.ok(app.includes("r.z = E.clamp(Math.round((start.z + dz) / 0.05) * 0.05, 0.2, Math.max(0.3, m.h - 0.85));"), '高度必须夹在货架范围内')
  assert.ok(app.includes('Math.hypot(du, dz) * m.scale < 4'), '必须有点击/拖动死区（否则点选会被当成拖动）')
  // 拖动中每帧重绘 SVG：坐标换算必须用「当前」元素，不能用指针按下时捕获的旧引用
  //（2026-09-15 事故：旧元素脱离文档 → getScreenCTM() 为 null → 坐标变垃圾值 → 托臂排跳到边界）
  assert.ok(app.includes('function frontSvgLive('), 'app.js 必须提供「取当前正面 SVG」的辅助函数')
  assert.ok(app.includes('var p = toFrontUZ(frontSvgLive(), ev.clientX, ev.clientY); if (!p) return;'),
    '拖动每帧必须用当前 SVG 换算坐标（不得复用捕获的旧元素）')
  assert.ok(app.includes("if (!svgEl || !svgEl.isConnected || typeof svgEl.getScreenCTM !== 'function') return null;"),
    'toFrontUZ 必须对脱离文档的元素判空')
  assert.ok(app.includes('if (!ctm) return null;'), 'toFrontUZ 必须对空 CTM 判空')
  assert.ok(app.includes("        ui.frontRow = rowId;\n        ui.sel = 'sh:' + s.id;\n        saveSoon(); renderChips(); schedule3D(); renderPlanNow(); buildEditors();"),
    '拖动结束后必须把该排设为当前排（否则拿不到两端手柄、没法接着调范围）')
  assert.ok(app.includes("toast('这一排已经占满货架长度：拖两端圆点缩小范围后即可左右移动');"),
    '占满货架长度的排横向拖动必须给出提示（否则用户不知道要先缩范围）')
  // 新加的托臂排默认范围 = 这排车的实际占位（默认就能左右移动），而不是整根货架
  assert.ok(app.includes('var span = Math.min(shelfLen, Math.round(fit * E.ARM_SLOT[size] * 100) / 100);'),
    '新排默认范围必须按车位数计算')
  assert.ok(app.includes('size: size, u0: 0, u1: span }'), '新排必须使用计算出的范围')
  assert.ok(app.includes("ui.frontRow = rowId;"), '点选一排必须记录排 id（用于高亮与手柄）')
  const schema = stripComments(toolSchema)
  assert.ok(schema.includes("action('openFront', s.id, '🧍 正面视角')"), '元素清单必须有正面视角入口')
})
