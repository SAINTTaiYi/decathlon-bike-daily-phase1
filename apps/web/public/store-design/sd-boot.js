/* ==========================================================================
   门店设计 · 界面实现的运行时选择（视口 → 只加载一套）
   --------------------------------------------------------------------------
   用户要求：移动端与桌面端必须是两套独立实现，运行时自动识别视口选择加载哪一套。
   这里就是那个「选择」：
     · 窄屏（<=860px）→ sd-mobile.css + sd-ui-mobile.js
     · 宽屏            → sd-desktop.css + sd-ui-desktop.js
   两者互斥加载，所以各自的样式里不需要任何媒体查询，也不存在「一套 DOM 适配两端」。
   契约：脚本就绪后派发 sd-ui-ready，app.js 收到后才开始初始化。
   ========================================================================== */
(function(){
  'use strict';
  var NARROW_MAX = 860;
  var impl = window.matchMedia('(max-width: ' + NARROW_MAX + 'px)').matches ? 'mobile' : 'desktop';
  document.documentElement.setAttribute('data-sd-impl', impl);

  var link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'sd-' + impl + '.css?v=3';
  link.setAttribute('data-sd-css', impl);
  document.head.appendChild(link);

  var script = document.createElement('script');
  script.src = 'sd-ui-' + impl + '.js?v=5';
  script.setAttribute('data-sd-js', impl);
  script.async = false;
  script.onload = function(){ window.dispatchEvent(new Event('sd-ui-ready')); };
  script.onerror = function(){
    // 让 app.js 的兜底逻辑接管：页面照常放出来，错误写进 #errlog。
    window.dispatchEvent(new Event('sd-ui-ready'));
  };
  document.head.appendChild(script);
})();
