/* 门店设计 · 页面错误收集（CSP script-src 'self'，因此不能内联在 index.html 里）。
   捕获到的错误会显示在页面底部的 #errlog，无头回归测试也据此判断页面是否健康。 */
window.__errs = [];
(function(){
  function push(msg){
    window.__errs.push(msg);
    try {
      var el = document.getElementById('errlog');
      if (el){ el.style.display = 'block'; el.textContent += msg + '\n'; }
    } catch(e){}
  }
  window.addEventListener('error', function(e){
    push('JS错误: ' + (e.message || e.type) + ' @' + (e.filename || '') + ':' + (e.lineno || ''));
  });
  window.addEventListener('unhandledrejection', function(e){
    push('Promise错误: ' + ((e.reason && e.reason.message) || e.reason));
  });
})();
