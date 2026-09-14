/* ==========================================================================
   门店设计 · 移动端界面实现（独立实现，不与桌面端共享 DOM/CSS）
   --------------------------------------------------------------------------
   只由运行时在窄屏（<=860px）加载，样式在 sd-mobile.css。桌面端是另一份完全
   独立的实现（sd-ui-desktop.js + sd-desktop.css），两者之间没有共享的选择器，
   也没有「一套 DOM + 媒体查询适配两端」。

   对外契约（app.js 依赖，两个实现都必须满足）：
     SDUI.mount(root)            渲染骨架并返回
     SDUI.renderStatus(items)    状态条（检查摘要）
     SDUI.renderPanel(vm)        面板内容（检查 / 元素 / 设置 三页）
     SDUI.selBarHTML(ctx)        选中元素的快捷条内容
     SDUI.refreshSelVals(bar,it) 仅刷新快捷条数值（不重建 DOM）
     SDUI.onSelectionChange()    选中变化时的界面反应
   必须提供的元素 id：见 SKELETON 内注释（app.js 按 id 取用）。
   ========================================================================== */
(function(){
'use strict';

var slots = {};
var lastVM = null;
var panelTab = 'check';
var sheetOpen = false;

function esc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fnum(v){ return window.Engine ? window.Engine.fnum(v) : String(v); }

/* ---------- 字段 / 动作渲染（移动端自己的 DOM 结构） ---------- */
function fieldHTML(f){
  if (f.kind === 'note') return '<p class="sd-m-note">' + esc(f.text) + '</p>';
  var id = 'f' + Math.random().toString(36).slice(2, 8);
  var label = '<label class="sd-m-field" for="' + id + '"><span class="sd-m-field-label">' + esc(f.label) + '</span>';
  if (f.kind === 'number'){
    return label + '<span class="sd-m-inputwrap"><input id="' + id + '" type="number" inputmode="decimal" data-path="' + f.path + '" value="' + esc(fnum(f.value)) + '"'
      + (f.min != null ? ' min="' + f.min + '"' : '') + (f.max != null ? ' max="' + f.max + '"' : '')
      + (f.step != null ? ' step="' + f.step + '"' : '') + '>'
      + (f.unit ? '<i class="sd-m-unit">' + esc(f.unit) + '</i>' : '') + '</span></label>';
  }
  if (f.kind === 'select'){
    return label + '<select id="' + id + '" data-path="' + f.path + '">' + f.options.map(function(o){
      return '<option value="' + esc(o[0]) + '"' + (String(f.value) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
    }).join('') + '</select></label>';
  }
  if (f.kind === 'toggle'){
    return '<label class="sd-m-switch" for="' + id + '"><span class="sd-m-field-label">' + esc(f.label) + '</span>'
      + '<input id="' + id + '" type="checkbox" data-path="' + f.path + '"' + (f.value ? ' checked' : '') + '></label>';
  }
  return label + '<input id="' + id + '" type="text" data-path="' + f.path + '" value="' + esc(f.value) + '" placeholder="' + esc(f.placeholder || '') + '"></label>';
}
function actionHTML(a){
  return '<button class="sd-m-act" data-act="' + a.act + '"' + (a.id != null ? ' data-id="' + esc(a.id) + '"' : '')
    + (a.tone ? ' data-tone="' + a.tone + '"' : '') + '>' + esc(a.label) + '</button>';
}
function actionsRow(list, cls){
  if (!list || !list.length) return '';
  return '<div class="' + (cls || 'sd-m-actions') + '">' + list.map(actionHTML).join('') + '</div>';
}
function fieldsGrid(fields, cls){
  if (!fields || !fields.length) return '';
  return '<div class="' + (cls || 'sd-m-grid') + '">' + fields.map(fieldHTML).join('') + '</div>';
}

/* ---------- 骨架 ---------- */
function skeleton(){
  return ''
  + '<header class="sd-m-head">'
  +   '<div class="sd-m-headrow">'
  +     '<div class="sd-m-brand"><span class="sd-m-kicker">STORE DESIGN</span><h1 class="sd-m-title">门店设计</h1></div>'
  +     '<div class="sd-m-headbtns">'
  +       '<button id="btnRandom" class="sd-m-pill">随机</button>'
  +       '<button class="sd-m-icon" data-sd-menu="1" aria-label="更多">⋯</button>'
  +       '<button id="btnExit" class="sd-m-icon sd-m-exit" hidden aria-label="退出">↗</button>'
  +     '</div>'
  +   '</div>'
  +   '<div class="sd-m-status" id="chips"></div>'
  +   '<nav class="tabs sd-m-seg">'
  +     '<button data-tab="t3d" class="on">3D 视角</button>'
  +     '<button data-tab="tplan">平面编辑</button>'
  +   '</nav>'
  + '</header>'
  + '<main class="sd-m-body">'
  +   '<section id="tab3d">'
  +     '<div class="sd-m-view" id="view3d"></div>'
  +     '<div class="sd-m-ctrls">'
  +       '<button id="rotL">⟲</button><button id="rotR">⟳</button>'
  +       '<button id="vIso">轴测</button><button id="vTop">俯视</button>'
  +       '<button id="vReset">复位</button><button id="spin">自动旋转</button>'
  +     '</div>'
  +     '<details class="sd-m-details"><summary>视角微调</summary><div class="sd-m-dbody">'
  +       '<div class="sd-m-slider"><span>方位角</span><input type="range" id="az" min="0" max="360" step="1"><b id="azv">90°</b></div>'
  +       '<div class="sd-m-slider"><span>俯仰角</span><input type="range" id="el" min="8" max="85" step="1"><b id="elv">33°</b></div>'
  +       '<div class="sd-m-slider"><span>缩放</span><input type="range" id="zm" min="40" max="260" step="2"><b id="zmv">100%</b></div>'
  +     '</div></details>'
  +   '</section>'
  +   '<section id="tabplan" style="display:none">'
  +     '<div class="sd-m-planbar">'
  +       '<button id="pzOut">－</button><button id="pzIn">＋</button><button id="pzFit">适应</button>'
  +       '<span class="sd-m-mini" id="pzInfo"></span>'
  +       '<label class="sd-m-check"><input type="checkbox" id="pgrid" checked> 网格</label>'
  +       '<label class="sd-m-check">吸附<select id="snap"><option value="0.5">0.5m</option><option value="0.25">0.25m</option><option value="0.1">0.1m</option></select></label>'
  +     '</div>'
  +     '<div id="planScroll" class="sd-m-planscroll"><div id="viewplan"></div></div>'
  +   '</section>'
  + '</main>'
  + '<div id="selbar" class="sd-m-selbar"></div>'
  + '<section id="sdSheet" class="sd-m-sheet" data-open="false">'
  +   '<div class="sd-m-sheethead">'
  +     '<button class="sd-m-tab" data-sd-tab="check">检查</button>'
  +     '<button class="sd-m-tab" data-sd-tab="elements">元素</button>'
  +     '<button class="sd-m-tab" data-sd-tab="settings">设置</button>'
  +     '<button class="sd-m-toggle" data-sd-toggle="1" aria-label="展开面板">▴</button>'
  +   '</div>'
  +   '<div class="sd-m-sheetbody"><div id="editors"></div></div>'
  + '</section>'
  + '<button id="fab" class="sd-m-fab" aria-label="添加组件">＋</button>'
  + '<div id="addmask" class="sd-m-mask"></div>'
  + '<div id="addsheet" class="sd-m-addsheet">'
  +   '<div class="sd-m-sheettitle">添加组件<button class="sd-m-icon" id="sheetClose" aria-label="关闭">✕</button></div>'
  +   '<div class="sd-m-addgrid" id="sheetgrid"></div>'
  + '</div>'
  + '<div class="sd-m-mask" id="sdMenuMask"></div>'
  + '<div class="sd-m-menu" id="sdMenu">'
  +   '<div class="sd-m-sheettitle">方案与导出<button class="sd-m-icon" data-sd-menu-close="1" aria-label="关闭">✕</button></div>'
  +   '<div class="sd-m-menulist">'
  +     '<button id="btnExportSvg">导出 SVG 视角</button>'
  +     '<button id="btnExportJson">导出配置（JSON 备份）</button>'
  +     '<button id="btnImportJson">导入配置</button>'
  +     '<button id="btnReset" data-tone="danger">恢复默认布置</button>'
  +   '</div>'
  + '</div>'
  + '<input type="file" id="fileImport" accept=".json,application/json" style="display:none">'
  + '<div id="toast" class="sd-m-toast"></div>'
  + '<div id="errlog"></div>';
}

/* ---------- 面板内容（检查 / 元素 / 设置） ---------- */
function checkPage(vm){
  var rows = vm.checks.map(function(c){
    return '<div class="sd-m-checkrow" data-tone="' + c.tone + '">'
      + '<span class="sd-m-dot"></span>'
      + '<span class="sd-m-checktext"><b>' + esc(c.label) + '</b><i>' + esc(c.value) + '</i></span>'
      + '</div>';
  }).join('');
  var warn = vm.warnings.length
    ? '<div class="sd-m-warnbox">' + vm.warnings.map(function(w){ return '<p>⚠ ' + esc(w) + '</p>'; }).join('') + '</div>'
    : '<p class="sd-m-okline">无越界 / 重叠提示</p>';
  return '<div class="sd-m-checks">' + rows + '</div>' + warn
    + actionsRow([{ act:'rand', label:'🎲 随机生成方案' }], 'sd-m-actions sd-m-actions-wide');
}

function selectionCard(sel){
  if (!sel) return '<div class="sd-m-empty">在平面图里点选任意元素即可编辑；也可以从下面的清单选择。</div>';
  return '<div class="sd-m-selcard">'
    + '<div class="sd-m-selhead"><b>' + esc(sel.title) + '</b><span>' + esc(sel.badge) + '</span>'
    +   '<button class="sd-m-icon" data-act="pick" data-id="__clear__" aria-label="取消选中">✕</button></div>'
    + fieldsGrid(sel.fields)
    + actionsRow(sel.actions)
    + (sel.extra ? actionsRow(sel.extra, 'sd-m-actions sd-m-actions-soft') : '')
    + '</div>';
}
function elementsPage(vm){
  var counts = vm.elements.map(function(g){
    return '<button class="sd-m-count" data-sd-scroll="' + g.key + '">' + esc(g.title) + ' <b>' + g.items.length + '</b></button>';
  }).join('');
  var list = vm.elements.map(function(g){
    return '<div class="sd-m-group" data-sd-group="' + g.key + '">'
      + '<p class="sd-m-grouphead">' + esc(g.title) + '</p>'
      + g.items.map(function(it){
          var on = vm.selection && String(vm.selection.id) === String(it.id);
          return '<button class="sd-m-item" data-act="pick" data-id="' + esc(it.id) + '"' + (on ? ' data-on="true"' : '') + '>'
            + '<span class="sd-m-itemtext"><b>' + esc(it.title) + '</b>' + (it.badge ? '<i>' + esc(it.badge) + '</i>' : '') + '</span>'
            + '<span class="sd-m-itemgo">›</span></button>';
        }).join('')
      + '</div>';
  }).join('');
  return '<div class="sd-m-counts">' + counts + '</div>'
    + selectionCard(vm.selection)
    + '<div class="sd-m-list">' + list + '</div>';
}

function settingsPage(vm){
  var out = vm.settings.map(function(g){
    return '<details class="sd-m-details" data-sec="' + g.key + '"><summary>' + esc(g.title) + '</summary><div class="sd-m-dbody">'
      + (g.hint ? '<p class="sd-m-hint">' + esc(g.hint) + '</p>' : '')
      + g.items.map(function(it){
          return '<div class="sd-m-subitem">'
            + (it.title ? '<p class="sd-m-subhead">' + esc(it.title) + (it.badge ? ' <i>' + esc(it.badge) + '</i>' : '') + '</p>' : '')
            + fieldsGrid(it.fields) + actionsRow(it.actions) + '</div>';
        }).join('')
      + '</div></details>';
  }).join('');
  var backups = '<details class="sd-m-details" data-sec="backups"><summary>历史版本恢复</summary><div class="sd-m-dbody">'
    + (vm.backups.length
        ? vm.backups.map(function(b){
            return '<div class="sd-m-backup"><span>' + esc(b.label) + '<i>' + esc(b.info) + '</i></span>'
              + '<button class="sd-m-act" data-act="restoreBak" data-id="' + esc(b.tag) + '">恢复</button></div>';
          }).join('')
        : '<p class="sd-m-hint">暂无历史备份（做过修改后会自动出现）</p>')
    + '<p class="sd-m-hint">每次修改都会自动留存「上一版」；升级版本时旧数据也会留档。布局不对时点「恢复」即可换回。</p>'
    + '</div></details>';
  var help = '<details class="sd-m-details" data-sec="help"><summary>使用说明</summary><div class="sd-m-dbody">'
    + vm.help.map(function(t){ return '<p class="sd-m-helpline">' + t + '</p>'; }).join('')
    + '</div></details>';
  return out + backups + help;
}

function renderPanelBody(){
  var host = slots.editors;
  if (!host || !lastVM) return;
  host.innerHTML = panelTab === 'elements' ? elementsPage(lastVM)
    : panelTab === 'settings' ? settingsPage(lastVM)
    : checkPage(lastVM);
  var tabs = document.querySelectorAll('.sd-m-tab');
  Array.prototype.forEach.call(tabs, function(b){
    b.setAttribute('data-on', String(b.getAttribute('data-sd-tab') === panelTab));
  });
}
function setSheetOpen(open){
  sheetOpen = !!open;
  var el = document.getElementById('sdSheet');
  if (el) el.setAttribute('data-open', String(sheetOpen));
}
function pickTab(tab){
  panelTab = tab;
  setSheetOpen(true);
  renderPanelBody();
  var body = document.querySelector('.sd-m-sheetbody');
  if (body) body.scrollTop = 0;
}

/* ---------- 状态条 ---------- */
function renderStatus(items){
  var host = slots.chips || document.getElementById('chips');
  if (!host) return;
  host.innerHTML = (items || []).map(function(it){
    return '<span class="sd-m-chip" data-tone="' + it.tone + '">' + esc(it.text) + '</span>';
  }).join('');
}

/* ---------- 选中快捷条 ---------- */
function stepper(field, val, unit){
  return '<span class="sd-m-step"><button data-bstep="' + field + '" data-bsign="-1">−</button>'
    + '<b data-bval="' + field + '" data-unit="' + (unit || '') + '">' + fnum(val) + (unit || '') + '</b>'
    + '<button data-bstep="' + field + '" data-bsign="1">＋</button></span>';
}
function selBarHTML(ctx){
  var k = ctx.kind, o = ctx.item, h = '';
  var close = '<button class="sd-m-x" data-bact="close" aria-label="取消选中">✕</button>';
  var del = '<button class="sd-m-act" data-bact="del" data-tone="danger">删除</button>';
  if (ctx.placing){
    h += '<div class="sd-m-placing"><b>拖动屏幕摆放「' + esc(ctx.placingLabel || '组件') + '」</b>'
      + '<button class="sd-m-act" data-bact="placeDone" data-tone="primary">完成</button></div>';
  }
  if (k === 'sh'){
    h += '<div class="sd-m-selrow">' + close
      + '<input class="sd-m-name" type="text" placeholder="货架名称" value="' + esc(o.name || '') + '">'
      + '<span class="sd-m-stepgroup">'
      + '<button data-bact="kind" data-bk="double"' + (o.kind === 'double' ? ' data-on="true"' : '') + '>双面</button>'
      + '<button data-bact="kind" data-bk="single"' + (o.kind === 'single' ? ' data-on="true"' : '') + '>单面</button>'
      + '<button data-bact="kind" data-bk="low"' + (o.kind === 'low' ? ' data-on="true"' : '') + '>矮</button>'
      + '</span>长' + stepper('len', o.len, 'm')
      + '<button data-bact="rot">旋转</button></div>';
    h += '<div class="sd-m-selrow"><span class="sd-m-tag">x</span>' + stepper('x', o.x, '')
      + '<span class="sd-m-tag">y</span>' + stepper('y', o.y, '')
      + '<span class="sd-m-tag">贴墙</span>'
      + '<button data-bact="flush" data-side="n">北</button><button data-bact="flush" data-side="s">南</button>'
      + '<button data-bact="flush" data-side="w">西</button><button data-bact="flush" data-side="e">东</button>'
      + '<button data-bact="dup">复制</button>' + del + '</div>';
    h += '<div class="sd-m-selrow"><span class="sd-m-tag">🚲</span><button data-bact="fillb" data-bt="adult">排成人车</button>'
      + '<button data-bact="fillb" data-bt="kids">排童车</button><button data-bact="clearb">清空本架</button></div>';
  } else if (k === 'st'){
    h += '<div class="sd-m-selrow">' + close
      + '<input class="sd-m-name" type="text" placeholder="工作室名称" value="' + esc(o.name || '') + '">'
      + '宽' + stepper('w', o.w, 'm') + '深' + stepper('h', o.h, 'm') + '</div>';
    h += '<div class="sd-m-selrow"><span class="sd-m-tag">x</span>' + stepper('x', o.x, '') + '<span class="sd-m-tag">y</span>' + stepper('y', o.y, '') + '</div>';
  } else if (k === 'zn'){
    h += '<div class="sd-m-selrow">' + close
      + '<input class="sd-m-name" type="text" placeholder="区域名称" value="' + esc(o.label || '') + '">'
      + '宽' + stepper('w', o.w, 'm') + '深' + stepper('h', o.h, 'm') + '</div>';
    h += '<div class="sd-m-selrow"><span class="sd-m-tag">x</span>' + stepper('x', o.x, '') + '<span class="sd-m-tag">y</span>' + stepper('y', o.y, '') + del + '</div>';
  } else if (k === 'pl'){
    h += '<div class="sd-m-selrow">' + close + '<span class="sd-m-tag">柱子</span>边长' + stepper('s', o.s || 1, 'm')
      + '<span class="sd-m-tag">x</span>' + stepper('x', o.x, '') + '<span class="sd-m-tag">y</span>' + stepper('y', o.y, '') + del + '</div>';
  } else if (k === 'mk'){
    h += '<div class="sd-m-selrow">' + close
      + '<input class="sd-m-name" type="text" placeholder="标记文字" value="' + esc(o.label || '') + '">'
      + '<span class="sd-m-tag">x</span>' + stepper('x', o.x, '') + '<span class="sd-m-tag">y</span>' + stepper('y', o.y, '') + del + '</div>';
  } else if (k === 'ms'){
    h += '<div class="sd-m-selrow">' + close + '<span class="sd-m-tag">网面墙</span>长' + stepper('len', o.len, 'm')
      + '<button data-bact="rot">' + (o.orient === 'h' ? '东西向' : '南北向') + '</button>'
      + '<span class="sd-m-tag">x</span>' + stepper('x', o.x, '') + '<span class="sd-m-tag">y</span>' + stepper('y', o.y, '') + del + '</div>';
  } else if (k === 'en'){
    h += '<div class="sd-m-selrow">' + close
      + '<input class="sd-m-name" type="text" placeholder="出入口名称" value="' + esc(o.name || '') + '">'
      + '宽' + stepper('w', o.w, 'm') + '深' + stepper('h', o.h, 'm') + '</div>';
    h += '<div class="sd-m-selrow"><span class="sd-m-tag">x</span>' + stepper('x', o.x, '') + '<span class="sd-m-tag">y</span>' + stepper('y', o.y, '') + del + '</div>';
  } else if (k === 'ct'){
    h += '<div class="sd-m-selrow">' + close + '<span class="sd-m-tag">门帘</span>长' + stepper('len', o.len, 'm')
      + '<button data-bact="rot">' + (o.orient === 'h' ? '东西向' : '南北向') + '</button>'
      + '<span class="sd-m-tag">x</span>' + stepper('x', o.x, '') + '<span class="sd-m-tag">y</span>' + stepper('y', o.y, '') + del + '</div>';
  } else if (k === 'bk'){
    var top = (o.pose === 'top');
    h += '<div class="sd-m-selrow">' + close
      + '<span class="sd-m-stepgroup">'
      + '<button data-bact="btype" data-t="adult"' + (o.type !== 'kids' ? ' data-on="true"' : '') + '>成人</button>'
      + '<button data-bact="btype" data-t="kids"' + (o.type === 'kids' ? ' data-on="true"' : '') + '>童车</button></span>'
      + '<span class="sd-m-stepgroup">'
      + '<button data-bact="bpose" data-p="stand"' + (!top ? ' data-on="true"' : '') + '>立地</button>'
      + '<button data-bact="bpose" data-p="top"' + (top ? ' data-on="true"' : '') + '>上架</button></span>'
      + '车头<button data-bact="bsteer" data-v="-45">-45°</button><button data-bact="bsteer" data-v="0">0°</button><button data-bact="bsteer" data-v="45">45°</button></div>';
    h += '<div class="sd-m-selrow">' + '<button data-bact="rot">转90°</button><button data-bact="dup">复制</button>'
      + '<button data-bact="addA">+成人</button><button data-bact="addK">+童车</button>' + del + '</div>';
  }
  return h;
}
function refreshSelVals(bar, it){
  if (!bar || !it) return;
  Array.prototype.forEach.call(bar.querySelectorAll('[data-bval]'), function(sp){
    var f = sp.getAttribute('data-bval'), v = it.o[f];
    if (f === 's' && v == null) v = 1;
    if (v == null || isNaN(v)) return;
    sp.textContent = fnum(v) + (sp.getAttribute('data-unit') || '');
  });
  var nm = bar.querySelector('.sd-m-name');
  if (nm && document.activeElement !== nm) nm.value = it.o.name || it.o.label || '';
}

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
  document.body.setAttribute('data-sd-ui', 'mobile');

  root.addEventListener('click', function(e){
    var t = e.target;
    var tabBtn = t.closest ? t.closest('[data-sd-tab]') : null;
    if (tabBtn){ pickTab(tabBtn.getAttribute('data-sd-tab')); return; }
    if (t.closest && t.closest('[data-sd-toggle]')){ setSheetOpen(!sheetOpen); return; }
    var scroll = t.closest ? t.closest('[data-sd-scroll]') : null;
    if (scroll){
      var g = root.querySelector('[data-sd-group="' + scroll.getAttribute('data-sd-scroll') + '"]');
      if (g) g.scrollIntoView({ behavior:'smooth', block:'start' });
      return;
    }
    if (t.closest && t.closest('[data-sd-menu]')){ toggleMenu(true); return; }
    if (t.closest && (t.closest('[data-sd-menu-close]') || t.closest('#sdMenuMask'))){ toggleMenu(false); return; }
    // 列表里点「✕」= 取消选中（pick 的空 id 约定）
    var pick = t.closest ? t.closest('button[data-act="pick"]') : null;
    if (pick && pick.getAttribute('data-id') === '__clear__'){ e.stopPropagation(); }
  }, true);
  return slots;
}
function toggleMenu(open){
  var m = document.getElementById('sdMenu'), mask = document.getElementById('sdMenuMask');
  if (m) m.setAttribute('data-open', String(!!open));
  if (mask) mask.setAttribute('data-open', String(!!open));
}

window.SDUI = {
  id: 'mobile',
  mount: mount,
  renderStatus: renderStatus,
  renderPanel: function(vm){ lastVM = vm; renderPanelBody(); },
  selBarHTML: selBarHTML,
  refreshSelVals: refreshSelVals,
  onSelectionChange: function(){
    // 面板收起时不重建；展开时同步高亮与选中卡片。
    if (!sheetOpen) return;
    renderPanelBody();
  },
  revealSelection: function(id){
    pickTab('elements');
    var el = (id && document.querySelector('.sd-m-item[data-id="' + id + '"]')) || document.querySelector('.sd-m-selcard');
    if (el && el.scrollIntoView) el.scrollIntoView({ behavior:'smooth', block:'center' });
  },
  setSheetOpen: setSheetOpen,
  isSheetOpen: function(){ return sheetOpen; }
};
})();
