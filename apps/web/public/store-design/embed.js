/* ==========================================================================
   门店设计渲染 · 宿主嵌入钩子（Ops 集成用，非工具本体）
   --------------------------------------------------------------------------
   本目录是本地工具 ~/web/store-3d 的发布副本：除本文件与 index.html 中的
   标题/页头文案外，与本地版保持一致；引擎与交互（engine.js / app.js）
   不做任何改动，本地改完重新拷贝即可。

   嵌入方式（Ops 侧）：?embed=1&exit=ops|back
     embed=1   显示页头「退出」按钮；直接打开本页（不带参数）时保持隐藏
     exit=ops  按钮文案「去 Workshop Ops ↗」
     exit=back 按钮文案「返回应用选择」

   退出动作统一走 postMessage（只发给**同源**父窗口），跳转到哪里由父页面
   决定，本页不硬编码任何站点地址。
   ========================================================================== */
(function () {
  'use strict'
  var params = new URLSearchParams(window.location.search)
  if (params.get('embed') !== '1') return

  var button = document.getElementById('btnExit')
  if (!button) return
  var mode = params.get('exit') === 'back' ? 'back' : 'ops'
  button.textContent = mode === 'back' ? '返回应用选择' : '去 Workshop Ops ↗'
  button.hidden = false

  button.addEventListener('click', function () {
    // 只有在被嵌入时才需要通知父页面；单独打开本页（无父窗口）时按钮本就不显示。
    if (window.parent === window) return
    window.parent.postMessage({ type: 'store-design:exit', mode: mode }, window.location.origin)
  })
})()
