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
var ui = { tab: 't3d', sel: null, planZ: null, grid: true, snap: 0.5,
           frontShelf: null, frontRow: null, frontHookGroup: null, frontScale: null, frontFace: {} };

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
      /* 云端图纸：本机存档落盘后同步一次「有没有未保存的改动」 */
      if (window.SDCloud) window.SDCloud.markDirty();
      /* 实时协作：把本地改动同步进协作房间（断线时只写本地 Y.Doc，重连后补发） */
      if (window.SDCollab) window.SDCollab.afterLocalChange();
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
/* 平面视图缩放（2026-09-15 用户报告「平面编辑无法缩放」）：
   根因是 CSS 把 #viewplan svg 也强制成 width:100%，改 z 只改内部坐标、外观不变。
   修掉样式之后，这里补齐建模软件该有的缩放交互：
     · 滚轮 = 缩放（以指针为锚点，缩放后指针下的位置保持不动）；
     · 双指捏合 = 缩放；单指拖动 = 平移（浏览器原生滚动）；
     · 中键 / 空格 + 拖动 = 平移。 */
function planViewport(){ return els.planScroll; }
function zoomPlanAt(nextZ, clientX, clientY){
  var sc = planViewport();
  if (!sc) return;
  var prevZ = currentPlanZ();
  var z = E.clamp(nextZ, 8, 120);
  if (Math.abs(z - prevZ) < 0.01) return;
  var rect = sc.getBoundingClientRect();
  // 指针在内容坐标系里的位置（含 padding 与滚动偏移）
  var px = sc.scrollLeft + (clientX != null ? clientX - rect.left : rect.width / 2);
  var py = sc.scrollTop + (clientY != null ? clientY - rect.top : rect.height / 2);
  var ratio = z / prevZ;
  ui.planZ = z;
  renderPlanNow();
  sc.scrollLeft = px * ratio - (clientX != null ? clientX - rect.left : rect.width / 2);
  sc.scrollTop = py * ratio - (clientY != null ? clientY - rect.top : rect.height / 2);
}
function bindPlanZoom(){
  var sc = els.planScroll;
  if (!sc || sc.getAttribute('data-zoom-bound') === '1') return;
  sc.setAttribute('data-zoom-bound', '1');

  sc.addEventListener('wheel', function(e){
    if (e.ctrlKey || !e.shiftKey){
      // 滚轮 = 缩放（与 3D 视角一致；按住 Shift 仍是缩放，保持行为可预期）
      e.preventDefault();
      var factor = Math.pow(1.0016, -e.deltaY);
      zoomPlanAt(currentPlanZ() * factor, e.clientX, e.clientY);
    }
  }, { passive: false });

  // 双指捏合缩放 + 中键平移
  var pts = {}, pinch = null, pan = null;
  sc.addEventListener('pointerdown', function(e){
    pts[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(pts);
    if (ids.length === 2){
      var a = pts[ids[0]], b = pts[ids[1]];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: currentPlanZ() };
    } else if (e.button === 1){   // 中键拖动平移
      pan = { x: e.clientX, y: e.clientY, sl: sc.scrollLeft, st: sc.scrollTop };
      e.preventDefault();
    }
  });
  sc.addEventListener('pointermove', function(e){
    if (!pts[e.pointerId]) return;
    pts[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(pts);
    if (ids.length === 2 && pinch){
      var a = pts[ids[0]], b = pts[ids[1]];
      var d = Math.hypot(a.x - b.x, a.y - b.y);
      var cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      zoomPlanAt(pinch.z * d / (pinch.d || 1), cx, cy);
      pinch.d = d; pinch.z = currentPlanZ();
    } else if (pan){
      sc.scrollLeft = pan.sl - (e.clientX - pan.x);
      sc.scrollTop = pan.st - (e.clientY - pan.y);
    }
  });
  function endPlanPointer(e){
    delete pts[e.pointerId];
    if (Object.keys(pts).length < 2) pinch = null;
    if (e.button === 1) pan = null;
  }
  sc.addEventListener('pointerup', endPlanPointer);
  sc.addEventListener('pointercancel', endPlanPointer);
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
  '货架陈列：默认高 3.3m。托臂按排放置（短托臂 0.5m / 长托臂 1m，可分别放），每排高度、车型、起止范围都能单独调；地架每米 3 个；挂钩每个都能单独摆位置（正面视角里直接拖，左右 + 上下）。',
  '货架正面视角：选中货架后点「🧍 正面视角」（或切顶部「货架正面」页签）——在里面直接拖动托臂排调高度与位置，两端圆点调范围。',
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
function afterStruct(){ saveSoon(); buildEditors(); renderChips(); render3DNow(); renderPlanNow(); renderFrontNow(); }
/* 实时协作物化时用来保留当前选中：id 对应的对象还在才保留。 */
function selStillExists(id){
  if (!id) return false;
  try {
    if (String(id).slice(0, 3) === 'wl:') return true;
    return !!anchorOf(id);
  } catch(e){ return false; }
}
function addShelf(kind){
  var h = (kind === 'low') ? 0.9 : E.SHELF_H_DEFAULT;
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

/* 货架陈列附件（托臂 / 地架 / 挂钩）。
   托臂按「排」放置：短托臂（伸出 0.5m）与长托臂（伸出 1m）可分别放置，
   每排高度（z，车轮底离地）可调，也可用起止位置只占货架的一段（左右混排）。
   地架仍是单值开关（点击循环「无 → 成人 → 童车 → 无」）。
   挂钩（2026-09-17 用户要求「不要固定在顶端」）：每个挂钩有独立的沿架位置与离地高度，
   快捷条这里是「一键成排 / 一键清空」入口，之后在正面视角里逐个拖动。
   附件不落盘成独立元素：全部由货架配置（shelves[].acc）派生渲染，随货架自动跟随。 */
var ACC_CYCLE = { rack: ['none', 'adult', 'kids'] };
var ACC_LABEL = { none: '无', adult: '成人', kids: '童车' };
function accLabel(v){ return ACC_LABEL[v] || '无'; }
/* 地架：单值开关（点击循环「无 → 成人 → 童车 → 无」）。
   挂钩不走这里（2026-09-17 起是逐个个体的位置数组，见 addHooksRow / clearHooks）。 */
function cycleAcc(id, key){
  var s = shelfGet(id); if (!s) return;
  s.acc = s.acc || {};
  var seq = ACC_CYCLE[key] || ['none'];
  var cur = s.acc[key];
  var idx = seq.indexOf(cur); if (idx < 0) idx = 0;
  var next = seq[(idx + 1) % seq.length];
  var wasOn = (cur === 'adult' || cur === 'kids');
  s.acc[key] = next;
  /* 地架从「无」变有时：默认落到组件多的那一面（用户 2026-09-17 要求） */
  if (key === 'rack' && !wasOn && (next === 'adult' || next === 'kids')){
    var sideNow = s.acc.rackSide;
    if (!(sideNow === 'pos' || sideNow === 'neg' || sideNow === 'both')) s.acc.rackSide = faceForNewComponent(s);
  }
  afterStruct(); renderSelBar(true);
  var a = E.accOf(s);
  toast('地架：' + (a.rack === 'none' ? '已拆除' : ((a.rack === 'kids' ? '童车' : '成人车') + ' ×' + E.rackCount(s) + '（每米 3 个）'
    + (s.kind === 'double' && a.rackSide !== 'auto' && a.rackSide !== 'both' ? ' · ' + frontFaceName(s, a.rackSide) : ''))));
}
/* 托臂排：新增 / 删除 / 清空。排 id 依次 a1、a2…（用于稳定的派生元素 id） */
function nextArmRowId(rows){
  var max = 0;
  (rows || []).forEach(function(r){
    var m = /^a(\d+)$/.exec(r && r.id ? r.id : '');
    if (m) max = Math.max(max, +m[1]);
  });
  return 'a' + Math.max(1, max + 1);
}
function addArmRow(id, len){
  var s = shelfGet(id); if (!s) return;
  /* 新增的排挂到「当前正在看的那一面」；不在正面视角时默认落到**组件多的那一面**
     （2026-09-17 用户要求：不要在两面之间来回猜，跟着已有的组件走）。 */
  var faceWanted = faceForNewComponent(s);
  s.acc = s.acc || {};
  if (!Array.isArray(s.acc.armRows)) s.acc.armRows = [];
  var rows = s.acc.armRows;
  var isLong = (len === 'long');
  var shelfLen = (+s.len || 4);
  var size = isLong ? 'adult' : 'kids';
  /* 默认范围 = 这排车的实际占位（每台一个位宽），而不是整根货架：
     这样新加的排默认就是「可左右移动」的，不用先手动缩范围（2026-09-15）。 */
  var fit = Math.max(1, Math.floor(shelfLen / E.ARM_SLOT[size] + 1e-6));
  /* 层高避让只看「同一面」已有的排（两面各自排层） */
  var rowZ = null;
  if (faceWanted){
    var onFace = rows.filter(function(r){ return (r.face === faceWanted); });
    rowZ = E.nextArmZ(s, onFace);
  }
  var span = Math.min(shelfLen, Math.round(fit * E.ARM_SLOT[size] * 100) / 100);
  var row = { id: nextArmRowId(rows), z: (rowZ == null) ? E.nextArmZ(s, rows) : rowZ, len: isLong ? 'long' : 'short',
              size: size, u0: 0, u1: span, face: faceWanted };
  rows.push(row);
  afterStruct(); renderSelBar(true);
  var norm = E.accOf(s).rows[rows.length - 1];
  toast('已加' + (isLong ? '长托臂 1m（成人车）' : '短托臂 0.5m（16″ 童车）')
    + '（' + frontFaceName(s, faceWanted) + '）：'
    + norm.z + 'm 高 · ' + E.rowBikeCount(s, norm) + ' 台 · 占货架 ' + norm.u0 + '~' + norm.u1 + 'm'
    + (norm.u1 - norm.u0 < shelfLen - 0.05 ? '（可左右拖动）' : '（高度可在属性栏调）'));
}
function delArmRow(id, idx){
  var s = shelfGet(id); if (!s) return;
  var rows = (s.acc && Array.isArray(s.acc.armRows)) ? s.acc.armRows : null;
  if (!rows || !rows[idx]) return;
  var n = rows.splice(idx, 1).length;
  afterStruct(); renderSelBar(true);
  toast('已删除托臂排 ' + (idx + 1) + (n ? '' : ''));
}
/* 挂钩（2026-09-17 第二轮，用户口径：成组摆放、每米 4 个钩子）：
   一组 = 一段挂杆（沿架起点 u0 / 终点 u1 + 离地高度 z），组内钩子按每米 4 个均布。
   这里只管增删；位置在正面视角里整组拖动（bindFront），也可以在属性栏里改数值。 */
function hookGroupArr(s){
  s.acc = s.acc || {};
  if (!Array.isArray(s.acc.hookGroups)) s.acc.hookGroups = [];
  return s.acc.hookGroups;
}
function nextHookGroupId(groups){
  var max = 0;
  (groups || []).forEach(function(g){
    var m = /^g(\d+)$/.exec(g && g.id ? g.id : '');
    if (m) max = Math.max(max, +m[1]);
  });
  return 'g' + Math.max(1, max + 1);
}
/* 新增组件的默认落面（用户 2026-09-17 要求）：默认 = 「组件多的那一面」
   （正面视角没手动切过面时也是它 —— 看到的就是要放的那一面）；
   手动切过面、或在正面视角里时按「正在看的那一面」走。 */
function faceForNewComponent(s){
  if (!s) return 'pos';
  if (ui.tab === 'tfront') return frontFaceOf(s);
  return E.defaultAddFace(s, cfg);
}
/* 新增一整组挂钩：默认覆盖货架全长（每米 4 个），高度与已有组错开 */
function addHookGroup(s){
  if (!s){ toast('先选中一个货架'); return; }
  var arr = hookGroupArr(s);
  var faceWanted = faceForNewComponent(s);
  var SL = (+s.len > 0) ? +s.len : 4;
  var g = { id: nextHookGroupId(arr), u0: 0, u1: Math.round(SL * 100) / 100, z: E.nextHookZ(s, arr), face: faceWanted };
  arr.push(g);
  ui.sel = 'sh:' + s.id; ui.frontHookGroup = g.id;
  afterStruct(); renderSelBar(true); renderFrontNow();
  var norm = E.accOf(s).hookGroups[arr.length - 1];
  toast('已加挂钩组：' + E.hookGroupCount(s, norm) + ' 个（每米 4 个）· 离地 ' + norm.z + 'm · '
    + frontFaceName(s, faceWanted) + '（正面视角里可整组拖动）');
}
function delHookGroupById(spec){
  var parts = String(spec == null ? '' : spec).split(':');
  var s = shelfGet(parts[0]); if (!s) return;
  var arr = (s.acc && Array.isArray(s.acc.hookGroups)) ? s.acc.hookGroups : null;
  if (!arr) return;
  var idx = -1;
  for (var i = 0; i < arr.length; i++){ if (String(arr[i].id) === String(parts[1])){ idx = i; break; } }
  if (idx < 0) return;
  arr.splice(idx, 1);
  if (String(ui.frontHookGroup) === String(parts[1])) ui.frontHookGroup = null;
  afterStruct(); renderSelBar(true); renderFrontNow();
  toast('已删除挂钩组');
}
function clearHooks(s, msg){
  if (!s) return;
  var arr = (s.acc && Array.isArray(s.acc.hookGroups)) ? s.acc.hookGroups : null;
  if (!arr || !arr.length) return;
  var n = 0;
  E.accOf(s).hookGroups.forEach(function(g){ n += E.hookGroupCount(s, g); });
  s.acc.hookGroups = [];
  ui.frontHookGroup = null;
  afterStruct(); renderSelBar(true); renderFrontNow();
  toast(msg || ('已清空 ' + n + ' 个挂钩'));
}
function clearArms(id){
  var s = shelfGet(id); if (!s || !s.acc) return;
  s.acc.armRows = [];
  afterStruct(); renderSelBar(true);
  toast('已清空该货架的托臂');
}

/* 旋转货架（快捷条 +1 步 / 预设按钮共用）：保持「包围盒中心」不动，
   否则斜放或换向后货架会从原地跳走。 */
function shelfBoundsCenter(s){
  var b = E.shelfBounds(s);
  return { x: b.x + b.w/2, y: b.y + b.h/2, w: b.w, h: b.h };
}
function rotateShelfTo(s, orient, deg){
  var before = shelfBoundsCenter(s);
  s.orient = (orient === 'v') ? 'v' : 'h';
  s.rot = (((+deg || 0) % 360) + 360) % 360;
  var after = shelfBoundsCenter(s);
  s.x = E.clamp(s.x + (before.x - after.x), 0, Math.max(0, cfg.space.w - after.w));
  s.y = E.clamp(s.y + (before.y - after.y), 0, Math.max(0, cfg.space.d - after.h));
}
function rotateShelfBy(s, deg){
  rotateShelfTo(s, s.orient, (s.rot || 0) + deg);
}

var acts = {
  rand: function(){ doRandom(); },
  /* 货架摆放姿态预设：横（东西向）/ 竖（南北向）/ 四个斜 45°。id 形如 "<货架id>:h:45" */
  setPose: function(ds){
    var p = String(ds.id).split(':'), s = shelfGet(p[0]); if (!s) return;
    rotateShelfTo(s, p[1], +p[2]);
    afterStruct(); renderSelBar(true);
    var deg = ((+p[2] || 0) % 360 + 360) % 360;
    toast('货架已切换到「' + (p[1] === 'v' ? '竖放' : '横放') + (deg ? ' · 斜 ' + deg + '°' : '') + '」');
  },
  /* 左侧工具栏：点工具即就地添加并进入摆放模式（拖动屏幕定位）。 */
  add: function(ds){
    if (!ds || !ds.kind) return;
    addComponent(ds.kind);
  },
  /* 面板清单里点选元素（两个界面实现的「元素」页都用 data-act="pick"）。
     id 约定 '__clear__' = 取消选中。 */
  pick: function(ds){
    if (!ds || ds.id == null) return;
    if (String(ds.id) === '__clear__'){
      ui.sel = null;
      ui.frontRow = null;
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
    if (window.SDUI && SDUI.onSelectionChange) SDUI.onSelectionChange({ placing: !!ui.placing });
    buildEditors();
  },
  flushWall: function(ds){ flushWallTo(ds.id); },
  fillb: function(ds){ fillShelfBikes(ds.id); },
  openFront: function(ds){
    var id = (ds && ds.id != null) ? String(ds.id).split(':')[0] : null;
    if (!id && /^sh:/.test(String(ui.sel || ''))) id = String(ui.sel).slice(3);
    var s = id ? shelfGet(id) : null;
    if (!s){ toast('先选中一个货架'); return; }
    if (ui.placing) endPlacing(true);
    ui.frontShelf = s.id; ui.frontRow = null; ui.frontHookGroup = null;
    ui.sel = 'sh:' + s.id;
    if (ui.tab !== 'tfront') setTab('tfront'); else renderFrontNow();
    buildEditors();
    toast('正面视角：拖托臂排调高度 / 左右平移，两端圆点调范围');
  },
  accRack: function(ds){ cycleAcc(ds.id, 'rack'); },
  /* 挂钩（2026-09-17 第二轮：成组，每米 4 个）：一点加一整组（货架全长），
     默认落到组件多的那一面；位置在正面视角里整组拖动。 */
  accHook: function(ds){ addHookGroup(shelfGet(ds.id)); },
  addHook: function(ds){ addHookGroup(shelfGet(ds.id)); },
  delHookGroup: function(ds){ delHookGroupById(ds.id); },
  clearHooks: function(ds){ var s = shelfGet(ds.id); if (s) clearHooks(s, null); },
  addArm: function(ds){ var p = String(ds.id).split(':'); addArmRow(p[0], p[1]); },
  delArmRow: function(ds){ var p = String(ds.id).split(':'); delArmRow(p[0], +p[1]); },
  clearArms: function(ds){ clearArms(ds.id); },
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
  /* 外墙姿态（用户 2026-09-17：墙体也可以横放、竖放、旋转）。
     id 形如 "left:90" —— 绕墙段中心转到指定角度；0 = 沿边（竖放，左右边）/（横放，上下边）。 */
  setWallRot: function(ds){
    var p = String(ds.id).split(':'), side = p[0], e = cfg.walls[side];
    if (!e) return;
    var deg = ((+p[1] || 0) % 360 + 360) % 360;
    e.rot = deg;
    afterStruct(); renderSelBar(true);
    toast('外墙已切换到 ' + (deg === 0 ? '沿边（0°）' : deg + '°'));
  },
  rotWall: function(ds){
    var side = ds.id, e = cfg.walls[side]; if (!e) return;
    e.rot = ((E.wallRot(cfg, side) + 45) % 360);
    afterStruct(); renderSelBar(true);
    toast('外墙旋转 ' + e.rot + '°');
  },
  addOpen: function(ds){
    var key = ds.id, e = cfg.walls[key];
    /* 新开口落在「当前墙段」中间（墙缩短后不再把开口加在墙外） */
    var L = E.wallLength(cfg, key), w = Math.min(2.0, Math.max(0.5, L - 0.2));
    e.open = e.open || [];
    e.open.push({ at: Math.max(0, Math.round((L/2 - w/2)*10)/10), w: w, type: 'pass', label: '' });
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
  delMarker: function(ds){ cfg.markers = cfg.markers.filter(function(x){ return String(x.id) !== String(ds.id); }); afterStruct(); },
  /* 工作室组件（2026-09-17）：属性栏「＋洞洞板 / ＋工作台 …」与大纲删除共用 */
  addStudioItem: function(ds){ if (ds && ds.id) addComponent(ds.id); },
  delStudioItem: function(ds){ cfg.studioItems = (cfg.studioItems || []).filter(function(x){ return String(x.id) !== String(ds.id); }); afterStruct(); }
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
      if (v !== 'low' && (sx.h == null || sx.h < 1.0)) sx.h = E.SHELF_H_DEFAULT;
    }
  }
  if (/^studioItems\.\d+\.kind$/.test(p)){
    /* 切换组件类型：长度按新类型的范围夹回（洞洞板 0.6~2.4 / 工作台 1.0~2.4 …） */
    var siK = cfg.studioItems[+p.split('.')[1]];
    if (siK){
      var defK = E.studioItemDef(siK.kind);
      var wK = +siK.w || defK.w;
      siK.w = Math.min(defK.wMax, Math.max(defK.wMin, wK));
    }
  }
  ensureStructures(p);
  renderFrontNow();
  if (/^shelves\.\d+\.acc\./.test(p)){
    renderSelBar(true);
    /* 改托臂长度 / 车型 / 起止后，面板里的「托臂排 N」说明与台数要跟着重算（select 才重建，避免打字时丢焦点） */
    if (t.tagName === 'SELECT') buildEditors();
  }
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
  if (k === 'si'){ var siA = findBy(cfg.studioItems || [], key); return siA ? { x: siA.x, y: siA.y } : null; }
  if (k === 'en'){ var en = findBy(cfg.entrances || [], key); return en ? { x: en.x, y: en.y } : null; }
  if (k === 'ct'){ var ct = findBy(cfg.curtains || [], key); return ct ? { x: ct.x, y: ct.y } : null; }
  if (k === 'bk'){ var bkk = findBy(cfg.bikes || [], key); return bkk ? { x: bkk.x, y: bkk.y } : null; }
  if (k === 'wl'){ if (!cfg.walls[key]) return null; return E.wallPt(cfg, key, 0, 0); }
  if (k === 'iw'){ var wsA = findBy(cfg.wallSegs || [], key); if (!wsA) return null;
    var thA = wsA.thick || 0.3, aA = Math.min(wsA.from, wsA.to);
    return (wsA.orient === 'v') ? { x: wsA.at - thA/2, y: aA } : { x: aA, y: wsA.at - thA/2 }; }
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
  if (k === 'si'){ var siS = findBy(cfg.studioItems || [], key); if (!siS) return null;
    var bSi = E.studioItemBounds(siS); return { w: bSi.w, h: bSi.h }; }
  if (k === 'en'){ var en = findBy(cfg.entrances || [], key); return en ? { w: en.w, h: en.h } : null; }
  if (k === 'ct'){ var ctt = findBy(cfg.curtains || [], key); return ctt ? ((ctt.orient === 'v') ? { w: 0.3, h: ctt.len } : { w: ctt.len, h: 0.3 }) : null; }
  if (k === 'bk'){ return { w: 1.0, h: 1.0 }; }
  if (k === 'iw'){ var wsS = findBy(cfg.wallSegs || [], key); if (!wsS) return null;
    var thS = wsS.thick || 0.3, lenS = Math.abs((+wsS.to || 0) - (+wsS.from || 0));
    if (E.wallSegRot(wsS)){ var bS = E.boundsOfPts(E.wallSegCorners(wsS)); return { w: bS.w, h: bS.h }; }
    return (wsS.orient === 'v') ? { w: thS, h: lenS } : { w: lenS, h: thS }; }
  if (k === 'wl'){ var eS = cfg.walls[key]; if (!eS) return null;
    var bW = E.wallBounds(cfg, key); return { w: bW.w, h: bW.h }; }
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
  if (k === 'si'){
    /* 工作室组件同样是中心锚定（与柱子一致） */
    var siM = findBy(cfg.studioItems || [], key); if (!siM) return;
    siM.x = E.clamp(nx, sz.w/2, W - sz.w/2);
    siM.y = E.clamp(ny, sz.h/2, D - sz.h/2);
    return;
  }
  var cx = E.clamp(nx, 0, Math.max(0, W - sz.w));
  var cy = E.clamp(ny, 0, Math.max(0, D - sz.h));
  if (k === 'sh'){ var s = shelfGet(key); if (s){ s.x = cx; s.y = cy; } }
  else if (k === 'st'){
    /* 拖动工作室时组件跟随（否则工作室挪走后家具全留在原地） */
    var dxS = cx - cfg.studio.x, dyS = cy - cfg.studio.y;
    cfg.studio.x = cx; cfg.studio.y = cy;
    if (dxS || dyS){
      (cfg.studioItems || []).forEach(function(siF){
        siF.x = Math.round((siF.x + dxS) * 100) / 100;
        siF.y = Math.round((siF.y + dyS) * 100) / 100;
      });
    }
  }
  else if (k === 'zn'){ var z = findBy(cfg.zones, key); if (z){ z.x = cx; z.y = cy; } }
  else if (k === 'mk'){ var m = findBy(cfg.markers, key); if (m){ m.x = cx; m.y = cy; } }
  else if (k === 'ms'){ var ms = findBy(cfg.meshes, key); if (ms){ ms.x = cx; ms.y = cy; } }
  else if (k === 'en'){ var en = findBy(cfg.entrances || [], key); if (en){ en.x = cx; en.y = cy; } }
  else if (k === 'ct'){ var ct = findBy(cfg.curtains || [], key); if (ct){ ct.x = cx; ct.y = cy; } }
  else if (k === 'bk'){
    var bkk = findBy(cfg.bikes || [], key);
    if (bkk){ bkk.x = E.clamp(nx, 0.2, cfg.space.w - 0.2); bkk.y = E.clamp(ny, 0.2, cfg.space.d - 0.2); }
  }
  else if (k === 'iw'){ moveInnerWall(key, nx, ny); }
  else if (k === 'wl'){ moveOuterWall(key, nx, ny); }
}
/* 外墙整段平移（2026-09-17）：拖动的锚点 = 墙段起点。沿边方向改 from，
   垂直方向改 at（朝室内为正）。墙长不变，所以不再靠「打缺口」缩短墙。 */
function moveOuterWall(side, nx, ny){
  var e = cfg.walls[side]; if (!e) return;
  var g = E.wallGeom(cfg, side), L = E.wallLength(cfg, side);
  var ax = E.wallPt(cfg, side, 0, 0).x, ay = E.wallPt(cfg, side, 0, 0).y;
  var dx = nx - ax, dy = ny - ay;
  var du = dx * g.dx + dy * g.dy;
  var dv = dx * g.ix + dy * g.iy;
  var from0 = E.wallStart(cfg, side), at0 = E.wallOffset(cfg, side);
  var nFrom = E.clamp(Math.round((from0 + du) / 0.5) * 0.5, 0, Math.max(0, g.edgeLen - L));
  var nAt = E.clamp(Math.round((at0 + dv) / 0.5) * 0.5, -6, 6);
  if (nFrom === from0 && nAt === at0) return;
  e.from = nFrom; e.at = nAt;
  postSelUpdate();
}
/* 内隔墙整体平移：v 向 → at 跟 x 走、起止跟 y 走；h 向相反。起止一起平移，长度不变。 */
function moveInnerWall(id, nx, ny){
  var ws = findBy(cfg.wallSegs || [], id); if (!ws) return;
  var th = ws.thick || 0.3;
  var lo = Math.min(+ws.from || 0, +ws.to || 0), hi = Math.max(+ws.from || 0, +ws.to || 0);
  var span = hi - lo;
  if (ws.orient === 'v'){
    var nAt = E.clamp(nx + th/2, th/2, cfg.space.w - th/2);
    var nLo = E.clamp(ny, 0, Math.max(0, cfg.space.d - span));
    ws.at = nAt; ws.from = nLo; ws.to = nLo + span;
  } else {
    var nAt2 = E.clamp(ny + th/2, th/2, cfg.space.d - th/2);
    var nLo2 = E.clamp(nx, 0, Math.max(0, cfg.space.w - span));
    ws.at = nAt2; ws.from = nLo2; ws.to = nLo2 + span;
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
  if (k === 'si') return { x: E.clamp(nx, sz.w/2, W - sz.w/2), y: E.clamp(ny, sz.h/2, D - sz.h/2) };
  if (k === 'iw') return { x: E.clamp(nx, 0, Math.max(0, W - sz.w)), y: E.clamp(ny, 0, Math.max(0, D - sz.h)) };
  /* 外墙可以往室内外自由移动（横向偏移），不按包围盒夹在空间里 */
  if (k === 'wl') return { x: nx, y: ny };
  return { x: E.clamp(nx, 0, Math.max(0, W - sz.w)), y: E.clamp(ny, 0, Math.max(0, D - sz.h)) };
}
function isCenterAnchored(id){
  var k = String(id).split(':')[0];
  /* 外墙的锚点 = 墙段起点（角点），按中心锚定拖动才不会跳 */
  return k === 'pl' || k === 'bk' || k === 'wl' || k === 'si';
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
      /* 货架附件车（托臂 / 地架）是派生元素：点它等于选中所属货架，参数在货架面板上改 */
      if (id && id.slice(0, 4) === 'acc:') id = 'sh:' + id.split(':')[1];
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
      /* 实时协作：拖动中节流广播位置预览（对方能实时看到元素在动） */
      if (window.SDCollab) window.SDCollab.dragPreview(id, cur.x, cur.y);
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
        /* 实时协作：先告诉房间拖动结束，随后 saveSoon 的 diff 即正式提交 */
        if (window.SDCollab) window.SDCollab.dragEnd(id);
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
  else if (k === 'iw') o = findBy(cfg.wallSegs || [], id);
  else if (k === 'si') o = findBy(cfg.studioItems || [], id);
  else if (k === 'wl') o = cfg.walls[id] || null;
  if (!o) return null;
  return { k:k, id:ui.sel, o:o };
}
var SEC_OF = { sh:'shelves', st:'studio', si:'studioItems', zn:'zones', pl:'pillars', mk:'markers', ms:'meshes', en:'entrances', ct:'curtains', bk:'bikes', iw:'wallSegs', wl:'walls' };
/* 面板里的「全部参数」跳到当前选中项：具体跳到哪儿由界面实现决定
   （移动端切到「元素」页并滚动到选中卡片；桌面端切到右栏「元素」页）。 */
function scrollToSection(){ if (window.SDUI && SDUI.revealSelection) SDUI.revealSelection(ui.sel); }

/* 快捷条：结构由当前界面实现产出（移动端=底部浮动条含步进器；桌面端=动作条），
   这里只负责「何时显示」与状态属性的维护。 */
function renderSelBar(force){
  var bar = els.selbar || $('#selbar');
  if (!bar) return;
  var it = selGet();
  if (!it || ui.tab !== 'tplan'){
    bar.classList.remove('show');
    document.body.classList.remove('selbar-on');
    return;
  }
  var placing = !!(ui.placing && String(ui.sel) === String(ui.placing));
  /* 附件按钮的选中态 / 文字随点随变，切换时必须强制重建（force=true） */
  if (!force && bar.classList.contains('show') && bar.getAttribute('data-sel') === String(ui.sel)
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
  saveSoon(); renderChips(); schedule3D(); renderPlanNow(); renderFrontNow(); syncInputs(); renderSelBar();
}
/* 选中状态变化后的统一收尾：选中框 → 快捷条 → 面板（双端各自的反应由 SDUI 决定）。 */
function afterSelect(){
  updateSelFrame();
  renderSelBar();
  /* 选中货架时把「货架正面」视图也跟随过去（在平面/大纲里换货架，正面视图同步换） */
  if (/^sh:/.test(String(ui.sel || ''))){
    var fsNext = String(ui.sel).slice(3);
    if (String(ui.frontShelf) !== fsNext) ui.frontHookGroup = null;   /* 换货架：旧的挂钩组选中作废 */
    ui.frontShelf = fsNext;
  }
  renderFrontNow();
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
      else if (it.k === 'iw') acts.delSeg({ id:id });
      else if (it.k === 'si') acts.delStudioItem({ id:id });
      ui.sel = null;
      afterSelect();
    } else if (act === 'rot'){
      if (it.k === 'bk'){ it.o.rot = ((it.o.rot == null ? 0 : it.o.rot) + 90) % 360; }
      else if (it.k === 'sh'){ rotateShelfBy(it.o, 45); }
      else if (it.k === 'si'){ it.o.rot = (((+it.o.rot || 0) + 90) % 360); renderSelBar(true); }
      else { it.o.orient = it.o.orient === 'h' ? 'v' : 'h'; }
      postSelUpdate();
      /* 货架快捷条的「贴墙 / 转正」按钮随角度切换，必须强制重建（refreshSelVals 只刷数值） */
      if (it.k === 'sh') renderSelBar(true);
    } else if (act === 'rotWall'){
      acts.rotWall({ id: id });
    } else if (act === 'resetWallRot'){
      acts.setWallRot({ id: id + ':0' });
    } else if (act === 'rotIW'){
      /* 内隔墙旋转 +45°（用户 2026-09-17：墙体也可以横放 / 竖放 / 旋转） */
      var wsR = findBy(cfg.wallSegs || [], id);
      if (wsR){ wsR.rot = ((+wsR.rot || 0) + 45) % 360; postSelUpdate(); renderSelBar(true); }
    } else if (act === 'resetRotIW'){
      var wsR0 = findBy(cfg.wallSegs || [], id);
      if (wsR0){ wsR0.rot = 0; postSelUpdate(); renderSelBar(true); }
    } else if (act === 'resetRot'){
      /* 斜放货架的一键转正（快捷条「转正 0°」） */
      rotateShelfTo(it.o, it.o.orient, 0);
      postSelUpdate();
      renderSelBar(true);
    } else if (act === 'resetRotItem'){
      /* 工作室组件转正（快捷条「转正 0°」） */
      if (it.k === 'si'){ it.o.rot = 0; postSelUpdate(); renderSelBar(true); }
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
    } else if (act === 'openFront'){
      acts.openFront({ id: id });
    } else if (act === 'addOpen'){
      /* 外墙快捷条：给该边加一个开口（外墙 id 就是边名 top/bottom/left/right） */
      acts.addOpen({ id: id });
    } else if (act === 'accRack'){
      cycleAcc(id, 'rack');
    } else if (act === 'accHook'){
      acts.accHook({ id: id });
    } else if (act === 'addArm'){
      addArmRow(id, b.getAttribute('data-arm'));
    } else if (act === 'clearArms'){
      clearArms(id);
    } else if (act === 'clearb'){
      var rc0 = E.shelfRect(it.o), pad0 = 0.9;
      cfg.bikes = (cfg.bikes || []).filter(function(b2){
        return !(b2.x > rc0.x - pad0 && b2.x < rc0.x + rc0.w + pad0 && b2.y > rc0.y - pad0 && b2.y < rc0.y + rc0.h + pad0);
      });
      postSelUpdate();
    } else if (act === 'kind'){
      it.o.kind = b.getAttribute('data-bk');
      if (it.o.kind === 'low' && (it.o.h == null || it.o.h > 1.2)) it.o.h = 0.9;
      if (it.o.kind !== 'low' && (it.o.h == null || it.o.h < 1.0)) it.o.h = E.SHELF_H_DEFAULT;
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

/* ---------------- 添加组件（入口 = 左侧工具栏） ----------------
   旧版是右下角悬浮「＋」+ 底部弹出面板（ADD_LIST / buildSheet / openSheet 三个函数
   与它们的清单），现在整段删除：工具清单由数据层统一给（sd-schema.js 的 TOOL_GROUPS），
   左侧工具栏（移动端为左滑抽屉）点击 → acts.add → addComponent(kind) → 进入摆放模式。 */
var TOOL_LABELS = {
  shelfD:'双面货架', shelfS:'单面货架', shelfL:'矮货架',
  bikeA:'成人车', bikeK:'童车', marker:'标记点', curtain:'门帘',
  zone:'区域', entrance:'出入口净空', mesh:'网面墙', pillar:'柱子',
  stuPeg:'洞洞板', stuBench:'工作台', stuStand:'维修架', stuCab:'工具柜'
};
function addLabel(kind){ return TOOL_LABELS[kind] || '组件'; }
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
    s = { id:id, name:'', kind:kk, orient:'h', x:sp.x, y:sp.y, len:len0, h: kk === 'low' ? 0.9 : E.SHELF_H_DEFAULT };
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
  } else if (kind === 'stuPeg' || kind === 'stuBench' || kind === 'stuStand' || kind === 'stuCab'){
    /* 工作室组件（2026-09-17）：默认摆进工作室正中，随后拖动摆放 */
    var mapS = { stuPeg:'pegboard', stuBench:'bench', stuStand:'stand', stuCab:'cabinet' };
    var ik = mapS[kind];
    var defS = E.studioItemDef(ik);
    var stS = cfg.studio;
    cfg.studioItems = cfg.studioItems || [];
    cfg.studioItems.push({ id:id, kind:ik,
      x: Math.round((stS.x + stS.w/2) * 100) / 100,
      y: Math.round((stS.y + stS.h/2) * 100) / 100,
      rot:0, w:defS.w });
    selId = 'si:' + id;
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

/* ---------------- 货架正面（立面）视角 ----------------
   进入方式：选中货架 → 快捷条「正面视角」/ 元素清单「正面视角」/ 直接切「货架正面」页签。
   在这里可以拖动托臂排：上下 = 改高度、左右 = 整排平移，两端圆点 = 改起止范围。
   视图数据全在 SVG 的 data-* 上（scale/mx/my/len/h），交互层不需要额外状态。 */
/* 屏幕坐标 → 立面局部坐标（u 沿货架、z 离地），与平面视图的 toWorld 同一套 CTM 变换 */
/* 屏幕坐标 → 立面局部坐标（u 沿货架、z 离地）。
   注意：拖动过程中每一帧都会重建 SVG，旧元素随即脱离文档、getScreenCTM() 变成 null ——
   若继续拿它换算，得到的坐标是垃圾值（被 clamp 到边界），表现为「拖一下就跳到角落」。
   所以这里必须判空，由调用方传入当前还在文档里的 SVG（2026-09-15 修）。 */
function toFrontUZ(svgEl, cx, cy){
  var m = frontMeta(); if (!m) return null;
  if (!svgEl || !svgEl.isConnected || typeof svgEl.getScreenCTM !== 'function') return null;
  var ctm = svgEl.getScreenCTM();
  if (!ctm) return null;
  var pt = svgEl.createSVGPoint(); pt.x = cx; pt.y = cy;
  var q = pt.matrixTransform(ctm.inverse());
  return { u: (q.x - m.mx) / m.scale, z: (m.my - q.y) / m.scale };
}
/* 当前正在显示的正面视图 SVG（拖动中每帧都要重新取，不能用捕获的旧引用） */
function frontSvgLive(){
  return els.viewfront ? els.viewfront.querySelector('svg') : null;
}
function frontMeta(){
  var svg = els.viewfront ? els.viewfront.querySelector('svg') : null;
  if (!svg) return null;
  var sc = +svg.getAttribute('data-scale');
  if (!sc) return null;
  return { scale: sc, mx:+svg.getAttribute('data-mx'), my:+svg.getAttribute('data-my'),
           len:+svg.getAttribute('data-len'), h:+svg.getAttribute('data-h'), shelf: svg.getAttribute('data-shelf') };
}
function frontShelfOf(){
  var id = ui.frontShelf || (/^sh:/.test(String(ui.sel || '')) ? String(ui.sel).slice(3) : null);
  return id ? shelfGet(id) : null;
}
function frontRowGet(s, rowId){
  if (!s || !s.acc || !Array.isArray(s.acc.armRows)) return null;
  for (var i = 0; i < s.acc.armRows.length; i++){
    if (String(s.acc.armRows[i].id) === String(rowId)) return s.acc.armRows[i];
  }
  return null;
}
function frontHookGroupGet(s, groupId){
  if (!s || !s.acc || !Array.isArray(s.acc.hookGroups)) return null;
  for (var i = 0; i < s.acc.hookGroups.length; i++){
    if (String(s.acc.hookGroups[i].id) === String(groupId)) return s.acc.hookGroups[i];
  }
  return null;
}
/* 组内数值可能在未显式设置时走默认值：拖动前先落成显式值，避免「看不见的默认」被改坏 */
function materializeHookGroup(s, hg){
  var norm = E.accOf(s).hookGroups.filter(function(x){ return String(x.id) === String(hg.id); })[0];
  if (!norm) return hg;
  if (hg.u0 == null) hg.u0 = norm.u0;
  if (hg.u1 == null) hg.u1 = norm.u1;
  if (hg.z == null) hg.z = norm.z;
  if (hg.face !== 'pos' && hg.face !== 'neg' && hg.face !== 'auto') hg.face = norm.face;
  return hg;
}
/* 行内数值可能在未显式设置时走默认值：拖动前先落成显式值，避免「看不见的默认」被改坏 */
function materializeRow(s, r){
  var norm = E.accOf(s).rows.filter(function(x){ return String(x.id) === String(r.id); })[0];
  if (!norm) return r;
  if (r.z == null) r.z = norm.z;
  if (r.len !== 'short' && r.len !== 'long') r.len = norm.len;
  if (r.size !== 'adult' && r.size !== 'kids') r.size = norm.size;
  if (r.u0 == null) r.u0 = norm.u0;
  if (r.u1 == null) r.u1 = norm.u1;
  return r;
}
/* 当前正在看的面：优先用户手动切的面；没切过时看「组件多的那一面」
   （2026-09-17 用户要求：默认跟着组件走，打开正面视角就能看到自己摆的东西；
   两面都没组件时回退「朝空间更空的一侧」—— 与新增组件的默认落面同一套规则）。 */
function frontFaceOf(s){
  if (!s) return 'pos';
  var picked = ui.frontFace[s.id];
  if (picked === 'pos' || picked === 'neg') return picked;
  return E.defaultAddFace(s, cfg);
}
function frontFaceSet(id, face){
  if (face !== 'pos' && face !== 'neg') delete ui.frontFace[id];
  else ui.frontFace[id] = face;
  ui.frontHookGroup = null;     /* 换面后原来的挂钩组不在这一面，清掉选中 */
  renderFrontNow();
}
/* 把当前面的托臂排镜像到另一面（用户：「另一面没有办法添加组件」） */
function mirrorRowsToOtherFace(s){
  var acc = E.accOf(s);
  var here = frontFaceOf(s), there = (here === 'pos') ? 'neg' : 'pos';
  var mine = acc.rows.filter(function(r){ return E.rowFace(s, r, cfg) === here; });
  if (!mine.length){ toast(frontFaceName(s, here) + '还没有托臂排'); return; }
  s.acc = s.acc || {};
  if (!Array.isArray(s.acc.armRows)) s.acc.armRows = [];
  var maxN = 0;
  s.acc.armRows.forEach(function(r){
    var m = /^a(\d+)$/.exec(r && r.id ? r.id : '');
    if (m) maxN = Math.max(maxN, +m[1]);
  });
  mine.forEach(function(r){
    maxN += 1;
    s.acc.armRows.push({ id: 'a' + maxN, z: r.z, len: r.len, size: r.size, u0: r.u0, u1: r.u1, face: there });
  });
  afterStruct(); renderSelBar(true);
  toast('已把 ' + mine.length + ' 排托臂复制到' + frontFaceName(s, there));
}
function frontFaceName(s, face){
  var n = E.faceNames(s);
  return n[face] || face;
}
function renderFrontBar(){
  var bar = els.frontBar; if (!bar) return;
  var s = frontShelfOf();
  if (!s){
    bar.innerHTML = '<span class="sd-d-mini sd-m-mini">先选中一个货架，再进入正面视角</span>';
    return;
  }
  var acc = E.accOf(s), rows = acc.rows.length;
  var names = E.faceNames(s);
  var here = frontFaceOf(s), there = (here === 'pos') ? 'neg' : 'pos';
  /* 页签计数 = 该面「组件数」（托臂排 + 挂钩组 + 地架）——
     用户 2026-09-17 反馈「选哪一面很难用」，这里让两面各有多少组件一眼可见。 */
  var fCounts = E.faceCounts(s, cfg);
  var dbl = (s.kind === 'double');
  bar.innerHTML =
    (dbl
      ? '<span class="sd-d-mini sd-m-mini">挂载面</span>'
        + '<button data-frontface="pos"' + (here === 'pos' ? ' data-on="true"' : '') + '>' + names.pos + '（' + fCounts.pos + '）</button>'
        + '<button data-frontface="neg"' + (here === 'neg' ? ' data-on="true"' : '') + '>' + names.neg + '（' + fCounts.neg + '）</button>'
      : '')
    + '<button data-act="addArm" data-id="' + esc2(s.id) + ':short">＋短托臂 0.5m</button>'
    + '<button data-act="addArm" data-id="' + esc2(s.id) + ':long">＋长托臂 1m</button>'
    + (dbl && E.armRowsOnFace(s, cfg, here).length ? '<button data-frontmirror="1">镜像托臂到' + names[there] + '（' + E.armRowsOnFace(s, cfg, here).length + ' 排）</button>' : '')
    + (rows ? '<button data-act="clearArms" data-id="' + esc2(s.id) + '" data-tone="danger">清空托臂（' + rows + ' 排）</button>' : '')
    + '<button data-act="addHook" data-id="' + esc2(s.id) + '">＋挂钩（4 个/米）</button>'
    + (acc.hookGroups.length ? '<button data-act="clearHooks" data-id="' + esc2(s.id) + '" data-tone="danger">清空挂钩（' + acc.hookGroups.length + ' 组/' + E.hookCount(s) + ' 个）</button>' : '')
    + '<button data-frontzoom="out">－</button><button data-frontzoom="in">＋</button><button data-frontzoom="fit">适应</button>';
}
function renderFrontNow(){
  if (!els.viewfront) return;
  if (ui.tab !== 'tfront') return;
  var s = frontShelfOf();
  renderFrontBar();
  if (!s){
    els.viewfront.innerHTML = '<p class="sd-d-mini sd-m-mini">先在 3D / 平面里点选一个货架，再回到这里：可以拖动托臂排调高度与位置。</p>';
    return;
  }
  /* 容器内宽要先扣掉内边距（否则可视区比 SVG 窄几个像素，出现横向滚动条） */
  var vw = (els.frontScroll ? els.frontScroll.clientWidth : 900) - 18;
  var vh = els.frontScroll ? els.frontScroll.clientHeight - 12 : 0;
  var r = E.renderShelfFront(cfg, s.id, { vw: vw, vh: vh, scale: ui.frontScale || 0, selRow: ui.frontRow,
                                          selHookGroup: ui.frontHookGroup, face: frontFaceOf(s) });
  els.viewfront.innerHTML = r.svg;
  var fsvgEl = els.viewfront.querySelector('svg');
  if (fsvgEl){
    fsvgEl.setAttribute('data-face', r.meta.face || '');
    fsvgEl.setAttribute('data-rows', String(r.meta.rows || 0));
    fsvgEl.setAttribute('data-other-rows', String(r.meta.otherRows || 0));
    fsvgEl.setAttribute('data-hooks', String(r.meta.hooks || 0));
    fsvgEl.setAttribute('data-hookgroups', String(r.meta.hookGroups || 0));
  }
  if (r.meta && !ui.frontScale) ui.frontScale = r.meta.scale;
}
function frontZoom(kind){
  var s = frontShelfOf(); if (!s) return;
  var m = frontMeta();
  var cur = (ui.frontScale || (m ? m.scale : 60));
  if (kind === 'fit') ui.frontScale = null;
  else if (kind === 'in') ui.frontScale = Math.min(220, Math.round(cur * 1.25));
  else ui.frontScale = Math.max(10, Math.round(cur / 1.25));
  renderFrontNow();
}
/* 正面视角 · 拖动挂钩组（2026-09-17 第二轮：成组，每米 4 个钩子）：
   拖「杆」= 整组移动（左右 + 上下，0.05m 栅格）；拖两端圆点 = 调这一组的范围
   （每米 4 个，范围一改钩子数量跟着变）。松手落盘，点一下 = 选中。 */
function dragFrontHookGroup(e, sc, svgEl, m, s, el){
  var isHandle = el.hasAttribute && el.hasAttribute('data-hookhandle');
  var raw = isHandle ? String(el.getAttribute('data-hookhandle')) : String(el.getAttribute('data-hookgroup'));
  var parts = raw.split(':');
  var gid = parts[0];
  var end = isHandle ? (parts[1] === '0' ? 'u0' : 'u1') : null;
  var hg = frontHookGroupGet(s, gid); if (!hg) return;
  materializeHookGroup(s, hg);
  var start = { u0: +hg.u0, u1: +hg.u1, z: +hg.z };
  var pt = toFrontUZ(svgEl, e.clientX, e.clientY); if (!pt) return;
  var s0 = { u: pt.u, z: pt.z }, moved = false;
  var spanMin = Math.min(E.HOOK_MIN_SPAN, m.len);
  function grid05(v){ return Math.round(v / 0.05) * 0.05; }
  e.preventDefault();
  try { sc.setPointerCapture(e.pointerId); } catch(e1){}
  function blockTM(ev){ ev.preventDefault(); }
  sc.addEventListener('touchmove', blockTM, { passive:false });
  function move(ev){
    var p = toFrontUZ(frontSvgLive(), ev.clientX, ev.clientY); if (!p) return;
    var du = p.u - s0.u, dz = p.z - s0.z;
    if (!moved && Math.hypot(du, dz) * m.scale < 4) return;   /* 4px 死区：点选 vs 拖动 */
    moved = true;
    if (end === 'u0'){
      hg.u0 = r2c(E.clamp(grid05(start.u0 + du), 0, Math.max(0, start.u1 - spanMin)));
    } else if (end === 'u1'){
      hg.u1 = r2c(E.clamp(grid05(start.u1 + du), Math.min(m.len, start.u0 + spanMin), m.len));
    } else {
      var w = start.u1 - start.u0;
      var u0 = E.clamp(grid05(start.u0 + du), 0, Math.max(0, m.len - w));
      hg.u0 = r2c(u0);
      hg.u1 = r2c(Math.min(m.len, u0 + w));
      hg.z = r2c(E.clamp(grid05(start.z + dz), E.HOOK_Z_MIN, m.h + E.HOOK_Z_ABOVE));
    }
    renderFrontNow();
    if (window.SDUI && SDUI.refreshSelVals) renderSelBar(true);
  }
  function up(){
    sc.removeEventListener('touchmove', blockTM);
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    try { sc.releasePointerCapture(e.pointerId); } catch(e2){}
    ui.frontHookGroup = gid;
    ui.sel = 'sh:' + s.id;
    if (moved){
      saveSoon(); renderChips(); schedule3D(); renderPlanNow(); buildEditors();
      renderSelBar(); renderFrontNow();
      var norm = E.accOf(s).hookGroups.filter(function(x){ return String(x.id) === String(gid); })[0];
      var n = norm ? E.hookGroupCount(s, norm) : 0;
      toast('挂钩组：' + n + ' 个（每米 4 个）· 占货架 ' + hg.u0.toFixed(2) + '~' + hg.u1.toFixed(2) + 'm · 离地 ' + hg.z.toFixed(2) + 'm');
    } else {
      afterSelect();
    }
  }
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}
function r2c(v){ return Math.round(v * 100) / 100; }
function bindFront(){
  var sc = els.frontScroll;
  if (!sc || sc.getAttribute('data-bound') === '1') return;
  sc.setAttribute('data-bound', '1');
  /* 触摸：按在托臂排上时不滚动页面，交给拖拽 */
  sc.addEventListener('touchstart', function(ev){
    if (!ev.cancelable) return;
    if (ev.target && ev.target.closest && (ev.target.closest('[data-row]') || ev.target.closest('[data-rowhandle]')
        || ev.target.closest('[data-hookgroup]') || ev.target.closest('[data-hookhandle]'))) ev.preventDefault();
  }, { passive:false, capture:true });
  sc.addEventListener('pointerdown', function(e){
    if (e.button != null && e.button > 0) return;
    var svgEl = sc.querySelector('svg'); if (!svgEl) return;
    var m = frontMeta(); if (!m) return;
    var s = shelfGet(m.shelf); if (!s) return;
    var hEl = e.target && e.target.closest ? e.target.closest('[data-rowhandle]') : null;
    var rEl = e.target && e.target.closest ? e.target.closest('[data-row]') : null;
    var kEl = e.target && e.target.closest ? e.target.closest('[data-hookgroup]') : null;
    var kH = e.target && e.target.closest ? e.target.closest('[data-hookhandle]') : null;
    if (kH || kEl){ dragFrontHookGroup(e, sc, svgEl, m, s, kH || kEl); return; }
    if (!hEl && !rEl) return;
    var rowId, mode;
    if (hEl){
      var hp = String(hEl.getAttribute('data-rowhandle')).split(':');
      rowId = hp[0]; mode = (hp[1] === '0') ? 'left' : 'right';
    } else { rowId = rEl.getAttribute('data-row'); mode = 'move'; }
    var r = frontRowGet(s, rowId); if (!r) return;
    materializeRow(s, r);
    var start = { z: r.z, u0: r.u0, u1: r.u1 };
    var pt = toFrontUZ(svgEl, e.clientX, e.clientY); if (!pt) return;
    var s0 = { u: pt.u, z: pt.z }, moved = false, hinted = false;
    e.preventDefault();
    try { sc.setPointerCapture(e.pointerId); } catch(e1){}
    function blockTM(ev){ ev.preventDefault(); }
    sc.addEventListener('touchmove', blockTM, { passive:false });
    function move(ev){
      var p = toFrontUZ(frontSvgLive(), ev.clientX, ev.clientY); if (!p) return;
      var du = p.u - s0.u, dz = p.z - s0.z;
      if (!moved && Math.hypot(du, dz) * m.scale < 4) return;   /* 4px 死区：点选 vs 拖动 */
      moved = true;
      if (mode === 'move'){
        r.z = E.clamp(Math.round((start.z + dz) / 0.05) * 0.05, 0.2, Math.max(0.3, m.h - 0.85));
        var w = start.u1 - start.u0;
        var slack = Math.max(0, m.len - w);
        var u0 = E.clamp(Math.round((start.u0 + du) / 0.1) * 0.1, 0, slack);
        r.u0 = u0; r.u1 = Math.round((u0 + w) * 100) / 100;
        /* 已经占满货架长度的排没有可移动空间：横向意图明显时提示一次怎么腾出空间 */
        if (!hinted && slack < 0.05 && Math.abs(du) > 0.4){
          hinted = true;
          toast('这一排已经占满货架长度：拖两端圆点缩小范围后即可左右移动');
        }
      } else if (mode === 'left'){
        r.u0 = E.clamp(Math.round((start.u0 + du) / 0.1) * 0.1, 0, Math.max(0, start.u1 - 0.4));
      } else {
        r.u1 = E.clamp(Math.round((start.u1 + du) / 0.1) * 0.1, Math.min(m.len, start.u0 + 0.4), m.len);
      }
      r.z = Math.round(r.z * 100) / 100;
      renderFrontNow();
      if (window.SDUI && SDUI.refreshSelVals) renderSelBar(true);
    }
    function up(){
      sc.removeEventListener('touchmove', blockTM);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      try { sc.releasePointerCapture(e.pointerId); } catch(e2){}
      if (moved){
        /* 拖完这一排就把它设为「当前排」：立即画出两端手柄、属性栏同步到这一排，
           接着就能调起止范围（否则拖完还得再点一下才能拿到手柄）。 */
        ui.frontRow = rowId;
        ui.sel = 'sh:' + s.id;
        saveSoon(); renderChips(); schedule3D(); renderPlanNow(); buildEditors();
        renderSelBar();
        renderFrontNow();
      } else {
        ui.frontRow = rowId;
        ui.sel = 'sh:' + s.id;
        afterSelect();
      }
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
}

/* ---------------- 全局绑定 ---------------- */
function setTab(tab){
  ui.tab = tab;
  $all('nav.tabs button').forEach(function(b){ b.classList.toggle('on', b.getAttribute('data-tab') === tab); });
  var t3 = $('#tab3d'), tp = $('#tabplan'), tf = $('#tabfront');
  if (t3) t3.style.display = (tab === 't3d') ? '' : 'none';
  if (tp) tp.style.display = (tab === 'tplan') ? '' : 'none';
  if (tf) tf.style.display = (tab === 'tfront') ? '' : 'none';
  if (tab === 'tplan') renderPlanNow();
  if (tab === 'tfront') renderFrontNow();
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
  $('#pzIn').addEventListener('click', function(){ zoomPlanAt(currentPlanZ() * 1.3); });
  $('#pzOut').addEventListener('click', function(){ zoomPlanAt(currentPlanZ() / 1.3); });
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
  /* 全局动作委托：左侧工具栏（移动端 = 左滑抽屉）与属性栏里的按钮都带 data-act，
     它们不在 #editors / #selbar 子树里，因此需要一层文档级委托。
     子树内的按钮仍由各自的监听器处理（这里跳过，避免重复触发）。 */
  document.addEventListener('click', function(e){
    var b = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
    if (!b) return;
    /* 面板 / 快捷条里的按钮由各自的监听器处理，这里跳过以免重复触发。
       关键兜底：若按钮的处理过程重建了面板（afterStruct / buildEditors），按钮会脱离文档，
       closest('#editors') 随即失效 → 同一动作会被执行两次（2026-09-15 修：
       点一次「删托臂排」删掉两排）。用 isConnected 判定「事件发出时按钮还在树上」。 */
    if (!b.isConnected) return;
    if (b.closest('#editors') || b.closest('#selbar')) return;
    var fn = acts[b.getAttribute('data-act')];
    if (fn) fn(b.dataset || {});
  });
  /* Escape：结束摆放模式（旧的「关闭添加面板」已随面板删除）。 */
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape') endPlacing(true); });
  var bR = $('#btnRandom');
  if (bR) bR.addEventListener('click', doRandom);
  els.editors.addEventListener('input', onEditInput);
  els.editors.addEventListener('change', onEditInput);
  els.editors.addEventListener('click', onEditClick);
  bindSelBar();
  bindPlan();
  bindPlanZoom();
  bindGestures();
  els.frontScroll = els.frontScroll || $('#frontScroll');
  els.viewfront = els.viewfront || $('#viewfront');
  els.frontBar = els.frontBar || $('#frontBar');
  bindFront();
  var frontRT = null;
  window.addEventListener('resize', function(){
    if (ui.tab !== 'tfront') return;
    clearTimeout(frontRT);
    frontRT = setTimeout(function(){ ui.frontScale = null; renderFrontNow(); }, 260);
  });
  if (els.frontBar){
    els.frontBar.addEventListener('click', function(e){
      var z = e.target && e.target.closest ? e.target.closest('[data-frontzoom]') : null;
      if (z){ frontZoom(z.getAttribute('data-frontzoom')); return; }
      var fb = e.target && e.target.closest ? e.target.closest('[data-frontface]') : null;
      if (fb){
        var s0 = frontShelfOf();
        if (s0) frontFaceSet(s0.id, fb.getAttribute('data-frontface'));
        return;
      }
      var mb = e.target && e.target.closest ? e.target.closest('[data-frontmirror]') : null;
      if (mb){
        var s1 = frontShelfOf();
        if (s1) mirrorRowsToOtherFace(s1);
      }
    });
  }
}

/* ---------------- 启动 ---------------- */
function applyQuery(){
  try {
    var q = new URLSearchParams(location.search);
    if (q.get('tab') === 'plan') setTab('tplan');
    if (q.get('tab') === 'front') setTab('tfront');
    if (q.get('shelf')) ui.frontShelf = q.get('shelf');
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
          var nSh0 = document.querySelectorAll('[data-id^="sh:"]').length;
          var bs = document.querySelector('[data-act="add"][data-kind="shelfD"]');
          if (bs){ bs.click(); log.push('shelf ' + nSh0 + '->' + document.querySelectorAll('[data-id^="sh:"]').length); }
          var nb = document.querySelector('[data-act="add"][data-kind="bikeK"]');
          if (nb){ nb.click(); log.push('addKidBike=' + bikes()); log.push('newSel=' + $('#selbar').getAttribute('data-sel')); }
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
          var bS = document.querySelector('[data-act="add"][data-kind="shelfS"]');
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
          /* --- 货架陈列附件：托臂排（＋短托臂 / ＋长托臂 / 删一排 / 清空）2026-09-15 --- */
          var sg3 = document.querySelector('[data-id^="sh:"]');
          if (sg3){
            var r3 = sg3.getBoundingClientRect();
            sg3.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true, clientX:r3.x+8, clientY:r3.y+5, pointerId:31, button:0}));
            window.dispatchEvent(new PointerEvent('pointerup', {bubbles:true, clientX:r3.x+8, clientY:r3.y+5, pointerId:31}));
          }
          /* 计数只看平面图那一张 SVG（3D 面板里是同一份数据，合计会翻倍造成误判） */
          function armBikes(){ var s = document.querySelector('#viewplan svg'); return s ? (s.outerHTML.match(/data-acc="arm"/g) || []).length : -1; }
          /* 面板里的「删托臂排」按钮数 = 当前选中货架的托臂排数（DOM 即时反映，避开 250ms 保存防抖） */
          function armRowsNow(){ return document.querySelectorAll('#editors [data-act="delArmRow"]').length; }
          function cntAcc(kind){ return document.querySelectorAll('[data-acc="' + kind + '"]').length; }
          var shShort = $('[data-bact="addArm"][data-arm="short"]');
          if (shShort){
            var ab0 = armBikes();
            shShort.click();
            var ab1 = armBikes(), rowsA = armRowsNow();
            $('[data-bact="addArm"][data-arm="long"]').click();
            var ab2 = armBikes(), rowsB = armRowsNow();
            var delBtn = $('#editors [data-act="delArmRow"]');
            if (delBtn) delBtn.dispatchEvent(new MouseEvent('click', {bubbles:true}));
            var rowsC = armRowsNow(), ab3 = armBikes();
            var clr = $('[data-bact="clearArms"]');
            if (clr) clr.click();
            log.push('arm=' + ab0 + '>' + ab1 + '>' + ab2 + '>' + ab3 + ' rows=' + rowsA + '>' + rowsB + '>' + rowsC + '>' + armRowsNow());
          } else { log.push('NO-ADDARM'); }
          var rackBtn0 = $('[data-bact="accRack"]');
          if (rackBtn0){
            var rb0 = cntAcc('rack');
            rackBtn0.click();
            var ra0 = cntAcc('rack'), rl0 = $('[data-bact="accRack"]').textContent;
            $('[data-bact="accRack"]').click();
            log.push('accRack=' + rb0 + '>' + ra0 + '(' + rl0 + ')');
          } else { log.push('NO-ACCRACK'); }
          var hookBtn0 = $('[data-bact="accHook"]');
          if (hookBtn0){
            hookBtn0.click();
            var hl0 = $('[data-bact="accHook"]').textContent;
            $('[data-bact="accHook"]').click();
            log.push('accHook=' + hl0 + '>' + $('[data-bact="accHook"]').textContent);
          } else { log.push('NO-ACCHOOK'); }
          /* --- 货架正面：连续拖动必须稳定（每帧重绘后坐标换算仍用当前 SVG）--- */
          function frontRailInfo(){
            var rg = document.querySelector('#viewfront [data-rowgroup]');
            if (!rg) return 'NO-ROW';
            var rail = rg.querySelector('rect');
            return [Math.round(+rail.getAttribute('x')), Math.round(+rail.getAttribute('y')), Math.round(+rail.getAttribute('width'))].join('/');
          }
          var fb = $('[data-bact="openFront"]');
          if (fb){
            fb.click();
            var fAdd = document.querySelector('#frontBar [data-act="addArm"][data-id$=":short"]');
            if (fAdd) fAdd.click();
            var fg = document.querySelectorAll('#viewfront [data-row]')[0];
            if (fg){
              var fr0 = fg.getBoundingClientRect(), fx0 = fr0.x + fr0.width / 2, fy0 = fr0.y + fr0.height / 2;
              var fsvg = document.querySelector('#viewfront svg');
              var info0 = frontRailInfo();
              fg.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true, clientX:fx0, clientY:fy0, pointerId:301, button:0}));
              var mid = '?';
              for (var mi = 1; mi <= 6; mi++){
                window.dispatchEvent(new PointerEvent('pointermove', {bubbles:true, clientX:fx0 + mi * 9, clientY:fy0 - mi * 8, pointerId:301}));
                if (mi === 2) mid = frontRailInfo();
              }
              window.dispatchEvent(new PointerEvent('pointerup', {bubbles:true, clientX:fx0 + 54, clientY:fy0 - 48, pointerId:301}));
              var info1 = frontRailInfo();
              var fh = document.querySelectorAll('#viewfront [data-rowhandle]').length;
              log.push('frontDrag=' + info0 + '>' + mid + '>' + info1
                + ' moved=' + (info1 !== info0) + ' handles=' + fh + ' scale=' + (fsvg ? fsvg.getAttribute('data-scale') : '-'));
            } else { log.push('NO-FRONT-ROW'); }
          } else { log.push('NO-FRONT-BTN'); }
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
  renderFrontNow();
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
    /* 云端图纸（2026-09-17）：界面就绪后接上保存 / 载入。 */
    /* 依赖脚本（sd-cloud.js / sd-collab.js）在 body 里位于 app.js 之后：
       sd-boot 动态加载的界面脚本可能先于它们完成并派发 sd-ui-ready，
       此时 boot() 里 window.SDCloud / window.SDCollab 还不存在 —— 直接判断会
       静默丢掉「保存到云端」或「实时协作」。这里改成短重试接线（最多 2 秒）。
       （2026-09-17 实测：桌面端在缓存命中时必现，表现为实时协作永远不连接） */
    var wireTries = 0;
    function wireServices(){
      if (window.SDCloud && !wireServices.cloud){
        wireServices.cloud = true;
        window.SDCloud.attach({
          getCfg: function(){ return cfg; },
          setCfg: function(obj){
            /* 云端图纸同样是「历史配置」：必须走 migrateLegacy（否则旧快照里的
               studio.peg 等旧结构不会升级，例如洞洞板数量会退回新默认的那一块）。 */
            cfg = E.migrateLegacy(obj);
            ui.sel = null;
            ui.frontRow = null;
            afterStruct();
            syncInputs();
          },
          toast: toast
        });
      }
      /* 实时协作（2026-09-17）：与云端图纸共用 cfg 读写钩子；
         applyRemoteConfig 与 setCfg 的区别是保留当前选中（物化高频发生，
         清选中会打断正在进行的编辑）。 */
      if (window.SDCollab && !wireServices.collab){
        wireServices.collab = true;
        window.SDCollab.attach({
          getCfg: function(){ return cfg; },
          applyRemoteConfig: function(obj){
            var keepSel = ui.sel, keepRow = ui.frontRow;
            /* 房间文档可能是旧版本写入的（例如早于组件系统的结构）：物化时同样迁移。 */
            cfg = E.migrateLegacy(obj);
            ui.sel = selStillExists(keepSel) ? keepSel : null;
            ui.frontRow = keepRow;
            saveSoon();
            buildEditors();
            renderChips(); render3DNow(); renderPlanNow(); renderFrontNow();
            if (ui.sel && window.SDUI && SDUI.refreshSelVals) renderSelBar(true);
            syncInputs();
          },
          previewMove: function(id, x, y){
            try {
              var k = String(id).split(':')[0];
              if (!(k === 'sh' || k === 'pl' || k === 'bk' || k === 'zn' || k === 'en' || k === 'ms' || k === 'mk' || k === 'ct' || k === 'si')) return;
              moveItem(id, snapV(x), snapV(y));
              render3DNow(); renderPlanNow();
            } catch(e7){}
          },
          isEditing: function(){
            var el = document.activeElement;
            if (!el) return false;
            var tag = el.tagName;
            return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
          },
          toast: toast
        });
      }
      if ((!wireServices.cloud || !wireServices.collab) && ++wireTries < 80){
        setTimeout(wireServices, 25);
      }
    }
    wireServices();
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
