/* ==========================================================================
   门店设计 · 数据模型（纯数据：无 DOM、无样式、无事件）
   --------------------------------------------------------------------------
   两个界面实现各自渲染同一份视图模型：
       sd-ui-mobile.js   移动端（底部面板 + 快捷条）
       sd-ui-desktop.js  桌面端（右侧参数栏）
   本文件只回答「有哪些字段、标题是什么、单位是什么、点了哪个动作」，
   不回答「长什么样」。字段的 DOM、布局与样式全部归各自的 UI 实现所有。

   字段描述符（两种 UI 都要认识的最小契约）：
     { kind:'number', path, label, value, unit?, min?, max?, step?, hint? }
     { kind:'text',   path, label, value, placeholder? }
     { kind:'select', path, label, value, options:[[value,label],…] }
     { kind:'toggle', path, label, value }
     { kind:'note',   text, tone? }                    只读提示行
   动作描述符：
     { act, id?, label, tone?:'primary'|'danger' }
   注意：path / act 名称与旧版面板完全一致，app.js 的事件处理无需改动。
   ========================================================================== */
(function(){
'use strict';

var KIND = { sh:'货架', st:'工作室', zn:'区域', pl:'柱子', mk:'标记', ms:'网面墙', en:'出入口净空', ct:'门帘', bk:'自行车', iw:'内隔墙', wl:'外墙' };
var SHELF_KINDS = [['double','双面'],['single','单面'],['low','矮货架']];
var ORIENT_HV = [['h','东西向'],['v','南北向']];
var FENCE = [['none','无'],['wall','矮墙'],['mesh','网面']];
var SIDES = [['wall','实墙'],['window','玻璃窗'],['mesh','网面'],['door','门洞'],['none','无']];

function E(){ return window.Engine; }
function num(v){ return E().fnum(v); }

/* ---------- 字段构造 ---------- */
function number(path, label, value, opts){
  var o = { kind:'number', path:path, label:label, value:value };
  if (opts) for (var k in opts) o[k] = opts[k];
  return o;
}
function text(path, label, value, placeholder){
  return { kind:'text', path:path, label:label, value:value == null ? '' : value, placeholder:placeholder || '' };
}
function select(path, label, value, options){ return { kind:'select', path:path, label:label, value:value, options:options }; }
function toggle(path, label, value){ return { kind:'toggle', path:path, label:label, value:!!value }; }
function note(text, tone){ return { kind:'note', text:text, tone:tone || '' }; }
function action(act, id, label, tone){ return { act:act, id:id, label:label, tone:tone || '' }; }

/* ---------- 检查清单（只读派生数据） ---------- */
function checklist(ck){
  return [
    { tone: ck.okShelf ? 'ok' : 'bad', label:'双面货架总长', value: num(ck.sumDouble) + ' m',
      hint:'目标 ≥26 m · 单面 ' + num(ck.sumSingle) + ' m 另计（' + ck.countDouble + ' 组）' },
    { tone: ck.okStudio ? 'ok' : 'bad', label:'工作室尺寸', value: ck.studioInfo, hint:'每边 ≥4 m' },
    { tone: ck.okMesh ? 'ok' : 'bad', label:'网面背靠', value: ck.meshInfo, hint:'' },
    { tone: ck.okAisle ? 'ok' : 'bad', label:'货道间距', value: ck.aisleInfo, hint:'平行相对货架排之间净距 ≥5 m' },
    { tone: ck.okTest ? 'ok' : 'bad', label:'骑行试用区', value: ck.okTest ? ck.testInfo : '未设置', hint:'' },
    { tone: ck.okEntrance ? 'ok' : 'bad', label:'出入口净空', value: ck.entranceInfo, hint:'三个出入口各需一块净空区' }
  ];
}
function statusItems(ck){
  var items = [
    { tone: ck.okShelf ? 'ok' : 'bad', text:'双面 ' + num(ck.sumDouble) + 'm' },
    { tone: ck.okStudio ? 'ok' : 'bad', text:'工作室 ' + ck.studioInfo },
    { tone: ck.okMesh ? 'ok' : 'bad', text:'网面背靠' },
    { tone: ck.okAisle ? 'ok' : 'bad', text:'货道 ≥5m' + (ck.minAisle != null ? '（' + num(Math.round(ck.minAisle * 10) / 10) + '）' : '') },
    { tone: ck.okTest ? 'ok' : 'bad', text:'试用区' },
    { tone: ck.okEntrance ? 'ok' : 'bad', text:'出入口净空' }
  ];
  if (ck.bikeAdult || ck.bikeKid) items.push({ tone:'info', text:'🚲 成人 ' + ck.bikeAdult + ' · 童车 ' + ck.bikeKid });
  if (ck.accArm || ck.accRack || ck.accHook){
    items.push({ tone:'info', text:'托臂 ' + ck.accArm + ' 台' + (ck.accArmRows ? '（' + ck.accArmRows + ' 排）' : '')
      + (ck.accRack ? ' · 地架 ' + ck.accRack : '') + (ck.accHook ? ' · 挂钩 ' + ck.accHook : '') });
  }
  if (ck.warnings && ck.warnings.length) items.push({ tone:'warn', text:'⚠ ' + ck.warnings.length + ' 条提示' });
  return items;
}

/* ---------- 各类型元素的字段 ---------- */
function shelfFields(s, i){
  var acc = E().accOf(s);
  var hS = (s.h == null) ? E().SHELF_H_DEFAULT : s.h;
  var fn = E().faceNames(s);
  var FACE_OPTS = [['auto', '自动（朝空侧）'], ['pos', fn.pos], ['neg', fn.neg]];
  var isDouble = (s.kind === 'double');
  var f = [
    text('shelves.' + i + '.name', '名称', s.name, '如 A区热销'),
    select('shelves.' + i + '.kind', '类型', s.kind, SHELF_KINDS),
    select('shelves.' + i + '.orient', '朝向', s.orient, ORIENT_HV),
    number('shelves.' + i + '.len', '长度', s.len, { unit:'m', min:0.3, max:100, step:0.1 }),
    number('shelves.' + i + '.h', '高度', hS, { unit:'m', min:0.5, max:4, step:0.1 }),
    /* 斜放（2026-09-17）：任意角度；快捷条「旋转」键每次 +45°，属性栏下方还有
       横/竖/四个斜 45° 的一键预设（见 shelfActions）。 */
    number('shelves.' + i + '.rot', '旋转角度', E().shelfRot(s), { unit:'°', min:0, max:345, step:5 })
  ];
  /* 自行车托臂：按「排」放置（短托臂 0.5m / 长托臂 1m 可分别放、每排高度可调）；
     每排可用「起始 / 结束位置」限定只占货架的一段（左右混排）。 */
  acc.rows.forEach(function(r, ri){
    f.push(note('托臂排 ' + (ri + 1) + '：' + (r.len === 'long' ? '长托臂 1m' : '短托臂 0.5m')
      + ' · ' + (r.size === 'kids' ? '16″ 童车' : '成人车')
      + ' ×' + E().rowBikeCount(s, r) + ' 台'));
    f.push(number('shelves.' + i + '.acc.armRows.' + ri + '.z', '　高度（离地）', r.z,
      { unit:'m', min:0.2, max: Math.max(0.5, hS - 0.85), step:0.05 }));
    f.push(select('shelves.' + i + '.acc.armRows.' + ri + '.len', '　托臂长度', r.len,
      [['short','短托臂 0.5m'],['long','长托臂 1m']]));
    f.push(select('shelves.' + i + '.acc.armRows.' + ri + '.size', '　车型', r.size,
      [['adult','成人车（2m/台）'],['kids','16″ 童车（4/3m/台）']]));
    f.push(number('shelves.' + i + '.acc.armRows.' + ri + '.u0', '　起始位置', r.u0,
      { unit:'m', min:0, max:s.len, step:0.1 }));
    f.push(number('shelves.' + i + '.acc.armRows.' + ri + '.u1', '　结束位置', r.u1,
      { unit:'m', min:0, max:s.len, step:0.1 }));
    if (isDouble) f.push(select('shelves.' + i + '.acc.armRows.' + ri + '.face', '　挂载面', r.face, FACE_OPTS));
  });
  var SIDE_OPTS = [['auto', '自动（朝空侧）'], ['pos', fn.pos], ['neg', fn.neg], ['both', '两面都装']];
  f.push(select('shelves.' + i + '.acc.rack', '地架排车', acc.rack, [['none','不装'],['adult','成人车'],['kids','童车']]));
  if (isDouble && acc.rack !== 'none') f.push(select('shelves.' + i + '.acc.rackSide', '　地架挂载面', acc.rackSide, SIDE_OPTS));
  f.push(select('shelves.' + i + '.acc.hook', '自行车挂钩', acc.hook, [['none','不装'],['on','装（4 个/米）']]));
  if (isDouble && acc.hook === 'on') f.push(select('shelves.' + i + '.acc.hookSide', '　挂钩挂载面', acc.hookSide, SIDE_OPTS));
  f.push(number('shelves.' + i + '.x', 'x 坐标', s.x, { unit:'m', min:0, max:200, step:0.1 }));
  f.push(number('shelves.' + i + '.y', 'y 坐标', s.y, { unit:'m', min:0, max:200, step:0.1 }));
  return f;
}
function shelfActions(s){
  var rotNow = E().shelfRot(s);
  function pose(orient, deg, label){
    var on = (orient === (s.orient === 'v' ? 'v' : 'h')) && (rotNow === deg);
    return action('setPose', s.id + ':' + orient + ':' + deg, (on ? '● ' : '') + label);
  }
  return [
    /* 摆放姿态预设：横 / 竖 / 四个方位的斜 45°（用户 2026-09-17 要求） */
    pose('h', 0, '横放'), pose('v', 0, '竖放'),
    pose('h', 45, '斜45°'), pose('h', 135, '斜135°'), pose('h', 225, '斜225°'), pose('h', 315, '斜315°'),
    action('openFront', s.id, '🧍 正面视角'),
    action('flushWall', s.id + ':n', '贴北墙'), action('flushWall', s.id + ':s', '贴南墙'),
    action('flushWall', s.id + ':w', '贴西墙'), action('flushWall', s.id + ':e', '贴东墙'),
    action('dupShelf', s.id, '复制'), action('delShelf', s.id, '删除', 'danger')
  ];
}
function studioFields(st){
  return [
    text('studio.name', '名称', st.name, '工作室名称'),
    number('studio.w', '宽', st.w, { unit:'m', min:2, max:20, step:0.5 }),
    number('studio.h', '深', st.h, { unit:'m', min:2, max:20, step:0.5 }),
    number('studio.wallH', '墙高', st.wallH, { unit:'m', min:0.8, max:3.5, step:0.1 }),
    number('studio.x', 'x 坐标', st.x, { unit:'m', min:0, max:200, step:0.1 }),
    number('studio.y', 'y 坐标', st.y, { unit:'m', min:0, max:200, step:0.1 }),
    select('studio.sides.n', '北侧', st.sides.n, SIDES),
    select('studio.sides.e', '东侧', st.sides.e, SIDES),
    select('studio.sides.s', '南侧', st.sides.s, SIDES),
    select('studio.sides.w', '西侧', st.sides.w, SIDES),
    number('studio.doorW', '门洞宽', st.doorW, { unit:'m', min:0.6, max:3, step:0.1 }),
    toggle('studio.peg.on', '洞洞板', st.peg && st.peg.on),
    number('studio.peg.panels', '洞洞板数量', (st.peg && st.peg.panels) || 2, { min:1, max:4, step:1 }),
    select('studio.peg.side', '洞洞板面', (st.peg && st.peg.side) || 'e', [['n','北'],['e','东'],['s','南'],['w','西']]),
    select('studio.peg.face', '洞洞板朝向', (st.peg && st.peg.face) || 'in', [['in','内侧'],['out','外侧']])
  ];
}
function zoneFields(z, i){
  var f = [
    select('zones.' + i + '.kind', '类型', z.kind, [['storage','储物区'],['passage','通道区'],['test','骑行试用区'],['other','其他']]),
    text('zones.' + i + '.label', '名称', z.label, '区域名称'),
    number('zones.' + i + '.w', '宽', z.w, { unit:'m', min:0.5, max:100, step:0.5 }),
    number('zones.' + i + '.h', '深', z.h, { unit:'m', min:0.5, max:100, step:0.5 }),
    number('zones.' + i + '.x', 'x 坐标', z.x, { unit:'m', min:0, max:200, step:0.1 }),
    number('zones.' + i + '.y', 'y 坐标', z.y, { unit:'m', min:0, max:200, step:0.1 })
  ];
  if (z.kind === 'storage'){
    var F0 = z.fence || {};
    f.push(select('zones.' + i + '.fence.n', '围栏·北', F0.n || 'none', FENCE));
    f.push(select('zones.' + i + '.fence.s', '围栏·南', F0.s || 'none', FENCE));
    f.push(select('zones.' + i + '.fence.w', '围栏·西', F0.w || 'none', FENCE));
    f.push(select('zones.' + i + '.fence.e', '围栏·东', F0.e || 'none', FENCE));
  }
  return f;
}
function entranceFields(en, i){
  return [
    text('entrances.' + i + '.name', '名称', en.name, '出入口名称'),
    number('entrances.' + i + '.w', '宽', en.w, { unit:'m', min:0.5, max:100, step:0.1 }),
    number('entrances.' + i + '.h', '深', en.h, { unit:'m', min:0.5, max:100, step:0.1 }),
    number('entrances.' + i + '.x', 'x 坐标', en.x, { unit:'m', min:0, max:200, step:0.1 }),
    number('entrances.' + i + '.y', 'y 坐标', en.y, { unit:'m', min:0, max:200, step:0.1 })
  ];
}
function pillarFields(p, i){
  return [
    number('pillars.' + i + '.s', '边长', p.s || 1, { unit:'m', min:0.3, max:3, step:0.1 }),
    number('pillars.' + i + '.x', 'x 坐标', p.x, { unit:'m', min:0, max:200, step:0.1 }),
    number('pillars.' + i + '.y', 'y 坐标', p.y, { unit:'m', min:0, max:200, step:0.1 })
  ];
}
function curtainFields(ct, i){
  return [
    select('curtains.' + i + '.orient', '朝向', ct.orient, ORIENT_HV),
    number('curtains.' + i + '.len', '长度', ct.len, { unit:'m', min:0.5, max:100, step:0.5 }),
    number('curtains.' + i + '.h', '高度', (ct.h == null ? 1.9 : ct.h), { unit:'m', min:0.5, max:3, step:0.1 }),
    number('curtains.' + i + '.x', 'x 坐标', ct.x, { unit:'m', min:0, max:200, step:0.1 }),
    number('curtains.' + i + '.y', 'y 坐标', ct.y, { unit:'m', min:0, max:200, step:0.1 })
  ];
}
function meshFields(ms, i){
  return [
    select('meshes.' + i + '.orient', '朝向', ms.orient, [['v','南北向'],['h','东西向']]),
    number('meshes.' + i + '.len', '长度', ms.len, { unit:'m', min:0.5, max:100, step:0.5 }),
    number('meshes.' + i + '.h', '高度', (ms.h == null ? 2 : ms.h), { unit:'m', min:0.5, max:3.5, step:0.1 }),
    number('meshes.' + i + '.x', 'x 坐标', ms.x, { unit:'m', min:0, max:200, step:0.1 }),
    number('meshes.' + i + '.y', 'y 坐标', ms.y, { unit:'m', min:0, max:200, step:0.1 })
  ];
}
function markerFields(mk, i){
  return [
    text('markers.' + i + '.label', '文字', mk.label, '标记文字'),
    select('markers.' + i + '.color', '颜色', mk.color, [['red','红'],['yellow','黄'],['green','绿'],['blue','蓝']]),
    number('markers.' + i + '.w', '宽', mk.w, { unit:'m', min:0.1, max:30, step:0.1 }),
    number('markers.' + i + '.h', '高', mk.h, { unit:'m', min:0.1, max:30, step:0.1 }),
    number('markers.' + i + '.x', 'x 坐标', mk.x, { unit:'m', min:0, max:200, step:0.1 }),
    number('markers.' + i + '.y', 'y 坐标', mk.y, { unit:'m', min:0, max:200, step:0.1 })
  ];
}
function bikeFields(bk, i){
  return [
    select('bikes.' + i + '.type', '车型', bk.type, [['adult','成人 2m'],['kids','童车 1.5m']]),
    select('bikes.' + i + '.pose', '摆放', (bk.pose === 'top') ? 'top' : 'stand', [['stand','立地'],['top','上架平放']]),
    number('bikes.' + i + '.rot', '朝向', bk.rot || 0, { unit:'°', min:0, max:350, step:45 }),
    number('bikes.' + i + '.steer', '车头', (bk.steer == null ? 45 : bk.steer), { unit:'°', min:-60, max:60, step:15 }),
    number('bikes.' + i + '.x', 'x 坐标', bk.x, { unit:'m', min:0, max:200, step:0.1 }),
    number('bikes.' + i + '.y', 'y 坐标', bk.y, { unit:'m', min:0, max:200, step:0.1 })
  ];
}

/* ---------- 元素清单（两个界面共用的一棵数据树） ----------
   注意：清单条目**不带字段**。字段只在「当前选中的那一个」上生成（见 buildVM →
   fieldsForItem）。旧版把所有元素的所有字段一次性铺在页面底部，默认就两百多个输入框；
   这就是用户说的「底下杂七杂八看得眼花」，所以这里是结构性约束，不要再改回去。 */
function elementGroups(cfg){
  var g = [];
  /* 墙体（2026-09-17 用户要求「灰色墙体要可编辑」）：外墙每侧一条、内隔墙每段一条，
     都能在平面里点选 / 在元素清单里选中后改参数；内隔墙还能拖动整段平移。 */
  g.push({ key:'wl', title:'外墙', items: WALL_SIDE_KEYS.map(function(key, i){
    var e = cfg.walls[key];
    var openCount = (e.open || []).length;
    var wLen = wallCurLen(cfg, key), wFrom = wallCurFrom(cfg, key);
    var wAt = isFinite(+e.at) ? +e.at : 0;
    var wRot = isFinite(+e.rot) ? (((+e.rot % 360) + 360) % 360) : 0;
    return { id:'wl:' + key, type:'wl', index:i, title: WALL_SIDE_TITLES[i],
      badge: (e.on === false ? '已关闭' : '长 ' + num(wLen) + 'm')
        + (wFrom ? ' · 起点 ' + num(wFrom) : '') + (wRot ? ' · ' + Math.round(wRot) + '°' : '')
        + (wAt ? ' · 偏移 ' + num(wAt) : '') + (openCount ? ' · 开口 ' + openCount : ''),
      actions: wallEdgeActions(cfg, key) };
  }) });
  if ((cfg.wallSegs || []).length) g.push({ key:'iw', title:'内隔墙', items: cfg.wallSegs.map(function(ws, i){
    var a = Math.min(+ws.from || 0, +ws.to || 0), b = Math.max(+ws.from || 0, +ws.to || 0);
    return { id:'iw:' + ws.id, type:'iw', index:i, title:'内隔墙 #' + (i + 1),
      badge: (ws.orient === 'v' ? '竖直' : '水平') + ' ' + num(b - a) + 'm'
        + (isFinite(+ws.rot) && Math.abs(+ws.rot % 360) > 1e-6 ? ' · ' + Math.round(((+ws.rot % 360) + 360) % 360) + '°' : ''),
      actions: [action('delSeg', ws.id, '删除', 'danger')] };
  }) });
  if (cfg.shelves.length){
    g.push({ key:'sh', title:'货架', items: cfg.shelves.map(function(s, i){
      var nA = E().bikesForShelf(s, 'adult').length, nK = E().bikesForShelf(s, 'kids').length;
      var acc = E().accOf(s), accBit = '';
      if (acc.rows.length){
        accBit += ' · 托臂×' + E().armBikeCount(s) + (acc.rows.length > 1 ? '(' + acc.rows.length + '排)' : '');
        if (s.kind === 'double'){
          var fn2 = E().faceNames(s);
          accBit += '[' + fn2.pos + E().armRowsOnFace(s, cfg, 'pos').length + '/' + fn2.neg + E().armRowsOnFace(s, cfg, 'neg').length + ']';
        }
      }
      if (acc.rack !== 'none') accBit += ' · 地架×' + E().rackCount(s);
      if (acc.hook === 'on') accBit += ' · 挂钩×' + E().hookCount(s);
      return { id:'sh:' + s.id, type:'sh', index:i, title: s.name ? s.name : ('货架 #' + (i + 1)),
        badge: (s.kind === 'double' ? '双面' : s.kind === 'single' ? '单面' : '矮货架') + ' ' + num(s.len) + 'm'
          + (E().shelfRot(s) ? ' · ' + num(E().shelfRot(s)) + '°' : '')
          + (nA + nK ? ' · 🚲' + (nA + nK) : '') + accBit,
        actions: shelfActions(s),
        extra: [
          action('fillb', s.id + ':adult:stand', '🚲 成人 ×' + nA),
          action('fillb', s.id + ':kids:stand', '🚲 童车 ×' + nK),
          action('fillb', s.id + ':adult:top', '⤓ 上架成人'),
          action('fillb', s.id + ':kids:top', '⤓ 上架童车'),
          action('addArm', s.id + ':short', '＋短托臂 0.5m'),
          action('addArm', s.id + ':long', '＋长托臂 1m')
        ].concat(acc.rows.map(function(r, ri){
          return action('delArmRow', s.id + ':' + ri, '删托臂排 ' + (ri + 1), 'danger');
        })).concat(acc.rows.length ? [action('clearArms', s.id, '清空托臂', 'danger')] : []) };
    }) });
  }
  g.push({ key:'st', title:'工作室', items: [{
    id:'st:studio', type:'st', index:0, title: cfg.studio.name || '工作室', badge: num(cfg.studio.w) + '×' + num(cfg.studio.h) + 'm',
    actions: [] }] });
  if (cfg.zones.length) g.push({ key:'zn', title:'区域', items: cfg.zones.map(function(z, i){
    return { id:'zn:' + z.id, type:'zn', index:i, title: z.label || ('区域 #' + (i + 1)), badge: num(z.w) + '×' + num(z.h) + 'm',
      actions: [action('delZone', z.id, '删除', 'danger')] };
  }) });
  if ((cfg.entrances || []).length) g.push({ key:'en', title:'出入口净空', items: cfg.entrances.map(function(en, i){
    return { id:'en:' + en.id, type:'en', index:i, title: en.name || ('出入口 #' + (i + 1)), badge: num(en.w) + '×' + num(en.h) + 'm',
      actions: [action('delEntrance', en.id, '删除', 'danger')] };
  }) });
  if ((cfg.curtains || []).length) g.push({ key:'ct', title:'门帘', items: cfg.curtains.map(function(ct, i){
    return { id:'ct:' + ct.id, type:'ct', index:i, title:'门帘 #' + (i + 1), badge: num(ct.len) + 'm',
      actions: [action('delCurtain', ct.id, '删除', 'danger')] };
  }) });
  if ((cfg.meshes || []).length) g.push({ key:'ms', title:'网面墙', items: cfg.meshes.map(function(ms, i){
    return { id:'ms:' + ms.id, type:'ms', index:i, title:'网面墙 #' + (i + 1), badge: num(ms.len) + 'm',
      actions: [action('delMesh', ms.id, '删除', 'danger')] };
  }) });
  if ((cfg.markers || []).length) g.push({ key:'mk', title:'标记点', items: cfg.markers.map(function(mk, i){
    return { id:'mk:' + mk.id, type:'mk', index:i, title: mk.label || ('标记 #' + (i + 1)), badge:'',
      actions: [action('delMarker', mk.id, '删除', 'danger')] };
  }) });
  if ((cfg.pillars || []).length) g.push({ key:'pl', title:'柱子', items: cfg.pillars.map(function(p, i){
    return { id:'pl:' + p.id, type:'pl', index:i, title:'柱子 #' + (i + 1), badge: num(p.s || 1) + 'm',
      actions: [action('delPillar', p.id, '删除', 'danger')] };
  }) });
  if ((cfg.bikes || []).length) g.push({ key:'bk', title:'自行车', items: cfg.bikes.map(function(bk, i){
    return { id:'bk:' + bk.id, type:'bk', index:i, title: (bk.type === 'kids' ? '童车' : '成人车') + ' #' + (i + 1),
      badge:(bk.pose === 'top' ? '上架' : '立地') + (bk.rot ? ' · ' + bk.rot + '°' : ''),
      actions: [action('delBike', bk.id, '删除', 'danger')] };
  }) });
  return g;
}

/* ---------- 墙体字段（元素清单与设置页共用同一份，2026-09-17） ---------- */
var WALL_SIDE_KEYS = ['top', 'bottom', 'left', 'right'];
var WALL_SIDE_TITLES = ['上边（商场方向）', '下边', '左边', '右边'];
function wallEdgeLength(cfg, key){ return (key === 'top' || key === 'bottom') ? cfg.space.w : cfg.space.d; }
/* 外墙 = 一段可直接编辑的墙（2026-09-17 用户定案）：
   起点 / 墙长 / 横向偏移 / 旋转角度，开口相对「墙起点」计 —— 不再靠打缺口间接缩短。 */
function wallCurFrom(cfg, key){
  var e = cfg.walls[key], L = wallEdgeLength(cfg, key), f = +e.from;
  if (!isFinite(f)) f = 0;
  return Math.max(0, Math.min(f, Math.max(0, L - 0.2)));
}
function wallCurLen(cfg, key){
  var e = cfg.walls[key], L = wallEdgeLength(cfg, key), ln = +e.len;
  if (!isFinite(ln) || ln <= 0) ln = L;
  return Math.max(0.2, Math.min(ln, L - wallCurFrom(cfg, key)));
}
function wallEdgeFields(cfg, key){
  var e = cfg.walls[key], L = wallEdgeLength(cfg, key);
  var from = wallCurFrom(cfg, key), len = wallCurLen(cfg, key);
  var at = isFinite(+e.at) ? +e.at : 0;
  var rot = isFinite(+e.rot) ? (((+e.rot % 360) + 360) % 360) : 0;
  var across = (key === 'top' || key === 'bottom') ? '横放' : '竖放';
  var fields = [
    toggle('walls.' + key + '.on', '有墙', e.on),
    note('该边全长 ' + num(L) + ' m · 当前墙段 ' + across + ' ' + num(len) + ' m'),
    number('walls.' + key + '.from', '起点（沿该边）', from, { unit:'m', min:0, max:Math.max(0, L - 0.2), step:0.5 }),
    number('walls.' + key + '.len', '墙长', len, { unit:'m', min:0.2, max:Math.max(0.2, L - from), step:0.5 }),
    number('walls.' + key + '.at', '横向偏移（朝室内为正）', at, { unit:'m', min:-6, max:6, step:0.5 }),
    number('walls.' + key + '.rot', '旋转角度', rot, { unit:'°', min:0, max:345, step:5 })
  ];
  (e.open || []).forEach(function(op, i){
    fields.push(note('开口 ' + (i + 1) + ' · 起点相对墙起点，墙长 ' + num(len) + ' m'));
    /* 墙缩短后，落在墙外的开口不渲染 —— 面板里的起点也夹到墙长内（改回长墙时原值仍在数据里） */
    var opAt = Math.min(+op.at || 0, Math.max(0, len - 0.1));
    fields.push(number('walls.' + key + '.open.' + i + '.at', '开口起点', opAt, { unit:'m', min:0, max:len, step:0.1 }));
    fields.push(number('walls.' + key + '.open.' + i + '.w', '开口宽', op.w, { unit:'m', min:0, max:len, step:0.1 }));
    fields.push(select('walls.' + key + '.open.' + i + '.type', '开口类型', op.type, [['main','主入口'],['pass','通道'],['other','其他']]));
    fields.push(text('walls.' + key + '.open.' + i + '.label', '开口名称', op.label, '如 商场出入口'));
  });
  return fields;
}
function wallEdgeActions(cfg, key){
  var e = cfg.walls[key];
  var rotNow = isFinite(+e.rot) ? (((+e.rot % 360) + 360) % 360) : 0;
  var along = (key === 'top' || key === 'bottom') ? '横放（沿边）' : '竖放（沿边）';
  var turn = (key === 'top' || key === 'bottom') ? '竖放（转 90°）' : '横放（转 90°）';
  function pose(deg, label){ return action('setWallRot', key + ':' + deg, (rotNow === deg ? '● ' : '') + label); }
  return [
    pose(0, along), pose(90, turn), pose(45, '斜 45°'), pose(135, '斜 135°'), pose(225, '斜 225°'), pose(315, '斜 315°'),
    action('addOpen', key, '＋ 开口')
  ].concat((e.open || []).map(function(op, i){
    return action('delOpen', key + ':' + i, '删除开口 ' + (i + 1), 'danger');
  }));
}
function wallSegFields(cfg, i){
  var ws = cfg.wallSegs[i];
  return [
    select('wallSegs.' + i + '.orient', '朝向', ws.orient, [['v','竖直'],['h','水平']]),
    number('wallSegs.' + i + '.at', '位置', ws.at, { unit:'m', min:0, max:200, step:0.1 }),
    number('wallSegs.' + i + '.from', '从', ws.from, { unit:'m', min:0, max:200, step:0.1 }),
    number('wallSegs.' + i + '.to', '到', ws.to, { unit:'m', min:0, max:200, step:0.1 }),
    number('wallSegs.' + i + '.thick', '厚度', ws.thick, { unit:'m', min:0.1, max:2, step:0.05 }),
    number('wallSegs.' + i + '.rot', '旋转角度', (isFinite(+ws.rot) ? ((((+ws.rot % 360) + 360) % 360)) : 0), { unit:'°', min:0, max:345, step:5 })
  ];
}

/* ---------- 设置（结构级参数） ---------- */
function settingsGroups(cfg){
  var o = cfg.opt || {};
  var groups = [{
    key:'space', title:'空间与显示', hint:'图纸尺寸与显示开关',
    items: [{ id:'space', title:'', badge:'', fields:[
      number('space.w', '空间宽 x', cfg.space.w, { unit:'m', min:5, max:200, step:0.5 }),
      number('space.d', '空间深 y', cfg.space.d, { unit:'m', min:5, max:200, step:0.5 }),
      select('opt.wallH', '外墙高度', o.wallH, [['low','低墙 0.35m'],['half','半墙 1.2m'],['full','全墙 2.6m']]),
      toggle('opt.translucent', '外墙半透明', o.translucent),
      toggle('opt.grid', '显示网格', o.grid),
      toggle('opt.dims', '显示尺寸链', o.dims),
      toggle('opt.labels', '显示标签', o.labels)
    ], actions: [] }]
  }];
  var wallItems = WALL_SIDE_KEYS.map(function(key, i){
    var L = wallEdgeLength(cfg, key);
    return { id:'wall-' + key, title: WALL_SIDE_TITLES[i], badge:'长 ' + num(L) + 'm',
      fields: wallEdgeFields(cfg, key), actions: wallEdgeActions(cfg, key) };
  });
  groups.push({ key:'walls', title:'外墙与开口', hint:'每侧一条边，可加开口并命名', items: wallItems });
  groups.push({ key:'segs', title:'内隔墙', hint:'仓库围栏等', items: cfg.wallSegs.map(function(ws, i){
    return { id:'seg-' + ws.id, title:'内隔墙 #' + (i + 1), badge:'',
      fields:[
        select('wallSegs.' + i + '.orient', '朝向', ws.orient, [['v','竖直'],['h','水平']]),
        number('wallSegs.' + i + '.at', '位置', ws.at, { unit:'m', min:0, max:200, step:0.1 }),
        number('wallSegs.' + i + '.from', '从', ws.from, { unit:'m', min:0, max:200, step:0.1 }),
        number('wallSegs.' + i + '.to', '到', ws.to, { unit:'m', min:0, max:200, step:0.1 }),
        number('wallSegs.' + i + '.thick', '厚度', ws.thick, { unit:'m', min:0.1, max:2, step:0.05 }),
        number('wallSegs.' + i + '.rot', '旋转角度', (isFinite(+ws.rot) ? ((((+ws.rot % 360) + 360) % 360)) : 0), { unit:'°', min:0, max:345, step:5 })
      ], actions:[action('delSeg', ws.id, '删除', 'danger')] };
  }).concat([{ id:'seg-add', title:'新增内隔墙', badge:'', fields:[], actions:[action('addSeg', null, '+ 添加内隔墙')] }]) });
  return groups;
}

/* 选中项的字段（只有它需要，其余条目只显示标题与摘要）。 */
function fieldsForItem(type, cfg, index){
  if (type === 'sh') return shelfFields(cfg.shelves[index], index);
  if (type === 'wl') return wallEdgeFields(cfg, WALL_SIDE_KEYS[index]);
  if (type === 'iw') return wallSegFields(cfg, index);
  if (type === 'st') return studioFields(cfg.studio);
  if (type === 'zn') return zoneFields(cfg.zones[index], index);
  if (type === 'en') return entranceFields((cfg.entrances || [])[index], index);
  if (type === 'ct') return curtainFields((cfg.curtains || [])[index], index);
  if (type === 'ms') return meshFields((cfg.meshes || [])[index], index);
  if (type === 'mk') return markerFields((cfg.markers || [])[index], index);
  if (type === 'pl') return pillarFields((cfg.pillars || [])[index], index);
  if (type === 'bk') return bikeFields((cfg.bikes || [])[index], index);
  return [];
}

/* ---------- 左侧工具栏（建模软件的工具箱） ----------
   工具点击后就地添加一个元素并进入「摆放模式」（拖动屏幕定位），
   与旧版悬浮「＋」面板是同一套动作（acts.add → addComponent），
   只是入口从右下角悬浮按钮换成左侧常驻工具栏。 */
var TOOL_GROUPS = [
  { title:'货架', items:[
    { kind:'shelfD', label:'双面货架', icon:'▤' },
    { kind:'shelfS', label:'单面货架', icon:'▭' },
    { kind:'shelfL', label:'矮货架', icon:'▬' }
  ] },
  { title:'陈列', items:[
    { kind:'bikeA', label:'成人车 2m', icon:'🚲' },
    { kind:'bikeK', label:'童车 1.5m', icon:'🚲' },
    { kind:'marker', label:'标记点', icon:'◎' },
    { kind:'curtain', label:'门帘', icon:'🚪' }
  ] },
  { title:'空间', items:[
    { kind:'zone', label:'区域', icon:'▢' },
    { kind:'entrance', label:'出入口净空', icon:'⬚' },
    { kind:'mesh', label:'网面墙', icon:'▦' },
    { kind:'pillar', label:'柱子', icon:'■' }
  ] }
];

/* ---------- 视图模型入口 ---------- */
function buildVM(cfg, ctx){
  var ck = E().computeChecks(cfg);
  var sel = null;
  var groups = elementGroups(cfg);
  if (ctx && ctx.sel){
    for (var i = 0; i < groups.length && !sel; i++){
      for (var j = 0; j < groups[i].items.length; j++){
        var cand = groups[i].items[j];
        if (String(cand.id) === String(ctx.sel)){
          sel = cand;
          sel.fields = fieldsForItem(cand.type, cfg, cand.index);
          break;
        }
      }
    }
  }
  return {
    tools: TOOL_GROUPS,
    checks: checklist(ck),
    warnings: ck.warnings || [],
    status: statusItems(ck),
    counters: {
      shelves: cfg.shelves.length, zones: cfg.zones.length, bikes: (cfg.bikes || []).length,
      entranceOk: !!ck.okEntrance, aisleOk: !!ck.okAisle
    },
    elements: groups,
    selection: sel,
    settings: settingsGroups(cfg),
    backups: (ctx && ctx.backups) || [],
    help: (ctx && ctx.help) || []
  };
}

window.SD_SCHEMA = {
  KIND: KIND,
  TOOL_GROUPS: TOOL_GROUPS,
  buildVM: buildVM,
  statusItems: statusItems,
  elementGroups: elementGroups,
  number: number, text: text, select: select, toggle: toggle, note: note, action: action
};
})();
