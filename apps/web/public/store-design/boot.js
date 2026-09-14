/* 门店布局设计渲染 · 启动钩子（页面错误收集）。
   原先是 index.html 里的内联脚本；生产站点的 CSP 是 script-src 'self'，
   内联脚本会被浏览器拒绝执行（控制台报 CSP 违规），因此抽成外部文件。 */

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
