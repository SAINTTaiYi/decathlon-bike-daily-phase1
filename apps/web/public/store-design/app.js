/* 门店布局设计渲染 · 交互层 v1 (store-3d/app.js) */
(function(){
'use strict';
var E = window.Engine;
var LS_CFG = 'store3d.cfg.v4';
var LS_VIEW = 'store3d.view.v1';
var LS_FLAG = 'store3d.cfg.migrated';
var LS_BAK = 'store3d.cfg.bak.';

var cfg = E.defaultConfig();
var restoredFrom = null;
/* 智能恢复：扫描所有历史存储键，挑出“用户真正调过的”那一份，自动迁移到当前格式。
   以后不会再因版本升级而丢布局；原始数据全部留档在 store3d.cfg.bak.* 里可随时切换。 */
(function loadStored(){
  try {
    var flagged = false;
    try { flagged = !!localStorage.getItem(LS_FLAG); } catch(e1){}
    var chosenRaw = null, chosenKey = null;
    if (flagged){
      try { chosenRaw = localStorage.getItem(LS_CFG); } catch(e2){}
      if (chosenRaw) chosenKey = LS_CFG;
    }
    if (!chosenRaw){
      var cands = {};
      ['store3d.cfg.v4','store3d.cfg.v3','store3d.cfg.v2','store3d.cfg.v1'].forEach(function(k){
        var r = null;
        try { r = localStorage.getItem(k); } catch(e3){}
        if (!r) return;
        try { localStorage.setItem(LS_BAK + k.replace('store3d.cfg.',''), r); } catch(e4){}
        var o = null;
        try { o = JSON.parse(r); } catch(e5){ return; }
        if (!o || typeof o !== 'object') return;
        try { cands[k] = { key:k, raw:r, score: E.configDiff(E.defaultConfig(), o) }; } catch(e6){}
      });
      var pick = null;
      if (cands['store3d.cfg.v3']) pick = cands['store3d.cfg.v3'];
      if (cands['store3d.cfg.v4'] && (!pick || (pick.score === 0 && cands['store3d.cfg.v4'].score > 0))) pick = cands['store3d.cfg.v4'];
      if (!pick){
        ['store3d.cfg.v2','store3d.cfg.v1'].forEach(function(k){
          if (cands[k] && (!pick || cands[k].score > pick.score)) pick = cands[k];
        });
      }
      if (pick){ chosenRaw = pick.raw; chosenKey = pick.key; }
      try { localStorage.setItem(LS_FLAG, '1'); } catch(e7){}
    }
    if (chosenRaw){
      var obj = JSON.parse(chosenRaw);
      cfg = E.migrateLegacy(obj);
      try { localStorage.setItem(LS_CFG, JSON.stringify(cfg)); } catch(e8){}
      if (chosenKey && chosenKey !== LS_CFG) restoredFrom = chosenKey;
    }
  } catch(e0){}
})();
var view = { az: 90, el: 33, zoom: 1, spin: false };
try {
  var rv = JSON.parse(localStorage.getItem(LS_VIEW) || '{}');
  if (rv && typeof rv === 'object'){
    if (rv.az != null) view.az = rv.az;
    if (rv.el != null) view.el = rv.el;
    if (rv.zoom) view.zoom = rv.zoom;
  }
} catch(e1){}
var ui = { tab: 't3d', sel: null, planZ: null, grid: true, snap: 0.5 };

function $(q, root){ return (root || document).querySelector(q); }
function $all(q, root){ return Array.prototype.slice.call((root || document).querySelectorAll(q)); }
function err(msg){
  if (window.__errs) window.__errs.push(msg);
  var el = document.getElementById('errlog');
  if (el){ el.style.display = 'block'; el.textContent += msg + '\n'; }
}
function esc2(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }
var toastT = null;
function toast(msg){
  var el2 = document.getElementById('toast');
  if (!el2) return;
  el2.textContent = msg;
  el2.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(function(){ el2.classList.remove('show'); }, 2600);
}
var els = {};

/* ---------------- 路径读写 ---------------- */
function getPath(p){
  var o = cfg, ks = p.split('.');
  for (var i=0;i<ks.length;i++){ if (o == null) return null; o = o[ks[i]]; }
  return o;
}
function setPath(p, v){
  var ks = p.split('.'), o = cfg;
  for (var i=0;i<ks.length-1;i++){
    if (o[ks[i]] == null) o[ks[i]] = {};
    o = o[ks[i]];
  }
  o[ks[ks.length-1]] = v;
}
function ensureStructures(p){
  cfg.zones.forEach(function(z){
    if (z.kind === 'storage' && !z.fence) z.fence = { n:'wall', s:'wall', w:'mesh', e:'none' };
  });
}

/* ---------------- 持久化 ---------------- */
var saveT = null;
function saveSoon(){
  clearTimeout(saveT);
  saveT = setTimeout(function(){
    try {
      var rawNew = JSON.stringify(cfg);
      var prev = localStorage.getItem(LS_CFG);
      if (prev && prev !== rawNew){ localStorage.setItem(LS_BAK + 'prev', prev); }
      localStorage.setItem(LS_CFG, rawNew);
      localStorage.setItem(LS_VIEW, JSON.stringify({ az: view.az, el: view.el, zoom: view.zoom }));
    } catch(e2){}
  }, 250);
}

/* ---------------- 视图渲染 ---------------- */
var r3raf = false;
function schedule3D(){
  if (r3raf) return;
  r3raf = true;
  requestAnimationFrame(function(){ r3raf = false; render3DNow(); });
}
function render3DNow(){
  if (!els.view3d) return;
  var w = els.view3d.clientWidth || 380;
  var h = Math.max(330, Math.min(640, Math.round(w * 0.92)));
  els.view3d.innerHTML = E.render3D(cfg, { az: view.az, el: view.el, zoom: view.zoom, vw: w, vh: h });
}
function currentPlanZ(){
  var W = cfg.space.w, D = cfg.space.d, pad = 1.4;
  var avail = (els.planScroll && els.planScroll.clientWidth) || 380;
  var auto = E.clamp(avail / (W + 2*pad), 16, 46);
  return ui.planZ || Math.max(auto, 20);
}
function renderPlanNow(){
  if (!els.viewplan) return;
  var z = currentPlanZ();
  els.viewplan.innerHTML = E.renderPlan(cfg, { z: z, sel: ui.sel, grid: ui.grid });
  var info = $('#pzInfo');
  if (info) info.textContent = Math.round(z) + ' px/m' + (ui.planZ ? '' : '（自动）');
  renderSelBar();
}
function renderChips(){
  /* 状态条内容（检查摘要）作为数据交给当前界面实现渲染：
     移动端是单行横向滚动条，桌面端是整行铺开——两种排布各在自己的样式文件里。 */
  if (!window.SDUI || !window.SD_SCHEMA) return;
  SDUI.renderStatus(SD_SCHEMA.statusItems(E.computeChecks(cfg)));
}
function syncViewUI(){
  var azS = $('#az'); if (!azS) return;
  azS.value = Math.round(view.az); $('#azv').textContent = Math.round(view.az) + '°';
  $('#el').value = Math.round(view.el); $('#elv').textContent = Math.round(view.el) + '°';
  $('#zm').value = Math.round(view.zoom * 100); $('#zmv').textContent = Math.round(view.zoom * 100) + '%';
}
function syncInputs(){
  $all('[data-path]', els.editors).forEach(function(inp){
    if (document.activeElement === inp) return;
    var v = getPath(inp.getAttribute('data-path'));
    if (inp.type === 'checkbox') inp.checked = !!v;
    else if (v != null) inp.value = (typeof v === 'number') ? v : String(v);
  });
}

/* ---------------- 面板视图模型（数据层 → 当前界面实现渲染） ----------------
   旧版把 15 组 <details> 段落一次性铺在页面底部，每个元素的所有数字字段全部列出来，
   用户反馈「底下杂七杂八看得眼花」。现在收敛成三页——检查 / 元素 / 设置：
     · 检查：通过/未通过一眼看完，附随机方案入口；
     · 元素：默认只展开「当前选中」的那一个，其余按类型收进清单；
     · 设置：结构级参数（空间与显示 / 外墙与开口 / 内隔墙 / 历史版本 / 使用说明）。
   视图模型由 sd-schema.js 产出，移动端与桌面端各自渲染成自己的 DOM。
   字段名（data-path）与动作名（data-act）沿用旧版，事件处理无需改动。 */

/* 历史备份：从 localStorage 扫描（数据层职责，界面只负责显示与「恢复」按钮）。 */
function collectBackups(){
  var list = [];
  ['v1','v2','v3','v4','prev'].forEach(function(tag){
    var raw = null;
    try { raw = localStorage.getItem(LS_BAK + tag); } catch(e){}
    if (!raw) return;
    var info = '';
    try {
      var obj = JSON.parse(raw);
      info = '相对默认 ' + E.configDiff(E.defaultConfig(), obj) + ' 处调整 · ' + (Math.round(raw.length / 102.4) / 10) + ' KB';
    } catch(e2){ info = '无法解析'; }
    list.push({ tag: tag, label: (tag === 'prev') ? '上一版自动备份' : ('历史版本 ' + tag), info: info });
  });
  return list;
}

/* 使用说明：旧版是一大段堆在页面底部的文字，现在拆成条目收进「设置」里。 */
var HELP_LINES = [
  '空间 23.0 × 17.0 m 按原图 0.5m 网格量取，可直接改数值（单位：米）。',
  '外墙开口：上边 x2.0~6.0 为「商场出入口」，左下角为「出入口」通道区，右侧隔墙上留「进出口」门洞。',
  '自行车库存区西侧默认按金属网面处理；工作室（4×4m）东侧背靠它——「网面背靠」检查即通过。若实际为实体墙，可把工作室某侧改为「网面」或加一道「独立网面墙」。',
  '货道间距：平行相对（投影重叠）或同一直线上的相邻货架之间净距要求 ≥5 m（含端到端通道）。',
  '货架可命名、可选单双面/朝向/长度（0.1m 精度）/高度；「贴墙」一键贴到北南西东墙面。',
  '贴墙豁免：两端都贴墙的断开货架列不参与 5 m 端部检查；与其相对的平行货道仍按 ≥5 m 检查。',
  '矮货架默认高 0.9m，颜色淡紫以便区分；长/高/单双面照常可调。',
  '门帘默认放在「商场出入口」与「进出口」，半透明条纹；可增删、拖动、改尺寸朝向。',
  '自行车：成人车 2.0m / 童车 1.5m。两种摆放：立地（90° 直放、车头 45° 倾斜）与上架平放（架顶，2m/位）。单台可调朝向与车头角度。',
  '出入口净空区：三个出入口各一块橙色虚线框，货架/试用区/区域/工作室/柱子/网面墙都不得占用；随机方案会自动避开。',
  '🎲 随机方案：随机货架排布、工作室位置、试用区大小位置，自动重试直到满足全部要求。',
  '数据安全：布局只写入同一个存储键，版本升级不会重置；每次修改自动留存「上一版」，可在「历史版本恢复」里换回。',
  '添加组件：右下角悬浮「＋」按钮 → 选类型即自动放到空地并进入摆放模式，拖动屏幕即可摆放。',
  '导出 SVG 可分享当前视角；导出配置可备份布置（JSON）。数据自动保存在本机浏览器。'
];

function buildEditors(){
  if (!window.SDUI || !window.SD_SCHEMA) return;
  var vm = SD_SCHEMA.buildVM(cfg, { sel: ui.sel, backups: collectBackups(), help: HELP_LINES });
  SDUI.renderPanel(vm);
}
/* ---------------- 结构操作（增删改） ---------------- */
function nid(){ return 'x' + Math.random().toString(36).slice(2, 7); }
function shelfGet(id){ for (var i=0;i<cfg.shelves.length;i++){ if (String(cfg.shelves[i].id) === String(id)) return cfg.shelves[i]; } return null; }
function findBy(arr, id){ for (var i=0;i<arr.length;i++){ if (String(arr[i].id) === String(id)) return arr[i]; } return null; }
function afterStruct(){ saveSoon(); buildEditors(); renderChips(); render3DNow(); renderPlanNow(); }
function addShelf(kind){
  var h = (kind === 'low') ? 0.9 : 1.5;
  cfg.shelves.push({ id: nid(), name: '', kind: kind, orient: 'h', x: 2, y: 2, len: 4, h: h });
  afterStruct();
}
function flushWallTo(id){
  var parts = String(id).split(':');
  var s = shelfGet(parts[0]); if (!s) return;
  var side = parts[1], d = E.shelfDepth(s);
  var W = cfg.space.w, D = cfg.space.d, t = E.WALL_T;
  if (s.orient === 'h'){
    if (side === 'n') s.y = t;
    else if (side === 's') s.y = D - t - d;
    else if (side === 'w') s.x = t;
    else if (side === 'e') s.x = W - t - s.len;
  } else {
    if (side === 'w') s.x = t;
    else if (side === 'e') s.x = W - t - d;
    else if (side === 'n') s.y = t;
    else if (side === 's') s.y = D - t - s.len;
  }
  s.x = E.clamp(s.x, 0, Math.max(0, W - (s.orient === 'h' ? s.len : d)));
  s.y = E.clamp(s.y, 0, Math.max(0, D - (s.orient === 'h' ? d : s.len)));
  afterStruct();
  syncInputs();
  toast('已贴墙：' + (side==='n'?'北':side==='s'?'南':side==='w'?'西':'东') + '侧');
}
function doRandom(){
  var r = E.randomLayout(cfg);
  cfg = r.cfg;
  ensureStructures();
  ui.sel = null;
  afterStruct();
  syncInputs();
  var ck = E.computeChecks(cfg);
  var msg = '🎲 随机方案：双面 ' + E.fnum(ck.sumDouble) + ' m' + (ck.minAisle != null ? ' · 最小货道 ' + E.fnum(Math.round(ck.minAisle*10)/10) + ' m' : '') + (ck.okTest ? ' · 含骑行试用区' : '');
  if (!r.clean) msg += '（提示 ' + r.warnings + ' 条，可再随机或手动微调）';
  toast(msg);
}

function fillShelfBikes(ids){
  var parts = String(ids).split(':');
  var sid = parts[0], typ = (parts[1] === 'kids') ? 'kids' : 'adult', pose = (parts[2] === 'top') ? 'top' : 'stand';
  var s = shelfGet(sid); if (!s) return;
  var dir = (pose === 'top') ? null : E.bestBikeDir(cfg, s, typ);
  var rc = E.shelfRect(s), rem;
  if (pose === 'top'){ rem = { x: rc.x-0.7, y: rc.y-0.7, w: rc.w+1.4, h: rc.h+1.4 }; }
  else {
    rem = { x: rc.x-1.0, y: rc.y-1.0, w: rc.w+2.0, h: rc.h+2.0 };
    if (dir === 's') rem.h += 2.2;
    else if (dir === 'n'){ rem.y -= 2.2; rem.h += 2.2; }
    else if (dir === 'e') rem.w += 2.2;
    else if (dir === 'w'){ rem.x -= 2.2; rem.w += 2.2; }
  }
  cfg.bikes = (cfg.bikes || []).filter(function(b){
    return !(b.x > rem.x && b.x < rem.x + rem.w && b.y > rem.y && b.y < rem.y + rem.h);
  });
  var list = E.bikesForShelf(s, typ, { dir: dir || 's', pose: pose });
  list.forEach(function(b){ b.id = nid(); cfg.bikes.push(b); });
  afterStruct(); syncInputs();
  toast('已排入 ' + list.length + ' 台' + (typ === 'kids' ? '童车(1.5m)' : '成人车(2m)') + (pose === 'top' ? '，平放架顶，2m/位' : '，垂直90°摆放，车头45°倾斜'));
}

var acts = {
  rand: function(){ doRandom(); },
  /* 面板清单里点选元素（两个界面实现的「元素」页都用 data-act="pick"）。
     id 约定 '__clear__' = 取消选中。 */
  pick: function(ds){
    if (!ds || ds.id == null) return;
    if (String(ds.id) === '__clear__'){
      ui.sel = null;
      endPlacing(true);
      afterSelect();
      return;
    }
    endPlacing(true);
    ui.sel = ds.id;
    if (ui.tab !== 'tplan') setTab('tplan');
    updateSelFrame();
    renderPlanNow();
    renderSelBar();
    if (window.SDUI && SDUI.onSelectionChange) SDUI.onSelectionChange();
    buildEditors();
  },
  flushWall: function(ds){ flushWallTo(ds.id); },
  fillb: function(ds){ fillShelfBikes(ds.id); },
  addCurtain: function(){ cfg.curtains = cfg.curtains || []; cfg.curtains.push({ id: nid(), orient:'h', x: 3, y: 0.22, len: 3, h: 1.9 }); afterStruct(); },
  delCurtain: function(ds){ cfg.curtains = (cfg.curtains || []).filter(function(x){ return String(x.id) !== String(ds.id); }); afterStruct(); },
  addBikeA: function(){ cfg.bikes = cfg.bikes || []; cfg.bikes.push({ id: nid(), type:'adult', x: 5, y: 5, angle: 45 }); afterStruct(); },
  addBikeK: function(){ cfg.bikes = cfg.bikes || []; cfg.bikes.push({ id: nid(), type:'kids', x: 5, y: 5, angle: 45 }); afterStruct(); },
  delBike: function(ds){ cfg.bikes = (cfg.bikes || []).filter(function(x){ return String(x.id) !== String(ds.id); }); afterStruct(); },
  clearBikes: function(){ cfg.bikes = []; afterStruct(); },
  addShelfL: function(){ addShelf('low'); },
  restoreBak: function(ds){
    var raw = null;
    try { raw = localStorage.getItem(LS_BAK + ds.id); } catch(e){}
    if (!raw){ toast('未找到该备份'); return; }
    if (!confirm('恢复「' + ds.id + '」备份？当前布局会被覆盖（当前状态也会留档）。')) return;
    try {
      var cur = localStorage.getItem(LS_CFG);
      if (cur){ localStorage.setItem(LS_BAK + 'prev', cur); }
      cfg = E.migrateLegacy(JSON.parse(raw));
      ui.sel = null;
      afterStruct(); syncInputs();
      toast('已恢复备份 ' + ds.id + ' ✓');
    } catch(e2){ toast('恢复失败：' + (e2 && e2.message ? e2.message : e2)); }
  },
  addOpen: function(ds){
    var key = ds.id, e = cfg.walls[key];
    var L = (key === 'top' || key === 'bottom') ? cfg.space.w : cfg.space.d;
    e.open = e.open || [];
    e.open.push({ at: Math.max(0, Math.round((L/2 - 1)*10)/10), w: 2.0, type: 'pass', label: '' });
    afterStruct();
  },
  delOpen: function(ds){
    var parts = String(ds.id).split(':');
    cfg.walls[parts[0]].open.splice(+parts[1], 1);
    afterStruct();
  },
  addSeg: function(){ cfg.wallSegs.push({ id: nid(), orient:'v', at: Math.round(cfg.space.w/2), from: 1, to: Math.round(cfg.space.d) - 1, thick: 0.3, label: '' }); afterStruct(); },
  delSeg: function(ds){ cfg.wallSegs = cfg.wallSegs.filter(function(x){ return String(x.id) !== String(ds.id); }); afterStruct(); },
  addPillar: function(){ cfg.pillars.push({ id: nid(), x: Math.round(cfg.space.w/2), y: Math.round(cfg.space.d/2), s: 1.0 }); afterStruct(); },
  delPillar: function(ds){ cfg.pillars = cfg.pillars.filter(function(x){ return String(x.id) !== String(ds.id); }); afterStruct(); },
  addShelfD: function(){ addShelf('double'); },
  addShelfS: function(){ addShelf('single'); },
  delShelf: function(ds){ cfg.shelves = cfg.shelves.filter(function(x){ return String(x.id) !== String(ds.id); }); afterStruct(); },
  dupShelf: function(ds){
    var s = shelfGet(ds.id); if (!s) return;
    var c = JSON.parse(JSON.stringify(s));
    c.id = nid();
    if (s.name) c.name = s.name + '·副本';
    c.y = Math.min(cfg.space.d - 0.6, c.y + 1.0);
    cfg.shelves.push(c); afterStruct();
  },
  addEntrance: function(){ cfg.entrances = cfg.entrances || []; cfg.entrances.push({ id: nid(), name:'新出入口', x: 1, y: 1, w: 2, h: 2 }); afterStruct(); },
  delEntrance: function(ds){ cfg.entrances = (cfg.entrances || []).filter(function(x){ return String(x.id) !== String(ds.id); }); afterStruct(); },
  addZone: function(){ cfg.zones.push({ id: nid(), kind:'passage', x: 1, y: 1, w: 4, h: 3, label:'新区域', fence:null }); afterStruct(); },
  delZone: function(ds){ cfg.zones = cfg.zones.filter(function(x){ return String(x.id) !== String(ds.id); }); afterStruct(); },
  addMesh: function(){ cfg.meshes.push({ id: nid(), orient:'v', x: Math.round(cfg.space.w/2), y: 3, len: 3, h: 2.0 }); afterStruct(); },
  delMesh: function(ds){ cfg.meshes = cfg.meshes.filter(function(x){ return String(x.id) !== String(ds.id); }); afterStruct(); },
  addMarker: function(){ cfg.markers.push({ id: nid(), color:'red', x: Math.round(cfg.space.w/2), y: 2, w: 0.5, h: 0.5, label:'' }); afterStruct(); },
  delMarker: function(ds){ cfg.markers = cfg.markers.filter(function(x){ return String(x.id) !== String(ds.id); }); afterStruct(); }
};

/* ---------------- 编辑面板事件 ---------------- */
function onEditInput(e){
  var t = e.target;
  var p = t && t.getAttribute && t.getAttribute('data-path');
  if (!p) return;
  var v;
  if (t.type === 'checkbox') v = t.checked;
  else if (t.type === 'number'){ v = parseFloat(t.value); if (isNaN(v)) return; }
  else v = t.value;
  setPath(p, v);
  if (/^shelves\.\d+\.kind$/.test(p)){
    var sx = cfg.shelves[+p.split('.')[1]];
    if (sx){
      if (v === 'low' && (sx.h == null || sx.h > 1.2)) sx.h = 0.9;
      if (v !== 'low' && (sx.h == null || sx.h < 1.0)) sx.h = 1.5;
    }
  }
  ensureStructures(p);
  saveSoon(); renderChips(); schedule3D(); renderPlanNow();
}
function onEditClick(e){
  var b = e.target && e.target.closest ? e.target.closest('button[data-act]') : null;
  if (!b) return;
  var fn = acts[b.getAttribute('data-act')];
  if (fn) fn(b.dataset || {});
}

/* ---------------- 平面拖动 ---------------- */
function toWorld(svgEl, cx, cy){
  var pt = svgEl.createSVGPoint(); pt.x = cx; pt.y = cy;
  var q = pt.matrixTransform(svgEl.getScreenCTM().inverse());
  return { x: q.x, y: q.y };
}
function snapV(v){ var s = ui.snap || 0.5; return Math.round(v/s)*s; }
function anchorOf(id){
  var p = String(id).split(':'), k = p[0], key = p[1];
  if (k === 'sh'){ var s = shelfGet(key); return s ? { x: s.x, y: s.y } : null; }
  if (k === 'st') return { x: cfg.studio.x, y: cfg.studio.y };
  if (k === 'zn'){ var z = findBy(cfg.zones, key); return z ? { x: z.x, y: z.y } : null; }
  if (k === 'pl'){ var pp = findBy(cfg.pillars, key); return pp ? { x: pp.x, y: pp.y } : null; }
  if (k === 'mk'){ var m = findBy(cfg.markers, key); return m ? { x: m.x, y: m.y } : null; }
  if (k === 'ms'){ var ms = findBy(cfg.meshes, key); return ms ? { x: ms.x, y: ms.y } : null; }
  if (k === 'en'){ var en = findBy(cfg.entrances || [], key); return en ? { x: en.x, y: en.y } : null; }
  if (k === 'ct'){ var ct = findBy(cfg.curtains || [], key); return ct ? { x: ct.x, y: ct.y } : null; }
  if (k === 'bk'){ var bkk = findBy(cfg.bikes || [], key); return bkk ? { x: bkk.x, y: bkk.y } : null; }
  return null;
}
function sizeOf(id){
  var p = String(id).split(':'), k = p[0], key = p[1];
  if (k === 'sh'){ var s = shelfGet(key); if (!s) return null; var r = E.shelfRect(s); return { w: r.w, h: r.h }; }
  if (k === 'st') return { w: cfg.studio.w, h: cfg.studio.h };
  if (k === 'zn'){ var z = findBy(cfg.zones, key); return z ? { w: z.w, h: z.h } : null; }
  if (k === 'pl'){ var pp = findBy(cfg.pillars, key); var sz = pp ? (pp.s || 1) : 1; return { w: sz, h: sz }; }
  if (k === 'mk'){ var m = findBy(cfg.markers, key); return m ? { w: m.w, h: m.h } : null; }
  if (k === 'ms'){ var ms = findBy(cfg.meshes, key); return ms ? ((ms.orient === 'v') ? { w: 0.2, h: ms.len } : { w: ms.len, h: 0.2 }) : null; }
  if (k === 'en'){ var en = findBy(cfg.entrances || [], key); return en ? { w: en.w, h: en.h } : null; }
  if (k === 'ct'){ var ctt = findBy(cfg.curtains || [], key); return ctt ? ((ctt.orient === 'v') ? { w: 0.3, h: ctt.len } : { w: ctt.len, h: 0.3 }) : null; }
  if (k === 'bk'){ return { w: 1.0, h: 1.0 }; }
  return null;
}
function moveItem(id, nx, ny){
  nx = snapV(nx); ny = snapV(ny);
  var sz = sizeOf(id); if (!sz) return;
  var p = String(id).split(':'), k = p[0], key = p[1];
  var W = cfg.space.w, D = cfg.space.d;
  if (k === 'pl'){
    var pp = findBy(cfg.pillars, key); if (!pp) return;
    pp.x = E.clamp(nx, sz.w/2, W - sz.w/2);
    pp.y = E.clamp(ny, sz.h/2, D - sz.h/2);
    return;
  }
  var cx = E.clamp(nx, 0, Math.max(0, W - sz.w));
  var cy = E.clamp(ny, 0, Math.max(0, D - sz.h));
  if (k === 'sh'){ var s = shelfGet(key); if (s){ s.x = cx; s.y = cy; } }
  else if (k === 'st'){ cfg.studio.x = cx; cfg.studio.y = cy; }
  else if (k === 'zn'){ var z = findBy(cfg.zones, key); if (z){ z.x = cx; z.y = cy; } }
  else if (k === 'mk'){ var m = findBy(cfg.markers, key); if (m){ m.x = cx; m.y = cy; } }
  else if (k === 'ms'){ var ms = findBy(cfg.meshes, key); if (ms){ ms.x = cx; ms.y = cy; } }
  else if (k === 'en'){ var en = findBy(cfg.entrances || [], key); if (en){ en.x = cx; en.y = cy; } }
  else if (k === 'ct'){ var ct = findBy(cfg.curtains || [], key); if (ct){ ct.x = cx; ct.y = cy; } }
  else if (k === 'bk'){
    var bkk = findBy(cfg.bikes || [], key);
    if (bkk){ bkk.x = E.clamp(nx, 0.2, cfg.space.w - 0.2); bkk.y = E.clamp(ny, 0.2, cfg.space.d - 0.2); }
  }
}
function updateSelFrame(){
  var sc = els.planScroll;
  if (!sc) return;
  var svg = sc.querySelector('svg');
  if (!svg) return;
  var f = svg.querySelector('#selframe');
  if (!f) return;
  var r = ui.sel ? E.itemRect(cfg, ui.sel) : null;
  if (!r){ f.setAttribute('display', 'none'); return; }
  f.removeAttribute('display');
  f.setAttribute('x', E.r2(r.x - 0.08));
  f.setAttribute('y', E.r2(r.y - 0.08));
  f.setAttribute('width', E.r2(r.w + 0.16));
  f.setAttribute('height', E.r2(r.h + 0.16));
}
function clampRaw(id, nx, ny){
  var sz = sizeOf(id) || { w:0.6, h:0.6 };
  var W = cfg.space.w, D = cfg.space.d;
  var k = String(id).split(':')[0];
  if (k === 'pl') return { x: E.clamp(nx, sz.w/2, W - sz.w/2), y: E.clamp(ny, sz.h/2, D - sz.h/2) };
  if (k === 'bk') return { x: E.clamp(nx, 0.2, W - 0.2), y: E.clamp(ny, 0.2, D - 0.2) };
  return { x: E.clamp(nx, 0, Math.max(0, W - sz.w)), y: E.clamp(ny, 0, Math.max(0, D - sz.h)) };
}
function isCenterAnchored(id){
  var k = String(id).split(':')[0];
  return k === 'pl' || k === 'bk';
}
/* ---------- 摆放模式（添加组件后拖拽放置） ---------- */
function startPlacing(selId, label){
  ui.placing = selId;
  ui.placingLabel = label || '组件';
  renderSelBar();
}
function endPlacing(silent){
  if (!ui.placing) return;
  ui.placing = null;
  renderSelBar();      /* 只更新快捷条；不重建 SVG（避免中断正在开始的拖拽） */
  if (!silent) toast('已摆放完成 ✓');
}
/* ---------- 平面拖拽（跟手、松手吸附；支持摆放模式与触屏） ---------- */
function bindPlan(){
  var sc = els.planScroll;
  /* 触摸拦截：触摸到元素（或摆放模式）时立即阻止滚动，避免拖拽被浏览器接管 */
  sc.addEventListener('touchstart', function(ev){
    if (!ev.cancelable) return;
    if (ui.placing){ ev.preventDefault(); return; }
    var t = ev.target && ev.target.closest ? ev.target.closest('[data-id]') : null;
    if (t) ev.preventDefault();
  }, { passive:false, capture:true });
  sc.addEventListener('pointerdown', function(e){
    if (e.button != null && e.button > 0) return;
    var t = e.target && e.target.closest ? e.target.closest('[data-id]') : null;
    var svgEl = sc.querySelector('svg');
    if (!svgEl) return;
    var id = null, placingMode = false;
    if (ui.placing){
      if (t && t.getAttribute('data-id') !== ui.placing){
        endPlacing(true);
      } else {
        id = ui.placing; placingMode = true;
      }
    }
    if (!id){
      if (!t){ ui.sel = null; afterSelect(); return; }
      id = t.getAttribute('data-id');
    }
    if (ui.sel !== id){
      try {
        if (!localStorage.getItem('store3d.hint.selbar')){
          localStorage.setItem('store3d.hint.selbar', '1');
          toast('拖动元素可移动；底部快捷条：改名 / 长度 / 贴墙 / 微调');
        }
      } catch(e0){}
    }
    ui.sel = id;
    /* 轻量移动选中框，绝不重建 SVG（重建会触发 pointercancel → 拖拽变滚动）；
       面板与快捷条由 afterSelect 统一收尾。 */
    afterSelect();
    var g = sc.querySelector('[data-id="' + id + '"]');
    if (!g) return;
    var baseT = g.getAttribute('transform') || '';
    var a = anchorOf(id); if (!a) return;
    var sz = sizeOf(id) || { w:0.6, h:0.6 };
    var fEl = sc.querySelector('#selframe');
    var fBase = E.itemRect(cfg, id);
    var pt = toWorld(svgEl, e.clientX, e.clientY);
    var off;
    var grabbed = (t && t.getAttribute('data-id') === id);
    if (grabbed) off = { dx: pt.x - a.x, dy: pt.y - a.y };
    else off = isCenterAnchored(id) ? { dx: 0, dy: 0 } : { dx: sz.w/2, dy: sz.h/2 };
    var moved = false, cur = { x: a.x, y: a.y };
    var startPx = { x: e.clientX, y: e.clientY };
    e.preventDefault();
    try { sc.setPointerCapture(e.pointerId); } catch(e1){}
    function blockTM(ev){ ev.preventDefault(); }
    sc.addEventListener('touchmove', blockTM, { passive:false });
    function move(ev){
      if (!moved && Math.hypot(ev.clientX - startPx.x, ev.clientY - startPx.y) < 5) return;
      moved = true;
      var svg2 = sc.querySelector('svg'); if (!svg2) return;
      var q = toWorld(svg2, ev.clientX, ev.clientY);
      cur = clampRaw(id, q.x - off.dx, q.y - off.dy);
      if (g && g.isConnected){
        var ddx = cur.x - a.x, ddy = cur.y - a.y;
        g.setAttribute('transform', 'translate(' + E.r2(ddx) + ' ' + E.r2(ddy) + ')' + (baseT ? ' ' + baseT : ''));
        if (fEl && fBase && fEl.isConnected){
          fEl.removeAttribute('display');
          fEl.setAttribute('x', E.r2(fBase.x - 0.08 + ddx));
          fEl.setAttribute('y', E.r2(fBase.y - 0.08 + ddy));
        }
      }
    }
    function cleanup(){
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', done1);
      window.removeEventListener('pointercancel', done2);
      sc.removeEventListener('touchmove', blockTM);
      try { sc.releasePointerCapture(e.pointerId); } catch(e2){}
    }
    function done1(){
      cleanup();
      if (moved){
        moveItem(id, snapV(cur.x), snapV(cur.y));
        postSelUpdate(); saveSoon();
      } else if (placingMode){
        endPlacing(false);
      }
    }
    function done2(){
      cleanup();
      renderPlanNow();
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', done1);
    window.addEventListener('pointercancel', done2);
  });
}

/* ---------------- 3D 手势/* ---------------- 3D 手势 ---------------- */
function bindGestures(){
  var el = els.view3d;
  el.style.touchAction = 'none';
  var ptrs = {}, last = null, pinch0 = null;
  function ptArr(){ var a = []; for (var k in ptrs){ a.push(ptrs[k]); } return a; }
  el.addEventListener('pointerdown', function(e){
    try { el.setPointerCapture(e.pointerId); } catch(e0){}
    ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
    if (ptArr().length === 1) last = { x: e.clientX, y: e.clientY };
    if (ptArr().length === 2){
      var a = ptArr();
      pinch0 = { d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), zoom: view.zoom };
    }
    e.preventDefault();
  });
  el.addEventListener('pointermove', function(e){
    if (!ptrs[e.pointerId]) return;
    ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
    var a = ptArr();
    if (a.length === 1 && last){
      var dx = e.clientX - last.x, dy = e.clientY - last.y;
      last = { x: e.clientX, y: e.clientY };
      view.az = (view.az + dx * 0.35 + 360) % 360;
      view.el = E.clamp(view.el + dy * 0.28, 8, 85);
      syncViewUI(); schedule3D();
    } else if (a.length === 2 && pinch0){
      var d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
      view.zoom = E.clamp(pinch0.zoom * d / (pinch0.d || 1), 0.35, 2.6);
      syncViewUI(); schedule3D();
    }
  });
  function endPt(e){
    delete ptrs[e.pointerId];
    var a = ptArr();
    pinch0 = null;
    last = (a.length === 1) ? { x: a[0].x, y: a[0].y } : null;
    saveSoon();
  }
  el.addEventListener('pointerup', endPt);
  el.addEventListener('pointercancel', endPt);
  el.addEventListener('wheel', function(e){
    view.zoom = E.clamp(view.zoom * (e.deltaY < 0 ? 1.08 : 0.92), 0.35, 2.6);
    syncViewUI(); schedule3D(); e.preventDefault();
  }, { passive: false });
}

/* ---------------- 底部快捷编辑条（移动端友好） ---------------- */
function selGet(){
  if (!ui.sel) return null;
  var p = String(ui.sel).split(':'), k = p[0], id = p[1], o = null;
  if (k === 'sh') o = shelfGet(id);
  else if (k === 'st') o = cfg.studio;
  else if (k === 'zn') o = findBy(cfg.zones, id);
  else if (k === 'pl') o = findBy(cfg.pillars, id);
  else if (k === 'mk') o = findBy(cfg.markers, id);
  else if (k === 'ms') o = findBy(cfg.meshes, id);
  else if (k === 'en') o = findBy(cfg.entrances || [], id);
  else if (k === 'ct') o = findBy(cfg.curtains || [], id);
  else if (k === 'bk') o = findBy(cfg.bikes || [], id);
  if (!o) return null;
  return { k:k, id:ui.sel, o:o };
}
var SEC_OF = { sh:'shelves', st:'studio', zn:'zones', pl:'pillars', mk:'markers', ms:'meshes', en:'entrances', ct:'curtains', bk:'bikes' };
/* 面板里的「全部参数」跳到当前选中项：具体跳到哪儿由界面实现决定
   （移动端切到「元素」页并滚动到选中卡片；桌面端切到右栏「元素」页）。 */
function scrollToSection(){ if (window.SDUI && SDUI.revealSelection) SDUI.revealSelection(ui.sel); }

/* 快捷条：结构由当前界面实现产出（移动端=底部浮动条含步进器；桌面端=动作条），
   这里只负责「何时显示」与状态属性的维护。 */
function renderSelBar(){
  var bar = els.selbar || $('#selbar');
  if (!bar) return;
  var it = selGet();
  if (!it || ui.tab !== 'tplan'){
    bar.classList.remove('show');
    document.body.classList.remove('selbar-on');
    return;
  }
  var placing = !!(ui.placing && String(ui.sel) === String(ui.placing));
  if (bar.classList.contains('show') && bar.getAttribute('data-sel') === String(ui.sel)
      && bar.getAttribute('data-place') === (placing ? '1' : '')){
    if (window.SDUI) SDUI.refreshSelVals(bar, it);
    return;
  }
  bar.innerHTML = window.SDUI
    ? SDUI.selBarHTML({ kind: it.k, item: it.o, placing: placing, placingLabel: ui.placingLabel })
    : '';
  bar.setAttribute('data-sel', String(ui.sel));
  bar.setAttribute('data-place', placing ? '1' : '');
  bar.classList.add('show');
  document.body.classList.add('selbar-on');
}
function postSelUpdate(){
  /* 面板与快捷条一起刷新：此前只 syncInputs()（面板输入框），快捷条上的步进器
     数值要等下次重建才更新，点了「＋」数字不动（2026-09-15 一起修掉）。 */
  saveSoon(); renderChips(); schedule3D(); renderPlanNow(); syncInputs(); renderSelBar();
}
/* 选中状态变化后的统一收尾：选中框 → 快捷条 → 面板（双端各自的反应由 SDUI 决定）。 */
function afterSelect(){
  updateSelFrame();
  renderSelBar();
  if (window.SDUI && SDUI.onSelectionChange) SDUI.onSelectionChange();
  buildEditors();
}
function applyStep(btn){
  var it = selGet(); if (!it) return;
  var o = it.o, field = btn.getAttribute('data-bstep'), sign = +btn.getAttribute('data-bsign');
  if (field === 'x' || field === 'y'){
    var stp = ui.snap || 0.5;
    moveItem(ui.sel, o.x + (field === 'x' ? sign*stp : 0), o.y + (field === 'y' ? sign*stp : 0));
  }
  else if (field === 'len'){ o.len = Math.max(0.3, Math.round((o.len + sign*0.5)*10)/10); }
  else if (field === 'w'){ o.w = Math.max(0.5, Math.round((o.w + sign*0.5)*10)/10); }
  else if (field === 'h'){ o.h = Math.max(0.5, Math.round((o.h + sign*0.5)*10)/10); }
  else if (field === 's'){ o.s = Math.max(0.3, Math.round(((o.s || 1) + sign*0.1)*10)/10); }
  else if (field === 'steer'){ o.steer = E.clamp(Math.round(((o.steer == null ? 45 : o.steer) + sign*15)/5)*5, -60, 60); }
  postSelUpdate();
}
function bindSelBar(){
  var bar = $('#selbar');
  if (!bar) return;
  bar.addEventListener('click', function(e){
    var b = e.target.closest ? e.target.closest('button') : null;
    if (!b) return;
    if (b.hasAttribute('data-bstep')){ applyStep(b); return; }
    var act = b.getAttribute('data-bact');
    var it = selGet();
    if (act === 'placeDone'){ endPlacing(false); return; }
    if (act === 'close'){ ui.sel = null; endPlacing(true); afterSelect(); return; }
    if (!it) return;
    var id = String(ui.sel).split(':')[1];
    if (act === 'del'){
      if (it.k === 'sh') acts.delShelf({ id:id });
      else if (it.k === 'zn') acts.delZone({ id:id });
      else if (it.k === 'pl') acts.delPillar({ id:id });
      else if (it.k === 'mk') acts.delMarker({ id:id });
      else if (it.k === 'ms') acts.delMesh({ id:id });
      else if (it.k === 'en') acts.delEntrance({ id:id });
      else if (it.k === 'ct') acts.delCurtain({ id:id });
      else if (it.k === 'bk') acts.delBike({ id:id });
      ui.sel = null;
      afterSelect();
    } else if (act === 'rot'){
      if (it.k === 'bk'){ it.o.rot = ((it.o.rot == null ? 0 : it.o.rot) + 90) % 360; }
      else { it.o.orient = it.o.orient === 'h' ? 'v' : 'h'; }
      postSelUpdate();
    } else if (act === 'btype'){
      it.o.type = b.getAttribute('data-t');
      postSelUpdate();
    } else if (act === 'bpose'){
      it.o.pose = b.getAttribute('data-p');
      postSelUpdate();
    } else if (act === 'bsteer'){
      it.o.steer = +b.getAttribute('data-v') || 0;
      postSelUpdate();
    } else if (act === 'ang'){
      it.o.angle = +b.getAttribute('data-bang') || 0;
      postSelUpdate();
    } else if (act === 'fillb'){
      fillShelfBikes(id + ':' + b.getAttribute('data-bt'));
      renderSelBar();
    } else if (act === 'clearb'){
      var rc0 = E.shelfRect(it.o), pad0 = 0.9;
      cfg.bikes = (cfg.bikes || []).filter(function(b2){
        return !(b2.x > rc0.x - pad0 && b2.x < rc0.x + rc0.w + pad0 && b2.y > rc0.y - pad0 && b2.y < rc0.y + rc0.h + pad0);
      });
      postSelUpdate();
    } else if (act === 'kind'){
      it.o.kind = b.getAttribute('data-bk');
      if (it.o.kind === 'low' && (it.o.h == null || it.o.h > 1.2)) it.o.h = 0.9;
      if (it.o.kind !== 'low' && (it.o.h == null || it.o.h < 1.0)) it.o.h = 1.5;
      postSelUpdate();
    } else if (act === 'flush'){
      flushWallTo(id + ':' + b.getAttribute('data-side'));
    } else if (act === 'dup'){
      if (it.k === 'bk'){
        var nb = JSON.parse(JSON.stringify(it.o));
        nb.id = nid();
        nb.x = Math.round(E.clamp(nb.x + 1.0, 0.3, cfg.space.w - 0.3) * 10) / 10;
        cfg.bikes.push(nb);
        ui.sel = 'bk:' + nb.id;
        postSelUpdate(); renderSelBar();
        toast('已复制 ' + (nb.type === 'kids' ? '童车' : '成人车'));
      } else {
        acts.dupShelf({ id:id });
      }
    } else if (act === 'addA' || act === 'addK'){
      var typ0 = (act === 'addK') ? 'kids' : 'adult';
      var nb2 = { id: nid(), type: typ0, pose: (it.o.pose === 'top') ? 'top' : 'stand',
                 x: Math.round(E.clamp(it.o.x + 1.0, 0.3, cfg.space.w - 0.3) * 10) / 10, y: it.o.y,
                 rot: (it.o.rot != null ? it.o.rot : 90), steer: 45 };
      cfg.bikes = cfg.bikes || [];
      cfg.bikes.push(nb2);
      ui.sel = 'bk:' + nb2.id;
      postSelUpdate(); renderSelBar();
      toast('已新增' + (typ0 === 'kids' ? '童车(1.5m)' : '成人车(2m)') + '，拖动可放到想要的位置');
    } else if (act === 'more'){
      scrollToSection();
    }
  });
  bar.addEventListener('input', function(e){
    if (!e.target.classList || !e.target.classList.contains('selname')) return;
    var it = selGet(); if (!it) return;
    it.o.name = e.target.value;
    saveSoon(); renderChips(); schedule3D(); renderPlanNow();
  });
}

/* ---------------- 添加组件（悬浮＋按钮 + 底部面板） ---------------- */
var ADD_LIST = [
  ['货架', null],
  ['shelfD','双面货架','🟨'], ['shelfS','单面货架','🟦'], ['shelfL','矮货架','🟪'],
  ['自行车', null],
  ['bikeA','成人车 2m','🚲'], ['bikeK','童车 1.5m','🚲'],
  ['其他', null],
  ['pillar','柱子','⬛'], ['curtain','门帘','🚪'], ['marker','标记点','🔴'],
  ['mesh','网面墙','🕸️'], ['zone','区域','🟩'], ['entrance','出入口净空','🟧']
];
function addLabel(kind){
  for (var i=0;i<ADD_LIST.length;i++){ if (ADD_LIST[i][0] === kind) return ADD_LIST[i][1]; }
  return '组件';
}
function openSheet(open){
  var sh = $('#addsheet'), mask = $('#addmask');
  if (!sh || !mask) return;
  if (open && ui.placing) endPlacing(true);
  sh.classList.toggle('show', !!open);
  mask.classList.toggle('show', !!open);
}
function buildSheet(){
  var g = $('#sheetgrid'); if (!g) return;
  var h = '';
  ADD_LIST.forEach(function(it){
    if (!it[1]){ h += '<div class="sheetsec">' + it[0] + '</div>'; return; }
    h += '<button data-add="' + it[0] + '"><span class="ic">' + it[2] + '</span>' + it[1] + '</button>';
  });
  g.innerHTML = h;
}
function occupiedRects(){
  var arr = [];
  cfg.shelves.forEach(function(s){ arr.push(E.shelfRect(s)); });
  cfg.zones.forEach(function(z){ arr.push({ x:z.x, y:z.y, w:z.w, h:z.h }); });
  if (cfg.studio) arr.push({ x:cfg.studio.x, y:cfg.studio.y, w:cfg.studio.w, h:cfg.studio.h });
  cfg.pillars.forEach(function(p){ arr.push(E.pillarRect(p)); });
  (cfg.entrances || []).forEach(function(e){ arr.push({ x:e.x, y:e.y, w:e.w, h:e.h }); });
  (cfg.meshes || []).forEach(function(m){ arr.push(m.orient === 'v' ? { x:m.x-0.1, y:m.y, w:0.2, h:m.len } : { x:m.x, y:m.y-0.1, w:m.len, h:0.2 }); });
  (cfg.curtains || []).forEach(function(c){ arr.push(c.orient === 'v' ? { x:c.x-0.15, y:c.y, w:0.3, h:c.len } : { x:c.x, y:c.y-0.15, w:c.len, h:0.3 }); });
  (cfg.bikes || []).forEach(function(b){ arr.push({ x:b.x-0.6, y:b.y-0.6, w:1.2, h:1.2 }); });
  return arr;
}
function findFreeSpot(w, h, prefer){
  var W = cfg.space.w, D = cfg.space.d, m = 0.4, pad = 0.2;
  var occ = occupiedRects();
  var pxc = prefer ? prefer.x : W/2, pyc = prefer ? prefer.y : D/2;
  var best = null, bestD = 1e9;
  for (var y = m; y + h <= D - m + 1e-6; y += 0.5){
    for (var x = m; x + w <= W - m + 1e-6; x += 0.5){
      var ok = true;
      for (var i=0;i<occ.length;i++){
        var o = occ[i];
        if (x < o.x + o.w + pad && x + w > o.x - pad && y < o.y + o.h + pad && y + h > o.y - pad){ ok = false; break; }
      }
      if (!ok) continue;
      var cx = x + w/2 - pxc, cy = y + h/2 - pyc, dd = cx*cx + cy*cy;
      if (dd < bestD){ bestD = dd; best = { x: Math.round(x*2)/2, y: Math.round(y*2)/2 }; }
    }
  }
  if (best) return best;
  var jx = (Math.random()*2 - 1)*1.5, jy = (Math.random()*2 - 1)*1.5;
  var bx2 = pxc - w/2, by2 = pyc - h/2;
  return { x: Math.max(0, Math.min(W - w, Math.round((bx2 + jx)*2)/2)), y: Math.max(0, Math.min(D - h, Math.round((by2 + jy)*2)/2)) };
}
function visibleCenter(){
  var z = currentPlanZ(), pad = 1.4;
  var rect = els.planScroll.getBoundingClientRect();
  var sx = els.planScroll.scrollLeft + Math.max(40, rect.width/2);
  var sy = els.planScroll.scrollTop + Math.max(40, rect.height/2);
  return { x: sx / z - pad, y: sy / z - pad };
}
function addComponent(kind){
  var id = nid(), selId = null, sp, s, b, p;
  var pref = visibleCenter();
  if (kind === 'shelfD' || kind === 'shelfS' || kind === 'shelfL'){
    var kk = kind === 'shelfD' ? 'double' : (kind === 'shelfS' ? 'single' : 'low');
    var len0 = 4, dep = E.shelfDepth({ kind:kk });
    sp = findFreeSpot(len0, dep, pref);
    s = { id:id, name:'', kind:kk, orient:'h', x:sp.x, y:sp.y, len:len0, h: kk === 'low' ? 0.9 : 1.5 };
    cfg.shelves.push(s); selId = 'sh:' + id;
  } else if (kind === 'bikeA' || kind === 'bikeK'){
    var typ = kind === 'bikeK' ? 'kids' : 'adult';
    var blen = typ === 'kids' ? 1.5 : 2.0;
    sp = findFreeSpot(blen, 1.0, pref);
    b = { id:id, type:typ, pose:'stand', x: Math.round((sp.x + blen/2)*100)/100, y: sp.y + 0.5, rot:90, steer:45 };
    cfg.bikes = cfg.bikes || []; cfg.bikes.push(b); selId = 'bk:' + id;
  } else if (kind === 'pillar'){
    sp = findFreeSpot(1.0, 1.0, pref);
    cfg.pillars.push({ id:id, x: sp.x + 0.5, y: sp.y + 0.5, s:1.0 }); selId = 'pl:' + id;
  } else if (kind === 'marker'){
    sp = findFreeSpot(0.6, 0.6, pref);
    cfg.markers.push({ id:id, color:'red', x: sp.x, y: sp.y, w:0.5, h:0.5, label:'' }); selId = 'mk:' + id;
  } else if (kind === 'curtain'){
    sp = findFreeSpot(3, 0.3, pref);
    cfg.curtains = cfg.curtains || [];
    cfg.curtains.push({ id:id, orient:'h', x: sp.x, y: sp.y + 0.15, len:3, h:1.9 }); selId = 'ct:' + id;
  } else if (kind === 'mesh'){
    sp = findFreeSpot(3, 0.2, pref);
    cfg.meshes = cfg.meshes || [];
    cfg.meshes.push({ id:id, orient:'h', x: sp.x, y: sp.y + 0.1, len:3, h:2.0 }); selId = 'ms:' + id;
  } else if (kind === 'zone'){
    sp = findFreeSpot(4, 3, pref);
    cfg.zones.push({ id:id, kind:'passage', x: sp.x, y: sp.y, w:4, h:3, label:'新区域', fence:null }); selId = 'zn:' + id;
  } else if (kind === 'entrance'){
    sp = findFreeSpot(2, 2, pref);
    cfg.entrances = cfg.entrances || [];
    cfg.entrances.push({ id:id, name:'新出入口', x: sp.x, y: sp.y, w:2, h:2 }); selId = 'en:' + id;
  }
  if (!selId){ toast('未知组件'); return; }
  ui.sel = selId;
  if (ui.tab !== 'tplan') setTab('tplan');
  afterStruct(); syncInputs();
  startPlacing(selId, addLabel(kind));
  renderSelBar();
  toast('已添加「' + addLabel(kind) + '」：拖动屏幕任意位置摆放，点「完成」结束');
}

/* ---------------- 导出 / 导入 ---------------- */
function dl(blob, name){
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); if (a.parentNode) a.parentNode.removeChild(a); }, 500);
}
function exportSvg(){
  var svg = E.render3D(cfg, { az: view.az, el: view.el, zoom: 1, vw: 2400, vh: 1500 });
  dl(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), '门店布局_3D视角.svg');
}
function exportJson(){
  dl(new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json;charset=utf-8' }), '门店布局_配置.json');
}
function importJson(e){
  var f = e.target.files && e.target.files[0]; if (!f) return;
  var rd = new FileReader();
  rd.onload = function(){
    try {
      var obj = JSON.parse(rd.result);
      cfg = E.deepMerge(E.defaultConfig(), obj);
      afterStruct(); syncInputs();
    } catch(err0){ alert('配置文件解析失败：' + err0.message); }
  };
  rd.readAsText(f);
  e.target.value = '';
}

/* ---------------- 全局绑定 ---------------- */
function setTab(tab){
  ui.tab = tab;
  $all('nav.tabs button').forEach(function(b){ b.classList.toggle('on', b.getAttribute('data-tab') === tab); });
  var t3 = $('#tab3d'), tp = $('#tabplan');
  if (t3) t3.style.display = (tab === 't3d') ? '' : 'none';
  if (tp) tp.style.display = (tab === 'tplan') ? '' : 'none';
  if (tab === 'tplan') renderPlanNow();
  if (tab === 't3d'){ endPlacing(true); setTimeout(render3DNow, 30); }
  renderSelBar();
}
function bindGlobal(){
  $all('nav.tabs button').forEach(function(b){
    b.addEventListener('click', function(){ setTab(b.getAttribute('data-tab')); });
  });
  var azS = $('#az'), elS = $('#el'), zmS = $('#zm');
  azS.addEventListener('input', function(){ view.az = +azS.value; syncViewUI(); schedule3D(); saveSoon(); });
  elS.addEventListener('input', function(){ view.el = +elS.value; syncViewUI(); schedule3D(); saveSoon(); });
  zmS.addEventListener('input', function(){ view.zoom = (+zmS.value)/100; syncViewUI(); schedule3D(); saveSoon(); });
  $('#rotL').addEventListener('click', function(){ view.az = (view.az - 45 + 360) % 360; syncViewUI(); schedule3D(); });
  $('#rotR').addEventListener('click', function(){ view.az = (view.az + 45) % 360; syncViewUI(); schedule3D(); });
  $('#vTop').addEventListener('click', function(){ view.el = 85; syncViewUI(); schedule3D(); });
  $('#vIso').addEventListener('click', function(){ view.el = 33; syncViewUI(); schedule3D(); });
  $('#vReset').addEventListener('click', function(){ view.az = 90; view.el = 33; view.zoom = 1; syncViewUI(); schedule3D(); saveSoon(); });
  var spinTimer = null;
  $('#spin').addEventListener('click', function(){
    view.spin = !view.spin;
    this.classList.toggle('primary', view.spin);
    if (view.spin){
      spinTimer = setInterval(function(){ view.az = (view.az + 1.2) % 360; syncViewUI(); schedule3D(); }, 40);
    } else if (spinTimer){ clearInterval(spinTimer); spinTimer = null; }
  });
  $('#pzIn').addEventListener('click', function(){ ui.planZ = E.clamp(currentPlanZ() * 1.3, 8, 120); renderPlanNow(); });
  $('#pzOut').addEventListener('click', function(){ ui.planZ = E.clamp(currentPlanZ() / 1.3, 8, 120); renderPlanNow(); });
  $('#pzFit').addEventListener('click', function(){ ui.planZ = null; renderPlanNow(); });
  $('#pgrid').addEventListener('change', function(){ ui.grid = this.checked; renderPlanNow(); });
  $('#snap').addEventListener('change', function(){ ui.snap = parseFloat(this.value) || 0.5; });
  $('#btnExportSvg').addEventListener('click', exportSvg);
  $('#btnExportJson').addEventListener('click', exportJson);
  $('#btnImportJson').addEventListener('click', function(){ $('#fileImport').click(); });
  $('#fileImport').addEventListener('change', importJson);
  $('#btnReset').addEventListener('click', function(){
    if (!confirm('恢复默认布置？当前修改将丢失。')) return;
    cfg = E.defaultConfig();
    ui.sel = null;
    afterStruct();
    syncInputs();
  });
  buildSheet();
  var fab = $('#fab');
  if (fab) fab.addEventListener('click', function(){ openSheet(!$('#addsheet').classList.contains('show')); });
  var mask = $('#addmask');
  if (mask) mask.addEventListener('click', function(){ openSheet(false); });
  var sClose = $('#sheetClose');
  if (sClose) sClose.addEventListener('click', function(){ openSheet(false); });
  var sg = $('#sheetgrid');
  if (sg) sg.addEventListener('click', function(e){
    var b = e.target.closest ? e.target.closest('button[data-add]') : null;
    if (!b) return;
    openSheet(false);
    addComponent(b.getAttribute('data-add'));
  });
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape'){ openSheet(false); endPlacing(true); } });
  var bR = $('#btnRandom');
  if (bR) bR.addEventListener('click', doRandom);
  els.editors.addEventListener('input', onEditInput);
  els.editors.addEventListener('change', onEditInput);
  els.editors.addEventListener('click', onEditClick);
  bindSelBar();
  bindPlan();
  bindGestures();
}

/* ---------------- 启动 ---------------- */
function applyQuery(){
  try {
    var q = new URLSearchParams(location.search);
    if (q.get('tab') === 'plan') setTab('tplan');
    if (q.get('az') != null && q.get('az') !== '') view.az = parseFloat(q.get('az')) || view.az;
    if (q.get('el') != null && q.get('el') !== '') view.el = parseFloat(q.get('el')) || view.el;
    if (q.get('zoom') != null && q.get('zoom') !== '') view.zoom = parseFloat(q.get('zoom')) || view.zoom;
    if (q.get('sel') != null && q.get('sel') !== '') ui.sel = q.get('sel');
  } catch(eq){}
}
/* 隐藏自检钩子：URL 加 ?selftest=1 时自动点按按钮并输出结果（供无头浏览器回归测试） */
function runSelfTest(){
  try {
    var q = new URLSearchParams(location.search);
    if (q.get('selftest') !== '1') return;
    setTimeout(function(){
      var log = [];
      function bikes(){ return document.querySelectorAll('[data-id^="bk:"]').length; }
      try {
        log.push('initial=' + bikes());
        var g = document.querySelector('[data-id^="bk:"]');
        if (g){
          var r = g.getBoundingClientRect();
          g.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true, clientX:r.x+8, clientY:r.y+8, pointerId:1}));
          window.dispatchEvent(new PointerEvent('pointerup', {bubbles:true, pointerId:1}));
          log.push('selbarShown=' + $('#selbar').classList.contains('show'));
          var dup = $('[data-bact="dup"]');
          if (dup){ dup.dispatchEvent(new MouseEvent('click', {bubbles:true})); log.push('afterDup=' + bikes()); }
          else log.push('NO-DUP');
          var addA = $('[data-bact="addA"]');
          if (addA){ addA.dispatchEvent(new MouseEvent('click', {bubbles:true})); log.push('afterAddA=' + bikes()); }
          else log.push('NO-ADDA');
          var addK = $('[data-bact="addK"]');
          if (addK){ addK.dispatchEvent(new MouseEvent('click', {bubbles:true})); log.push('afterAddK=' + bikes()); }
          else log.push('NO-ADDK');
          log.push('selAfter=' + $('#selbar').getAttribute('data-sel'));
          var fab = $('#fab');
          if (fab){
            var nSh0 = document.querySelectorAll('[data-id^="sh:"]').length;
            fab.click();
            log.push('sheetOpen=' + $('#addsheet').classList.contains('show'));
            var bs = $('#addsheet [data-add="shelfD"]');
            if (bs){ bs.click(); log.push('shelf ' + nSh0 + '->' + document.querySelectorAll('[data-id^="sh:"]').length); }
            var nb = $('#addsheet [data-add="bikeK"]');
            if (nb){ nb.click(); log.push('addKidBike=' + bikes()); }
            log.push('newSel=' + $('#selbar').getAttribute('data-sel'));
          }
          /* --- 拖拽测试1：自行车拖动后 transform 必须叠乘（不飞走）--- */
          var bg = document.querySelector('[data-id^="bk:"]');
          if (bg){
            var br = bg.getBoundingClientRect();
            bg.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true, clientX:br.x+5, clientY:br.y+5, pointerId:11, button:0}));
            var bg1 = document.querySelector('[data-id^="bk:"]');
            log.push('bikeNodeStable=' + (bg1 === bg));
            window.dispatchEvent(new PointerEvent('pointermove', {bubbles:true, clientX:br.x+45, clientY:br.y+8, pointerId:11}));
            var bg2 = document.querySelector('[data-id^="bk:"]');
            var t2 = bg2 ? (bg2.getAttribute('transform') || '') : '';
            log.push('bikeDragTransform=' + (/[)] translate[(]/.test(t2) ? 'composed-ok' : 'CHECK:' + t2.slice(0,60)));
            window.dispatchEvent(new PointerEvent('pointerup', {bubbles:true, clientX:br.x+45, clientY:br.y+8, pointerId:11}));
          }
          /* --- 拖拽测试3：货架（首触选中场景，此前 bug 重灾区）--- */
          var sg0 = document.querySelector('[data-id^="sh:"]');
          if (sg0){
            var sr = sg0.getBoundingClientRect();
            sg0.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true, clientX:sr.x+20, clientY:sr.y+8, pointerId:13, button:0}));
            var sg1 = document.querySelector('[data-id^="sh:"]');
            log.push('shelfNodeStable=' + (sg1 === sg0));
            window.dispatchEvent(new PointerEvent('pointermove', {bubbles:true, clientX:sr.x+70, clientY:sr.y+30, pointerId:13}));
            var sg2 = document.querySelector('[data-id^="sh:"]');
            var t3 = sg2 ? (sg2.getAttribute('transform') || '') : '';
            log.push('shelfDragTransform=' + (t3.indexOf('translate') >= 0 ? 'moved-ok' : 'CHECK:' + t3.slice(0,40)));
            var fr = document.querySelector('#selframe');
            log.push('frameFollows=' + (fr && !fr.hasAttribute('display') ? E.r2 ? 'ok' : 'ok' : 'HIDDEN'));
            window.dispatchEvent(new PointerEvent('pointerup', {bubbles:true, clientX:sr.x+70, clientY:sr.y+30, pointerId:13}));
          }
          /* --- 拖拽测试2：摆放模式（加组件后拖动屏幕摆放）--- */
          $('#fab').click();
          var bS = $('#addsheet [data-add="shelfS"]');
          if (bS) bS.click();
          log.push('placingActive=' + !!$('[data-bact="placeDone"]'));
          var scl = $('#planScroll');
          var pr = scl.getBoundingClientRect();
          var shs = document.querySelectorAll('[data-id^="sh:"]');
          var lastS = shs[shs.length-1];
          var x0 = lastS ? lastS.querySelector('rect').getAttribute('x') : null;
          scl.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true, clientX:pr.x+60, clientY:pr.y+60, pointerId:12, button:0}));
          window.dispatchEvent(new PointerEvent('pointermove', {bubbles:true, clientX:pr.x+130, clientY:pr.y+100, pointerId:12}));
          window.dispatchEvent(new PointerEvent('pointerup', {bubbles:true, clientX:pr.x+130, clientY:pr.y+100, pointerId:12}));
          var shs2 = document.querySelectorAll('[data-id^="sh:"]');
          var lastS2 = shs2[shs2.length-1];
          var x1 = lastS2 ? lastS2.querySelector('rect').getAttribute('x') : null;
          log.push('placeDrag=' + (x0 !== x1 ? 'moved(' + x0 + '->' + x1 + ')' : 'NOT-MOVED'));
          var dn = $('[data-bact="placeDone"]');
          if (dn) dn.click();
          log.push('placingEnded=' + !$('[data-bact="placeDone"]'));
          log.push('errlog=' + JSON.stringify(($('#errlog').textContent || '').slice(0,80)));
        } else { log.push('NO-BIKE-ELEM'); }
      } catch(e){ log.push('THREW: ' + (e && e.message)); }
      var pre = document.createElement('pre');
      pre.id = 'selftest';
      pre.textContent = log.join(' | ');
      document.body.appendChild(pre);
    }, 30);
  } catch(e0){}
}

function init(){
  /* 界面骨架由当前视口的实现渲染（sd-ui-mobile.js / sd-ui-desktop.js）；
     它同时提供 app.js 需要的全部挂载点。 */
  var root = document.getElementById('sdApp');
  if (!window.SDUI){ err('界面实现未加载：sd-ui-*.js 缺失（视口 ' + window.innerWidth + 'px）'); return; }
  var slots = SDUI.mount(root) || {};
  els.view3d = slots.view3d || $('#view3d');
  els.viewplan = slots.viewplan || $('#viewplan');
  els.chips = slots.chips || $('#chips');
  els.editors = slots.editors || $('#editors');
  els.selbar = slots.selbar || $('#selbar');
  els.planScroll = slots.planScroll || $('#planScroll');
  buildEditors();
  bindGlobal();
  applyQuery();
  syncViewUI();
  renderChips();
  render3DNow();
  renderPlanNow();
  if (restoredFrom) toast('✓ 已恢复你之前保存的布局（来源 ' + restoredFrom.replace('store3d.cfg.','') + '）。如不理想，可在「历史版本恢复」中切换其他备份。');
  runSelfTest();
  window.addEventListener('resize', function(){
    setTimeout(function(){ render3DNow(); renderPlanNow(); }, 80);
  });
}
var booted = false;
function boot(){
  if (booted) return;
  booted = true;
  try {
    init();
    document.documentElement.setAttribute('data-sd-ready', 'true');
  } catch(e9){
    err('初始化失败：' + (e9 && e9.message ? e9.message : e9) + '\n' + (e9 && e9.stack ? e9.stack : ''));
    document.documentElement.setAttribute('data-sd-ready', 'true');
  }
}
if (window.SDUI) boot();
else {
  window.addEventListener('sd-ui-ready', boot, { once: true });
  /* 兜底：界面实现加载失败时也要把页面放出来，并把错误显示在 #errlog，
     绝不能让页面停在加载态（看不见任何东西是最糟的失败模式）。 */
  window.setTimeout(function(){
    if (!booted){ document.documentElement.setAttribute('data-sd-ready', 'true'); err('界面实现加载超时（sd-ui-*.js 未就绪）'); }
  }, 2500);
}
})();
