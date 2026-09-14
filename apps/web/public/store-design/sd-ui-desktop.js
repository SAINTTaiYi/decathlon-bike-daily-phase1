/* ==========================================================================
   门店设计 · 桌面端界面实现（独立实现，不与移动端共享 DOM/CSS）
   --------------------------------------------------------------------------
   只由运行时在宽屏（>860px）加载，样式在 sd-desktop.css。布局方向与移动端
   完全不同：左侧图纸 + 右侧参数栏；移动端是单列画布 + 底部面板。
   两套实现之间没有共享选择器，也没有「一套 DOM + 媒体查询适配两端」。

   对外契约与移动端一致（见 sd-ui-mobile.js 头部注释）。
   ========================================================================== */
(function(){
'use strict';

var slots = {};
var lastVM = null;
var railTab = 'check';

function esc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fnum(v){ return window.Engine ? window.Engine.fnum(v) : String(v); }

/* ---------- 字段 / 动作（桌面端自己的 DOM 结构：标签在左、控件在右） ---------- */
function fieldHTML(f){
  if (f.kind === 'note') return '<p class="sd-d-note">' + esc(f.text) + '</p>';
  var id = 'd' + Math.random().toString(36).slice(2, 8);
  if (f.kind === 'number'){
    return '<div class="sd-d-field"><label for="' + id + '">' + esc(f.label) + '</label>'
      + '<span class="sd-d-inputwrap"><input id="' + id + '" type="number" inputmode="decimal" data-path="' + f.path + '" value="' + esc(fnum(f.value)) + '"'
      + (f.min != null ? ' min="' + f.min + '"' : '') + (f.max != null ? ' max="' + f.max + '"' : '')
      + (f.step != null ? ' step="' + f.step + '"' : '') + '>'
      + (f.unit ? '<i>' + esc(f.unit) + '</i>' : '') + '</span></div>';
  }
  if (f.kind === 'select'){
    return '<div class="sd-d-field"><label for="' + id + '">' + esc(f.label) + '</label>'
      + '<select id="' + id + '" data-path="' + f.path + '">' + f.options.map(function(o){
        return '<option value="' + esc(o[0]) + '"' + (String(f.value) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
      }).join('') + '</select></div>';
  }
  if (f.kind === 'toggle'){
    return '<div class="sd-d-field sd-d-field-toggle"><label for="' + id + '">' + esc(f.label) + '</label>'
      + '<input id="' + id + '" type="checkbox" data-path="' + f.path + '"' + (f.value ? ' checked' : '') + '></div>';
  }
  return '<div class="sd-d-field"><label for="' + id + '">' + esc(f.label) + '</label>'
    + '<input id="' + id + '" type="text" data-path="' + f.path + '" value="' + esc(f.value) + '" placeholder="' + esc(f.placeholder || '') + '"></div>';
}
function actionHTML(a){
  return '<button class="sd-d-act" data-act="' + a.act + '"' + (a.id != null ? ' data-id="' + esc(a.id) + '"' : '')
    + (a.tone ? ' data-tone="' + a.tone + '"' : '') + '>' + esc(a.label) + '</button>';
}
function actionsRow(list){
  if (!list || !list.length) return '';
  return '<div class="sd-d-actions">' + list.map(actionHTML).join('') + '</div>';
}
function fieldsGrid(fields){
  if (!fields || !fields.length) return '';
  return '<div class="sd-d-fields">' + fields.map(fieldHTML).join('') + '</div>';
}

/* ---------- 骨架 ---------- */
function skeleton(){
  return ''
  + '<header class="sd-d-topbar">'
  +   '<div class="sd-d-brand"><span class="sd-d-kicker">STORE DESIGN</span><h1>门店设计</h1>'
  +     '<span class="sd-d-sub">平面布局 · 3D 渲染 · 方案校验</span></div>'
  +   '<div class="sd-d-topactions">'
  +     '<button id="btnRandom" class="sd-d-btn sd-d-btn-primary">🎲 随机方案</button>'
  +     '<button id="btnExportSvg" class="sd-d-btn">导出 SVG</button>'
  +     '<button id="btnExportJson" class="sd-d-btn">导出配置</button>'
  +     '<button id="btnImportJson" class="sd-d-btn">导入配置</button>'
  +     '<button id="btnReset" class="sd-d-btn">重置</button>'
  +     '<button id="btnExit" class="sd-d-btn sd-d-btn-ghost" hidden>返回应用选择</button>'
  +   '</div>'
  + '</header>'
  + '<div class="sd-d-status" id="chips"></div>'
  + '<main class="sd-d-main">'
  +   '<section class="sd-d-stage">'
  +     '<nav class="tabs sd-d-tabs">'
  +       '<button data-tab="t3d" class="on">3D 视角</button>'
  +       '<button data-tab="tplan">平面编辑</button>'
  +     '</nav>'
  +     '<div id="tab3d" class="sd-d-pane">'
  +       '<div class="sd-d-view" id="view3d"></div>'
  +       '<div class="sd-d-viewbar">'
  +         '<button id="rotL">⟲ 左转45°</button><button id="rotR">⟳ 右转45°</button>'
  +         '<button id="vIso">轴测</button><button id="vTop">俯视</button>'
  +         '<button id="vReset">复位</button><button id="spin">自动旋转</button>'
  +         '<span class="sd-d-slider"><i>方位角</i><input type="range" id="az" min="0" max="360" step="1"><b id="azv">90°</b></span>'
  +         '<span class="sd-d-slider"><i>俯仰角</i><input type="range" id="el" min="8" max="85" step="1"><b id="elv">33°</b></span>'
  +         '<span class="sd-d-slider"><i>缩放</i><input type="range" id="zm" min="40" max="260" step="2"><b id="zmv">100%</b></span>'
  +       '</div>'
  +     '</div>'
  +     '<div id="tabplan" class="sd-d-pane" style="display:none">'
  +       '<div class="sd-d-planbar">'
  +         '<button id="pzOut">－</button><button id="pzIn">＋</button><button id="pzFit">适应</button>'
  +         '<span class="sd-d-mini" id="pzInfo"></span>'
  +         '<label class="sd-d-check"><input type="checkbox" id="pgrid" checked> 网格</label>'
  +         '<label class="sd-d-check">吸附<select id="snap"><option value="0.5">0.5m</option><option value="0.25">0.25m</option><option value="0.1">0.1m</option></select></label>'
  +         '<span class="sd-d-hint">拖动元素即可移动（自动吸附）；点选后右侧直接编辑参数</span>'
  +       '</div>'
  +       '<div id="planScroll" class="sd-d-planscroll"><div id="viewplan"></div></div>'
  +     '</div>'
  +   '</section>'
  +   '<aside class="sd-d-rail">'
  +     '<div id="selbar" class="sd-d-selbar"></div>'
  +     '<nav class="sd-d-railtabs">'
  +       '<button data-sd-tab="check">检查</button>'
  +       '<button data-sd-tab="elements">元素</button>'
  +       '<button data-sd-tab="settings">设置</button>'
  +     '</nav>'
  +     '<div class="sd-d-railbody"><div id="editors"></div></div>'
  +   '</aside>'
  + '</main>'
  + '<button id="fab" class="sd-d-add" aria-label="添加组件">＋ 添加组件</button>'
  + '<div id="addmask" class="sd-d-mask"></div>'
  + '<div id="addsheet" class="sd-d-addsheet">'
  +   '<div class="sd-d-sheettitle">添加组件<button class="sd-d-act" id="sheetClose">关闭</button></div>'
  +   '<div class="sd-d-addgrid" id="sheetgrid"></div>'
  + '</div>'
  + '<input type="file" id="fileImport" accept=".json,application/json" style="display:none">'
  + '<div id="toast" class="sd-d-toast"></div>'
  + '<div id="errlog"></div>';
}

/* ---------- 三页内容 ---------- */
function checkPage(vm){
  var rows = vm.checks.map(function(c){
    return '<div class="sd-d-checkrow" data-tone="' + c.tone + '">'
      + '<span class="sd-d-dot"></span>'
      + '<span class="sd-d-checklabel">' + esc(c.label) + '</span>'
      + '<b class="sd-d-checkvalue">' + esc(c.value) + '</b>'
      + '<i class="sd-d-checkhint">' + esc(c.hint || '') + '</i></div>';
  }).join('');
  var warn = vm.warnings.length
    ? '<div class="sd-d-warnbox">' + vm.warnings.map(function(w){ return '<p>⚠ ' + esc(w) + '</p>'; }).join('') + '</div>'
    : '<p class="sd-d-okline">无越界 / 重叠提示</p>';
  return '<div class="sd-d-checks">' + rows + '</div>' + warn
    + actionsRow([{ act:'rand', label:'🎲 重新随机方案' }]);
}
function selectionCard(sel){
  if (!sel) return '<div class="sd-d-empty"><b>未选中元素</b><span>在左侧平面图里点选货架、工作室、区域等，或从下表选择。</span></div>';
  return '<div class="sd-d-selcard">'
    + '<div class="sd-d-selhead"><b>' + esc(sel.title) + '</b><span>' + esc(sel.badge) + '</span>'
    +   '<button class="sd-d-selclose" data-act="pick" data-id="__clear__" aria-label="取消选中">✕</button></div>'
    + fieldsGrid(sel.fields)
    + actionsRow(sel.actions)
    + (sel.extra ? actionsRow(sel.extra) : '')
    + '</div>';
}
function elementsPage(vm){
  var list = vm.elements.map(function(g){
    return '<section class="sd-d-group" data-sd-group="' + g.key + '">'
      + '<h3 class="sd-d-grouphead">' + esc(g.title) + '<i>' + g.items.length + '</i></h3>'
      + g.items.map(function(it){
          var on = vm.selection && String(vm.selection.id) === String(it.id);
          return '<button class="sd-d-item" data-act="pick" data-id="' + esc(it.id) + '"' + (on ? ' data-on="true"' : '') + '>'
            + '<span class="sd-d-itemname">' + esc(it.title) + '</span>'
            + '<span class="sd-d-itembadge">' + esc(it.badge) + '</span></button>';
        }).join('')
      + '</section>';
  }).join('');
  return selectionCard(vm.selection) + '<div class="sd-d-list">' + list + '</div>';
}
function settingsPage(vm){
  var out = vm.settings.map(function(g){
    return '<details class="sd-d-sec" data-sec="' + g.key + '"><summary>' + esc(g.title) + '</summary>'
      + '<div class="sd-d-secbody">'
      + (g.hint ? '<p class="sd-d-hint">' + esc(g.hint) + '</p>' : '')
      + g.items.map(function(it){
          return '<div class="sd-d-subitem">'
            + (it.title ? '<p class="sd-d-subhead">' + esc(it.title) + (it.badge ? ' <i>' + esc(it.badge) + '</i>' : '') + '</p>' : '')
            + fieldsGrid(it.fields) + actionsRow(it.actions) + '</div>';
        }).join('')
      + '</div></details>';
  }).join('');
  var backups = '<details class="sd-d-sec" data-sec="backups"><summary>历史版本恢复</summary><div class="sd-d-secbody">'
    + (vm.backups.length
        ? vm.backups.map(function(b){
            return '<div class="sd-d-backup"><span>' + esc(b.label) + '<i>' + esc(b.info) + '</i></span>'
              + '<button class="sd-d-act" data-act="restoreBak" data-id="' + esc(b.tag) + '">恢复</button></div>';
          }).join('')
        : '<p class="sd-d-hint">暂无历史备份（做过修改后会自动出现）</p>')
    + '<p class="sd-d-hint">每次修改都会自动留存「上一版」；升级版本时旧数据也会留档。</p>'
    + '</div></details>';
  var help = '<details class="sd-d-sec" data-sec="help"><summary>使用说明</summary><div class="sd-d-secbody">'
    + vm.help.map(function(t){ return '<p class="sd-d-helpline">' + t + '</p>'; }).join('')
    + '</div></details>';
  return out + backups + help;
}
function renderRailBody(){
  var host = slots.editors;
  if (!host || !lastVM) return;
  host.innerHTML = railTab === 'elements' ? elementsPage(lastVM)
    : railTab === 'settings' ? settingsPage(lastVM)
    : checkPage(lastVM);
  Array.prototype.forEach.call(document.querySelectorAll('.sd-d-railtabs button'), function(b){
    b.setAttribute('data-on', String(b.getAttribute('data-sd-tab') === railTab));
  });
}

/* ---------- 状态条 ---------- */
function renderStatus(items){
  var host = slots.chips || document.getElementById('chips');
  if (!host) return;
  host.innerHTML = (items || []).map(function(it){
    return '<span class="sd-d-chip" data-tone="' + it.tone + '">' + esc(it.text) + '</span>';
  }).join('');
}

/* ---------- 选中快捷条：桌面端是「动作条」，完整参数在右侧栏 ---------- */
function selBarHTML(ctx){
  var k = ctx.kind, o = ctx.item, h = '';
  var close = '<button class="sd-d-act sd-d-act-ghost" data-bact="close">取消选中</button>';
  var del = '<button class="sd-d-act" data-bact="del" data-tone="danger">删除</button>';
  if (ctx.placing){
    h += '<span class="sd-d-placing">拖动屏幕摆放「' + esc(ctx.placingLabel || '组件') + '」</span>'
      + '<button class="sd-d-act" data-bact="placeDone" data-tone="primary">完成</button>';
  }
  if (k === 'sh'){
    h += '<b class="sd-d-selflag">货架</b>'
      + '<button class="sd-d-act" data-bact="kind" data-bk="double"' + (o.kind === 'double' ? ' data-on="true"' : '') + '>双面</button>'
      + '<button class="sd-d-act" data-bact="kind" data-bk="single"' + (o.kind === 'single' ? ' data-on="true"' : '') + '>单面</button>'
      + '<button class="sd-d-act" data-bact="kind" data-bk="low"' + (o.kind === 'low' ? ' data-on="true"' : '') + '>矮货架</button>'
      + '<button class="sd-d-act" data-bact="rot">旋转</button>'
      + '<button class="sd-d-act" data-bact="flush" data-side="n">贴北</button>'
      + '<button class="sd-d-act" data-bact="flush" data-side="s">贴南</button>'
      + '<button class="sd-d-act" data-bact="flush" data-side="w">贴西</button>'
      + '<button class="sd-d-act" data-bact="flush" data-side="e">贴东</button>'
      + '<button class="sd-d-act" data-bact="dup">复制</button>'
      + '<button class="sd-d-act" data-bact="fillb" data-bt="adult">排成人车</button>'
      + '<button class="sd-d-act" data-bact="fillb" data-bt="kids">排童车</button>'
      + '<button class="sd-d-act" data-bact="clearb">清空本架车</button>' + del + close;
  } else if (k === 'st'){
    h += '<b class="sd-d-selflag">工作室</b><button class="sd-d-act" data-bact="more">查看参数</button>' + close;
  } else if (k === 'zn'){
    h += '<b class="sd-d-selflag">区域</b><button class="sd-d-act" data-bact="more">查看参数</button>' + del + close;
  } else if (k === 'pl'){
    h += '<b class="sd-d-selflag">柱子</b><button class="sd-d-act" data-bact="more">查看参数</button>' + del + close;
  } else if (k === 'mk'){
    h += '<b class="sd-d-selflag">标记</b><button class="sd-d-act" data-bact="more">查看参数</button>' + del + close;
  } else if (k === 'ms'){
    h += '<b class="sd-d-selflag">网面墙</b><button class="sd-d-act" data-bact="rot">改朝向</button>'
      + '<button class="sd-d-act" data-bact="more">查看参数</button>' + del + close;
  } else if (k === 'en'){
    h += '<b class="sd-d-selflag">出入口净空</b><button class="sd-d-act" data-bact="more">查看参数</button>' + del + close;
  } else if (k === 'ct'){
    h += '<b class="sd-d-selflag">门帘</b><button class="sd-d-act" data-bact="rot">改朝向</button>'
      + '<button class="sd-d-act" data-bact="more">查看参数</button>' + del + close;
  } else if (k === 'bk'){
    var top = (o.pose === 'top');
    h += '<b class="sd-d-selflag">自行车</b>'
      + '<button class="sd-d-act" data-bact="btype" data-t="adult"' + (o.type !== 'kids' ? ' data-on="true"' : '') + '>成人 2m</button>'
      + '<button class="sd-d-act" data-bact="btype" data-t="kids"' + (o.type === 'kids' ? ' data-on="true"' : '') + '>童车 1.5m</button>'
      + '<button class="sd-d-act" data-bact="bpose" data-p="stand"' + (!top ? ' data-on="true"' : '') + '>立地</button>'
      + '<button class="sd-d-act" data-bact="bpose" data-p="top"' + (top ? ' data-on="true"' : '') + '>上架平放</button>'
      + '<button class="sd-d-act" data-bact="bsteer" data-v="-45">车头 -45°</button>'
      + '<button class="sd-d-act" data-bact="bsteer" data-v="0">车头 0°</button>'
      + '<button class="sd-d-act" data-bact="bsteer" data-v="45">车头 45°</button>'
      + '<button class="sd-d-act" data-bact="rot">转90°</button>'
      + '<button class="sd-d-act" data-bact="dup">复制</button>'
      + '<button class="sd-d-act" data-bact="addA">+成人</button>'
      + '<button class="sd-d-act" data-bact="addK">+童车</button>' + del + close;
  }
  return h;
}
function refreshSelVals(){ /* 桌面端快捷条没有数值步进器：参数在右栏编辑 */ }

/* ---------- 装配 ---------- */
function mount(root){
  root.innerHTML = skeleton();
  slots.root = root;
  slots.chips = document.getElementById('chips');
  slots.editors = document.getElementById('editors');
  slots.selbar = document.getElementById('selbar');
  slots.view3d = document.getElementById('view3d');
  slots.viewplan = document.getElementById('viewplan');
  slots.planScroll = document.getElementById('planScroll');
  document.body.setAttribute('data-sd-ui', 'desktop');

  root.addEventListener('click', function(e){
    var t = e.target;
    var tabBtn = t.closest ? t.closest('[data-sd-tab]') : null;
    if (tabBtn){ railTab = tabBtn.getAttribute('data-sd-tab'); renderRailBody(); return; }
  }, true);
  return slots;
}

window.SDUI = {
  id: 'desktop',
  mount: mount,
  renderStatus: renderStatus,
  renderPanel: function(vm){ lastVM = vm; renderRailBody(); },
  selBarHTML: selBarHTML,
  refreshSelVals: refreshSelVals,
  onSelectionChange: function(){ renderRailBody(); },
  revealSelection: function(){
    railTab = 'elements';
    renderRailBody();
    var el = document.querySelector('.sd-d-selcard');
    if (el && el.scrollIntoView) el.scrollIntoView({ behavior:'smooth', block:'nearest' });
  },
  setSheetOpen: function(){},
  isSheetOpen: function(){ return true; }
};
})();
