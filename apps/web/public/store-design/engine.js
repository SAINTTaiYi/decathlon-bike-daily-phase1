/* ==========================================================================
   门店布局设计渲染引擎  v1  (store-3d/engine.js)
   浏览器 + Node 双用（UMD）。核心：正交轴测投影（可旋转）+ SVG 输出。
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.Engine = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

var VERSION = 'store3d-1.14';
var WALL_T  = 0.3;     // 外墙厚（米）
var BIKE_LEN = { adult: 2.0, kids: 1.5 };   // 自行车长度（米）
var BIKE_SLOT = { adult: 2.0, kids: 1.6 };  // 每个自行车位 2m（童车 1.6m）
var EPS     = 1e-6;

/* --------------------------- 小工具 --------------------------- */
function r2(v){ return Math.round(v*100)/100; }
function fnum(v){
  v = Math.round(v*100)/100;
  return (Math.abs(v - Math.round(v)) < 0.001) ? String(Math.round(v)) : String(v);
}
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
function heightByMode(m){ return m==='full' ? 2.6 : (m==='half' ? 1.2 : 0.35); }

function deepMerge(base, src){
  if (Array.isArray(base)) { return Array.isArray(src) ? src : base; }
  if (base !== null && typeof base === 'object') {
    var out = {}, k;
    for (k in base) { out[k] = deepMerge(base[k], (src && typeof src === 'object') ? src[k] : undefined); }
    if (src && typeof src === 'object') { for (k in src) { if (!(k in out)) out[k] = src[k]; } }
    return out;
  }
  return (src === undefined || src === null) ? base : src;
}

/* --------------------------- 几何小工具 --------------------------- */
function shelfDepth(s){ return s.kind === 'single' ? 0.35 : 0.5; }
/* 货架的 3D 盒子（与 render3D 里 boxAdd 用的是同一个范围） */
function shelfBox(s){
  var d = shelfDepth(s), h = s.h || SHELF_H_DEFAULT;
  return (s.orient === 'v')
    ? { x1: s.x, y1: s.y, x2: s.x + d, y2: s.y + s.len, z1: 0, z2: h }
    : { x1: s.x, y1: s.y, x2: s.x + s.len, y2: s.y + d, z1: 0, z2: h };
}
/* 盒子 8 个角在相机视线方向上的深度区间（用于附件排序：见 render3D 里的 attachKey） */
function boxKeyRange(bx, d3){
  var mn = Infinity, mx = -Infinity;
  [[bx.x1,bx.y1],[bx.x1,bx.y2],[bx.x2,bx.y1],[bx.x2,bx.y2]].forEach(function(c){
    [bx.z1, bx.z2].forEach(function(z){
      var k = c[0]*d3[0] + c[1]*d3[1] + z*d3[2];
      if (k < mn) mn = k;
      if (k > mx) mx = k;
    });
  });
  return { min: mn, max: mx };
}
function shelfRect(s){
  var d = shelfDepth(s);
  return (s.orient === 'v') ? { x:s.x, y:s.y, w:d, h:s.len } : { x:s.x, y:s.y, w:s.len, h:d };
}

/* --------------------------- 货架旋转（2026-09-17） ---------------------------
   货架可以斜放：s.rot = 旋转角度（度，平面视图里顺时针为正；缺省 0 = 原有行为）。
   底面矩形先按 orient 摆好，再绕自身中心旋转 rot —— 所有派生几何（托臂 / 地架 /
   挂钩 / 挂车 / 平面符号 / 标注）都必须走同一套变换，否则斜放后附件会脱离货架。 */
function shelfRot(s){
  var r = +(s && s.rot);
  if (!isFinite(r) || Math.abs(r) < 1e-6) return 0;
  r = r % 360; if (r < 0) r += 360;
  return (Math.abs(r) < 1e-6) ? 0 : r;
}
function shelfBaseRect(s){
  var d = shelfDepth(s);
  return (s.orient === 'v') ? { x:s.x, y:s.y, w:d, h:s.len } : { x:s.x, y:s.y, w:s.len, h:d };
}
function shelfCenter(s){ var r = shelfBaseRect(s); return { x: r.x + r.w/2, y: r.y + r.h/2 }; }
/* 世界坐标点绕货架中心旋转（附件派生几何统一走这里） */
function shelfRotPt(s, x, y){
  var deg = shelfRot(s);
  if (!deg) return { x: x, y: y };
  var a = deg * Math.PI / 180, c = shelfCenter(s), ca = Math.cos(a), sa = Math.sin(a);
  var dx = x - c.x, dy = y - c.y;
  return { x: c.x + dx*ca - dy*sa, y: c.y + dx*sa + dy*ca };
}
/* 货架局部坐标（u 沿架长 0..len，t 离底面「负法线侧」0..depth）→ 世界坐标（含旋转） */
function shelfLocalPt(s, u, t){
  var p = (s.orient === 'v') ? { x: s.x + t, y: s.y + u } : { x: s.x + u, y: s.y + t };
  return shelfRotPt(s, p.x, p.y);
}
/* 底面四角（含旋转） */
function shelfCorners(s){
  var d = shelfDepth(s), L = +s.len || 0;
  return [[0,0],[L,0],[L,d],[0,d]].map(function(pt){ return shelfLocalPt(s, pt[0], pt[1]); });
}
/* 货架局部盒（u 沿架长 / t 离基准面，符号由调用方决定）→ 世界四角 */
function shelfLocalBoxCorners(s, u1, u2, t1, t2){
  return [shelfLocalPt(s,u1,t1), shelfLocalPt(s,u2,t1), shelfLocalPt(s,u2,t2), shelfLocalPt(s,u1,t2)];
}
/* 旋转后的轴对齐包围盒（选中框 / 遮挡登记用） */
function shelfBounds(s){
  var cs = shelfCorners(s);
  var x1 = Math.min(cs[0].x, cs[1].x, cs[2].x, cs[3].x), x2 = Math.max(cs[0].x, cs[1].x, cs[2].x, cs[3].x);
  var y1 = Math.min(cs[0].y, cs[1].y, cs[2].y, cs[3].y), y2 = Math.max(cs[0].y, cs[1].y, cs[2].y, cs[3].y);
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}
/* --------------------- 通用角度 / 旋转（墙、货架共用口径） --------------------- */
function rotDeg(v){
  var r = +v;
  if (!isFinite(r) || Math.abs(r) < 1e-6) return 0;
  r = r % 360; if (r < 0) r += 360;
  return (Math.abs(r) < 1e-6) ? 0 : r;
}
function rotPt(x, y, cx, cy, deg){
  if (!deg) return { x: x, y: y };
  var a = deg * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
  var dx = x - cx, dy = y - cy;
  return { x: cx + dx*ca - dy*sa, y: cy + dx*sa + dy*ca };
}
function boundsOfPts(pts){
  var x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  pts.forEach(function(p){ x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y); x2 = Math.max(x2, p.x); y2 = Math.max(y2, p.y); });
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/* --------------------------- 外墙几何（2026-09-17） ---------------------------
   每一边的墙都是一段「可编辑的墙段」（用户 2026-09-17 定案）：
     from  起点：沿该边从边的原点起算（缺省 0）
     len   长度：墙段自身长度（缺省 = 整边）——不再靠「打缺口」间接缩短
     at    横向偏移：朝室内为正（缺省 0）
     rot   旋转：绕墙段中心的角度（缺省 0 = 沿边）
   开口 open[].at 相对「墙段起点」计，与「整边长度」脱钩。
   四项缺省时几何与旧版逐字节一致。 */
var WALL_SIDES = ['top', 'bottom', 'left', 'right'];
function wallGeom(cfg, side){
  var W = cfg.space.w, D = cfg.space.d;
  if (side === 'top')    return { edgeLen: W, ox: 0, oy: 0, dx: 1, dy: 0, ix: 0,  iy: 1  };  /* u 沿 +x，室内在 +y */
  if (side === 'bottom') return { edgeLen: W, ox: 0, oy: D, dx: 1, dy: 0, ix: 0,  iy: -1 };
  if (side === 'left')   return { edgeLen: D, ox: 0, oy: 0, dx: 0, dy: 1, ix: 1,  iy: 0  };
  return                        { edgeLen: D, ox: W, oy: 0, dx: 0, dy: 1, ix: -1, iy: 0  };
}
function wallEdge(cfg, side){ return (cfg.walls || {})[side] || {}; }
function wallStart(cfg, side){
  var g = wallGeom(cfg, side), f = +wallEdge(cfg, side).from;
  if (!isFinite(f)) f = 0;
  return Math.max(0, Math.min(f, Math.max(0, g.edgeLen - 0.2)));
}
function wallLength(cfg, side){
  var g = wallGeom(cfg, side), L = +wallEdge(cfg, side).len;
  if (!isFinite(L) || L <= 0) L = g.edgeLen;
  return Math.max(0.2, Math.min(L, g.edgeLen - wallStart(cfg, side)));
}
function wallOffset(cfg, side){ var a = +wallEdge(cfg, side).at; return isFinite(a) ? a : 0; }
function wallRot(cfg, side){ return rotDeg(wallEdge(cfg, side).rot); }
/* 墙段局部坐标（u 从墙起点沿边，v 从该边往室内）→ 世界坐标（含 at 偏移与 rot） */
function wallPt(cfg, side, u, v){
  var g = wallGeom(cfg, side);
  var U = wallStart(cfg, side) + u, V = wallOffset(cfg, side) + v;
  var x = g.ox + g.dx*U + g.ix*V, y = g.oy + g.dy*U + g.iy*V;
  var rot = wallRot(cfg, side);
  if (!rot) return { x: x, y: y };
  var c = wallCenterPt(cfg, side);
  return rotPt(x, y, c.x, c.y, rot);
}
function wallCenterPt(cfg, side){
  var g = wallGeom(cfg, side);
  var uc = wallStart(cfg, side) + wallLength(cfg, side)/2, vc = wallOffset(cfg, side) + WALL_T/2;
  return { x: g.ox + g.dx*uc + g.ix*vc, y: g.oy + g.dy*uc + g.iy*vc };
}
/* 墙段的四角（u1..u2 为墙段自身坐标） */
function wallBandCorners(cfg, side, u1, u2){
  return [wallPt(cfg, side, u1, 0), wallPt(cfg, side, u2, 0), wallPt(cfg, side, u2, WALL_T), wallPt(cfg, side, u1, WALL_T)];
}
function wallBounds(cfg, side){
  return boundsOfPts(wallBandCorners(cfg, side, 0, wallLength(cfg, side)));
}
/* 墙段被开口切开后的实心段（返回墙段自身坐标下的 [u1,u2]） */
function wallSegSpans(cfg, side){
  return segsOf(wallLength(cfg, side), wallEdge(cfg, side).open);
}
function wallIsDefault(cfg, side){
  var g = wallGeom(cfg, side);
  return wallRot(cfg, side) === 0 && wallStart(cfg, side) === 0
    && Math.abs(wallOffset(cfg, side)) < 1e-9 && Math.abs(wallLength(cfg, side) - g.edgeLen) < 1e-9;
}

/* --------------------------- 内隔墙几何（含旋转） --------------------------- */
function wallSegRot(ws){ return rotDeg(ws.rot); }
function wallSegSpan(ws){
  var a = Math.min(+ws.from || 0, +ws.to || 0), b = Math.max(+ws.from || 0, +ws.to || 0);
  return [a, b];
}
function wallSegCenter(ws){
  var sp = wallSegSpan(ws);
  return (ws.orient === 'v') ? { x: +ws.at, y: (sp[0]+sp[1])/2 } : { x: (sp[0]+sp[1])/2, y: +ws.at };
}
function wallSegCorners(ws){
  var th = ws.thick || 0.3, sp = wallSegSpan(ws);
  var pts = (ws.orient === 'v')
    ? [[+ws.at - th/2, sp[0]], [+ws.at + th/2, sp[0]], [+ws.at + th/2, sp[1]], [+ws.at - th/2, sp[1]]]
    : [[sp[0], +ws.at - th/2], [sp[1], +ws.at - th/2], [sp[1], +ws.at + th/2], [sp[0], +ws.at + th/2]];
  var rot = wallSegRot(ws), c = wallSegCenter(ws);
  return pts.map(function(p){ return rotPt(p[0], p[1], c.x, c.y, rot); });
}

function pillarRect(p){ var s = p.s || 1.0; return { x:p.x-s/2, y:p.y-s/2, w:s, h:s }; }
function overlapArea(a,b){
  var ox = Math.min(a.x+a.w, b.x+b.w) - Math.max(a.x, b.x);
  var oy = Math.min(a.y+a.h, b.y+b.h) - Math.max(a.y, b.y);
  return (ox > 0 && oy > 0) ? ox*oy : 0;
}
function splitSegs(list, a, b){
  var out = [];
  list.forEach(function(sg){
    var s = sg[0], e = sg[1];
    if (b <= s+1e-9 || a >= e-1e-9){ out.push(sg); return; }
    if (a > s+1e-9) out.push([s, a]);
    if (b < e-1e-9) out.push([b, e]);
  });
  return out;
}
function segsOf(L, opens){
  var list = [[0, L]];
  (opens||[]).forEach(function(o){ list = splitSegs(list, +o.at||0, (+o.at||0)+(+o.w||0)); });
  return list;
}

/* --------------------------- 默认配置 --------------------------- */
function defaultConfig(){
  var out = {
    v: 1,
    space: { w: 23.0, d: 17.0 },
    opt: { grid:true, dims:true, labels:true, translucent:false, wallH:'low' },
    walls: {
      top:    { on:true, open:[ { at:2.0,  w:4.0, type:'main', label:'商场出入口' } ] },
      bottom: { on:true, open:[ { at:0.0,  w:6.6, type:'pass', label:'出入口'     } ] },
      left:   { on:true, open:[ { at:13.6, w:3.4, type:'pass', label:''          } ] },
      right:  { on:true, open:[] }
    },
    wallSegs: [
      { id:'w1', orient:'v', at:19.8, from:13.1, to:14.6, thick:0.4, label:'进出口' },
      { id:'w2', orient:'v', at:19.8, from:16.1, to:16.7, thick:0.4, label:'' }
    ],
    pillars: [
      { id:'p1', x:7.6, y:1.1,  s:1.0 },
      { id:'p2', x:7.6, y:9.1,  s:1.0 },
      { id:'p3', x:7.6, y:16.5, s:1.0 }
    ],
    zones: [
      { id:'z1', kind:'passage', x:0.0,  y:13.6, w:6.6,  h:3.4,  label:'出入口', fence:null },
      { id:'z2', kind:'storage', x:20.0, y:1.0,  w:2.5,  h:12.0, label:'自行车库存区',
        fence:{ n:'wall', s:'wall', w:'mesh', e:'none' } },
      { id:'z3', kind:'test', x:8.5, y:13.8, w:8.5, h:2.8, label:'骑行试用区', fence:null }
    ],
    shelves: [
      { id:'s1', name:'', kind:'double', orient:'h', x:1.5,  y:2.5, len:7.5, h:SHELF_H_DEFAULT },
      { id:'s2', name:'', kind:'double', orient:'h', x:1.5,  y:8.0, len:7.5, h:SHELF_H_DEFAULT },
      { id:'s3', name:'', kind:'double', orient:'h', x:14.0, y:2.5, len:5.5, h:SHELF_H_DEFAULT },
      { id:'s4', name:'', kind:'double', orient:'h', x:14.0, y:8.0, len:5.5, h:SHELF_H_DEFAULT }
    ],
    studio: {
      name:'工作室',
      x:15.9, y:9.05, w:4.0, h:4.0, wallH:2.2,
      sides: { n:'wall', e:'none', s:'door', w:'window' }, doorW:1.2,
      peg: { on:true, side:'e', face:'in', panels:2 }
    },
    meshes: [],
    markers: [
      { id:'m1', color:'red',    x:7.1,  y:15.55, w:1.0, h:0.5,  label:'消防' },
      { id:'m2', color:'red',    x:22.1, y:0.55,  w:0.45,h:0.48, label:'' },
      { id:'m3', color:'red',    x:22.55,y:9.05,  w:0.5, h:0.5,  label:'' },
      { id:'m4', color:'red',    x:22.9, y:16.05, w:0.15,h:0.45, label:'' },
      { id:'m5', color:'yellow', x:0.1,  y:13.1,  w:1.0, h:0.45, label:'' },
      { id:'m6', color:'yellow', x:6.6,  y:16.1,  w:0.45,h:0.9,  label:'' },
      { id:'m7', color:'green',  x:22.2, y:16.52, w:0.9, h:0.45, label:'' }
    ],
    entrances: [
      { id:'e1', name:'商场出入口', x:2.0,  y:0.3,  w:4.0, h:2.0 },
      { id:'e2', name:'出入口',     x:0.0,  y:13.6, w:6.6, h:3.4 },
      { id:'e3', name:'进出口',     x:17.8, y:14.4, w:1.8, h:1.9 }
    ],
    curtains: [
      { id:'c1', orient:'h', x:2.0,  y:0.38, len:4.0, h:1.9 },
      { id:'c2', orient:'v', x:19.8, y:14.6, len:1.5, h:1.9 }
    ],
    bikes: []
  };
  var bs = [], bi2 = 0;
  bikesForShelf(out.shelves[0], 'adult', { dir: 's', pose: 'stand' }).forEach(function(b){ bi2++; b.id = 'b' + bi2; bs.push(b); });
  bikesForShelf(out.shelves[2], 'kids',  { dir: 'n', pose: 'stand' }).forEach(function(b){ bi2++; b.id = 'b' + bi2; bs.push(b); });
  bikesForShelf(out.shelves[3], 'adult', { pose: 'top' }).forEach(function(b){ bi2++; b.id = 'b' + bi2; bs.push(b); });
  out.bikes = bs;
  return out;
}

/* 货架排车：垂直货架 90° 摆放、车头 45° 倾斜；每位 2m（pose='top' 时平放架顶）
   opts: { dir:'n'|'s'|'e'|'w', pose:'stand'|'top' } */
function bikesForShelf(s, type, opts){
  opts = opts || {};
  type = (type === 'kids') ? 'kids' : 'adult';
  var pose = (opts.pose === 'top') ? 'top' : 'stand';
  var slot = BIKE_SLOT[type] || 2.0;
  var blen = BIKE_LEN[type] || 2.0;
  var d = shelfDepth(s);
  var n = Math.floor((s.len - 0.4) / slot);
  if (n < 1) n = 1;
  var startU = (s.len - n*slot)/2 + slot/2;
  var dir = opts.dir || (s.orient === 'h' ? 's' : 'e');
  var rot = (dir === 'n') ? 270 : (dir === 'e') ? 0 : (dir === 'w') ? 180 : 90;
  var off = blen*0.42;
  var res = [];
  for (var i = 0; i < n; i++){
    var u = startU + i*slot, bx, by;
    if (s.orient === 'v'){ by = s.y + u; bx = (dir === 'e') ? (s.x + d + off) : (dir === 'w') ? (s.x - off) : (s.x + d/2); }
    else { bx = s.x + u; by = (dir === 'n') ? (s.y - off) : (s.y + d + off); }
    if (pose === 'top'){ bx = s.x + u; by = s.y + d/2; rot = (s.orient === 'v') ? 90 : 0; }
    res.push({ type: type, pose: pose, x: Math.round(bx*100)/100, y: Math.round(by*100)/100, rot: rot, steer: 45 });
  }
  return res;
}

/* ---------------- 货架陈列附件（托臂 / 地架 / 挂钩） ----------------
   门店规格（2026-09-15 用户口述，来源 = 门店实际陈列照片）：
     · 货架高度 3.3m（SHELF_H_DEFAULT；矮货架仍是 0.9m）。
     · 托臂分短托臂（伸出 0.5m）与长托臂（伸出 1m），两者可分别放置；
       每一排托臂在货架上的高度可单独调整（z = 车轮底离地高度）。
       每排位宽：成人车 2.0m、16″ 童车 4/3m → 2m 货架 1 台/排；4m 货架 3 台童车/排。
       每排还可用「起始 / 结束位置」限定只占货架的一段（短长混排、成人童车混排）。
     · 地架：地面停车架，每米 3 个（1m 货架放 3 个）。
     · 挂钩：货架前缘横杆挂点，每米 4 个。
   附件不落盘成独立元素：由货架配置派生（cfg.shelves[].acc），随货架移动 / 转向 /
   伸缩自动跟随，也不参与「越界 / 出入口净空」等独立元素检查。 */
var ARM_SLOT = { adult: 2.0, kids: 4 / 3 };   /* 每台车占位宽度（m）：成人 / 16 寸童车 */
var ARM_LEN = { short: 0.5, long: 1.0 };      /* 托臂伸出长度（m）：短 / 长 */
var RACK_PER_M = 3;                           /* 地架密度（个 / m） */
var HOOK_PER_M = 4;                           /* 挂钩密度（个 / m） */
var SHELF_H_DEFAULT = 3.3;                    /* 门店货架实际高度（m） */

/* ---------------- 挂载面（双面货架的两面） ----------------
   双面货架有两面可挂：'pos' = 坐标较大的一侧（东西向货架的南面 / 南北向货架的东面），
   'neg' = 另一侧（北面 / 西面）。托臂排、地架、挂钩都能指定挂在哪一面；
   未指定（'auto'）时按「朝空间更空的一侧」自动选择（老图纸的行为保持不变）。
   2026-09-15 用户要求：双面货架要能自己选在哪一面挂，两面都能加。 */
function faceNames(s){
  return (s && s.orient === 'v') ? { pos:'东面', neg:'西面' } : { pos:'南面', neg:'北面' };
}
function normFace(v){ return (v === 'pos' || v === 'neg') ? v : 'auto'; }
function normSide(v){ return (v === 'pos' || v === 'neg' || v === 'both') ? v : 'auto'; }
/* 解析成实际使用的面列表（'both' → 两面都挂） */
function resolveFaces(s, cfg, side){
  var one = (side === 'pos' || side === 'neg') ? side : accFace(s, cfg);
  return (side === 'both') ? ['pos', 'neg'] : [one];
}
/* 托臂排的默认高度：3.3m 货架第一排 0.9m（第二排由 nextArmZ 递增） */
function defaultArmZ(s){
  var h = (s && s.h != null) ? +s.h : SHELF_H_DEFAULT;
  return (h >= 2.6) ? 0.9 : Math.max(0.35, h - 1.1);
}
/* 单排托臂规格归一化（id / 高度 / 臂长 / 车型 / 起止位置） */
function normArmRow(r, i, s){
  r = r || {};
  var SL = (+s.len > 0) ? +s.len : 4;
  var len = (r.len === 'long') ? 'long' : 'short';
  var size = (r.size === 'kids') ? 'kids' : 'adult';
  var u0 = (+r.u0 >= 0) ? +r.u0 : 0;
  if (u0 > SL - 0.3) u0 = Math.max(0, SL - 0.3);
  var u1 = (+r.u1 > 0) ? +r.u1 : SL;
  if (u1 > SL) u1 = SL;
  if (u1 < u0 + 0.3) u1 = Math.min(SL, u0 + 0.3);
  var z = (+r.z >= 0) ? +r.z : defaultArmZ(s);
  return { id: r.id || ('a' + (i + 1)), z: r2(z), len: len, size: size, u0: r2(u0), u1: r2(u1),
           face: normFace(r.face) };
}
/* 附件配置（归一化后的只读视图；rows = 托臂排数组，可 0..n 排） */
function accOf(s){
  var a = (s && s.acc) || {};
  var rows = [];
  if (Array.isArray(a.armRows)){ a.armRows.forEach(function(r, i){ rows.push(normArmRow(r, i, s)); }); }
  return {
    rows: rows,
    rack: (a.rack === 'adult' || a.rack === 'kids') ? a.rack : 'none',
    hook: a.hook === 'on' ? 'on' : 'none',
    rackSide: normSide(a.rackSide),
    hookSide: normSide(a.hookSide)
  };
}
function accOn(s){ var a = accOf(s); return a.rows.length > 0 || a.rack !== 'none' || a.hook === 'on'; }
/* 一排托臂挂几台车（范围不足一台时按一台算） */
function rowFace(s, r, cfg){ return (r.face === 'pos' || r.face === 'neg') ? r.face : accFace(s, cfg); }
/* 某一面有几排托臂 / 几台车（正面视角的页签计数用） */
function armRowsOnFace(s, cfg, face){
  return accOf(s).rows.filter(function(r){ return rowFace(s, r, cfg) === face; });
}
function rowBikeCount(s, r){ return Math.max(1, Math.floor((r.u1 - r.u0) / ARM_SLOT[r.size] + 1e-6)); }
/* 一排托臂里第 i 台车的沿架位置（u 坐标，排内居中分布） */
function rowBikeU(s, r, i){
  var n = rowBikeCount(s, r), slot = ARM_SLOT[r.size];
  return r.u0 + ((r.u1 - r.u0) - n * slot) / 2 + slot / 2 + i * slot;
}
function armBikeCount(s){ var n = 0; accOf(s).rows.forEach(function(r){ n += rowBikeCount(s, r); }); return n; }
/* 新增一排托臂时的默认高度：优先空着的常用层（0.9 / 2.15），都占用则在上方 1.2m 处 */
function nextArmZ(s, rawRows){
  var h = (s && s.h != null) ? +s.h : SHELF_H_DEFAULT;
  var rows = rawRows || [];
  var cands = (h >= 2.6) ? [0.9, 2.15, 1.5, 2.6] : (h >= 2.0 ? [0.7, 1.4] : [Math.max(0.3, h - 1.2)]);
  for (var i = 0; i < cands.length; i++){
    var ok = true;
    for (var j = 0; j < rows.length; j++){ if (Math.abs((+rows[j].z || 0) - cands[i]) < 0.3){ ok = false; break; } }
    if (ok) return r2(cands[i]);
  }
  var top = 0.4;
  rows.forEach(function(r){ if ((+r.z || 0) > top) top = +r.z; });
  return r2(Math.min(Math.max(0.4, h - 0.85), top + 1.2));
}
function rackCount(s){ var a = accOf(s); return a.rack === 'none' ? 0 : Math.max(1, Math.round(s.len * RACK_PER_M)); }
function hookCount(s){ var a = accOf(s); return a.hook === 'on' ? Math.max(1, Math.round(s.len * HOOK_PER_M)) : 0; }

/* 附件展示面：默认朝空间里更空的一侧（贴墙货架自动朝外，不用手动翻面）。 */
function accFace(s, cfg){
  var d = shelfDepth(s), sp = (cfg && cfg.space) || { w: 20, d: 20 };
  if (s.orient === 'h') return (sp.d - (s.y + d)) >= s.y ? 'pos' : 'neg';
  return (sp.w - (s.x + d)) >= s.x ? 'pos' : 'neg';
}
/* 货架局部坐标 → 世界坐标：u 沿货架（0..len），t 离货架面（正 = 面外）。
   斜放货架（s.rot）的所有附件几何都从这里派生，所以旋转在最后一并施加。 */
function accPos(s, u, t, face){
  var d = shelfDepth(s), sgn = (face === 'neg') ? -1 : 1;
  var p = (s.orient === 'h')
    ? { x: s.x + u, y: sgn > 0 ? (s.y + d + t) : (s.y - t) }
    : { x: sgn > 0 ? (s.x + d + t) : (s.x - t), y: s.y + u };
  return shelfRotPt(s, p.x, p.y);
}
/* 附件距离带有符号：「面外」在局部 t 坐标里的正负由挂载面决定（负 = 底面另一侧），
   斜放路径用它把 AABB 换成「货架局部盒」。 */
function accLocalT(s, t, face){ return (face === 'neg') ? -t : t; }
/* 托臂硬件（派生，供 3D / 平面渲染）：每台车两根托臂（前 / 后轮各一根），
   臂从货架面伸出 armLen（短 0.5m / 长 1m），外端有挡钩；车轮落在托臂上。 */
function armHardwareOf(cfg, s){
  var a = accOf(s);
  if (!a.rows.length) return [];
  var out = [];
  a.rows.forEach(function(r){
    var face = rowFace(s, r, cfg);
    var armLen = ARM_LEN[r.len];
    var n = rowBikeCount(s, r), scale = (r.size === 'kids') ? 0.78 : 1.0;
    for (var i = 0; i < n; i++){
      var u = rowBikeU(s, r, i);
      [-1, 1].forEach(function(sg){
        var uu = u + sg * 0.55 * scale;
        if (uu < 0.04 || uu > s.len - 0.04) return;   /* 托臂不得伸出货架端头 */
        out.push({
          rowId: r.id, face: face, z: r.z, len: r.len, size: r.size, armLen: armLen, u: r2(uu),
          /* local：货架局部坐标（斜放时渲染用；t0/t1/cradleT 带挂载面符号） */
          local: { u: uu, t0: accLocalT(s, 0.02, face), t1: accLocalT(s, armLen, face), cradleT: accLocalT(s, armLen - 0.07, face) },
          inner: accPos(s, uu, 0.02, face),
          tip: accPos(s, uu, armLen, face),
          cradle: accPos(s, uu, armLen - 0.07, face)
        });
      });
    }
  });
  return out;
}
/* 附件自行车（派生，不写入 cfg.bikes）：托臂车横挂架上、地架车立在地面。
   rot 约定与编辑器一致（车头沿局部 +x）；lift = 该排托臂高度（车轮底离地）；
   长托臂把车挂得更靠外（离货架 0.9m），短托臂靠里（0.4m）。 */
function accBikesOf(cfg){
  var out = [];
  (cfg.shelves || []).forEach(function(s){
    var a = accOf(s);
    if (!accOn(s)) return;
    a.rows.forEach(function(r){
      var face = rowFace(s, r, cfg);
      var n = rowBikeCount(s, r), t = Math.max(0.15, ARM_LEN[r.len] - 0.10);
      for (var i = 0; i < n; i++){
        var u = rowBikeU(s, r, i);
        var p = accPos(s, u, t, face);
        out.push({
          id: 'acc:' + s.id + ':arm:' + r.id + ':' + i,
          acc: 'arm', row: r.id, face: face, type: r.size, pose: 'arm', lift: r.z,
          x: r2(p.x), y: r2(p.y), rot: (((s.orient === 'h') ? 0 : 90) + shelfRot(s)) % 360, steer: 0
        });
      }
    });
    if (a.rack !== 'none'){
      var n2 = rackCount(s), sc3 = (a.rack === 'kids') ? 0.78 : 1.0;
      var t2 = 0.20 + 0.9 * sc3;
      resolveFaces(s, cfg, a.rackSide).forEach(function(face){
        /* 车头朝外（2026-09-15 用户指正）：车头（车把一端）背对货架、朝着通道 ——
           与货架自带车位（bikesForShelf 的 dir='s'/'n'）方向一致。 */
        var rot2 = (((s.orient === 'h') ? ((face === 'pos') ? 90 : 270) : ((face === 'pos') ? 0 : 180)) + shelfRot(s)) % 360;
        for (var j = 0; j < n2; j++){
          var u2 = (j + 0.5) * s.len / n2;
          var p2 = accPos(s, u2, t2, face);
          out.push({ id: 'acc:' + s.id + ':rack:' + face + ':' + j, acc: 'rack', face: face,
                     type: a.rack, pose: 'rack', x: r2(p2.x), y: r2(p2.y), rot: rot2, steer: 0 });
        }
      });
    }
  });
  return out;
}

/* 自动挑选自行车摆放方向（朝空地一侧） */
function bestBikeDir(cfg, s, type){
  var cands = (s.orient === 'h') ? ['s','n'] : ['e','w'];
  var obs = [];
  cfg.shelves.forEach(function(o){ if (String(o.id) !== String(s.id)) obs.push(shelfRect(o)); });
  (cfg.zones || []).forEach(function(z){ obs.push({ x:z.x, y:z.y, w:z.w, h:z.h }); });
  (cfg.pillars || []).forEach(function(p){ obs.push(pillarRect(p)); });
  (cfg.entrances || []).forEach(function(e){ obs.push({ x:e.x, y:e.y, w:e.w, h:e.h }); });
  (cfg.meshes || []).forEach(function(m){ obs.push(m.orient === 'v' ? { x:m.x-0.1, y:m.y, w:0.2, h:m.len } : { x:m.x, y:m.y-0.1, w:m.len, h:0.2 }); });
  if (cfg.studio) obs.push({ x:cfg.studio.x, y:cfg.studio.y, w:cfg.studio.w, h:cfg.studio.h });
  function ok(dir){
    var list = bikesForShelf(s, type, { dir: dir, pose: 'stand' });
    for (var i=0;i<list.length;i++){
      var b = list[i], bx = { x: b.x-0.85, y: b.y-0.85, w: 1.7, h: 1.7 };
      if (bx.x < -0.01 || bx.y < -0.01 || bx.x+bx.w > cfg.space.w+0.01 || bx.y+bx.h > cfg.space.d+0.01) return false;
      for (var j=0;j<obs.length;j++){ if (overlapArea(bx, obs[j]) > 0.05) return false; }
    }
    return true;
  }
  for (var ci=0; ci<cands.length; ci++){ if (ok(cands[ci])) return cands[ci]; }
  return cands[0];
}

/* --------------------------- 校验 --------------------------- */
function computeChecks(cfg){
  var out = {
    sumDouble:0, sumSingle:0, countDouble:0, countSingle:0,
    okShelf:false, okStudio:false, okMesh:false,
    studioInfo:'', meshInfo:'', shelfInfo:'', warnings:[]
  };
  cfg.shelves.forEach(function(s){
    var L = +s.len || 0;
    if (s.kind === 'double'){ out.sumDouble += L; out.countDouble++; }
    else { out.sumSingle += L; out.countSingle++; }
  });
  out.sumDouble  = Math.round(out.sumDouble*100)/100;
  out.sumSingle  = Math.round(out.sumSingle*100)/100;
  out.okShelf    = out.sumDouble >= 26 - EPS;
  out.shelfInfo  = '双面 '+out.countDouble+' 组 / 共 '+out.sumDouble+' m（≈'+Math.round(out.sumDouble/2)+' 节 2m 货架）';

  var bA = 0, bK = 0;
  (cfg.bikes || []).forEach(function(b){ if (b.type === 'kids') bK++; else bA++; });
  out.bikeAdult = bA; out.bikeKid = bK;

  /* 货架陈列附件：托臂（上下两层合计）/ 地架 / 挂钩 计数 */
  var accArm = 0, accArmRows = 0, accRack = 0, accHook = 0;
  cfg.shelves.forEach(function(s){
    var a3 = accOf(s);
    accArmRows += a3.rows.length;
    a3.rows.forEach(function(r){ accArm += rowBikeCount(s, r); });
    accRack += rackCount(s);
    accHook += hookCount(s);
  });
  out.accArm = accArm; out.accArmRows = accArmRows; out.accRack = accRack; out.accHook = accHook;

  var tz0 = null;
  cfg.zones.forEach(function(z){ if (z.kind === 'test') tz0 = z; });
  out.okTest = !!tz0;
  out.testInfo = tz0 ? (fnum(tz0.w)+'×'+fnum(tz0.h)+' m @('+fnum(tz0.x)+', '+fnum(tz0.y)+')') : '未设置';

  var st = cfg.studio;
  out.studioInfo = fnum(st.w)+'×'+fnum(st.h)+'m';
  out.okStudio   = (st.w >= 4-EPS && st.h >= 4-EPS);

  /* ---- 网面背靠检查 ---- */
  var SIDES = ['n','e','s','w'], SNAME = { n:'北', e:'东', s:'南', w:'西' };
  function sideSeg(x, y, w, h, side){
    if (side==='n') return { orient:'h', c:y,     b0:x,     b1:x+w   };
    if (side==='s') return { orient:'h', c:y+h,   b0:x,     b1:x+w   };
    if (side==='w') return { orient:'v', c:x,     b0:y,     b1:y+h   };
    return            { orient:'v', c:x+w, b0:y,     b1:y+h   };
  }
  var cands = [];
  SIDES.forEach(function(sd){
    if (st.sides[sd] === 'mesh'){
      cands.push({ seg: sideSeg(st.x,st.y,st.w,st.h,sd), own: sd,
                   desc:'工作室'+SNAME[sd]+'侧（自有网面墙）' });
    }
  });
  cfg.zones.forEach(function(z){
    if (z.kind !== 'storage' || !z.fence) return;
    SIDES.forEach(function(sd){
      if (z.fence[sd] === 'mesh'){
        cands.push({ seg: sideSeg(z.x,z.y,z.w,z.h,sd),
                     desc:'「'+z.label+'」'+SNAME[sd]+'侧网面' });
      }
    });
  });
  cfg.meshes.forEach(function(m, i){
    var seg = (m.orient === 'v')
      ? { orient:'v', c:m.x, b0:m.y, b1:m.y+m.len }
      : { orient:'h', c:m.y, b0:m.x, b1:m.x+m.len };
    cands.push({ seg: seg, desc:'独立网面墙 #'+(i+1) });
  });
  function segOverlap(a, b){
    if (a.orient !== b.orient) return 0;
    if (Math.abs(a.c - b.c) > 0.16) return 0;
    return Math.min(a.b1, b.b1) - Math.max(a.b0, b.b0);
  }
  var best = null;
  SIDES.forEach(function(sd){
    var sl = sideSeg(st.x, st.y, st.w, st.h, sd);
    cands.forEach(function(cd){
      if (cd.own && cd.own !== sd) return;
      var ov = segOverlap(sl, cd.seg);
      if (ov > 0.5 - EPS && (!best || ov > best.ov)) best = { side:sd, ov:ov, desc:cd.desc };
    });
  });
  if (best){ out.okMesh = true; out.meshSide = best.side; out.meshInfo = SNAME[best.side]+'侧背靠：'+best.desc+'（贴合 '+fnum(best.ov)+'m）'; }
  else { out.meshInfo = '未检测到任何一条边背靠网面'; }

  /* ---- 越界 / 重叠 提示 ---- */
  var W = cfg.space.w, D = cfg.space.d, warn = out.warnings;
  function sName(i){
    var s0 = cfg.shelves[i];
    return (s0 && s0.name) ? ('「' + s0.name + '」') : ('货架#' + (i+1));
  }
  function oob(name, rc){
    if (rc.x < -0.01 || rc.y < -0.01 || rc.x+rc.w > W+0.01 || rc.y+rc.h > D+0.01) warn.push(name+' 超出空间边界');
  }
  var shelfRects = cfg.shelves.map(function(s,i){
    return { name:sName(i), r: shelfRect(s), tag:'shelf' };
  });
  shelfRects.forEach(function(x){ oob(x.name, x.r); });
  oob('工作室', { x:st.x, y:st.y, w:st.w, h:st.h });
  cfg.zones.forEach(function(z){ oob('区域「'+(z.label||z.kind)+'」', z); });
  cfg.wallSegs.forEach(function(w,i){
    if (w.orient==='v'){ if (w.from < 0 || w.to > D) warn.push('内隔墙#'+(i+1)+' 超出边界'); }
    else { if (w.from < 0 || w.to > W) warn.push('内隔墙#'+(i+1)+' 超出边界'); }
  });
  cfg.meshes.forEach(function(m,i){
    var rc = (m.orient==='v')
      ? { x:m.x-0.05, y:m.y, w:0.1, h:m.len }
      : { x:m.x, y:m.y-0.05, w:m.len, h:0.1 };
    oob('网面墙#'+(i+1), rc);
  });
  var solid = [];
  solid.push({ name:'工作室', r:{ x:st.x,y:st.y,w:st.w,h:st.h }, tag:'studio' });
  cfg.pillars.forEach(function(p,i){ solid.push({ name:'柱子#'+(i+1), r:pillarRect(p), tag:'pillar' }); });
  cfg.zones.forEach(function(z){ solid.push({ name:'区域「'+(z.label||z.kind)+'」', r:{x:z.x,y:z.y,w:z.w,h:z.h}, tag:'zone' }); });
  cfg.wallSegs.forEach(function(w,i){
    var r = (w.orient==='v')
      ? { x:w.at-w.thick/2, y:Math.min(w.from,w.to), w:w.thick, h:Math.abs(w.to-w.from) }
      : { x:Math.min(w.from,w.to), y:w.at-w.thick/2, w:Math.abs(w.to-w.from), h:w.thick };
    solid.push({ name:'内隔墙#'+(i+1), r:r, tag:'wall' });
  });
  shelfRects.forEach(function(x){
    solid.forEach(function(o){
      if (o.tag === 'wall') return;
      if (overlapArea(x.r, o.r) > 0.02) warn.push(x.name+' 与 '+o.name+' 重叠');
    });
  });
  solid.forEach(function(o){
    if (o.tag === 'studio' || o.tag === 'wall') return;
    if (overlapArea({x:st.x,y:st.y,w:st.w,h:st.h}, o.r) > 0.02) warn.push('工作室 与 '+o.name+' 重叠');
  });
  /* ---- 货道间距：平行相对（投影重叠）的两排货架之间净距 ≥5m ---- */
  var MIN_AISLE = 5.0, aisleIssues = [], minA = null;
  function isWallFlush(rc){
    var wt = WALL_T + 0.3;
    return (rc.x <= wt) || (rc.y <= wt) || (rc.x + rc.w >= cfg.space.w - wt) || (rc.y + rc.h >= cfg.space.d - wt);
  }
  var _rects = cfg.shelves.map(function(s){ return { s:s, r:shelfRect(s) }; });
  for (var ai=0; ai<_rects.length; ai++){
    for (var aj=ai+1; aj<_rects.length; aj++){
      var RA=_rects[ai], RB=_rects[aj];
      if (RA.s.orient !== RB.s.orient) continue;
      var gap = null;
      if (RA.s.orient === 'h'){
        var ovX = Math.min(RA.r.x+RA.r.w, RB.r.x+RB.r.w) - Math.max(RA.r.x, RB.r.x);
        if (ovX > 0.3){
          var top = RA.r.y <= RB.r.y ? RA.r : RB.r, bot = top===RA.r ? RB.r : RA.r;
          gap = bot.y - (top.y + top.h);
        } else {
          var cA0 = RA.r.y + RA.r.h/2, cB0 = RB.r.y + RB.r.h/2;
          if (Math.abs(cA0 - cB0) <= 0.35 && !(isWallFlush(RA.r) && isWallFlush(RB.r))){
            var e1a = RA.r.x, e1b = RA.r.x+RA.r.w, e2a = RB.r.x, e2b = RB.r.x+RB.r.w;
            gap = (e2a > e1b) ? (e2a - e1b) : ((e1a > e2b) ? (e1a - e2b) : null);
          }
        }
      } else {
        var ovY = Math.min(RA.r.y+RA.r.h, RB.r.y+RB.r.h) - Math.max(RA.r.y, RB.r.y);
        if (ovY > 0.3){
          var lef = RA.r.x <= RB.r.x ? RA.r : RB.r, rig = lef===RA.r ? RB.r : RA.r;
          gap = rig.x - (lef.x + lef.w);
        } else {
          var cA1 = RA.r.x + RA.r.w/2, cB1 = RB.r.x + RB.r.w/2;
          if (Math.abs(cA1 - cB1) <= 0.35 && !(isWallFlush(RA.r) && isWallFlush(RB.r))){
            var f1a = RA.r.y, f1b = RA.r.y+RA.r.h, f2a = RB.r.y, f2b = RB.r.y+RB.r.h;
            gap = (f2a > f1b) ? (f2a - f1b) : ((f1a > f2b) ? (f1a - f2b) : null);
          }
        }
      }
      if (gap == null || gap <= 0.02) continue;
      if (minA === null || gap < minA) minA = gap;
      if (gap < MIN_AISLE - 0.01) aisleIssues.push('货道间距仅 '+fnum(Math.round(gap*10)/10)+' m（<5m）：'+sName(ai)+' 与 '+sName(aj));
    }
  }
  out.okAisle = aisleIssues.length === 0;
  out.minAisle = (minA === null) ? null : Math.round(minA*100)/100;
  out.aisleInfo = (minA === null) ? '未检测到可比较的平行货道' : ('最小平行货道 '+fnum(Math.round(minA*10)/10)+' m');
  aisleIssues.forEach(function(w){ warn.push(w); });

  /* ---- 自行车：越界 / 出入口净空 / 工作室 ---- */
  (cfg.bikes || []).forEach(function(b, i){
    var rcB = { x: b.x-1.0, y: b.y-1.0, w: 2.0, h: 2.0 };
    if (rcB.x < -0.01 || rcB.y < -0.01 || rcB.x+rcB.w > W+0.01 || rcB.y+rcB.h > D+0.01) warn.push('自行车#'+(i+1)+' 超出空间边界');
    (cfg.entrances || []).forEach(function(en2){
      if (overlapArea(en2, { x:b.x-0.8, y:b.y-0.8, w:1.6, h:1.6 }) > 0.02) warn.push('自行车#'+(i+1)+' 占用出入口「'+en2.name+'」净空');
    });
    if (b.pose !== 'top' && overlapArea({x:st.x,y:st.y,w:st.w,h:st.h}, { x:b.x-0.7, y:b.y-0.7, w:1.4, h:1.4 }) > 0.05) warn.push('自行车#'+(i+1)+' 与工作室重叠');
  });

  /* ---- 出入口净空：货架、骑行试用区等不得占用 ---- */
  var eIssues = [];
  var eObjs = [];
  cfg.shelves.forEach(function(s,i){ eObjs.push({ name:sName(i), r:shelfRect(s) }); });
  cfg.zones.forEach(function(z){
    if (z.kind === 'passage') return;
    eObjs.push({ name: z.label || '区域', r:{ x:z.x, y:z.y, w:z.w, h:z.h } });
  });
  eObjs.push({ name:'工作室', r:{ x:st.x, y:st.y, w:st.w, h:st.h } });
  cfg.pillars.forEach(function(p,i){ eObjs.push({ name:'柱子#'+(i+1), r:pillarRect(p) }); });
  cfg.meshes.forEach(function(m,i){
    var rc2 = (m.orient==='v') ? { x:m.x-0.05, y:m.y, w:0.1, h:m.len } : { x:m.x, y:m.y-0.05, w:m.len, h:0.1 };
    eObjs.push({ name:'网面墙#'+(i+1), r:rc2 });
  });
  (cfg.entrances || []).forEach(function(en){
    eObjs.forEach(function(o){
      if (overlapArea(en, o.r) > 0.02) eIssues.push('出入口「'+en.name+'」净空被占用：'+o.name);
    });
  });
  out.okEntrance = eIssues.length === 0;
  out.entranceInfo = eIssues.length === 0 ? '商场出入口 / 出入口 / 进出口 三处净空正常' : eIssues[0];
  eIssues.forEach(function(w){ warn.push(w); });

  if (warn.length > 8) out.warnings = warn.slice(0,8).concat(['…等共 '+warn.length+' 条']);
  return out;
}

/* ======================== 3D 轴测渲染 ======================== */
var PAT_MESH  = '<pattern id="mp" width="7" height="7" patternUnits="userSpaceOnUse"><rect width="7" height="7" fill="#cfdfec" fill-opacity="0.45"/><path d="M0 0H7M0 0V7" stroke="#8fa7ba" stroke-width="0.7"/></pattern>';
var PAT_MESH2 = '<pattern id="mp2" width="7" height="7" patternUnits="userSpaceOnUse"><rect width="7" height="7" fill="#c6d6e3" fill-opacity="0.5"/><path d="M0 0H7M0 0V7" stroke="#8199ad" stroke-width="0.7"/></pattern>';
var PAT_PEG   = '<pattern id="pp" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#f0ddb6"/><circle cx="4" cy="4" r="1.05" fill="#c7ab74"/></pattern>';

var PAL = {
  wall:   { t:'#cac8c3', xp:'#bdbab5', xm:'#b3b0ab', yp:'#b8b5b0', ym:'#b0ada8', s:'#8e8a85' },
  pillar: { t:'#4a4a4a', xp:'#3d3d3d', xm:'#363636', yp:'#414141', ym:'#333333', s:'#232323' },
  shelfD: { t:'#f5e6ca', xp:'#ecd7ae', xm:'#e6ce9f', yp:'#e9d3aa', ym:'#e2ca9b', s:'#b79f79', ln:'#cbb083' },
  shelfS: { t:'#e6eff8', xp:'#d6e4f2', xm:'#ccddee', yp:'#d2e1f0', ym:'#c8daec', s:'#96afc7', ln:'#b6cadf' },
  studio: { t:'#ded9d0', xp:'#d3cec4', xm:'#cbc6bc', yp:'#cfcac0', ym:'#c7c2b8', s:'#a29a8e' },
  fence:  { t:'#b6b4af', xp:'#a9a7a2', xm:'#a19f9a', yp:'#a6a49f', ym:'#9e9c97', s:'#8a8883' },
  meshW:  { t:'url(#mp)', xp:'url(#mp)', xm:'url(#mp2)', yp:'url(#mp)', ym:'url(#mp2)', s:'#7f95a7' },
  peg:    { t:'url(#pp)', xp:'url(#pp)', xm:'url(#pp)', yp:'url(#pp)', ym:'url(#pp)', s:'#b59b6d' },
  glass:  { t:'#cfe6f2', xp:'#bcdcea', xm:'#b2d4e4', yp:'#b8d8e8', ym:'#aed0e0', s:'#7fadc8' },
  shelfLow: { t:'#e8e2f2', xp:'#dcd4ea', xm:'#d4cce4', yp:'#d8d0e7', ym:'#d0c8e0', s:'#a89bc4', ln:'#c3b8d9' },
  curt:   { t:'url(#cur)', xp:'url(#cur)', xm:'url(#cur)', yp:'url(#cur)', ym:'url(#cur)', s:'#8fb6c9' },
  bikeA:  { t:'#6d747c', xp:'#5e656d', xm:'#575e66', yp:'#616870', ym:'#5a616a', s:'#454b52' },
  bikeK:  { t:'#e0a35e', xp:'#d2954f', xm:'#c98e4a', yp:'#d89a54', ym:'#cf924d', s:'#a97838' }
};
var PAT_CURT = '<pattern id="cur" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="#dcebf2" fill-opacity="0.35"/><rect width="4.6" height="10" fill="#bcd7e4" fill-opacity="0.55"/></pattern>';

function render3D(cfg, view){
  view = view || {};
  var W = cfg.space.w, D = cfg.space.d;
  var az = (view.az != null ? view.az : 90) * Math.PI/180;
  var el0 = (view.el != null ? view.el : 33) * Math.PI/180;
  var zoom = view.zoom || 1, vw = view.vw || 900, vh = view.vh || 620;
  var ce = Math.cos(el0), se = Math.sin(el0), ca = Math.cos(az), sa = Math.sin(az);
  var d3 = [ ca*ce, sa*ce, se ], r3 = [ sa, -ca, 0 ], u3 = [ -ca*se, -sa*se, ce ];

  function dot(a,b){ return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; }
  function pro(p){ return [ dot(p,r3), dot(p,u3) ]; }

  /* ---- 视口自适应 ---- */
  var m = 0.85, pad = 64, fit = [];
  [[-m,-m],[W+m,-m],[W+m,D+m],[-m,D+m]].forEach(function(cn){
    fit.push(pro([cn[0],cn[1],0]), pro([cn[0],cn[1],1.5]), pro([cn[0],cn[1],3.0]));
  });
  var x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;
  fit.forEach(function(p){
    if (p[0]<x0)x0=p[0]; if (p[0]>x1)x1=p[0];
    if (p[1]<y0)y0=p[1]; if (p[1]>y1)y1=p[1];
  });
  var bw = Math.max(x1-x0, 1e-6), bh = Math.max(y1-y0, 1e-6);
  var sc = Math.min((vw-2*pad)/bw, (vh-2*pad)/bh);
  if (!isFinite(sc) || sc <= 0) sc = 8;
  sc *= zoom;
  var gx = (x0+x1)/2, gy = (y0+y1)/2;
  function T(p){ var q = pro(p); return [ (q[0]-gx)*sc + vw/2, -(q[1]-gy)*sc + vh/2 ]; }
  function ptsStr(pts){
    var a = [];
    for (var i=0;i<pts.length;i++){ var q = T(pts[i]); a.push(r2(q[0])+','+r2(q[1])); }
    return a.join(' ');
  }
  function polyStr(pts, fill, stroke, sw, op, attr){
    return '<polygon points="'+ptsStr(pts)+'" fill="'+fill+'"'
      + (op != null ? ' fill-opacity="'+op+'"' : '')
      + (stroke ? ' stroke="'+stroke+'" stroke-width="'+sw+'" stroke-linejoin="round"' : '')
      + (attr || '') + '/>';
  }
  function lineStr(a, b, color, sw, dash, op){
    var q1 = T(a), q2 = T(b);
    return '<line x1="'+r2(q1[0])+'" y1="'+r2(q1[1])+'" x2="'+r2(q2[0])+'" y2="'+r2(q2[1])+'" stroke="'+color+'" stroke-width="'+sw+'"'
      + (dash ? ' stroke-dasharray="'+dash+'"' : '')
      + (op != null ? ' stroke-opacity="'+op+'"' : '') + '/>';
  }

  var L0=[], L1=[], L2=[], L3=[];
  function p0(s){ L0.push(s); }
  /* view.debugPaint（仅测试用）：把深度键写进元素属性，供回归测试核对
     「画序 = 深度序」的断言，不开启时输出完全不变。 */
  var DBG = !!(view && view.debugPaint);
  function tagK(s, k){
    return s.replace(/^<(\w+)/, function(_, tagName){ return '<' + tagName + ' data-k="' + r2(k) + '"'; });
  }
  /* add1：如果在「摆件」收集区间内（objBegin..objEnd），先攒起来 —— 摆件要等
     所有实心体画完、拿到完整遮挡体清单后再统一决定前后（顺序无关：最后才排序）。 */
  function add1(k, s){ if (DBG) s = tagK(s, k); if (curObj) curObj.parts.push({ k:k, s:s }); else L1.push({ k:k, s:s }); }
  function add2(k, s){ if (DBG) s = tagK(s, k); L2.push({ k:k, s:s }); }
  var trans = !!cfg.opt.translucent;

  /* ================= 实心遮挡（2026-09-15 用户要求「货架做成实心的」）=================
     此前画序靠「每个多边形的平均深度」近似，长货架立面的平均值与它局部真实深度能差
     1m 以上，于是挂在别处的车、柱子旁边的车会轮流穿透出来。现在换一种算法：
       · 货架 / 柱子 / 工作室墙 / 网面墙 / 围栏 一律登记成「实心遮挡体」；
       · 每个摆件（自行车 / 托臂 / 地架 / 挂钩 / 标记）在画之前，用射线（沿视线方向
         朝相机）算出自己被哪些实心体挡住：
           被挡住   → 把它的深度键整体挪到该实心体「之前」→ 实心体便会盖住它；
           没被挡住且屏幕上压着它 → 挪到「之后」→ 它盖住实心体。
         采样点是沿物件长度分布的多个点，因此「一半被柱子挡住」这种情况也能按段处理。
       · 大面细分依旧负责「实心体之间」的排序（货架 vs 货架 / 柱子）。
     ============================================================================== */
  var occluders = [];
  function occl(bx, tag){
    var mx = (bx.x1 + bx.x2) / 2, my = (bx.y1 + bx.y2) / 2, mz = (bx.z1 + bx.z2) / 2;
    var dx = (bx.x2 - bx.x1) / 2, dy = (bx.y2 - bx.y1) / 2, dz = (bx.z2 - bx.z1) / 2;
    occluders.push({ box: bx, rng: boxKeyRange(bx, d3), sb: null, tag: tag,
                     mx: mx, my: my, mz: mz, rad: Math.sqrt(dx*dx + dy*dy + dz*dz) });
  }
  function boxMid(bx){ return [ (bx.x1+bx.x2)/2, (bx.y1+bx.y2)/2, (bx.z1+bx.z2)/2 ]; }
  /* 点沿视线方向朝相机走，是否被 box 挡住（AABB 射线求交） */
  /* 射线与实心体求交：返回「进入距离」（沿 dir 方向），没打到返回 -1。
     有了进入距离就能算出该射线打到的那张面的深度 —— 比拿整盒的 min/max 精确得多：
     整盒范围会让两个实心体的约束互相打架（2026-09-15 实测踩到）。 */
  function rayBoxEntryT(pt, bx, pad, dir){
    pad = pad || 0;
    dir = dir || 1;
    var lo0 = bx.x1 + pad, lo1 = bx.y1 + pad, lo2 = bx.z1 + pad;
    var hi0 = bx.x2 - pad, hi1 = bx.y2 - pad, hi2 = bx.z2 - pad;
    if (lo0 >= hi0 || lo1 >= hi1 || lo2 >= hi2) return -1;
    var lo = [lo0, lo1, lo2], hi = [hi0, hi1, hi2];
    var t0 = 0.02, t1 = 1e9;
    for (var i = 0; i < 3; i++){
      var oo = pt[i], dd = d3[i] * dir;
      if (Math.abs(dd) < 1e-9){ if (oo < lo[i] || oo > hi[i]) return -1; continue; }
      var a = (lo[i] - oo) / dd, c = (hi[i] - oo) / dd;
      if (a > c){ var t = a; a = c; c = t; }
      if (a > t0) t0 = a;
      if (c < t1) t1 = c;
      if (t0 > t1) return -1;
    }
    return (t1 > 0.02) ? t0 : -1;
  }
  function rayBoxHit(pt, bx, pad, dir){ return rayBoxEntryT(pt, bx, pad, dir) >= 0; }
  function screenBox(bx){
    var x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    [[bx.x1,bx.y1],[bx.x1,bx.y2],[bx.x2,bx.y1],[bx.x2,bx.y2]].forEach(function(c){
      [bx.z1, bx.z2].forEach(function(z){
        var q = T([c[0], c[1], z]);
        if (q[0] < x1) x1 = q[0];
        if (q[0] > x2) x2 = q[0];
        if (q[1] < y1) y1 = q[1];
        if (q[1] > y2) y2 = q[1];
      });
    });
    return { x1: x1, y1: y1, x2: x2, y2: y2 };
  }
  /* 采样点的深度窗口：[lo, hi] 之外才是安全的。两条都是精确的射线判定：
       · 朝相机方向（+d3）被实心体挡住 → 必须排在它「之前」→ hi = 该盒最近处的深度
       · 否 则，朝场景里（-d3）能打到某个实心体 → 说明这个点正好落在它的轮廓内
         且点在它前面 → 必须排在它「之后」→ lo = 该盒最远处的深度
     都用射线而不是屏幕包围盒：包围盒会把「其实没压着」的情形误判成压着，
     于是同一个物件被两条互斥的约束夹住（2026-09-15 实测踩到）。 */
  /* 每个采样点给出三样东西：
       hi      —— 挡住它的那张面的深度（必须在它之前）
       loBox   —— 「压在实心体前面」的保守界：整个实心体的最远深度（一定盖住它）
       loRay   —— 同一件事的精确界：射线打到的那张面的深度（保守界与其它实心体
                  的约束打架时才用，见 resolveObjs） */
  function pointWindow(pt, hz){
    var loBox = -Infinity, loRay = -Infinity, hi = Infinity;
    var k0 = pt[0]*d3[0] + pt[1]*d3[1] + pt[2]*d3[2];
    /* 物件有竖向尺寸：车顶、车把这个高度才代表它的实际轮廓（轮心那一点常常刚好
       从实心体底边擦过，会漏判「其实压着」的情形）。 */
    var pUp = hz ? [pt[0], pt[1], pt[2] + hz] : null;
    for (var i = 0; i < occluders.length; i++){
      var ob = occluders[i];
      /* 预筛：物件采样点离实心体中心超过「半径 + 物件尺寸」时不可能相交 */
      var ddx = pt[0] - ob.mx, ddy = pt[1] - ob.my, ddz = pt[2] - ob.mz;
      var lim = ob.rad + hz + 0.6;
      if (ddx*ddx + ddy*ddy + ddz*ddz > lim*lim) continue;
      var tF = rayBoxEntryT(pt, ob.box, 0.03, 1);
      if (tF >= 0){
        if (k0 + tF - 0.02 < hi) hi = k0 + tF - 0.02;
        continue;
      }
      var tB = rayBoxEntryT(pt, ob.box, 0.03, -1);
      if (tB < 0 && pUp) tB = rayBoxEntryT(pUp, ob.box, 0.03, -1);
      if (tB >= 0){
        if (ob.rng.max + 0.02 > loBox) loBox = ob.rng.max + 0.02;
        var lo2 = k0 - tB + 0.02 + TILE * 0.5;
        if (lo2 > loRay) loRay = lo2;
      }
    }
    return { loBox: loBox, loRay: loRay, hi: hi, k: k0 };
  }
  var pendObjs = [], curObj = null;
  function objBegin(samples, hz){ curObj = { samples: samples, hz: hz || 0, parts: [] }; pendObjs.push(curObj); return curObj; }
  function objEnd(){ curObj = null; }
  /* 把一组部件的深度键塞进 [lo, hi]：优先刚性平移（不动内部前后关系），
     实在塞不下才压缩（窗口优先「被挡住」那一侧 = 实心体遮挡优先） */
  function fitWindow(kmin, kmax, lo, hi){
    /* 冲突（既被某实心体挡住、又「压」在另一实心体前面）：以射线结论为准 ——
       挡住是精确判定，「压在前面」只是屏幕包围盒的保守估计。 */
    if (hi < lo) lo = -Infinity;
    var span = kmax - kmin;
    if (kmin >= lo && kmax <= hi) return { base: kmin, scale: 1 };
    var shift = 0;
    if (kmin < lo) shift = lo - kmin;
    if (kmax + shift > hi) shift = hi - kmax;
    if (kmin + shift >= lo && kmax + shift <= hi) return { base: kmin + shift, scale: 1 };
    var a, b;
    if (hi === Infinity){ a = lo; b = lo + span; }
    else if (lo === -Infinity){ b = hi; a = hi - span; }
    else { a = Math.max(lo, hi - span); b = Math.min(hi, a + span); }
    return { base: a, scale: span > 1e-9 ? (b - a) / span : 0 };
  }
  function resolveObjs(){
    for (var oi = 0; oi < pendObjs.length; oi++){
      var o = pendObjs[oi];
      if (!o.parts.length) continue;
      var wins = o.samples.map(function(pt){ return pointWindow(pt, o.hz); });
      var groups = wins.map(function(){ return []; });
      for (var pi = 0; pi < o.parts.length; pi++){
        var p = o.parts[pi], bi = 0, bd = Infinity;
        for (var wi = 0; wi < wins.length; wi++){
          var dd = Math.abs(p.k - wins[wi].k);
          if (dd < bd){ bd = dd; bi = wi; }
        }
        groups[bi].push(p);
      }
      for (var gi = 0; gi < groups.length; gi++){
        var g = groups[gi];
        if (!g.length) continue;
        var kmin = Infinity, kmax = -Infinity;
        for (var j = 0; j < g.length; j++){ if (g[j].k < kmin) kmin = g[j].k; if (g[j].k > kmax) kmax = g[j].k; }
        /* 优先用保守界（整盒），它必然盖住该实心体；只有保守界与该点「被挡住」
           的界打架时，才退到射线精确界（不同实心体的深度区间会重叠）。 */
        var w = wins[gi];
        var lo = (w.loBox <= w.hi - 0.02) ? w.loBox : w.loRay;
        var m = fitWindow(kmin, kmax, lo, w.hi);
        for (var j2 = 0; j2 < g.length; j2++){
          L1.push({ k: m.base + (g[j2].k - kmin) * m.scale, s: g[j2].s });
        }
      }
    }
    pendObjs.length = 0;
  }

  /* keyOf（可选）：自定义深度键。附件（托臂 / 地架 / 挂钩）与挂车必须按「所属货架」
     排序，否则大货架面的平均深度会把它们盖住（2026-09-15 穿模修复）。
     tag（可选）：结构标记（data-struct="种类:id"），供回归测试核对画序。

     大面细分（2026-09-15 深度修复）：画家算法给每个多边形一个深度键，整块货架立面
     （7.5m × 3.3m）的「平均深度」与它局部真实深度能差 1m 以上 —— 挂在偏下位置的
     自行车、站在货架端头的散车都会被误判前后。这里把大于 TILE 的面切成小片，
     每片的深度误差 ≤ 半片长，画序才真正可靠；描边单独描一遍保持原来的外观。 */
  var TILE = 1.1;
  /* 单个面的细分绘制（boxAdd / quadBoxAdd 共用）：大面按 TILE 切片，每片一个深度键；
     同色 1px 描边防止相邻小片间出现发丝缝；最后整面再描一次边保持轮廓。 */
  function faceTiled(pts, fill, pal, op, keyOf, attr, noTile, solid){
    var isPattern = String(fill).indexOf('url(') === 0;
    var e1 = Math.sqrt(Math.pow(pts[1][0]-pts[0][0],2)+Math.pow(pts[1][1]-pts[0][1],2)+Math.pow(pts[1][2]-pts[0][2],2));
    var e2 = Math.sqrt(Math.pow(pts[2][0]-pts[1][0],2)+Math.pow(pts[2][1]-pts[1][1],2)+Math.pow(pts[2][2]-pts[1][2],2));
    /* 半透明面不细分：小片各自带 1px 同色描边，重叠处会叠加出网格缝 */
    var tiling = !noTile && op == null;
    var nu = tiling ? Math.max(1, Math.min(40, Math.ceil(e1 / TILE))) : 1;
    var nv = tiling ? Math.max(1, Math.min(40, Math.ceil(e2 / TILE))) : 1;
    if (nu === 1 && nv === 1){
      var k1 = avgDepth(pts); if (keyOf) k1 = keyOf(k1);
      /* solid：实心块的面不描外轮廓（轮廓由 hullPath 单独画一次），只留填充 */
      add1(k1, polyStr(pts, fill, solid ? null : pal.s, solid ? null : 0.9, op, attr));
      return;
    }
    for (var iu = 0; iu < nu; iu++){
      for (var iv = 0; iv < nv; iv++){
        var u0 = iu/nu, u1 = (iu+1)/nu, v0 = iv/nv, v1 = (iv+1)/nv;
        var a0 = [pts[0][0]+(pts[1][0]-pts[0][0])*u0, pts[0][1]+(pts[1][1]-pts[0][1])*u0, pts[0][2]+(pts[1][2]-pts[0][2])*u0];
        var b0 = [pts[3][0]+(pts[2][0]-pts[3][0])*u0, pts[3][1]+(pts[2][1]-pts[3][1])*u0, pts[3][2]+(pts[2][2]-pts[3][2])*u0];
        var a1 = [pts[0][0]+(pts[1][0]-pts[0][0])*u1, pts[0][1]+(pts[1][1]-pts[0][1])*u1, pts[0][2]+(pts[1][2]-pts[0][2])*u1];
        var b1 = [pts[3][0]+(pts[2][0]-pts[3][0])*u1, pts[3][1]+(pts[2][1]-pts[3][1])*u1, pts[3][2]+(pts[2][2]-pts[3][2])*u1];
        function lp(a, b, t){ return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t]; }
        var q = [lp(a0,b0,v0), lp(a1,b1,v0), lp(a1,b1,v1), lp(a0,b0,v1)];
        var k2 = avgDepth(q); if (keyOf) k2 = keyOf(k2);
        /* 同色描边 1px：相邻小片之间不留发丝缝（图案填充不描，避免纹理走样） */
        add1(k2, polyStr(q, fill, (isPattern || solid) ? null : fill, (isPattern || solid) ? null : 1, op, attr));
      }
    }
    if (solid) return;
    var k3 = avgDepth(pts) + 0.0004; if (keyOf) k3 = keyOf(k3);
    add1(k3, polyStr(pts, 'none', pal.s, 0.9, null, attr));
  }
  function avgDepth(pts){
    var k = 0;
    for (var i=0;i<pts.length;i++) k += dot(pts[i], d3);
    return k / pts.length;
  }
  function boxAdd(bx, pal, op, keyOf, tag, noTile, solid){
    var attr = tag ? ' data-struct="' + tag + '"' : '';
    function face(pts, fill){ faceTiled(pts, fill, pal, op, keyOf, attr, noTile, solid); }
    if (d3[2] >  1e-4) face([[bx.x1,bx.y1,bx.z2],[bx.x2,bx.y1,bx.z2],[bx.x2,bx.y2,bx.z2],[bx.x1,bx.y2,bx.z2]], pal.t);
    if (d3[0] >  1e-4) face([[bx.x2,bx.y1,bx.z1],[bx.x2,bx.y2,bx.z1],[bx.x2,bx.y2,bx.z2],[bx.x2,bx.y1,bx.z2]], pal.xp);
    if (d3[0] < -1e-4) face([[bx.x1,bx.y1,bx.z1],[bx.x1,bx.y2,bx.z1],[bx.x1,bx.y2,bx.z2],[bx.x1,bx.y1,bx.z2]], pal.xm);
    if (d3[1] >  1e-4) face([[bx.x1,bx.y2,bx.z1],[bx.x2,bx.y2,bx.z1],[bx.x2,bx.y2,bx.z2],[bx.x1,bx.y2,bx.z2]], pal.yp);
    if (d3[1] < -1e-4) face([[bx.x1,bx.y1,bx.z1],[bx.x2,bx.y1,bx.z1],[bx.x2,bx.y1,bx.z2],[bx.x1,bx.y1,bx.z2]], pal.ym);
  }
  /* 任意四边形底面的盒体（货架斜放，2026-09-17）：与 boxAdd 同一套细分 / 同色描边 /
     深度键规则，只是底面是旋转后的四边形。侧面可见性用「外法线 · 视线」判定，
     配色按外法线最接近的坐标轴取 —— 正交视角（rot=0）下与 boxAdd 完全一致。 */
  function quadBoxAdd(cs, z1, z2, pal, op, keyOf, tag, solid){
    var attr = tag ? ' data-struct="' + tag + '"' : '';
    function face(pts, fill){ faceTiled(pts, fill, pal, op, keyOf, attr, null, solid); }
    if (d3[2] > 1e-4){
      var top = [];
      for (var i2 = 0; i2 < 4; i2++) top.push([cs[i2].x, cs[i2].y, z2]);
      face(top, pal.t);
    }
    var cx = (cs[0].x + cs[1].x + cs[2].x + cs[3].x) / 4, cy = (cs[0].y + cs[1].y + cs[2].y + cs[3].y) / 4;
    for (var j = 0; j < 4; j++){
      var pa = cs[j], pb = cs[(j+1) % 4];
      var dx = pb.x - pa.x, dy = pb.y - pa.y;
      var nx = dy, ny = -dx;
      if (nx * ((pa.x+pb.x)/2 - cx) + ny * ((pa.y+pb.y)/2 - cy) < 0){ nx = -nx; ny = -ny; }
      if (nx * d3[0] + ny * d3[1] <= 1e-6) continue;
      var shade = (Math.abs(nx) >= Math.abs(ny)) ? (nx > 0 ? pal.xp : pal.xm) : (ny > 0 ? pal.yp : pal.ym);
      face([[pa.x,pa.y,z1],[pb.x,pb.y,z1],[pb.x,pb.y,z2],[pa.x,pa.y,z2]], shade);
    }
  }
  /* 实心块的可见外轮廓：8 个角投影后的凸包（正交投影下 = 立方体的剪影）。
     面的细分小片不描边之后由它一次性画外轮廓；轮廓再按 TILE 分段，每段带自己的
     深度键 —— 挡在货架前面的挂车 / 散车能正确压住轮廓，而不是被一条长线穿过。 */
  function hullPath(cs, z1, z2, stroke, sw){
    var entries = [];
    for (var hi = 0; hi < cs.length; hi++){
      entries.push({ w: [cs[hi].x, cs[hi].y, z1], s: T([cs[hi].x, cs[hi].y, z1]) });
      entries.push({ w: [cs[hi].x, cs[hi].y, z2], s: T([cs[hi].x, cs[hi].y, z2]) });
    }
    var uniq = [];
    entries.forEach(function(e){
      for (var ui = 0; ui < uniq.length; ui++){
        if (Math.abs(uniq[ui].s[0]-e.s[0]) < 1e-6 && Math.abs(uniq[ui].s[1]-e.s[1]) < 1e-6) return;
      }
      uniq.push(e);
    });
    if (uniq.length < 3) return;
    var cx0 = 0, cy0 = 0;
    uniq.forEach(function(e){ cx0 += e.s[0]; cy0 += e.s[1]; });
    cx0 /= uniq.length; cy0 /= uniq.length;
    uniq.sort(function(a, b){ return Math.atan2(a.s[1]-cy0, a.s[0]-cx0) - Math.atan2(b.s[1]-cy0, b.s[0]-cx0); });
    var startI = 0;
    for (var si = 1; si < uniq.length; si++){
      if (uniq[si].s[0] < uniq[startI].s[0] || (Math.abs(uniq[si].s[0]-uniq[startI].s[0]) < 1e-9 && uniq[si].s[1] < uniq[startI].s[1])) startI = si;
    }
    var loop = [], cur = startI, guard = 0;
    do {
      loop.push(uniq[cur]);
      var next = (cur + 1) % uniq.length;
      for (var ti = 0; ti < uniq.length; ti++){
        var turn = (uniq[cur].s[0]-uniq[ti].s[0])*(uniq[next].s[1]-uniq[ti].s[1]) - (uniq[cur].s[1]-uniq[ti].s[1])*(uniq[next].s[0]-uniq[ti].s[0]);
        if (turn < 0) next = ti;
      }
      cur = next; guard++;
    } while (cur !== startI && guard <= uniq.length);
    if (loop.length < 3) return;
    for (var ei = 0; ei < loop.length; ei++){
      var a = loop[ei], b = loop[(ei + 1) % loop.length];
      var dx = b.w[0]-a.w[0], dy = b.w[1]-a.w[1], dz = b.w[2]-a.w[2];
      var len = Math.sqrt(dx*dx + dy*dy + dz*dz);
      var n = Math.max(1, Math.min(40, Math.ceil(len / TILE)));
      for (var k = 0; k < n; k++){
        var p0 = [a.w[0]+dx*k/n, a.w[1]+dy*k/n, a.w[2]+dz*k/n];
        var p1 = [a.w[0]+dx*(k+1)/n, a.w[1]+dy*(k+1)/n, a.w[2]+dz*(k+1)/n];
        add1((dot(p0,d3)+dot(p1,d3))/2 + 0.0008, lineStr(p0, p1, stroke, sw));
      }
    }
  }

  function cornersBounds(cs){
    var x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (var i3 = 0; i3 < 4; i3++){
      if (cs[i3].x < x1) x1 = cs[i3].x; if (cs[i3].x > x2) x2 = cs[i3].x;
      if (cs[i3].y < y1) y1 = cs[i3].y; if (cs[i3].y > y2) y2 = cs[i3].y;
    }
    return { x1:x1, y1:y1, x2:x2, y2:y2 };
  }
  function prismAddN(corners, z1, z2, pal, op){
    var out2 = [], N2 = corners.length;
    if (d3[2] > 1e-4){
      var top2 = [];
      for (var t2=0;t2<N2;t2++) top2.push([corners[t2][0], corners[t2][1], z2]);
      out2.push(polyStr(top2, pal.t, pal.s, 0.9, op));
    }
    for (var i2=0;i2<N2;i2++){
      var a2 = corners[i2], b2 = corners[(i2+1)%N2];
      var dd = -(b2[1]-a2[1])*d3[0] + (b2[0]-a2[0])*d3[1];
      if (dd > 1e-6) out2.push(polyStr([[a2[0],a2[1],z1],[b2[0],b2[1],z1],[b2[0],b2[1],z2],[a2[0],a2[1],z2]], pal.xp, pal.s, 0.9, op));
      else if (dd < -1e-6) out2.push(polyStr([[a2[0],a2[1],z1],[b2[0],b2[1],z1],[b2[0],b2[1],z2],[a2[0],a2[1],z2]], pal.xm, pal.s, 0.9, op));
    }
    return out2.join('');
  }
  function addLine1(a, b, color, sw, dash){
    add1((dot(a,d3)+dot(b,d3))/2 + 0.001, lineStr(a, b, color, sw, dash));
  }
  function addLine2(a, b, color, sw, dash){
    add2((dot(a,d3)+dot(b,d3))/2, lineStr(a, b, color, sw, dash));
  }
  function addText(p, t, o){
    o = o || {};
    var q = T(p);
    add2(dot(p,d3)+0.02, '<text x="'+r2(q[0])+'" y="'+r2(q[1]+(o.dy||0))+'" font-size="'+(o.size||11)+'" fill="'+o.fill+'" text-anchor="middle"'
      + (o.weight ? ' font-weight="'+o.weight+'"' : '')
      + ' dominant-baseline="central" stroke="#ffffff" stroke-width="'+(o.halo != null ? o.halo : 3)+'" paint-order="stroke" stroke-linejoin="round">'+esc(t)+'</text>');
  }
  function addBadge(p, t, o){
    o = o || {};
    var q = T(p);
    var size = o.size || 10.5;
    var w = String(t).length*size*0.98 + 14, h2 = size + 9;
    var bx = q[0]-w/2, by = q[1]-h2/2 + (o.dy || 0);
    add2(dot(p,d3)+0.03, '<g><rect x="'+r2(bx)+'" y="'+r2(by)+'" width="'+r2(w)+'" height="'+r2(h2)+'" rx="4.5" fill="'+o.fill+'"'
      + (o.stroke ? ' stroke="'+o.stroke+'"' : '')
      + '/><text x="'+r2(q[0])+'" y="'+r2(by+h2/2+0.5)+'" font-size="'+size+'" fill="'+o.tfill+'" text-anchor="middle" dominant-baseline="central" font-weight="600">'+esc(t)+'</text></g>');
  }
  function addVText(p, lines, o){
    o = o || {};
    var q = T(p), size = o.size || 9.5, step = size+2.5, n = lines.length;
    var startY = q[1] - ((n-1)*step)/2 + (o.dy||0), s = '<g>';
    for (var i=0;i<n;i++){
      s += '<text x="'+r2(q[0])+'" y="'+r2(startY+i*step)+'" font-size="'+size+'" fill="'+o.fill+'" text-anchor="middle" dominant-baseline="central" stroke="#ffffff" stroke-width="2.6" paint-order="stroke">'+esc(lines[i])+'</text>';
    }
    add2(dot(p,d3)+0.03, s+'</g>');
  }

  /* ---------- 网面墙 ---------- */
  function addMeshWall(ms, h, t){
    h = h || 2.0; t = t || 0.06;
    var x = ms.x, y = ms.y, L = ms.len;
    if (ms.orient === 'v'){
      var mvBox = { x1:x-t/2, y1:y, x2:x+t/2, y2:y+L, z1:0, z2:h };
      occl(mvBox, 'mesh');
      boxAdd(mvBox, PAL.meshW, null, null, 'mesh');
      addLine1([x, y, h],[x, y+L, h], '#7f95a7', 1.2);
    } else {
      var mhBox = { x1:x, y1:y-t/2, x2:x+L, y2:y+t/2, z1:0, z2:h };
      occl(mhBox, 'mesh');
      boxAdd(mhBox, PAL.meshW, null, null, 'mesh');
      addLine1([x, y, h],[x+L, y, h], '#7f95a7', 1.2);
    }
  }

  /* ---------- 地台与地面 ---------- */
  var sk = '#e8e6e1';
  p0(polyStr([[0,0,0],[W,0,0],[W,0,-0.09],[0,0,-0.09]], sk, null));
  p0(polyStr([[0,D,0],[W,D,0],[W,D,-0.09],[0,D,-0.09]], sk, null));
  p0(polyStr([[0,0,0],[0,D,0],[0,D,-0.09],[0,0,-0.09]], sk, null));
  p0(polyStr([[W,0,0],[W,D,0],[W,D,-0.09],[W,0,-0.09]], sk, null));
  p0(polyStr([[0,0,0],[W,0,0],[W,D,0],[0,D,0]], '#ffffff', '#dad8d3', 1));

  /* ---------- 区域地面 ---------- */
  var st0 = cfg.studio;
  cfg.zones.forEach(function(z){
    var fill = z.kind==='storage' ? '#e8f0e1' : (z.kind==='passage' ? '#dceef0' : (z.kind==='test' ? '#fae7d0' : '#f2f0ea'));
    p0(polyStr([[z.x,z.y,0.004],[z.x+z.w,z.y,0.004],[z.x+z.w,z.y+z.h,0.004],[z.x,z.y+z.h,0.004]], fill, null, 0, 0.92));
  });
  cfg.zones.forEach(function(z){
    if (z.kind !== 'test') return;
    var P4 = [[z.x,z.y,0.008],[z.x+z.w,z.y,0.008],[z.x+z.w,z.y+z.h,0.008],[z.x,z.y+z.h,0.008]];
    for (var i4=0;i4<4;i4++) p0(lineStr(P4[i4], P4[(i4+1)%4], '#e2a96a', 1.2, '0.35 0.25'));
  });

  /* ---------- 0.5m 网格 ---------- */
  if (cfg.opt.grid){
    var gx2, gy2;
    for (gx2=0.5; gx2<W-1e-6; gx2+=0.5){
      var im = Math.abs(gx2-Math.round(gx2)) < 1e-6;
      p0(lineStr([gx2,0,0.002],[gx2,D,0.002], im?'#dedcd7':'#ebebe8', im?0.9:0.6));
    }
    for (gy2=0.5; gy2<D-1e-6; gy2+=0.5){
      var im2 = Math.abs(gy2-Math.round(gy2)) < 1e-6;
      p0(lineStr([0,gy2,0.002],[W,gy2,0.002], im2?'#dedcd7':'#ebebe8', im2?0.9:0.6));
    }
  }

  /* ---------- 区域描边 ---------- */
  cfg.zones.forEach(function(z){
    var stroke = z.kind==='storage' ? '#b7cdad' : (z.kind==='passage' ? '#a8ccd2' : (z.kind==='test' ? '#e2a96a' : '#d8d5cf'));
    p0(polyStr([[z.x,z.y,0.006],[z.x+z.w,z.y,0.006],[z.x+z.w,z.y+z.h,0.006],[z.x,z.y+z.h,0.006]], 'none', stroke, 1.1));
  });

  /* ---------- 出入口净空区 ---------- */
  (cfg.entrances || []).forEach(function(en){
    p0(polyStr([[en.x,en.y,0.005],[en.x+en.w,en.y,0.005],[en.x+en.w,en.y+en.h,0.005],[en.x,en.y+en.h,0.005]], '#f6cf9e', null, 0, 0.22));
    var P5 = [[en.x,en.y,0.0085],[en.x+en.w,en.y,0.0085],[en.x+en.w,en.y+en.h,0.0085],[en.x,en.y+en.h,0.0085]];
    for (var i5=0;i5<4;i5++) p0(lineStr(P5[i5], P5[(i5+1)%4], '#d8944a', 1.1, '0.4 0.28'));
  });

  /* ---------- 工作室地面 ---------- */
  p0(polyStr([[st0.x,st0.y,0.007],[st0.x+st0.w,st0.y,0.007],[st0.x+st0.w,st0.y+st0.h,0.007],[st0.x,st0.y+st0.h,0.007]], '#f6f3ec', '#cfc9bd', 1));

  /* ---------- 入口箭头 ---------- */
  function arrowDecal(cx, cy, dir, n, col){
    var px_ = [-dir[1], dir[0]];
    for (var i=0;i<n;i++){
      var off = (i-(n-1)/2) * 0.9;
      var bx = cx + px_[0]*off, by = cy + px_[1]*off;
      var tip = [bx + dir[0]*0.55, by + dir[1]*0.55];
      var l = [bx + px_[0]*0.18, by + px_[1]*0.18];
      var r = [bx - px_[0]*0.18, by - px_[1]*0.18];
      p0(polyStr([[tip[0],tip[1],0.012],[l[0],l[1],0.012],[r[0],r[1],0.012]], col, null, 0, 0.85));
    }
  }
  /* 开口箭头：位置走墙段变换；箭头朝向 = 该边「朝室内」的方向，随墙一起转 */
  var WALL_INWARD = { top:[0,1], bottom:[0,-1], left:[1,0], right:[-1,0] };
  WALL_SIDES.forEach(function(side){
    var we = cfg.walls[side];
    if (!we || !we.on) return;
    var wR = wallRot(cfg, side) * Math.PI / 180, wCa = Math.cos(wR), wSa = Math.sin(wR);
    var base = WALL_INWARD[side];
    var dir = [base[0]*wCa - base[1]*wSa, base[0]*wSa + base[1]*wCa];
    (we.open || []).forEach(function(o){
      var at = Math.min(+o.at || 0, Math.max(0, wallLength(cfg, side) - (+o.w || 0)));
      var wp = wallPt(cfg, side, at + (+o.w || 0)/2, 0.75);
      arrowDecal(wp.x, wp.y, dir, 2, (side === 'top' || side === 'bottom') && o.type === 'main' ? '#e05252' : '#45a7b3');
    });
  });
  cfg.wallSegs.forEach(function(ws){
    if (ws.orient==='v' && ws.to < D-WALL_T-0.6){
      p0(polyStr([[ws.at-0.5,ws.to,0.010],[ws.at,ws.to,0.010],[ws.at,D-WALL_T,0.010],[ws.at-0.5,D-WALL_T,0.010]], '#dceef0', null, 0, 0.85));
      arrowDecal(ws.at-1.0, (ws.to+D-WALL_T)/2, [-1,0], 2, '#45a7b3');
    }
  });

  /* ---------- 外墙 ---------- */
  var H = heightByMode(cfg.opt.wallH);
  var wallOp = trans ? 0.55 : null;
  function wallBox(x1,y1,x2,y2){ return { x1:x1, y1:y1, x2:x2, y2:y2, z1:0, z2:H }; }
  /* 外墙不做细分：外墙是房间边界，不会有东西在它「后面」需要被它挡住，
     细分只增加体积（单面 23m × 2.6m 会切成 60+ 片）。 */
  WALL_SIDES.forEach(function(side){
    var we = cfg.walls[side];
    if (!we || !we.on) return;
    var wRot = wallRot(cfg, side);
    wallSegSpans(cfg, side).forEach(function(sg){
      if (!wRot){
        var w1 = wallPt(cfg, side, sg[0], 0), w2 = wallPt(cfg, side, sg[1], WALL_T);
        boxAdd(wallBox(Math.min(w1.x,w2.x), Math.min(w1.y,w2.y), Math.max(w1.x,w2.x), Math.max(w1.y,w2.y)),
               PAL.wall, wallOp, null, 'wall:' + side, true);
      } else {
        quadBoxAdd(wallBandCorners(cfg, side, sg[0], sg[1]), 0, H, PAL.wall, wallOp, null, 'wall:' + side);
      }
    });
  });

  /* ---------- 内隔墙 ---------- */
  cfg.wallSegs.forEach(function(ws){
    var a = Math.min(ws.from, ws.to), b = Math.max(ws.from, ws.to);
    if (wallSegRot(ws)){
      /* 斜的内隔墙（2026-09-17 用户要求：墙体也可以横放 / 竖放 / 旋转） */
      quadBoxAdd(wallSegCorners(ws), 0, H, PAL.wall, wallOp, null, 'wallseg:' + ws.id);
    } else if (ws.orient==='v') boxAdd(wallBox(ws.at-ws.thick/2, a, ws.at+ws.thick/2, b), PAL.wall, wallOp);
    else boxAdd(wallBox(a, ws.at-ws.thick/2, b, ws.at+ws.thick/2), PAL.wall, wallOp);
  });

  /* ---------- 柱子 ---------- */
  cfg.pillars.forEach(function(p){
    var s = p.s || 1.0;
    var pBox = { x1:p.x-s/2, y1:p.y-s/2, x2:p.x+s/2, y2:p.y+s/2, z1:0, z2:2.6 };
    occl(pBox, 'pillar');
    boxAdd(pBox, PAL.pillar, null, null, 'pillar');
  });

  /* ---------- 库区围栏 ---------- */
  cfg.zones.forEach(function(z){
    if (z.kind !== 'storage' || !z.fence) return;
    var FS = {
      n: ['h', z.x, z.x+z.w, z.y],
      s: ['h', z.x, z.x+z.w, z.y+z.h],
      w: ['v', z.y, z.y+z.h, z.x],
      e: ['v', z.y, z.y+z.h, z.x+z.w]
    };
    ['n','s','w','e'].forEach(function(sd){
      var f = z.fence[sd], g = FS[sd];
      if (!f || f==='none' || !g) return;
      var t = 0.12;
      if (f === 'wall'){
        var fBox = (g[0]==='h')
          ? { x1:g[1], y1:g[3]-t/2, x2:g[2], y2:g[3]+t/2, z1:0, z2:0.9 }
          : { x1:g[3]-t/2, y1:g[1], x2:g[3]+t/2, y2:g[2], z1:0, z2:0.9 };
        occl(fBox, 'fence');
        boxAdd(fBox, PAL.fence);
      } else if (f === 'mesh'){
        if (g[0]==='h') addMeshWall({ x:g[1], y:g[3], len:g[2]-g[1], orient:'h' }, 2.4, 0.26);
        else addMeshWall({ x:g[3], y:g[1], len:g[2]-g[1], orient:'v' }, 2.4, 0.26);
      }
    });
  });

  /* ---------- 工作室 ---------- */
  var stH = st0.wallH || 2.2;
  var stOp = trans ? 0.6 : null;
  var sN = st0.y, sS = st0.y+st0.h, sW = st0.x, sE = st0.x+st0.w, stT = 0.09;
  function stSideBox(x1,y1,x2,y2,z1,z2){
    var b = { x1:x1, y1:y1, x2:x2, y2:y2, z1:(z1||0), z2:(z2==null?stH:z2) };
    occl(b, 'studio');
    boxAdd(b, PAL.studio, stOp, null, 'studio');
  }
  function stGlassBox(x1,y1,x2,y2,z1,z2){ boxAdd({ x1:x1, y1:y1, x2:x2, y2:y2, z1:z1, z2:z2 }, PAL.glass, 0.45); }
  var doorW = st0.doorW || 1.2;
  var winA = 0.85, winB = Math.min(1.85, stH-0.2);
  if (winB < winA + 0.4) winB = stH;
  ['n','e','s','w'].forEach(function(sd){
    var t = st0.sides[sd];
    if (t === 'none') return;
    var horiz = (sd==='n' || sd==='s');
    var yy = sd==='n' ? sN : sS;
    var xx = sd==='w' ? sW : sE;
    if (t === 'wall'){
      if (horiz) stSideBox(sW, yy-stT/2, sE, yy+stT/2);
      else stSideBox(xx-stT/2, sN, xx+stT/2, sS);
    } else if (t === 'window'){
      if (horiz){
        stSideBox(sW, yy-stT/2, sE, yy+stT/2, 0, winA);
        stGlassBox(sW, yy-stT/2, sE, yy+stT/2, winA, winB);
        stSideBox(sW, yy-stT/2, sE, yy+stT/2, winB, stH);
      } else {
        stSideBox(xx-stT/2, sN, xx+stT/2, sS, 0, winA);
        stGlassBox(xx-stT/2, sN, xx+stT/2, sS, winA, winB);
        stSideBox(xx-stT/2, sN, xx+stT/2, sS, winB, stH);
      }
    } else if (t === 'door'){
      if (horiz){
        var mid = (sW+sE)/2, a1 = mid-doorW/2, b1 = mid+doorW/2;
        stSideBox(sW, yy-stT/2, a1, yy+stT/2);
        stSideBox(b1, yy-stT/2, sE, yy+stT/2);
      } else {
        var mid2 = (sN+sS)/2, a2 = mid2-doorW/2, b2 = mid2+doorW/2;
        stSideBox(xx-stT/2, sN, xx+stT/2, a2);
        stSideBox(xx-stT/2, b2, xx+stT/2, sS);
      }
    } else if (t === 'mesh'){
      if (horiz) addMeshWall({ x:sW, y:yy, len:sE-sW, orient:'h' }, stH, 0.08);
      else addMeshWall({ x:xx, y:sN, len:sS-sN, orient:'v' }, stH, 0.08);
    }
  });
  /* 洞洞板 */
  if (st0.peg && st0.peg.on){
    var psd = st0.peg.side || 'e', PW = 1.4, PG = 0.1, PN = Math.max(1, Math.round(st0.peg.panels || 2));
    var totalP = PN*PW + (PN-1)*PG;
    var zA = 0.9, zB = Math.min(2.1, stH-0.05);
    var dirMap = { n:1, s:-1, w:1, e:-1 };
    var sgn = (st0.peg.face === 'out' ? -1 : 1) * dirMap[psd];
    var vertical = (psd==='w' || psd==='e');
    var cAlong = vertical ? (sN+sS)/2 : (sW+sE)/2;
    var cFixed = vertical ? (psd==='e' ? sE : sW) : (psd==='s' ? sS : sN);
    var startA = cAlong - totalP/2;
    for (var pi=0; pi<PN; pi++){
      var a0 = startA + pi*(PW+PG), a1 = a0 + PW;
      if (vertical){
        var xxp = cFixed + sgn*0.14;
        boxAdd({ x1:xxp-0.025, y1:a0, x2:xxp+0.025, y2:a1, z1:zA, z2:zB }, PAL.peg);
      } else {
        var yyp = cFixed + sgn*0.14;
        boxAdd({ x1:a0, y1:yyp-0.025, x2:a1, y2:yyp+0.025, z1:zA, z2:zB }, PAL.peg);
      }
    }
  }

  /* ---------- 货架 ---------- */
  /* 货架是「实心体」：登记成遮挡体后，托臂 / 挂车 / 地架 / 挂钩 / 散车都用射线
     判断自己在它的哪一侧，不再依赖「相机在哪一侧」的近似（那套在双面货架、
     多货架、柱子旁边都会出错）。 */
  cfg.shelves.forEach(function(s){
    var d = shelfDepth(s), pal = s.kind==='double' ? PAL.shelfD : (s.kind==='single' ? PAL.shelfS : PAL.shelfLow);
    var hS = s.h || SHELF_H_DEFAULT;
    if (shelfRot(s)){
      /* 斜放货架（2026-09-17）：底面是旋转后的四边形，不能再走 AABB 的 boxAdd。 */
      var cs = shelfCorners(s), bb = cornersBounds(cs);
      occl({ x1:bb.x1, y1:bb.y1, x2:bb.x2, y2:bb.y2, z1:0, z2:hS }, 'shelf:' + s.id);
      /* 实心块（用户 2026-09-17：整个货架改成实心的）：面只有填充，外轮廓一次画成 */
      quadBoxAdd(cs, 0, hS, pal, null, null, 'shelf:' + s.id, true);
      hullPath(cs, 0, hS, pal.s, 0.9);
      return;
    }
    var rx1, ry1, rx2, ry2;
    if (s.orient === 'v'){ rx1=s.x; ry1=s.y; rx2=s.x+d; ry2=s.y+s.len; }
    else { rx1=s.x; ry1=s.y; rx2=s.x+s.len; ry2=s.y+d; }
    var sBox = { x1:rx1, y1:ry1, x2:rx2, y2:ry2, z1:0, z2:hS };
    occl(sBox, 'shelf:' + s.id);
    /* 实心块（用户 2026-09-17）：旧的木纹线 / 层板线都在面之外（面平面 ±0.015m）
       逐条拖长 7.5m 画，单条线只有一个深度键 → 两端与切缝处会穿出面外，
       看起来就是「裸露的线条」。现在面只填充，外轮廓由 hullPath 一次画成。 */
    boxAdd(sBox, pal, null, null, 'shelf:' + s.id, null, true);
    hullPath([{ x:rx1, y:ry1 }, { x:rx2, y:ry1 }, { x:rx2, y:ry2 }, { x:rx1, y:ry2 }], 0, hS, pal.s, 0.9);
  });

  /* ---------- 货架陈列附件（托臂 / 地架 / 挂钩） ---------- */
  var PAL_ACC = { t:'#cdd2d7', xp:'#bcc2c8', xm:'#b3b9bf', yp:'#d3d7db', ym:'#c2c7cc', s:'#8f959b' };
  cfg.shelves.forEach(function(s){
    var a2 = accOf(s);
    if (!accOn(s)) return;
    var hS2 = s.h || 1.5;
    /* 托臂（短 0.5m / 长 1m，可多排、每排高度可调）：臂从架面伸出，外端挡钩托住车轮 */
    armHardwareOf(cfg, s).forEach(function(hw){
      if (shelfRot(s)){
        /* 斜放：托臂 / 挡钩按货架局部盒旋转（45° 时包 AABB 会变成肥方块） */
        var tLo = Math.min(hw.local.t0, hw.local.t1) - 0.026, tHi = Math.max(hw.local.t0, hw.local.t1) + 0.026;
        var sgnT = (hw.local.t1 >= hw.local.t0) ? 1 : -1;
        var aCorners = shelfLocalBoxCorners(s, hw.local.u - 0.026, hw.local.u + 0.026, tLo, tHi);
        var cd0 = hw.local.cradleT - 0.026, cd1 = hw.local.cradleT + 0.026;
        var cCorners = shelfLocalBoxCorners(s, hw.local.u - 0.026, hw.local.u + 0.026, cd0, cd1);
        var aMid = shelfLocalPt(s, hw.local.u, (hw.local.t0 + hw.local.t1) / 2);
        var cMid = shelfLocalPt(s, hw.local.u, hw.local.cradleT);
        objBegin([[aMid.x, aMid.y, hw.z - 0.028], [cMid.x, cMid.y, hw.z + 0.045]], 0.06);
        quadBoxAdd(aCorners, hw.z - 0.05, hw.z - 0.006, PAL_ACC);
        quadBoxAdd(cCorners, hw.z - 0.01, hw.z + 0.10, PAL_ACC);
        return;
      }
      var aBox = { x1: Math.min(hw.inner.x, hw.tip.x) - 0.026, y1: Math.min(hw.inner.y, hw.tip.y) - 0.026,
                   x2: Math.max(hw.inner.x, hw.tip.x) + 0.026, y2: Math.max(hw.inner.y, hw.tip.y) + 0.026,
                   z1: hw.z - 0.05, z2: hw.z - 0.006 };
      var cBox = { x1: hw.cradle.x - 0.026, y1: hw.cradle.y - 0.026, x2: hw.cradle.x + 0.026, y2: hw.cradle.y + 0.026,
                   z1: hw.z - 0.01, z2: hw.z + 0.10 };
      objBegin([boxMid(aBox), boxMid(cBox)], 0.06);
      boxAdd(aBox, PAL_ACC);
      boxAdd(cBox, PAL_ACC);
    });
    /* 地架：地面托条 + 前端挡块（可指定面，或两面都装） */
    if (a2.rack !== 'none'){
      var nR = rackCount(s);
      resolveFaces(s, cfg, a2.rackSide).forEach(function(faceR){
        for (var jR = 0; jR < nR; jR++){
          var uR = (jR + 0.5) * s.len / nR;
          if (shelfRot(s)){
            var t0R = accLocalT(s, 0, faceR), t1R = accLocalT(s, 0.41, faceR);
            var t0S = accLocalT(s, 0.265, faceR), t1S = accLocalT(s, 0.375, faceR);
            var rCorners = shelfLocalBoxCorners(s, uR - 0.05, uR + 0.05, Math.min(t0R, t1R), Math.max(t0R, t1R));
            var sCorners = shelfLocalBoxCorners(s, uR - 0.055, uR + 0.055, Math.min(t0S, t1S), Math.max(t0S, t1S));
            var rMid = shelfLocalPt(s, uR, (t0R + t1R) / 2), sMid = shelfLocalPt(s, uR, (t0S + t1S) / 2);
            objBegin([[rMid.x, rMid.y, 0.035], [sMid.x, sMid.y, 0.145]], 0.12);
            quadBoxAdd(rCorners, 0, 0.07, PAL_ACC);
            quadBoxAdd(sCorners, 0.07, 0.22, PAL_ACC);
            continue;
          }
          var paR = accPos(s, uR, 0.05, faceR), pbR = accPos(s, uR, 0.36, faceR);
          var pcR = accPos(s, uR, 0.32, faceR);
          var rBox = { x1: Math.min(paR.x,pbR.x)-0.05, y1: Math.min(paR.y,pbR.y)-0.05,
                       x2: Math.max(paR.x,pbR.x)+0.05, y2: Math.max(paR.y,pbR.y)+0.05, z1: 0, z2: 0.07 };
          var rStub = { x1: pcR.x-0.055, y1: pcR.y-0.055, x2: pcR.x+0.055, y2: pcR.y+0.055, z1: 0.07, z2: 0.22 };
          objBegin([boxMid(rBox), boxMid(rStub)], 0.12);
          boxAdd(rBox, PAL_ACC);
          boxAdd(rStub, PAL_ACC);
        }
      });
    }
    /* 挂钩：前缘横杆 + 每米 4 个 J 形小钩（可指定面，或两面都装） */
    if (a2.hook === 'on'){
      var nH = hookCount(s), ztH = hS2 + 0.03;
      resolveFaces(s, cfg, a2.hookSide).forEach(function(faceH){
        var hTip = accPos(s, s.len / 2, 0.15, faceH);
        if (shelfRot(s)){
          var t0H = accLocalT(s, 0.08 - 0.026, faceH), t1H = accLocalT(s, 0.08 + 0.026, faceH);
          var hCorners = shelfLocalBoxCorners(s, 0.05 - 0.026, s.len - 0.05 + 0.026, Math.min(t0H, t1H), Math.max(t0H, t1H));
          var hMid = shelfLocalPt(s, s.len / 2, (t0H + t1H) / 2);
          objBegin([[hMid.x, hMid.y, ztH], [hTip.x, hTip.y, ztH - 0.12]], 0.10);
          quadBoxAdd(hCorners, ztH - 0.026, ztH + 0.026, PAL_ACC);
        } else {
          var pAH = accPos(s, 0.05, 0.08, faceH), pBH = accPos(s, s.len - 0.05, 0.08, faceH);
          var hRail = { x1: Math.min(pAH.x,pBH.x)-0.026, y1: Math.min(pAH.y,pBH.y)-0.026,
                        x2: Math.max(pAH.x,pBH.x)+0.026, y2: Math.max(pAH.y,pBH.y)+0.026,
                        z1: ztH-0.026, z2: ztH+0.026 };
          objBegin([boxMid(hRail), [hTip.x, hTip.y, ztH - 0.12]], 0.10);
          boxAdd(hRail, PAL_ACC);
        }
        for (var kH = 0; kH < nH; kH++){
          var uH = (kH + 0.5) * s.len / nH;
          var phH = accPos(s, uH, 0.08, faceH), peH = accPos(s, uH, 0.15, faceH);
          var kHook = phH.x * d3[0] + phH.y * d3[1] + (ztH - 0.11) * d3[2];
          add1(kHook, lineStr([phH.x, phH.y, ztH-0.03], [phH.x, phH.y, ztH-0.12], '#7c8288', 0.7));
          add1(kHook, lineStr([phH.x, phH.y, ztH-0.12], [peH.x, peH.y, ztH-0.19], '#7c8288', 0.7));
        }
        objEnd();
      });
    }
  });

  /* ---------- 独立网面墙 ---------- */
  cfg.meshes.forEach(function(ms){ addMeshWall(ms, ms.h || 2.0); });

  /* ---------- 门帘 ---------- */
  (cfg.curtains || []).forEach(function(ct){
    var hh = ct.h || 1.9, t2 = 0.05;
    if (ct.orient === 'v') boxAdd({ x1:ct.x-t2, y1:ct.y, x2:ct.x+t2, y2:ct.y+ct.len, z1:0, z2:hh }, PAL.curt, 0.9);
    else boxAdd({ x1:ct.x, y1:ct.y-t2, x2:ct.x+ct.len, y2:ct.y+t2, z1:0, z2:hh }, PAL.curt, 0.9);
  });

  /* ---------- 自行车（立体车模：车轮/车架/车把，车头45°倾斜） ---------- */
  function circlePtsH(cx2, cy2, z2, r2, dirDeg){
    var a2 = dirDeg*Math.PI/180, ca2 = Math.cos(a2), sa2 = Math.sin(a2);
    var pts = [];
    for (var i=0;i<16;i++){
      var t = i/16*Math.PI*2, ct = Math.cos(t)*r2, st = Math.sin(t)*r2;
      pts.push([ cx2 + ct*ca2 - st*sa2, cy2 + ct*sa2 + st*ca2, z2 ]);
    }
    return pts;
  }
  function ringPath(outer, inner){
    function pp(list){ var arr=[]; for (var i2=0;i2<list.length;i2++){ var q=T(list[i2]); arr.push((i2?'L':'M')+r2(q[0])+' '+r2(q[1])); } return arr.join('')+'Z'; }
    return pp(outer)+pp(inner);
  }
  var PAL_RIM = { t:'#eef0f1', xp:'#e3e6e8', xm:'#dde0e2', yp:'#e8ebed', ym:'#e1e4e6', s:'#b9bec2' };
  /* 货架附件车（托臂 / 地架）与散车一起渲染：pose 仅区分 top（平放）与其余（立体车） */
  var skipBike = view.skipBike ? String(view.skipBike) : null;
  (cfg.bikes || []).concat(accBikesOf(cfg)).forEach(function(bk){
    if (skipBike && String(bk.id) === skipBike) return;   /* 审计 / 测试用：消融渲染（不画这一台） */
    var btype = (bk.type === 'kids') ? 'kids' : 'adult';
    var scl = (btype === 'kids') ? 0.78 : 1.0;
    var pose = (bk.pose === 'top') ? 'top' : 'stand';
    var rotD = (bk.rot != null) ? bk.rot : (bk.angle != null ? bk.angle : 0);
    var steerD = (bk.steer != null) ? bk.steer : 45;
    var col = (btype === 'kids') ? PAL.bikeK : PAL.bikeA;
    var tireCol = (btype === 'kids') ? '#a86f28' : '#3a3f45';
    var cx3 = bk.x, cy3 = bk.y;
    var baseZ = 0;
    if (pose === 'top'){
      var hz = SHELF_H_DEFAULT;
      for (var si2=0; si2<cfg.shelves.length; si2++){
        var rcSi = shelfRect(cfg.shelves[si2]);
        if (cx3 > rcSi.x-0.15 && cx3 < rcSi.x+rcSi.w+0.15 && cy3 > rcSi.y-0.15 && cy3 < rcSi.y+rcSi.h+0.15){ hz = cfg.shelves[si2].h || SHELF_H_DEFAULT; break; }
      }
      baseZ = hz + 0.015;
    } else if (bk.lift != null){
      baseZ = bk.lift;
    }
    var ra = rotD*Math.PI/180, rca = Math.cos(ra), rsa = Math.sin(ra);
    function loc(px, py, pz){ return [ cx3 + (px*rca - py*rsa)*scl, cy3 + (px*rsa + py*rca)*scl, baseZ + (pz||0)*scl ]; }
    var bikeParts = [];
    function bp(k2, str2){ bikeParts.push({ k:k2, s:str2 }); }
    function bar3(A, B, w){
      var a = loc(A[0],A[1],A[2]), b = loc(B[0],B[1],B[2]);
      var dx = b[0]-a[0], dy = b[1]-a[1], dz = b[2]-a[2];
      var lx2 = -rsa, ly2 = rca;
      var nx = -dz*ly2, ny = dz*lx2, nz = dx*ly2 - dy*lx2;
      var nl = Math.sqrt(nx*nx+ny*ny+nz*nz) || 1; nx/=nl; ny/=nl; nz/=nl;
      var hw2 = w*scl/2;
      bp((dot(a,d3)+dot(b,d3))/2 + 0.004, polyStr([[a[0]+nx*hw2,a[1]+ny*hw2,a[2]+nz*hw2],[b[0]+nx*hw2,b[1]+ny*hw2,b[2]+nz*hw2],[b[0]-nx*hw2,b[1]-ny*hw2,b[2]-nz*hw2],[a[0]-nx*hw2,a[1]-ny*hw2,a[2]-nz*hw2]], col.t, col.s, 0.6));
    }
    if (pose !== 'top'){
      function wheel(C, dirDeg, r2x){
        var aa = dirDeg*Math.PI/180, caa = Math.cos(aa), saa = Math.sin(aa);
        var out2 = [], inn2 = [];
        for (var i3=0;i3<16;i3++){
          var t2 = i3/16*Math.PI*2, ct2 = Math.cos(t2), st2 = Math.sin(t2);
          out2.push([ C[0] + ct2*r2x*caa, C[1] + ct2*r2x*saa, C[2] + st2*r2x ]);
          inn2.push([ C[0] + ct2*r2x*0.55*caa, C[1] + ct2*r2x*0.55*saa, C[2] + st2*r2x*0.55 ]);
        }
        bp(dot(C,d3) + 0.002, '<path d="' + ringPath(out2, inn2) + '" fill="' + tireCol + '" fill-rule="evenodd" fill-opacity="0.96"/>');
        var qh = T(C);
        bp(dot(C,d3) + 0.006, '<circle cx="'+r2(qh[0])+'" cy="'+r2(qh[1])+'" r="'+r2(Math.max(0.9, 0.05*scl*sc))+'" fill="'+col.s+'"/>');
      }
      var rw = 0.35*scl;
      wheel(loc(-0.55, 0, 0.35), rotD, rw);
      wheel(loc(0.55, 0, 0.35), rotD + steerD, rw);
      bar3([-0.26,0,0.90], [0.40,0,0.86], 0.07);
      bar3([-0.10,0,0.33], [0.40,0,0.84], 0.08);
      bar3([-0.10,0,0.33], [-0.26,0,0.90], 0.07);
      bar3([-0.10,0,0.33], [-0.55,0,0.35], 0.05);
      bar3([-0.26,0,0.90], [-0.55,0,0.35], 0.05);
      bar3([0.42,0,0.86], [0.55,0,0.35], 0.06);
      bar3([0.42,0,0.86], [0.50,0,0.99], 0.06);
      var hb = loc(0.50, 0, 0.99);
      var hbA = (rotD + steerD)*Math.PI/180, hx = Math.cos(hbA), hy = Math.sin(hbA);
      var px2 = -hy, py2 = hx, hbw = 0.24*scl, hbt = 0.028*scl;
      bp(dot(hb,d3)+0.02, prismAddN([
        [hb[0]-px2*hbw-hx*hbt, hb[1]-py2*hbw-hy*hbt],[hb[0]+px2*hbw-hx*hbt, hb[1]+py2*hbw-hy*hbt],
        [hb[0]+px2*hbw+hx*hbt, hb[1]+py2*hbw+hy*hbt],[hb[0]-px2*hbw+hx*hbt, hb[1]-py2*hbw+hy*hbt]
      ], hb[2]-0.02, hb[2]+0.02, col));
      var sd = loc(-0.28, 0, 0.93);
      var sdx = rca*0.14*scl, sdy = rsa*0.14*scl, sdpx = -rsa*0.07*scl, sdpy = rca*0.07*scl;
      bp(dot(sd,d3)+0.02, prismAddN([
        [sd[0]-sdx-sdpx, sd[1]-sdy-sdpy],[sd[0]+sdx-sdpx, sd[1]+sdy-sdpy],
        [sd[0]+sdx+sdpx, sd[1]+sdy+sdpy],[sd[0]-sdx+sdpx, sd[1]-sdy+sdpy]
      ], sd[2]-0.012, sd[2]+0.022, col));
    } else {
      function disc(C, dirDeg, r2x){
        bp(dot(C,d3)-0.02, prismAddN(circlePtsH(C[0], C[1], C[2], r2x, dirDeg), C[2]-0.028, C[2]+0.018, col));
        bp(dot(C,d3)+0.01, prismAddN(circlePtsH(C[0], C[1], C[2]+0.02, r2x*0.55, dirDeg), C[2]+0.018, C[2]+0.03, PAL_RIM));
        var qh2 = T([C[0], C[1], C[2]+0.035]);
        bp(dot(C,d3) + 0.02, '<circle cx="'+r2(qh2[0])+'" cy="'+r2(qh2[1])+'" r="'+r2(Math.max(0.9, 0.045*scl*sc))+'" fill="'+col.s+'"/>');
      }
      var rw2 = 0.35*scl;
      disc(loc(-0.55, 0, 0.05), rotD, rw2);
      disc(loc(0.55, 0, 0.05), rotD + steerD, rw2);
      function flatBar(A, B, w){
        var a = loc(A[0],A[1],A[2]), b = loc(B[0],B[1],B[2]);
        var dx = b[0]-a[0], dy = b[1]-a[1];
        var L2 = Math.sqrt(dx*dx+dy*dy) || 1, ux = dx/L2, uy = dy/L2;
        var pxx = -uy, pyy = ux, hw3 = w*scl/2;
        bp((dot(a,d3)+dot(b,d3))/2 + 0.005, prismAddN([
          [a[0]+pxx*hw3, a[1]+pyy*hw3],[b[0]+pxx*hw3, b[1]+pyy*hw3],
          [b[0]-pxx*hw3, b[1]-pyy*hw3],[a[0]-pxx*hw3, a[1]-pyy*hw3]
        ], a[2]-0.008, a[2]+0.05, col));
      }
      flatBar([-0.55,0,0.05],[0.55,0,0.05], 0.08);
      var hbB = loc(0.55, 0, 0.05);
      var hbA2 = (rotD + steerD)*Math.PI/180, hx2 = Math.cos(hbA2), hy2 = Math.sin(hbA2);
      var px4 = -hy2, py4 = hx2, hbw2 = 0.22*scl;
      bp(dot(hbB,d3)+0.015, prismAddN([
        [hbB[0]-px4*hbw2, hbB[1]-py4*hbw2],[hbB[0]+px4*hbw2, hbB[1]+py4*hbw2],
        [hbB[0]+px4*hbw2+hx2*0.06*scl, hbB[1]+py4*hbw2+hy2*0.06*scl],[hbB[0]-px4*hbw2+hx2*0.06*scl, hbB[1]-py4*hbw2+hy2*0.06*scl]
      ], hbB[2], hbB[2]+0.05, col));
      var sd2 = loc(-0.30, 0, 0.05);
      bp(dot(sd2,d3)+0.015, prismAddN(circlePtsH(sd2[0], sd2[1], sd2[2], 0.10*scl, rotD), sd2[2]+0.04, sd2[2]+0.075, col));
    }
    /* 整台车作为一个「摆件」交给实心遮挡算法：沿车身取 5 个采样点（前后轮 /
       车架 / 车把 / 车座），逐段判断是被实心体挡住还是挡在它前面 ——
       被柱子挡住一半的车、挂在货架另一面的车都会各归各位（2026-09-15）。 */
    var bId = esc(bk.id || '');
    objBegin([
      loc(-0.55, 0, 0.35), loc(0.55, 0, 0.35), loc(0, 0, 0.18),
      loc(0.55, 0, 0.85), loc(-0.30, 0, 0.90)
    ], 0.55 * scl);
    for (var ip = 0; ip < bikeParts.length; ip++){
      var pI = bikeParts[ip];
      var extra = (ip === 0)
        ? (' data-lift="' + (bk.lift != null ? esc(bk.lift) : '') + '"' + (bk.acc ? ' data-acc="' + esc(bk.acc) + '"' : ''))
        : '';
      add1(pI.k, '<g data-bike="' + bId + '"' + extra + '>' + pI.s + '</g>');
    }
    objEnd();
  });

  /* ---------- 标记 ---------- */
  var MKCOL = { red:['#e05252','#c23b3b'], yellow:['#f2d444','#d8b52c'], green:['#a9dd8b','#7fbe5f'], blue:['#7fb3e8','#5b93cd'] };
  cfg.markers.forEach(function(mk){
    var col = MKCOL[mk.color] || MKCOL.red;
    var mBox = { x1:mk.x, y1:mk.y, x2:mk.x+mk.w, y2:mk.y+mk.h, z1:0, z2:0.07 };
    objBegin([boxMid(mBox)], 0.04);
    boxAdd(mBox, { t:col[0], xp:col[1], xm:col[1], yp:col[1], ym:col[1], s:col[1] });
    objEnd();
  });

  /* ---------- 尺寸链 ---------- */
  /* 2026-09-17 修「货架穿模 / 细线露出」：标尺此前走 L2（标注层，永远画在结构之后
     = 盖在货架之上），货架旁的刻度线和小数字会透过货架显示。现在整条尺寸链改走
     L1 深度排序 —— 长线按 TILE 分段（与 boxAdd 的大面细分同一口径，否则一根 23m
     的线只有一个深度键，还是会穿过货架），数字用所在点的深度键。 */
  if (cfg.opt.dims){
    var off = 0.55, tick = 0.13, col = '#a3a3a3', colT = '#8b8b8b';
    function dimLine(a, b, sw){
      var dx = b[0]-a[0], dy = b[1]-a[1];
      var len = Math.sqrt(dx*dx + dy*dy);
      var n = Math.max(1, Math.ceil(len / TILE));
      for (var i=0;i<n;i++){
        var p0 = [a[0]+dx*i/n, a[1]+dy*i/n, a[2]];
        var p1 = [a[0]+dx*(i+1)/n, a[1]+dy*(i+1)/n, b[2]];
        add1((dot(p0,d3)+dot(p1,d3))/2, lineStr(p0, p1, col, sw));
      }
    }
    function dimText(p, t, o){
      var q = T(p);
      add1(dot(p,d3)+0.02, '<text x="'+r2(q[0])+'" y="'+r2(q[1])+'" font-size="'+(o.size||11)+'" fill="'+o.fill+'" text-anchor="middle"'
        + ' dominant-baseline="central" stroke="#ffffff" stroke-width="'+(o.halo != null ? o.halo : 3)+'" paint-order="stroke" stroke-linejoin="round">'+esc(t)+'</text>');
    }
    dimLine([0,-off,0],[W,-off,0], 1);
    for (var xc=0; xc<=W+1e-6; xc+=0.5){ dimLine([xc,-off-tick/2,0],[xc,-off+tick/2,0], 0.8); }
    for (var k1=1; k1<=Math.round(W); k1++){ dimText([k1-0.5,-off-0.02,0], fnum(k1), { size:8, fill:colT, halo:2.4 }); }
    dimLine([0,D+off,0],[W,D+off,0], 1);
    for (var xc2=0; xc2<=W+1e-6; xc2+=0.5){ dimLine([xc2,D+off-tick/2,0],[xc2,D+off+tick/2,0], 0.8); }
    for (var k2=1; k2<=Math.round(W); k2++){ dimText([k2-0.5,D+off+0.02,0], fnum(k2), { size:8, fill:colT, halo:2.4 }); }
    dimLine([-off,0,0],[-off,D,0], 1);
    for (var yc=0; yc<=D+1e-6; yc+=0.5){ dimLine([-off-tick/2,yc,0],[-off+tick/2,yc,0], 0.8); }
    for (var k3=1; k3<=Math.round(D); k3++){ dimText([-off-0.02,k3-0.5,0], fnum(k3), { size:8, fill:colT, halo:2.4 }); }
    dimLine([W+off,0,0],[W+off,D,0], 1);
    for (var yc2=0; yc2<=D+1e-6; yc2+=0.5){ dimLine([W+off-tick/2,yc2,0],[W+off+tick/2,yc2,0], 0.8); }
    for (var k4=1; k4<=Math.round(D); k4++){ dimText([W+off+0.02,k4-0.5,0], fnum(k4), { size:8, fill:colT, halo:2.4 }); }
    dimText([W/2, -off-0.38, 0], '总宽 '+fnum(W)+' m', { size:9, fill:colT, halo:2.6 });
    dimText([-off-0.45, D/2, 0], '总深 '+fnum(D)+' m', { size:9, fill:colT, halo:2.6 });
  }

  /* ---------- 标签 ---------- */
  if (cfg.opt.labels){
    cfg.zones.forEach(function(z){
      var cx = z.x+z.w/2, cy = z.y+z.h/2;
      if (z.kind === 'storage') addText([cx,cy,0.35], z.label, { size:11.5, fill:'#517a44' });
      else if (z.kind === 'passage') addText([cx,cy,0.35], z.label, { size:12, fill:'#2b7f8a' });
      else if (z.kind === 'test') addText([cx,cy,0.35], z.label + ' 🚲', { size:12, fill:'#b57430' });
      else addText([cx,cy,0.35], z.label, { size:11.5, fill:'#6b6b6b' });
    });
    (cfg.entrances || []).forEach(function(en){
      addText([en.x+0.75, en.y+0.42, 0.3], '净空·'+en.name, { size:9.5, fill:'#c07f3a', halo:2.6 });
    });
    addText([st0.x+st0.w/2, st0.y+st0.h/2, stH+0.28], (st0.name||'工作室')+' '+fnum(st0.w)+'×'+fnum(st0.h)+'m', { size:12, fill:'#5a5347', weight:600 });
    var ckD = computeChecks(cfg);
    if (ckD.okMesh && ckD.meshSide){
      var msd = ckD.meshSide, tx, ty;
      if (msd==='e'){ tx = st0.x+st0.w+0.22; ty = st0.y+st0.h/2; }
      else if (msd==='w'){ tx = st0.x-0.22; ty = st0.y+st0.h/2; }
      else if (msd==='n'){ tx = st0.x+st0.w/2; ty = st0.y-0.22; }
      else { tx = st0.x+st0.w/2; ty = st0.y+st0.h+0.22; }
      addText([tx, ty, stH+0.06], '网面', { size:10, fill:'#4c6b80' });
    }
    if (st0.peg && st0.peg.on) addText([st0.x+st0.w-0.32, st0.y+0.55, 2.35], '洞洞板', { size:10, fill:'#8a6d3b' });
    cfg.pillars.forEach(function(p){ addBadge([p.x, p.y, 2.6], '柱子', { size:10, fill:'#3a3a3a', tfill:'#ffffff', dy:-8 }); });
    /* 开口名称：位置跟着墙段（缩短 / 偏移 / 旋转后仍贴在该开口上方） */
    function wallBadge(side, o, dy, fill){
      if (!o.label) return;
      var wp = wallPt(cfg, side, Math.min(+o.at || 0, Math.max(0, wallLength(cfg, side) - (+o.w || 0))) + (+o.w || 0)/2, 0.2);
      addBadge([wp.x, wp.y, 0.9], o.label, { size:10.5, fill:fill, tfill:'#ffffff', dy:dy });
    }
    cfg.walls.top.open.forEach(function(o){ wallBadge('top', o, -16, '#e05252'); });
    cfg.walls.bottom.open.forEach(function(o){ wallBadge('bottom', o, 16, '#45a7b3'); });
    cfg.walls.left.open.forEach(function(o){ wallBadge('left', o, -16, '#45a7b3'); });
    cfg.walls.right.open.forEach(function(o){ wallBadge('right', o, -16, '#45a7b3'); });
    cfg.wallSegs.forEach(function(ws){
      if (ws.orient==='v' && ws.label) addVText([ws.at-0.85, (ws.to+D-WALL_T)/2, 0.9], ws.label.split(''), { size:9, fill:'#2b7f8a' });
    });
    cfg.shelves.forEach(function(s){
      var d = shelfDepth(s);
      var cx = s.orient==='h' ? s.x+s.len/2 : s.x+d/2;
      var cy = s.orient==='h' ? s.y+d/2 : s.y+s.len/2;
      var nmT = s.name ? s.name : (s.kind==='double'?'双面货架':(s.kind==='single'?'单面货架':'矮货架'));
      addText([cx,cy,(s.h||SHELF_H_DEFAULT)+0.42], nmT+' '+fnum(s.len)+'m',
              { size:10.5, fill: s.kind==='double' ? '#6b5a3e' : (s.kind==='single' ? '#3f5c7a' : '#6a5f8a') });
    });
    cfg.meshes.forEach(function(ms, i){
      var cx = ms.orient==='h' ? ms.x+ms.len/2 : ms.x;
      var cy = ms.orient==='h' ? ms.y : ms.y+ms.len/2;
      addText([cx,cy,(ms.h||2)+0.18], '网面墙', { size:10, fill:'#4c6b80' });
    });
    (cfg.curtains || []).forEach(function(ct){
      var cx3 = ct.orient==='h' ? ct.x+ct.len/2 : ct.x+0.3;
      var cy3 = ct.orient==='h' ? ct.y : ct.y+ct.len/2;
      addText([cx3,cy3,(ct.h||1.9)+0.14], '门帘', { size:9.5, fill:'#4c8aa0' });
    });
    cfg.markers.forEach(function(mk){
      if (!mk.label) return;
      var fillc = mk.color==='red' ? '#e05252' : (mk.color==='yellow' ? '#d8b52c' : (mk.color==='green' ? '#7fbe5f' : '#5b93cd'));
      addBadge([mk.x+mk.w/2, mk.y+mk.h/2, 0.3], mk.label, { size:9.5, fill:fillc, tfill:'#ffffff', dy:-12 });
    });
  }

  /* ---------- 指南针（屏幕固定） ---------- */
  var ccx = vw-46, ccy = 44;
  var ndx = ca, ndy = -sa*se, nl = Math.sqrt(ndx*ndx+ndy*ndy) || 1;
  ndx /= nl; ndy /= nl;
  L3.push('<circle cx="'+ccx+'" cy="'+ccy+'" r="18" fill="#ffffff" fill-opacity="0.85" stroke="#d8d5cf"/>');
  L3.push('<line x1="'+r2(ccx-ndx*11)+'" y1="'+r2(ccy-ndy*11)+'" x2="'+r2(ccx+ndx*11)+'" y2="'+r2(ccy+ndy*11)+'" stroke="#d05252" stroke-width="2"/>');
  L3.push('<polygon points="'+r2(ccx+ndx*13)+','+r2(ccy+ndy*13)+' '+r2(ccx+ndx*7-ndy*4.5)+','+r2(ccy+ndy*7+ndx*4.5)+' '+r2(ccx+ndx*7+ndy*4.5)+','+r2(ccy+ndy*7-ndx*4.5)+'" fill="#d05252"/>');
  L3.push('<text x="'+r2(ccx+ndx*24)+'" y="'+r2(ccy+ndy*24)+'" font-size="9" fill="#b33" text-anchor="middle" dominant-baseline="central">N</text>');

  resolveObjs();   /* 摆件定位：射线算完遮挡体关系后才定深度键 */
  L1.sort(function(a,b){ return a.k-b.k; });
  L2.sort(function(a,b){ return a.k-b.k; });
  var out = [];
  out.push('<svg xmlns="http://www.w3.org/2000/svg" width="'+vw+'" height="'+vh+'" viewBox="0 0 '+vw+' '+vh+'">');
  out.push('<defs>'+PAT_MESH+PAT_MESH2+PAT_PEG+PAT_CURT+'<style>text{font-family:"PingFang SC","Noto Sans SC","Noto Sans CJK SC","Microsoft YaHei",system-ui,sans-serif;}</style></defs>');
  out.push('<rect width="'+vw+'" height="'+vh+'" fill="#f7f6f3"/>');
  out.push(L0.join(''));
  out.push(L1.map(function(i){ return i.s; }).join(''));
  out.push(L2.map(function(i){ return i.s; }).join(''));
  out.push(L3.join(''));
  out.push('</svg>');
  return out.join('');
}

/* 元素矩形（选中框定位 / 拖拽框跟随用；与平面渲染同一套坐标） */
function itemRect(cfg2, selId){
  if (!selId) return null;
  var parts = String(selId).split(':'), kind = parts[0], key = parts[1];
  function byId(arr, id){ for (var i=0;i<arr.length;i++){ if (String(arr[i].id) === String(id)) return arr[i]; } return null; }
  var st = cfg2.studio;
  if (kind==='sh'){ var s = byId(cfg2.shelves, key); return s ? (shelfRot(s) ? shelfBounds(s) : shelfRect(s)) : null; }
  if (kind==='iw'){
    var ws2 = byId(cfg2.wallSegs || [], key); if (!ws2) return null;
    if (wallSegRot(ws2)) return boundsOfPts(wallSegCorners(ws2));
    var a2i = Math.min(ws2.from, ws2.to), b2i = Math.max(ws2.from, ws2.to), th2 = ws2.thick || 0.3;
    return (ws2.orient === 'v')
      ? { x: ws2.at - th2/2, y: a2i, w: th2, h: b2i - a2i }
      : { x: a2i, y: ws2.at - th2/2, w: b2i - a2i, h: th2 };
  }
  if (kind==='wl'){
    var e2 = cfg2.walls[key]; if (!e2) return null;
    /* 外墙现在是一段可编辑的墙（长度 / 横向偏移 / 旋转），选中框 = 墙段实际范围 */
    if (wallIsDefault(cfg2, key)){
      var WW2 = cfg2.space.w, DD2 = cfg2.space.d;
      if (key === 'top')    return { x:0, y:0, w:WW2, h:WALL_T };
      if (key === 'bottom') return { x:0, y:DD2-WALL_T, w:WW2, h:WALL_T };
      if (key === 'left')   return { x:0, y:0, w:WALL_T, h:DD2 };
      if (key === 'right')  return { x:WW2-WALL_T, y:0, w:WALL_T, h:DD2 };
    }
    return wallBounds(cfg2, key);
  }
  if (kind==='st') return st ? { x:st.x, y:st.y, w:st.w, h:st.h } : null;
  if (kind==='zn'){ var z2 = byId(cfg2.zones, key); return z2 ? { x:z2.x, y:z2.y, w:z2.w, h:z2.h } : null; }
  if (kind==='pl'){ var p2 = byId(cfg2.pillars, key); return p2 ? pillarRect(p2) : null; }
  if (kind==='mk'){ var m2 = byId(cfg2.markers, key); return m2 ? { x:m2.x, y:m2.y, w:m2.w, h:m2.h } : null; }
  if (kind==='ms'){ var ms2 = byId(cfg2.meshes || [], key); if (!ms2) return null;
    return (ms2.orient==='v') ? { x:ms2.x-0.1, y:ms2.y, w:0.2, h:ms2.len } : { x:ms2.x, y:ms2.y-0.1, w:ms2.len, h:0.2 }; }
  if (kind==='en'){ var en2 = byId(cfg2.entrances || [], key); return en2 ? { x:en2.x, y:en2.y, w:en2.w, h:en2.h } : null; }
  if (kind==='ct'){ var ct2 = byId(cfg2.curtains || [], key); if (!ct2) return null;
    return (ct2.orient==='v') ? { x:ct2.x-0.15, y:ct2.y, w:0.3, h:ct2.len } : { x:ct2.x, y:ct2.y-0.15, w:ct2.len, h:0.3 }; }
  if (kind==='bk'){ var bk2 = byId(cfg2.bikes || [], key); if (!bk2) return null;
    var bl = (bk2.type==='kids') ? 1.5 : 2.0;
    var ra2 = ((bk2.rot != null) ? bk2.rot : (bk2.angle||0)) * Math.PI/180;
    var cc = Math.abs(Math.cos(ra2)), ss = Math.abs(Math.sin(ra2));
    var hw = (bl/2+0.15)*cc + 0.45*ss, hh3 = (bl/2+0.15)*ss + 0.45*cc;
    return { x: bk2.x-hw, y: bk2.y-hh3, w: hw*2, h: hh3*2 }; }
  return null;
}

/* ======================== 2D 平面编辑渲染 ======================== */
function renderPlan(cfg, ui){
  ui = ui || {};
  var W = cfg.space.w, D = cfg.space.d;
  var pad = 1.4, z = ui.z || 30;
  var sel = ui.sel || null;
  var o = [];

  function rectStr(x,y,w,h,fill,stroke,sw){
    return '<rect x="'+r2(x)+'" y="'+r2(y)+'" width="'+r2(w)+'" height="'+r2(h)+'" fill="'+fill+'"'
      + (stroke ? ' stroke="'+stroke+'" stroke-width="'+(sw!=null?sw:0.03)+'"' : '') + '/>';
  }
  function labelStr(x,y,t,size,fill){
    return '<text x="'+r2(x)+'" y="'+r2(y)+'" font-size="'+(size||0.5)+'" fill="'+(fill||'#666')+'" text-anchor="middle" dominant-baseline="central">'+esc(t)+'</text>';
  }
  function lineP(x1,y1,x2,y2,color,sw,dash){
    return '<line x1="'+r2(x1)+'" y1="'+r2(y1)+'" x2="'+r2(x2)+'" y2="'+r2(y2)+'" stroke="'+color+'" stroke-width="'+sw+'"'
      + (dash ? ' stroke-dasharray="'+dash+'"' : '') + '/>';
  }
  function chev(x,y,dir,size){
    var px2 = [-dir[1], dir[0]];
    var tip = [x+dir[0]*size, y+dir[1]*size];
    var a = [x+px2[0]*size*0.62, y+px2[1]*size*0.62];
    var b = [x-px2[0]*size*0.62, y-px2[1]*size*0.62];
    return '<polygon points="'+r2(tip[0])+','+r2(tip[1])+' '+r2(a[0])+','+r2(a[1])+' '+r2(b[0])+','+r2(b[1])+'" fill="#45a7b3" fill-opacity="0.85"/>';
  }
  function byId(arr, id){ for (var i=0;i<arr.length;i++){ if (arr[i].id === id) return arr[i]; } return null; }

  o.push('<svg xmlns="http://www.w3.org/2000/svg" width="'+r2((W+2*pad)*z)+'" height="'+r2((D+2*pad)*z)+'" viewBox="'+(-pad)+' '+(-pad)+' '+(W+2*pad)+' '+(D+2*pad)+'" style="display:block">');
  o.push('<style>text{font-family:"PingFang SC","Noto Sans SC","Noto Sans CJK SC",system-ui,sans-serif;} .it{cursor:move}</style>');
  o.push('<rect x="'+(-pad)+'" y="'+(-pad)+'" width="'+r2(W+2*pad)+'" height="'+r2(D+2*pad)+'" fill="#ffffff"/>');

  /* 网格 */
  if (ui.grid !== false){
    for (var gx=0.5; gx<W-1e-6; gx+=0.5){
      var im = Math.abs(gx-Math.round(gx))<1e-6;
      o.push(lineP(gx,0,gx,D, im?'#e0dfdb':'#ececea', im?0.03:0.02));
    }
    for (var gy=0.5; gy<D-1e-6; gy+=0.5){
      var im2 = Math.abs(gy-Math.round(gy))<1e-6;
      o.push(lineP(0,gy,W,gy, im2?'#e0dfdb':'#ececea', im2?0.03:0.02));
    }
  }
  /* 外侧标尺数字 */
  for (var mx=2; mx<W; mx+=2){ o.push(labelStr(mx, -0.5, String(mx), 0.5, '#9a9a9a')); }
  for (var my=2; my<D; my+=2){ o.push(labelStr(-0.55, my, String(my), 0.5, '#9a9a9a')); }

  /* 区域 */
  cfg.zones.forEach(function(zn){
    var fill = zn.kind==='storage' ? '#e8f0e1' : (zn.kind==='passage' ? '#dceef0' : (zn.kind==='test' ? '#fae7d0' : '#f2f0ea'));
    var stroke = zn.kind==='storage' ? '#b7cdad' : (zn.kind==='passage' ? '#a8ccd2' : (zn.kind==='test' ? '#e2a96a' : '#d8d5cf'));
    o.push('<g class="it" data-id="zn:'+zn.id+'">');
    o.push(rectStr(zn.x, zn.y, zn.w, zn.h, fill, stroke, 0.045));
    if (zn.kind === 'test') o.push('<rect x="'+r2(zn.x)+'" y="'+r2(zn.y)+'" width="'+r2(zn.w)+'" height="'+r2(zn.h)+'" fill="none" stroke="#e2a96a" stroke-width="0.06" stroke-dasharray="0.4 0.25"/>');
    o.push(labelStr(zn.x+zn.w/2, zn.y+zn.h/2, zn.label, 0.55, zn.kind==='storage' ? '#517a44' : (zn.kind==='test' ? '#b57430' : '#2b7f8a')));
    if (zn.kind==='storage' && zn.fence){
      var SP = { n:[zn.x,zn.y,zn.x+zn.w,zn.y], s:[zn.x,zn.y+zn.h,zn.x+zn.w,zn.y+zn.h], w:[zn.x,zn.y,zn.x,zn.y+zn.h], e:[zn.x+zn.w,zn.y,zn.x+zn.w,zn.y+zn.h] };
      ['n','s','w','e'].forEach(function(sd){
        var f = zn.fence[sd]; if (!f || f==='none') return;
        var P = SP[sd];
        if (f==='wall') o.push(lineP(P[0],P[1],P[2],P[3], '#9a9a9a', 0.1));
        else if (f==='mesh'){
          o.push(lineP(P[0],P[1],P[2],P[3], '#6f93a9', 0.09, '0.18 0.12'));
          var vv = (sd==='w'||sd==='e');
          if (vv) o.push('<text x="'+r2((P[0]+P[2])/2 - 0.32)+'" y="'+r2((P[1]+P[3])/2)+'" font-size="0.42" fill="#4c6b80" text-anchor="middle" transform="rotate(-90 '+r2((P[0]+P[2])/2-0.32)+' '+r2((P[1]+P[3])/2)+')">网面</text>');
          else o.push(labelStr((P[0]+P[2])/2, (P[1]+P[3])/2 + 0.35, '网面', 0.42, '#4c6b80'));
        }
      });
    }
    o.push('</g>');
  });

  /* 出入口净空区 */
  (cfg.entrances || []).forEach(function(en){
    o.push('<g class="it" data-id="en:'+en.id+'">');
    o.push('<rect x="'+r2(en.x)+'" y="'+r2(en.y)+'" width="'+r2(en.w)+'" height="'+r2(en.h)+'" fill="#f9dcb9" fill-opacity="0.22" stroke="#d89a55" stroke-width="0.07" stroke-dasharray="0.36 0.22"/>');
    o.push(labelStr(en.x+en.w/2, en.y+0.42, '净空·'+en.name, 0.42, '#c07f3a'));
    o.push('</g>');
  });

  /* 内隔墙（可点选 / 可拖动：data-id=iw:<id>） */
  cfg.wallSegs.forEach(function(ws){
    o.push('<g class="it" data-id="iw:'+ws.id+'">');
    var csI = wallSegCorners(ws);
    if (wallSegRot(ws)){
      o.push('<polygon points="' + csI.map(function(pp){ return r2(pp.x)+','+r2(pp.y); }).join(' ')
        + '" fill="#c6c4bf" stroke="#8f8b86" stroke-width="0.03"/>');
    } else {
      o.push(rectStr(csI[0].x, csI[0].y, csI[1].x - csI[0].x, csI[3].y - csI[0].y, '#c6c4bf', '#8f8b86', 0.03));
    }
    o.push('</g>');
  });

  /* 外墙（每侧一个可选中的分组：data-id=wl:<上/下/左/右>） */
  var wallFill = '#c6c4bf', wallStroke = '#8f8b86';
  WALL_SIDES.forEach(function(edgeName){
    var eW = cfg.walls[edgeName];
    if (!eW || !eW.on) return;
    var segs = wallSegSpans(cfg, edgeName);
    if (!segs.length) return;
    var wRotP = wallRot(cfg, edgeName);
    o.push('<g class="it" data-id="wl:'+edgeName+'">');
    segs.forEach(function(sg){
      if (!wRotP){
        var q1 = wallPt(cfg, edgeName, sg[0], 0), q2 = wallPt(cfg, edgeName, sg[1], WALL_T);
        o.push(rectStr(Math.min(q1.x,q2.x), Math.min(q1.y,q2.y), Math.abs(q2.x-q1.x), Math.abs(q2.y-q1.y), wallFill, wallStroke, 0.03));
      } else {
        var csW = wallBandCorners(cfg, edgeName, sg[0], sg[1]);
        o.push('<polygon points="' + csW.map(function(pp){ return r2(pp.x)+','+r2(pp.y); }).join(' ')
          + '" fill="'+wallFill+'" stroke="'+wallStroke+'" stroke-width="0.03"/>');
      }
    });
    o.push('</g>');
  });

  /* 开口标注 */
  /* 开口标注（位置与朝向都跟着墙段：缩短 / 偏移 / 旋转后仍然对得上） */
  var PLAN_INWARD = { top:[0,1], bottom:[0,-1], left:[1,0], right:[-1,0] };
  WALL_SIDES.forEach(function(side){
    var eW = cfg.walls[side];
    if (!eW || !eW.on) return;
    var wRp = wallRot(cfg, side) * Math.PI / 180, cp2 = Math.cos(wRp), sp3 = Math.sin(wRp);
    var bIn = PLAN_INWARD[side];
    var dirP = [bIn[0]*cp2 - bIn[1]*sp3, bIn[0]*sp3 + bIn[1]*cp2];
    (eW.open || []).forEach(function(op){
      var wOp = +op.w || 0;
      var mid = Math.min(+op.at || 0, Math.max(0, wallLength(cfg, side) - wOp)) + wOp/2;
      /* 上/下边画两只箭头（跨过开口），左/右边画一只（与旧版一致） */
      var spots = (side === 'top' || side === 'bottom') ? [mid-0.5, mid+0.5] : [mid];
      spots.forEach(function(uu){
        var q = wallPt(cfg, side, uu, 0.5);
        o.push(chev(q.x, q.y, dirP, 0.22));
      });
      if (op.label){
        var lq = wallPt(cfg, side, mid, -0.65);
        o.push(labelStr(lq.x, lq.y, op.label, 0.55, side === 'top' ? '#d04545' : '#2b7f8a'));
      }
    });
  });
  cfg.wallSegs.forEach(function(ws){
    if (ws.orient==='v' && ws.label){
      var cxs = ws.at-0.85, cys = (ws.to + D - WALL_T)/2, chars = ws.label.split('');
      for (var ci=0; ci<chars.length; ci++){
        o.push(labelStr(cxs, cys + (ci-(chars.length-1)/2)*0.56, chars[ci], 0.5, '#2b7f8a'));
      }
    }
  });

  /* 柱子 */
  cfg.pillars.forEach(function(p){
    var r = pillarRect(p);
    o.push('<g class="it" data-id="pl:'+p.id+'">');
    o.push(rectStr(r.x, r.y, r.w, r.h, '#3a3a3a', null));
    o.push(labelStr(p.x, p.y, '柱', 0.42, '#ffffff'));
    o.push('</g>');
  });

  /* 货架 */
  cfg.shelves.forEach(function(s){
    var rc = shelfRect(s);
    var fill = s.kind==='double' ? '#f5e6ca' : (s.kind==='single' ? '#e6eff8' : '#e8e2f2');
    var stroke = s.kind==='double' ? '#b79f79' : (s.kind==='single' ? '#96afc7' : '#a89bc4');
    o.push('<g class="it" data-id="sh:'+s.id+'">');
    if (shelfRot(s)){
      /* 斜放货架：底面画成旋转后的四边形（矩形 rectStr 表达不了角度） */
      var csP = shelfCorners(s);
      o.push('<polygon points="' + csP.map(function(p){ return r2(p.x)+','+r2(p.y); }).join(' ')
        + '" fill="'+fill+'" stroke="'+stroke+'" stroke-width="0.045"/>');
      if (s.kind==='double'){
        var dP = shelfDepth(s);
        var mP0 = shelfLocalPt(s, 0, dP/2), mP1 = shelfLocalPt(s, s.len, dP/2);
        o.push(lineP(mP0.x, mP0.y, mP1.x, mP1.y, '#cbb083', 0.05, '0.3 0.18'));
      }
      var lp0 = shelfLocalPt(s, s.len/2, (s.orient === 'h') ? -0.42 : -0.55);
      o.push(labelStr(lp0.x, lp0.y, (s.name ? s.name+' ' : '') + fnum(s.len)+'m', 0.5, '#7a6a50'));
      o.push('</g>');
      return;
    }
    o.push(rectStr(rc.x, rc.y, rc.w, rc.h, fill, stroke, 0.045));
    if (s.kind==='double'){
      if (s.orient==='h') o.push(lineP(rc.x, rc.y+rc.h/2, rc.x+rc.w, rc.y+rc.h/2, '#cbb083', 0.05, '0.3 0.18'));
      else o.push(lineP(rc.x+rc.w/2, rc.y, rc.x+rc.w/2, rc.y+rc.h, '#cbb083', 0.05, '0.3 0.18'));
    }
    var lx = s.orient==='h' ? rc.x+rc.w/2 : rc.x-0.55;
    var ly = s.orient==='h' ? rc.y-0.42 : rc.y+rc.h/2;
    o.push(labelStr(lx, ly, (s.name ? s.name+' ' : '') + fnum(s.len)+'m', 0.5, '#7a6a50'));
    o.push('</g>');
  });

  /* 货架陈列附件（托臂 / 地架 / 挂钩）：俯视符号 */
  cfg.shelves.forEach(function(s){
    if (!accOn(s)) return;
    var a2 = accOf(s), face2 = accFace(s, cfg);
    /* 正交（rot=0）时保持 rectStr（输出与旧版逐字节一致）；斜放时改用旋转四边形。
       t 传「面相关」的正值，符号在 accLocalT 里按挂载面翻转。 */
    function boxRS(u0, u1, t0, t1, fill, stroke, sw, face){
      var f = face || face2;
      if (shelfRot(s)){
        var tA = accLocalT(s, t0, f), tB = accLocalT(s, t1, f);
        var csR = shelfLocalBoxCorners(s, Math.min(u0,u1), Math.max(u0,u1), Math.min(tA,tB), Math.max(tA,tB));
        o.push('<polygon points="' + csR.map(function(p){ return r2(p.x)+','+r2(p.y); }).join(' ')
          + '" fill="'+fill+'"' + (stroke ? ' stroke="'+stroke+'" stroke-width="'+sw+'"' : '') + '/>');
        return;
      }
      var p1 = accPos(s, u0, t0, f), p2 = accPos(s, u1, t1, f);
      o.push(rectStr(Math.min(p1.x,p2.x), Math.min(p1.y,p2.y), Math.abs(p2.x-p1.x), Math.abs(p2.y-p1.y), fill, stroke, sw));
    }
    /* 托臂：每台车两根（前 / 后轮），长度按排（短 0.5m / 长 1m） */
    armHardwareOf(cfg, s).forEach(function(hw){
      if (shelfRot(s)){
        var tLo = Math.min(hw.local.t0, hw.local.t1) - 0.024, tHi = Math.max(hw.local.t0, hw.local.t1) + 0.024;
        var csA = shelfLocalBoxCorners(s, hw.local.u - 0.024, hw.local.u + 0.024, tLo, tHi);
        o.push('<polygon points="' + csA.map(function(p){ return r2(p.x)+','+r2(p.y); }).join(' ')
          + '" fill="#c9ced3" stroke="#9aa0a6" stroke-width="0.02"/>');
        var csT = shelfLocalBoxCorners(s, hw.local.u - 0.05, hw.local.u + 0.05, hw.local.cradleT - 0.05, hw.local.cradleT + 0.05);
        o.push('<polygon points="' + csT.map(function(p){ return r2(p.x)+','+r2(p.y); }).join(' ') + '" fill="#8f959b"/>');
        return;
      }
      o.push(rectStr(Math.min(hw.inner.x, hw.tip.x) - 0.024, Math.min(hw.inner.y, hw.tip.y) - 0.024,
                     Math.abs(hw.tip.x - hw.inner.x) + 0.048, Math.abs(hw.tip.y - hw.inner.y) + 0.048,
                     '#c9ced3', '#9aa0a6', 0.02));
      o.push(rectStr(hw.tip.x - 0.05, hw.tip.y - 0.05, 0.10, 0.10, '#8f959b', null));
    });
    if (a2.rack !== 'none'){
      var nR = rackCount(s);
      for (var jR = 0; jR < nR; jR++){
        var uR = (jR + 0.5) * s.len / nR;
        boxRS(uR-0.05, uR+0.05, 0.05, 0.36, '#d7dadd', '#9aa0a6', 0.02);
      }
    }
    if (a2.hook === 'on'){
      var nH = hookCount(s);
      for (var kH = 0; kH < nH; kH++){
        var uH = (kH + 0.5) * s.len / nH;
        var phH = accPos(s, uH, 0.10, face2);
        o.push('<circle cx="' + r2(phH.x) + '" cy="' + r2(phH.y) + '" r="0.055" fill="#7c8288"/>');
      }
    }
  });

  /* 工作室 */
  var st = cfg.studio;
  o.push('<g class="it" data-id="st">');
  o.push(rectStr(st.x, st.y, st.w, st.h, '#f6f3ec', '#cfc9bd', 0.045));
  function stub(x1,y1,x2,y2){ o.push(lineP(x1,y1,x2,y2,'#a59d90',0.13)); }
  function meshLine(x1,y1,x2,y2){
    o.push(lineP(x1,y1,x2,y2,'#6f93a9',0.1,'0.2 0.12'));
    o.push(rectStr(x1-0.07,y1-0.07,0.14,0.14,'#7f95a7',null));
    o.push(rectStr(x2-0.07,y2-0.07,0.14,0.14,'#7f95a7',null));
  }
  function winBand(x1,y1,x2,y2){
    o.push(lineP(x1,y1,x2,y2,'#cfe4f0',0.16));
    o.push(lineP(x1,y1,x2,y2,'#6fa7c8',0.06));
  }
  var dW = st.doorW || 1.2;
  var sN2 = st.y, sS2 = st.y+st.h, sW2 = st.x, sE2 = st.x+st.w;
  ['n','e','s','w'].forEach(function(sd){
    var t = st.sides[sd];
    if (t === 'none') return;
    if (t === 'wall'){
      if (sd==='n') stub(sW2, sN2, sE2, sN2);
      if (sd==='s') stub(sW2, sS2, sE2, sS2);
      if (sd==='w') stub(sW2, sN2, sW2, sS2);
      if (sd==='e') stub(sE2, sN2, sE2, sS2);
    } else if (t === 'mesh'){
      if (sd==='n') meshLine(sW2, sN2, sE2, sN2);
      if (sd==='s') meshLine(sW2, sS2, sE2, sS2);
      if (sd==='w') meshLine(sW2, sN2, sW2, sS2);
      if (sd==='e') meshLine(sE2, sN2, sE2, sS2);
    } else if (t === 'window'){
      if (sd==='n') winBand(sW2, sN2, sE2, sN2);
      if (sd==='s') winBand(sW2, sS2, sE2, sS2);
      if (sd==='w') winBand(sW2, sN2, sW2, sS2);
      if (sd==='e') winBand(sE2, sN2, sE2, sS2);
    } else if (t === 'door'){
      if (sd==='n' || sd==='s'){
        var yy = sd==='n' ? sN2 : sS2, mid = (sW2+sE2)/2;
        stub(sW2, yy, mid-dW/2, yy); stub(mid+dW/2, yy, sE2, yy);
      } else {
        var xx = sd==='w' ? sW2 : sE2, mid2 = (sN2+sS2)/2;
        stub(xx, sN2, xx, mid2-dW/2); stub(xx, mid2+dW/2, xx, sS2);
      }
    }
  });
  if (st.peg && st.peg.on){
    var psd = st.peg.side, PW=1.4, PG=0.1, PN=Math.max(1, Math.round(st.peg.panels||2));
    var totalP = PN*PW + (PN-1)*PG;
    var vertical = (psd==='w'||psd==='e');
    var cAlong = vertical ? (st.y+st.h/2) : (st.x+st.w/2);
    var startA = cAlong - totalP/2;
    for (var pi2=0; pi2<PN; pi2++){
      var a0 = startA + pi2*(PW+PG), a1 = a0 + PW;
      if (vertical){
        var xx2 = (psd==='e' ? st.x+st.w : st.x) + (psd==='e' ? -0.17 : 0.17);
        o.push(rectStr(xx2-0.06, a0, 0.12, a1-a0, '#e9d4a6', '#b59b6d', 0.03));
      } else {
        var yy2 = (psd==='s' ? st.y+st.h : st.y) + (psd==='s' ? -0.17 : 0.17);
        o.push(rectStr(a0, yy2-0.06, a1-a0, 0.12, '#e9d4a6', '#b59b6d', 0.03));
      }
    }
  }
  o.push(labelStr(st.x+st.w/2, st.y+st.h/2, (st.name||'工作室')+' '+fnum(st.w)+'×'+fnum(st.h), 0.55, '#5a5347'));
  o.push('</g>');

  /* 独立网面墙 */
  cfg.meshes.forEach(function(ms){
    o.push('<g class="it" data-id="ms:'+ms.id+'">');
    if (ms.orient==='v'){
      o.push(lineP(ms.x, ms.y, ms.x, ms.y+ms.len, '#6f93a9', 0.1, '0.2 0.12'));
      o.push(rectStr(ms.x-0.08, ms.y-0.08, 0.16, 0.16, '#7f95a7', null));
      o.push(rectStr(ms.x-0.08, ms.y+ms.len-0.08, 0.16, 0.16, '#7f95a7', null));
      o.push('<text x="'+r2(ms.x-0.35)+'" y="'+r2(ms.y+ms.len/2)+'" font-size="0.42" fill="#4c6b80" text-anchor="middle" transform="rotate(-90 '+r2(ms.x-0.35)+' '+r2(ms.y+ms.len/2)+')">网面</text>');
    } else {
      o.push(lineP(ms.x, ms.y, ms.x+ms.len, ms.y, '#6f93a9', 0.1, '0.2 0.12'));
      o.push(rectStr(ms.x-0.08, ms.y-0.08, 0.16, 0.16, '#7f95a7', null));
      o.push(rectStr(ms.x+ms.len-0.08, ms.y-0.08, 0.16, 0.16, '#7f95a7', null));
      o.push(labelStr(ms.x+ms.len/2, ms.y-0.35, '网面', 0.42, '#4c6b80'));
    }
    o.push('</g>');
  });

  /* 门帘 */
  (cfg.curtains || []).forEach(function(ct){
    o.push('<g class="it" data-id="ct:' + ct.id + '">');
    if (ct.orient === 'v'){
      o.push(lineP(ct.x, ct.y, ct.x, ct.y+ct.len, '#6fa7c8', 0.14, '0.22 0.12'));
      o.push(rectStr(ct.x-0.16, ct.y, 0.32, ct.len, 'transparent', '#8fb6c9', 0.02));
    } else {
      o.push(lineP(ct.x, ct.y, ct.x+ct.len, ct.y, '#6fa7c8', 0.14, '0.22 0.12'));
      o.push(rectStr(ct.x, ct.y-0.16, ct.len, 0.32, 'transparent', '#8fb6c9', 0.02));
    }
    o.push('</g>');
  });

  /* 自行车（俯视符号：车架+双轮，车头可转动；含货架附件车） */
  (cfg.bikes || []).concat(accBikesOf(cfg)).forEach(function(bk){
    var btype = (bk.type === 'kids') ? 'kids' : 'adult';
    var col = (btype === 'kids') ? '#d2954f' : '#5e656d';
    var tcol = (btype === 'kids') ? '#a86f28' : '#3a3f45';
    var rotD = (bk.rot != null) ? bk.rot : (bk.angle != null ? bk.angle : 0);
    var steerD = (bk.steer != null) ? bk.steer : 45;
    var pose = (bk.pose === 'top') ? 'top' : 'stand';
    var g = '<g class="it" data-id="' + (bk.acc ? esc(bk.id) : ('bk:' + bk.id)) + '"' + (bk.acc ? ' data-acc="' + esc(bk.acc) + '"' : '') + ' transform="translate(' + r2(bk.x) + ' ' + r2(bk.y) + ') rotate(' + r2(rotD) + ')">';
    g += '<rect x="-0.95" y="-0.55" width="1.9" height="1.1" fill="transparent"/>';
    if (pose !== 'top'){
      g += '<rect x="-0.9" y="-0.035" width="0.7" height="0.07" rx="0.03" fill="' + tcol + '" fill-opacity="0.9"/>';
      g += '<rect x="-0.57" y="-0.045" width="1.14" height="0.09" rx="0.04" fill="' + col + '" fill-opacity="0.95"/>';
      g += '<g transform="translate(0.55 0) rotate(' + r2(steerD) + ')">'
        + '<rect x="-0.35" y="-0.035" width="0.7" height="0.07" rx="0.03" fill="' + tcol + '" fill-opacity="0.9"/>'
        + '<rect x="-0.015" y="-0.23" width="0.05" height="0.46" rx="0.025" fill="' + col + '"/>'
        + '</g>';
      g += '<circle cx="-0.28" cy="0" r="0.085" fill="' + col + '"/>';
    } else {
      g += '<rect x="-0.57" y="-0.045" width="1.14" height="0.09" rx="0.04" fill="' + col + '" fill-opacity="0.95"/>';
      g += '<circle cx="-0.55" cy="0" r="0.35" fill="none" stroke="' + tcol + '" stroke-width="0.07" stroke-opacity="0.92"/>';
      g += '<g transform="translate(0.55 0)">'
        + '<circle r="0.35" fill="none" stroke="' + tcol + '" stroke-width="0.07" stroke-opacity="0.92"/>'
        + '<g transform="rotate(' + r2(steerD) + ')"><rect x="-0.015" y="-0.23" width="0.05" height="0.46" rx="0.025" fill="' + col + '"/></g>'
        + '</g>';
      g += '<circle cx="-0.3" cy="0" r="0.09" fill="' + tcol + '"/>';
    }
    g += '</g>';
    o.push(g);
  });

  /* 标记 */
  var MKFILL = { red:'#e05252', yellow:'#f2d444', green:'#a9dd8b', blue:'#7fb3e8' };
  cfg.markers.forEach(function(mk){
    o.push('<g class="it" data-id="mk:'+mk.id+'">');
    o.push(rectStr(mk.x, mk.y, mk.w, mk.h, MKFILL[mk.color]||'#e05252', null));
    if (mk.color==='green') o.push(rectStr(mk.x, mk.y, mk.w, mk.h, 'none', '#7fbe5f', 0.05));
    if (mk.label) o.push(labelStr(mk.x+mk.w/2, mk.y-0.35, mk.label, 0.44, '#b23a3a'));
    o.push('</g>');
  });

  /* 选中高亮 */
  function selRect(id){ return itemRect(cfg, id); }
  var SR = selRect(sel);
  o.push('<rect id="selframe" pointer-events="none" x="' + r2(SR ? SR.x-0.08 : 0) + '" y="' + r2(SR ? SR.y-0.08 : 0) + '" width="' + r2(SR ? SR.w+0.16 : 0) + '" height="' + r2(SR ? SR.h+0.16 : 0) + '" fill="none" stroke="#2f7fd0" stroke-width="0.07" stroke-dasharray="0.28 0.16"' + (SR ? '' : ' display="none"') + '/>');

  o.push('</svg>');
  return o.join('');
}

/* ======================== 货架正面（立面）视图 ========================
   用途：正对货架立面看，直接拖动调整托臂排 —— 高度（离地）、托臂长度（短 0.5m /
   长 1m）、车型（成人 2m / 16″ 童车 4/3m）、排的起止范围。平面俯视图里调这些很不直观。
   坐标：u 沿货架长度（0..len 米），z 离地高度（0..h 米）→ 屏幕 (X(u), Y(z))。
   opt: { scale?: px/m, selRow?: rowId, vw?: 容器宽 }
   返回 { svg, meta }，meta 含 scale / mx / my / len / h（同时写进 <svg> 的 data-* 供交互层读取）。
*/
function renderShelfFront(cfg, shelfId, opt){
  opt = opt || {};
  var s = null;
  (cfg.shelves || []).forEach(function(x){ if (String(x.id) === String(shelfId)) s = x; });
  if (!s) return { svg: '', meta: null };
  var L = +s.len || 0, H = (s.h == null) ? SHELF_H_DEFAULT : +s.h;
  var acc = accOf(s);
  var names = faceNames(s);
  /* 查看面：'auto' 用货架的自动面；只画该面的托臂排，并给出对侧排数提示 */
  var viewFace = (opt.face === 'pos' || opt.face === 'neg') ? opt.face : accFace(s, cfg);
  var rowsAll = acc.rows;
  var rows = rowsAll.filter(function(r){ return rowFace(s, r, cfg) === viewFace; });
  var otherFace = (viewFace === 'pos') ? 'neg' : 'pos';
  var otherRows = rowsAll.length - rows.length;
  var ML = 70, MR = 30, MT = 46, MB = 56;
  var vw = opt.vw || 900, vhAvail = opt.vh || 0;
  var fitW = (vw - ML - MR) / Math.max(0.5, L);
  var fitH = vhAvail ? ((vhAvail - MT - MB) / Math.max(1, H + 1.3)) : Infinity;   /* 1.3m：挂车在货架顶之上可能占的高度 */
  var sc = +opt.scale || clamp(Math.min(fitW, fitH), 12, 130);
  sc = clamp(sc, 10, 220);
  var mx = ML, my = MT + H * sc;
  var W = mx + L * sc + MR, Hh = my + MB;
  function X(u){ return r2(mx + u * sc); }
  function Y(z){ return r2(my - z * sc); }

  var o = [];
  var FACE = s.kind === 'double' ? '#f5e6ca' : (s.kind === 'single' ? '#e6eff8' : '#e8e2f2');
  var FACE_LN = s.kind === 'double' ? '#d8c39a' : (s.kind === 'single' ? '#c3d5e6' : '#cdc3e0');
  var INK = '#3d3d3d', MUT = '#8d8a84', LINE = '#d6d2ca', ACC = '#c9a227';

  o.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + r2(W) + '" height="' + r2(Hh) + '" viewBox="0 0 ' + r2(W) + ' ' + r2(Hh) + '"'
    + ' data-scale="' + sc + '" data-mx="' + mx + '" data-my="' + my + '" data-len="' + r2(L) + '" data-h="' + r2(H) + '"'
    + ' data-shelf="' + esc(s.id) + '">');
  o.push('<defs><style>text{font-family:"PingFang SC","Noto Sans SC","Noto Sans CJK SC","Microsoft YaHei",system-ui,sans-serif;}</style></defs>');

  /* 地面 + 立面 */
  o.push('<rect x="0" y="0" width="' + r2(W) + '" height="' + r2(Hh) + '" fill="#f7f6f3"/>');
  o.push('<rect x="' + mx + '" y="' + Y(H) + '" width="' + r2(L * sc) + '" height="' + r2(H * sc) + '" fill="' + FACE + '" stroke="' + FACE_LN + '" stroke-width="1"/>');
  for (var xd = 2; xd < L - 0.05; xd += 2){
    o.push('<line x1="' + X(xd) + '" y1="' + Y(H) + '" x2="' + X(xd) + '" y2="' + Y(0) + '" stroke="' + FACE_LN + '" stroke-width="1" stroke-dasharray="4 5"/>');
  }
  o.push('<line x1="' + (mx - 14) + '" y1="' + Y(0) + '" x2="' + r2(W - 8) + '" y2="' + Y(0) + '" stroke="#b9b4aa" stroke-width="2"/>');

  /* 刻度：左侧高度 / 底部长度 */
  o.push('<g fill="' + MUT + '" font-size="10.5">');
  for (var zz = 0; zz <= H + 1e-6; zz += 0.25){
    var big = Math.abs(zz - Math.round(zz)) < 1e-6;
    o.push('<line x1="' + (mx - (big ? 9 : 5)) + '" y1="' + Y(zz) + '" x2="' + (mx - 1) + '" y2="' + Y(zz) + '" stroke="' + LINE + '" stroke-width="1"/>');
    if (big && zz > 0.01) o.push('<text x="' + (mx - 13) + '" y="' + r2(Y(zz) + 3.5) + '" text-anchor="end">' + fnum(zz) + '</text>');
  }
  o.push('<text x="' + (mx - 13) + '" y="' + r2(Y(0) + 12) + '" text-anchor="end">0m</text>');
  for (var uu = 0; uu <= L + 1e-6; uu += 0.5){
    var ubig = Math.abs(uu - Math.round(uu)) < 1e-6;
    o.push('<line x1="' + X(uu) + '" y1="' + (Y(0) + 2) + '" x2="' + X(uu) + '" y2="' + (Y(0) + (ubig ? 9 : 5)) + '" stroke="' + LINE + '" stroke-width="1"/>');
    if (ubig) o.push('<text x="' + X(uu) + '" y="' + r2(Y(0) + 22) + '" text-anchor="middle">' + fnum(uu) + '</text>');
  }
  o.push('</g>');

  /* 托臂排（从下到上绘制，保证选中排最后画） */
  rows = rows.slice().sort(function(a, b){ return a.z - b.z; });
  rows.forEach(function(r, ri){
    var on = String(opt.selRow || '') === String(r.id);
    var armLen = ARM_LEN[r.len], scl = (r.size === 'kids') ? 0.78 : 1.0;
    var n = rowBikeCount(s, r);
    var x0 = X(r.u0), x1 = X(r.u1), yr = Y(r.z);
    var g = [];
    /* 选中高亮：整排的可视范围（含挂车高度） */
    if (on){
      g.push('<rect x="' + x0 + '" y="' + r2(yr - 1.18 * sc) + '" width="' + r2(+x1 - +x0) + '" height="' + r2(1.3 * sc)
        + '" rx="' + r2(0.12 * sc) + '" fill="' + ACC + '" fill-opacity="0.14" stroke="' + ACC + '" stroke-width="1.2"/>');
    }
    /* 托臂导轨（这一排的横向范围） */
    g.push('<rect x="' + x0 + '" y="' + r2(yr - 0.035 * sc) + '" width="' + r2(+x1 - +x0) + '" height="' + r2(0.07 * sc)
      + '" fill="#c2c8cd" stroke="#9aa0a6" stroke-width="1"/>');
    /* 每台车两根托臂（前 / 后轮），托臂朝屏幕外 → 画成短托 + 轮托 */
    for (var i = 0; i < n; i++){
      var uc = rowBikeU(s, r, i);
      [-1, 1].forEach(function(sg){
        var uu = uc + sg * 0.55 * scl;
        var xa = X(uu);
        g.push('<line x1="' + xa + '" y1="' + r2(yr + 0.02 * sc) + '" x2="' + xa + '" y2="' + r2(yr + 0.16 * sc) + '" stroke="#9aa0a6" stroke-width="1.6"/>');
        g.push('<path d="M' + r2(xa - 0.07 * sc) + ' ' + r2(yr + 0.16 * sc) + ' L' + xa + ' ' + r2(yr + 0.05 * sc) + ' L' + r2(xa + 0.07 * sc) + ' ' + r2(yr + 0.16 * sc) + '" fill="none" stroke="#8f959b" stroke-width="1.6"/>');
      });
      /* 车（侧视剪影）：与 3D 同一套坐标（x 沿车长、z 高度） */
      var col = (r.size === 'kids') ? '#e0a35e' : '#6d747c';
      var colS = (r.size === 'kids') ? '#a97838' : '#454b52';
      var tire = (r.size === 'kids') ? '#a86f28' : '#3a3f45';
      function P(px, pz){ return [r2(X(uc + px * scl)), r2(Y(r.z + pz * scl))]; }
      function bar(A, B, w2){
        var a = P(A[0], A[1]), b = P(B[0], B[1]);
        g.push('<line x1="' + a[0] + '" y1="' + a[1] + '" x2="' + b[0] + '" y2="' + b[1] + '" stroke="' + col + '" stroke-width="' + r2(Math.max(1.2, w2 * scl * sc)) + '" stroke-linecap="round"/>');
      }
      [-0.55, 0.55].forEach(function(wx){
        var c = P(wx, 0.35), rr = r2(0.35 * scl * sc);
        g.push('<circle cx="' + c[0] + '" cy="' + c[1] + '" r="' + rr + '" fill="none" stroke="' + tire + '" stroke-width="' + r2(Math.max(1.6, 0.05 * scl * sc)) + '"/>');
        g.push('<circle cx="' + c[0] + '" cy="' + c[1] + '" r="' + r2(Math.max(0.7, 0.03 * scl * sc)) + '" fill="' + colS + '"/>');
      });
      bar([-0.26, 0.90], [0.40, 0.86], 0.07);
      bar([-0.10, 0.33], [0.40, 0.84], 0.08);
      bar([-0.10, 0.33], [-0.26, 0.90], 0.07);
      bar([-0.10, 0.33], [-0.55, 0.35], 0.05);
      bar([-0.26, 0.90], [-0.55, 0.35], 0.05);
      bar([0.42, 0.86], [0.55, 0.35], 0.06);
      bar([0.42, 0.86], [0.50, 0.99], 0.06);
      bar([0.38, 0.99], [0.62, 0.99], 0.07);          /* 车把 */
      bar([-0.36, 0.93], [-0.20, 0.93], 0.09);        /* 车座 */
    }
    /* 排标号 + 命中区（点它 = 选中该排；拖动 = 移动/改高度） */
    g.push('<g data-row="' + esc(r.id) + '" data-id="sh:' + esc(s.id) + '" data-rowi="' + ri + '">'
      + '<rect x="' + x0 + '" y="' + r2(yr - 1.18 * sc) + '" width="' + r2(+x1 - +x0) + '" height="' + r2(1.3 * sc) + '" fill="transparent" style="cursor:grab"/>'
      + '</g>');
    var badgeX = +x0 - 12, badgeY = r2(yr - 0.02 * sc);
    g.push('<text x="' + badgeX + '" y="' + badgeY + '" text-anchor="end" font-size="11" fill="' + (on ? '#7a5b06' : MUT) + '">'
      + (ri + 1) + '</text>');
    if (on){
      g.push('<g data-rowhandle="' + esc(r.id) + ':0"><circle cx="' + x0 + '" cy="' + yr + '" r="7" fill="#fff" stroke="' + ACC + '" stroke-width="2" style="cursor:ew-resize"/></g>');
      g.push('<g data-rowhandle="' + esc(r.id) + ':1"><circle cx="' + x1 + '" cy="' + yr + '" r="7" fill="#fff" stroke="' + ACC + '" stroke-width="2" style="cursor:ew-resize"/></g>');
      g.push('<text x="' + r2((+x0 + +x1) / 2) + '" y="' + r2(yr - 1.26 * sc) + '" text-anchor="middle" font-size="11.5" fill="#7a5b06">'
        + (r.len === 'long' ? '长托臂 1m' : '短托臂 0.5m') + ' · ' + (r.size === 'kids' ? '16″ 童车' : '成人车')
        + ' ×' + n + ' · 离地 ' + fnum(r.z) + 'm</text>');
    }
    o.push('<g data-rowgroup="' + esc(r.id) + '">' + g.join('') + '</g>');
  });

  if (!rows.length){
    o.push('<text x="' + r2(mx + L * sc / 2) + '" y="' + r2(Y(H / 2)) + '" text-anchor="middle" font-size="13" fill="' + MUT + '">'
      + names[viewFace] + '还没有托臂排：点上方「＋短托臂 / ＋长托臂」添加'
      + (otherRows ? '（' + names[otherFace] + '已有 ' + otherRows + ' 排）' : '') + '</text>');
  }
  /* 地架 / 挂钩在正面上看不到（贴在货架前缘 / 地面），给一行说明避免误以为丢了 */
  var extra = [];
  if (acc.rack !== 'none'){
    var rf = resolveFaces(s, cfg, acc.rackSide);
    extra.push('地架 ' + (rackCount(s) * rf.length) + ' 个' + (rf.length > 1 ? '（两面）' : '·' + names[rf[0]]));
  }
  if (acc.hook === 'on'){
    var hf = resolveFaces(s, cfg, acc.hookSide);
    extra.push('挂钩 ' + (hookCount(s) * hf.length) + ' 个' + (hf.length > 1 ? '（两面）' : '·' + names[hf[0]]));
  }
  if (extra.length){
    o.push('<text x="' + mx + '" y="' + r2(my + 44) + '" font-size="11.5" fill="' + MUT + '">'
      + esc(extra.join(' · ')) + '（在 3D / 平面视图查看）</text>');
  }
  var rowBikes = 0;
  rows.forEach(function(r){ rowBikes += rowBikeCount(s, r); });
  o.push('<text x="' + mx + '" y="' + 22 + '" font-size="12.5" fill="' + INK + '">'
    + esc(s.name || '货架') + ' · 长 ' + fnum(L) + 'm · 高 ' + fnum(H) + 'm · ' + (s.kind === 'double' ? '双面' : (s.kind === 'single' ? '单面' : '矮货架'))
    + ' · 正在看「' + names[viewFace] + '」' + (rows.length ? ' · 托臂 ' + rows.length + ' 排 / ' + rowBikes + ' 台' : '')
    + (otherRows ? ' · ' + names[otherFace] + '另有 ' + otherRows + ' 排' : '') + '</text>');
  o.push('</svg>');
  return { svg: o.join(''), meta: { scale: sc, mx: mx, my: my, len: r2(L), h: r2(H), shelfId: s.id,
    face: viewFace, faceName: names[viewFace], rows: rows.length, otherRows: otherRows } };
}

/* ======================== ASCII 布局转储（调试用） ======================== */
function asciiDump(cfg, cols){
  cols = cols || 100;
  var W = cfg.space.w, D = cfg.space.d;
  var cw = W/cols, chh = cw*2;
  var rows = Math.max(8, Math.round(D/chh));
  var grid = [];
  for (var r=0; r<rows; r++){ grid.push(new Array(cols).fill(' ')); }
  function put(x0,y0,x1,y1,c){
    if (x1<x0){ var t=x0; x0=x1; x1=t; }
    if (y1<y0){ var t2=y0; y0=y1; y1=t2; }
    var a=Math.max(0, Math.floor(x0/cw)), b=Math.min(cols-1, Math.floor(x1/cw));
    var c0=Math.max(0, Math.floor(y0/chh)), c1=Math.min(rows-1, Math.floor(y1/chh));
    if (b<a) b=a; if (c1<c0) c1=c0;
    for (var rr=c0; rr<=c1; rr++){ for (var cc2=a; cc2<=b; cc2++){ grid[rr][cc2]=c; } }
  }
  /* 墙段只登记它自己占的那一段（缩短 / 偏移 / 旋转后不再整边封死） */
  [['top', [0, -0.3, W, 0.3]], ['bottom', [0, D-0.3, W, D+0.3]],
   ['left', [-0.3, 0, 0.3, D]], ['right', [W-0.3, 0, W+0.3, D]]].forEach(function(pair){
    var side = pair[0], e = cfg.walls[side], d2 = pair[1];
    if (!e || !e.on) return;
    if (wallIsDefault(cfg, side)){ put(d2[0], d2[1], d2[2], d2[3], '#'); return; }
    var b = wallBounds(cfg, side);
    put(b.x, b.y, b.x + b.w, b.y + b.h, '#');
  });
  cfg.zones.forEach(function(zn){ put(zn.x, zn.y, zn.x+zn.w, zn.y+zn.h, zn.kind==='storage' ? 'G' : (zn.kind==='test' ? 'r' : (zn.kind==='passage' ? 't' : 'o'))); });
  (cfg.entrances||[]).forEach(function(en){ put(en.x, en.y, en.x+en.w, en.y+en.h, 'e'); });
  (cfg.curtains||[]).forEach(function(ct){ if (ct.orient==='v') put(ct.x-0.1, ct.y, ct.x+0.1, ct.y+ct.len, 'C'); else put(ct.x, ct.y-0.1, ct.x+ct.len, ct.y+0.1, 'C'); });
  (cfg.bikes||[]).forEach(function(bk){ put(bk.x-0.7, bk.y-0.7, bk.x+0.7, bk.y+0.7, 'b'); });
  cfg.wallSegs.forEach(function(ws){
    if (wallSegRot(ws)){
      var bI = boundsOfPts(wallSegCorners(ws));
      put(bI.x, bI.y, bI.x + bI.w, bI.y + bI.h, 'H');
      return;
    }
    if (ws.orient==='v') put(ws.at-ws.thick/2, ws.from, ws.at+ws.thick/2, ws.to, 'H');
    else put(ws.from, ws.at-ws.thick/2, ws.to, ws.at+ws.thick/2, 'H');
  });
  cfg.meshes.forEach(function(ms){
    if (ms.orient==='v') put(ms.x-0.1, ms.y, ms.x+0.1, ms.y+ms.len, 'M');
    else put(ms.x, ms.y-0.1, ms.x+ms.len, ms.y+0.1, 'M');
  });
  var st = cfg.studio;
  put(st.x, st.y, st.x+st.w, st.y+st.h, 'T');
  cfg.shelves.forEach(function(s){ var rc = shelfRect(s); put(rc.x, rc.y, rc.x+rc.w, rc.y+rc.h, s.kind==='double' ? 'S' : 's'); });
  cfg.pillars.forEach(function(p){ var s2 = p.s || 1; put(p.x-s2/2, p.y-s2/2, p.x+s2/2, p.y+s2/2, 'P'); });
  cfg.markers.forEach(function(mk){ put(mk.x, mk.y, mk.x+mk.w, mk.y+mk.h, 'm'); });
  var lines = ['ASCII plan '+cols+'x'+rows+'  (1 cell ≈ '+r2(cw)+'×'+r2(chh)+' m)'];
  for (var rr2=0; rr2<rows; rr2++){ lines.push(grid[rr2].join('')); }
  return lines.join('\n');
}

/* ======================== 随机方案生成 ======================== */
function _rb(a,b){ return a + Math.random()*(b-a); }
function _rs(v, st){ return Math.round(v/st)*st; }
function _pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
var _uid = 0;

function buildRandomCandidate(baseCfg){
  var c2 = JSON.parse(JSON.stringify(baseCfg));
  function sid(){ _uid++; return 'g' + _uid; }
  var shelves = [];
  var fam = Math.random() < 0.62 ? 'h' : 'v';
  if (fam === 'h'){
    var y1 = _rs(_rb(2.4, 2.9), 0.1);
    var rx = _rs(_rb(13.6, 14.4), 0.1);
    var ll = _rs(_rb(7.0, 8.0), 0.5);
    var lxMax = rx - 5.0 - ll;
    if (lxMax < 1.2) return null;
    var lx = _rs(_rb(1.2, Math.min(2.6, lxMax)), 0.1);
    var rl = Math.min(_rs(_rb(5.0, 6.0), 0.5), 19.6 - rx);
    if (ll + rl < 13.0) return null;
    [[lx, ll], [rx, rl]].forEach(function(pr){
      [y1, y1 + 5.5].forEach(function(yy){
        shelves.push({ id:sid(), kind:'double', orient:'h', x:pr[0], y:_rs(yy, 0.1), len:pr[1], h:SHELF_H_DEFAULT });
      });
    });
  } else {
    var x1 = _rs(_rb(1.6, 2.4), 0.1);
    var x2 = _rs(_rb(8.4, 9.2), 0.1);
    var x3 = _rs(Math.min(15.2, Math.max(x2 + 5.5, 14.2)), 0.1);
    var y0 = _rs(_rb(2.4, 3.0), 0.1);
    var l1 = Math.min(_rs(_rb(10.5, 12.0), 0.5), 13.5 - y0);
    var l2 = Math.min(_rs(_rb(10.5, 12.0), 0.5), 13.5 - y0);
    var l3 = Math.min(_rs(_rb(4.5, 6.5), 0.5), 13.5 - y0, 19.6 - x3);
    if (l1 + l2 + l3 < 26.0) return null;
    [[x1, l1], [x2, l2], [x3, l3]].forEach(function(pr){
      shelves.push({ id:sid(), kind:'double', orient:'v', x:pr[0], y:y0, len:pr[1], h:SHELF_H_DEFAULT });
    });
  }
  c2.shelves = shelves;

  var studio = { x:15.9, y:9.05, w:4, h:4, wallH:2.2,
                 sides:{ n:'wall', e:'none', s:'door', w:'window' }, doorW:1.2,
                 peg:{ on:true, side:'e', face:'in', panels:2 } };
  studio.y = _rs(_rb(8.95, 9.15), 0.05);
  if (Math.random() < 0.6){
    studio.x = _rs(_rb(15.86, 15.94), 0.01);
    studio.sides = { n:'wall', e:'none', s:'door', w:'window' };
    studio.peg.side = 'e';
  } else {
    var sxMax = 15.4;
    if (fam === 'v') sxMax = Math.min(15.4, x3 - 4.2);
    studio.x = _rs(_rb(9.8, Math.max(9.8, sxMax)), 0.1);
    var ms = _pick(['n','e','s','w']);
    var rest = ['n','e','s','w'].filter(function(sd){ return sd !== ms; });
    var ds = _pick(rest);
    var ws = _pick(rest.filter(function(sd){ return sd !== ds; }));
    studio.sides = { n:'wall', e:'wall', s:'wall', w:'wall' };
    studio.sides[ms] = 'mesh'; studio.sides[ds] = 'door'; studio.sides[ws] = 'window';
    studio.peg.side = ms;
  }
  c2.studio = studio;

  c2.zones = (c2.zones || []).filter(function(z){ return z.kind !== 'test'; });
  var tw = _rs(_rb(7.5, 9.0), 0.5);
  var tx = _rs(_rb(8.2, 17.4 - tw), 0.1);
  var ty = _rs(_rb(13.6, 13.8), 0.1);
  var th = Math.min(_rs(_rb(2.6, 3.0), 0.1), 16.6 - ty);
  _uid++;
  c2.zones.push({ id:'zt'+_uid, kind:'test', x:tx, y:ty, w:tw, h:th, label:'骑行试用区', fence:null });
  c2.meshes = [];
  return c2;
}

function randomLayout(baseCfg){
  var best = null, bestScore = -1, bestWarn = 1e9, tries = 0;
  for (var i=0; i<900; i++){
    var cand = buildRandomCandidate(baseCfg);
    if (!cand) continue;
    tries++;
    var ck = computeChecks(cand);
    var score = (ck.okShelf?1:0)+(ck.okStudio?1:0)+(ck.okMesh?1:0)+(ck.okTest?1:0)+(ck.okAisle?1:0)+(ck.okEntrance?1:0);
    var clean = (score === 6 && ck.warnings.length === 0);
    if (clean) return { cfg: cand, tries: tries, clean: true, warnings: 0 };
    if (score > bestScore || (score === bestScore && ck.warnings.length < bestWarn)){
      best = cand; bestScore = score; bestWarn = ck.warnings.length;
    }
  }
  var use = best || buildRandomCandidate(baseCfg) || baseCfg;
  var ck2 = computeChecks(use);
  return { cfg: use, tries: tries, clean: (ck2.warnings.length===0 && ck2.okShelf && ck2.okStudio && ck2.okMesh && ck2.okTest && ck2.okAisle && ck2.okEntrance), warnings: ck2.warnings.length };
}

/* ======================== 旧版本数据迁移 / 差异评分 ======================== */
/* 把任意历史版本的配置转成当前格式（补齐缺失字段、旧自行车格式转换） */
function migrateLegacy(cfgIn){
  var c2 = deepMerge(defaultConfig(), cfgIn || {});
  var fromV = (+(cfgIn && cfgIn.v) || 1);
  (c2.bikes || []).forEach(function(b){
    if (b.angle != null && b.rot == null){
      /* 旧版：整车斜放 angle → 新版：90°直放 + 车头45° */
      var hit = null;
      (c2.shelves || []).forEach(function(s){
        var r = shelfRect(s);
        if (b.x > r.x-0.6 && b.x < r.x+r.w+0.6 && b.y > r.y-0.6 && b.y < r.y+r.h+0.6) hit = s;
      });
      if (hit){
        var rr = shelfRect(hit);
        var dir = bestBikeDir(c2, hit, b.type);
        var blen = (b.type === 'kids') ? BIKE_LEN.kids : BIKE_LEN.adult;
        var off = blen * 0.42;
        var u = (hit.orient === 'h') ? (b.x - rr.x) : (b.y - rr.y);
        u = Math.min(Math.max(u, 0.3), Math.max(0.3, hit.len - 0.3));
        b.rot = (dir === 'n') ? 270 : (dir === 'e') ? 0 : (dir === 'w') ? 180 : 90;
        if (hit.orient === 'h'){
          b.x = Math.round((rr.x + u) * 100) / 100;
          b.y = Math.round(((dir === 'n') ? (rr.y - off) : (rr.y + rr.h + off)) * 100) / 100;
        } else {
          b.y = Math.round((rr.y + u) * 100) / 100;
          b.x = Math.round(((dir === 'e') ? (rr.x + rr.w + off) : (rr.x - off)) * 100) / 100;
        }
      } else {
        b.rot = 90;
      }
      b.steer = 45;
      b.pose = b.pose || 'stand';
      delete b.angle;
    } else {
      if (b.rot == null) b.rot = 90;
      if (b.steer == null) b.steer = 45;
      if (b.pose == null) b.pose = 'stand';
    }
  });
  /* 2026-09-15：门店货架实际高度 3.3m —— 旧默认 1.5m 一次性升版
     （只在 cfg.v < 2 时执行，之后用户自己改成别的值不会被反复覆盖；矮货架 0.9m 不动） */
  if (fromV < 2){
    (c2.shelves || []).forEach(function(s){
      if (s.h != null && s.kind !== 'low' && Math.abs(+s.h - 1.5) < 1e-6) s.h = SHELF_H_DEFAULT;
    });
  }
  /* 旧版单条托臂（acc.arm = adult/kids）→ 托臂排数组（幂等） */
  (c2.shelves || []).forEach(function(s){
    var a2 = s.acc;
    if (!a2) return;
    if (!Array.isArray(a2.armRows) && (a2.arm === 'adult' || a2.arm === 'kids')){
      a2.armRows = [{ id:'a1', z: defaultArmZ(s), len: 'short', size: a2.arm,
                      u0: 0.2, u1: Math.max(0.9, (+s.len || 4) - 0.2) }];
    }
    delete a2.arm;
  });
  c2.v = 2;
  return c2;
}

/* 比较两份配置的差异程度（用于判断哪份是“用户真正调过的”）。
   忽略 v / bikes（自行车格式跨版本变化，不参与评分） */
function configDiff(base, other){
  var score = 0;
  function walk(x, y, key){
    if (key === 'v' || key === 'bikes') return;
    if (x === null || typeof x !== 'object'){
      if (typeof x === 'number' || typeof x === 'string' || typeof x === 'boolean'){
        if (x !== y) score++;
      }
      return;
    }
    if (Array.isArray(x)){
      if (!Array.isArray(y)){ score++; return; }
      var n = Math.min(x.length, y.length);
      for (var i=0;i<n;i++) walk(x[i], y[i]);
      return;
    }
    for (var kk in x){ walk(x[kk], (y && typeof y === 'object') ? y[kk] : undefined, kk); }
  }
  walk(base, other, null);
  return score;
}

return {
  randomLayout: randomLayout,
  itemRect: itemRect,
  migrateLegacy: migrateLegacy,
  configDiff: configDiff,
  bikesForShelf: bikesForShelf,
  bestBikeDir: bestBikeDir,
  accOf: accOf,
  accOn: accOn,
  shelfBox: shelfBox,
  boxKeyRange: boxKeyRange,
  accFace: accFace,
  accBikesOf: accBikesOf,
  armHardwareOf: armHardwareOf,
  renderShelfFront: renderShelfFront,
  faceNames: faceNames,
  normFace: normFace,
  normSide: normSide,
  resolveFaces: resolveFaces,
  rowFace: rowFace,
  armRowsOnFace: armRowsOnFace,
  rowBikeCount: rowBikeCount,
  rowBikeU: rowBikeU,
  armBikeCount: armBikeCount,
  nextArmZ: nextArmZ,
  defaultArmZ: defaultArmZ,
  rackCount: rackCount,
  hookCount: hookCount,
  ARM_SLOT: ARM_SLOT,
  ARM_LEN: ARM_LEN,
  SHELF_H_DEFAULT: SHELF_H_DEFAULT,
  BIKE_LEN: BIKE_LEN,
  BIKE_SLOT: BIKE_SLOT,
  VERSION: VERSION,
  WALL_T: WALL_T,
  defaultConfig: defaultConfig,
  computeChecks: computeChecks,
  render3D: render3D,
  renderPlan: renderPlan,
  asciiDump: asciiDump,
  deepMerge: deepMerge,
  fnum: fnum,
  r2: r2,
  clamp: clamp,
  shelfDepth: shelfDepth,
  shelfRect: shelfRect,
  shelfRot: shelfRot,
  shelfCorners: shelfCorners,
  shelfBounds: shelfBounds,
  shelfLocalPt: shelfLocalPt,
  shelfRotPt: shelfRotPt,
  /* 墙体几何（2026-09-17）：外墙可编辑长度 / 横竖 / 旋转，内外墙同一套口径 */
  WALL_SIDES: WALL_SIDES,
  rotDeg: rotDeg,
  rotPt: rotPt,
  boundsOfPts: boundsOfPts,
  wallGeom: wallGeom,
  wallStart: wallStart,
  wallLength: wallLength,
  wallOffset: wallOffset,
  wallRot: wallRot,
  wallPt: wallPt,
  wallCenterPt: wallCenterPt,
  wallBandCorners: wallBandCorners,
  wallBounds: wallBounds,
  wallSegSpans: wallSegSpans,
  wallIsDefault: wallIsDefault,
  wallSegRot: wallSegRot,
  wallSegSpan: wallSegSpan,
  wallSegCenter: wallSegCenter,
  wallSegCorners: wallSegCorners,
  pillarRect: pillarRect,
  segsOf: segsOf,
  heightByMode: heightByMode
};
});
