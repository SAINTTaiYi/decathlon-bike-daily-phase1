/* ==========================================================================
   门店设计渲染 · 宿主嵌入钩子（Ops 集成用，非工具本体）
   --------------------------------------------------------------------------
   本目录是本地工具 ~/web/store-3d 的发布副本：除本文件与 index.html 中的
   标题/页头文案外，与本地版保持一致；引擎与交互（engine.js / app.js）
   不做任何改动，本地改完重新拷贝即可。

   退出按钮（2026-09-17 用户要求：独立打开也要能回模块选择屏）——**始终显示**，
   按钮本体由各界面实现渲染（桌面 sd-d-topbar / 移动 sd-m-top）：
     · 被宿主嵌入（有父窗口）→ postMessage 同源通知父页面，去向由宿主决定；
     · 独立打开（直接访问本页）→ 没有父页面可接管，整页回站点根 = 应用选择屏。

   嵌入参数：?embed=1&exit=ops|back
     embed=1   以嵌入方式运行（只影响按钮文案与消息里的 mode）
     exit=ops  按钮文案「去 Workshop Ops ↗」
     exit=back 按钮文案「返回应用选择」
   ========================================================================== */
(function () {
  'use strict'
  var params = new URLSearchParams(window.location.search)
  var embedded = params.get('embed') === '1'
  var mode = params.get('exit') === 'back' ? 'back' : 'ops'
  var tries = 0

  function arm() {
    var button = document.getElementById('btnExit')
    if (!button) {
      // 界面实现（sd-ui-*）是异步注入的，页头渲染完成前按钮还不存在 —— 轮询等待。
      if (++tries < 60) setTimeout(arm, 100)
      return
    }
    var icon = !!(button.classList && button.classList.contains('sd-m-exit'))
    if (icon) {
      // 移动端是图标按钮：嵌入去 Ops 用 ↗，其余（返回类）用 ←，语义写进 aria-label。
      var toOps = embedded && mode === 'ops'
      button.textContent = toOps ? '↗' : '←'
      button.setAttribute('aria-label', toOps ? '去 Workshop Ops' : '返回应用选择')
    } else {
      button.textContent = embedded ? (mode === 'back' ? '返回应用选择' : '去 Workshop Ops ↗') : '返回应用选择'
    }
    button.hidden = false
    button.addEventListener('click', function () {
      if (window.parent !== window) {
        // 被嵌入时才需要通知父页面；消息只发给**同源**父窗口。
        window.parent.postMessage({ type: 'store-design:exit', mode: embedded ? mode : 'back' }, window.location.origin)
        return
      }
      // 独立打开：整页回站点根（应用选择屏）。
      window.location.assign('/')
    })
  }
  arm()
})()
