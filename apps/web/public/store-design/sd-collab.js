/* 门店设计 · 实时协作（sd-collab.js）—— 2026-09-17
 *
 * 架构：本地 cfg（普通 JS 对象）仍是唯一数据源，所有编辑操作照旧直接改它；
 * 本模块在「收口点」做快照 diff，把差异写进 Yjs 文档并广播；远端更新反向
 * 物化回 cfg 并重渲染。为什么用「快照 diff 适配器」而不是把 cfg 换成 Yjs
 * 代理：app.js 有一百多处直接改 cfg 的代码，适配器让它们零改动、零回归。
 *
 * 接入点（全部由 app.js 主动调用）：
 *   1) saveSoon() 内 → SDCollab.afterLocalChange()   出站 diff（250ms 防抖）
 *   2) 平面拖动 pointermove → SDCollab.dragPreview(id, x, y)  瞬态预览
 *   3) 拖动结束 → SDCollab.dragEnd(id) → 随后 saveSoon 的正常 diff 即正式提交
 *   4) 拖拽期间本地标记 localDragActive：远端物化会推迟到拖拽结束，
 *      避免全量重渲染打断正在进行的拖动（重建 SVG 会触发 pointercancel）。
 *
 * 与 SDCloud（D1 快照，手动保存/载入）的关系：本模块不碰 D1；
 * 「保存到云端」按钮语义不变。实时房间是常驻工作区（用户 2026-09-17 拍板）：
 * 房间状态长期保留，谁连上都能拿到最新状态——包括尚未发布的改动。
 *
 * 协议（与 apps/worker/src/design/protocol.ts 对齐）：
 *   C→S hello{sv} / u{u} / drag{id,x,y} / dragend{id} / 'ping'
 *   S→C sync{u,sv} / u{u,from} / drag{...} / dragend{...} / peers{peers} / 'pong'
 *
 * 对账：连接后 hello 带本地状态向量；服务端回「客户端缺的」(sync.u) 与
 * 服务端状态向量 (sync.sv)；客户端再把「服务端缺的」回补 (u)。双向无损。
 * 房间为空（服务端 sv 为空）时：客户端把当前 cfg 全量灌入作为种子。
 *
 * 断线：本地编辑照常写入本地 Y.Doc（只是不发）；重连后由上述对账自动补发。
 * 降级：未登录 / 只读会话 / 连续失败 → 进入 disabled，退回纯本机模式，
 *       工具功能不受任何影响。
 */
(function(){
'use strict'

if (!window.Y) {
  try { console.warn('[sd-collab] Yjs 未加载，实时协作已禁用') } catch(e0){}
  return
}
var Y = window.Y

/* —— 同步键清单（与 engine.defaultConfig 对齐）——
   OBJECTS：单例对象，字段级同步（值可以是标量或嵌套对象，整存整取）。
   COLLECTIONS：数组集合，按 id 建索引做增删改（对象内字段级）。 */
var OBJECTS = ['space', 'opt', 'studio', 'walls']
var COLLECTIONS = ['wallSegs', 'pillars', 'zones', 'shelves', 'meshes', 'markers', 'bikes', 'entrances', 'curtains', 'studioItems']
var ID_PREFIX = {
  sh: 'shelves', pl: 'pillars', bk: 'bikes', zn: 'zones', en: 'entrances',
  ms: 'meshes', mk: 'markers', ct: 'curtains', iw: 'wallSegs', si: 'studioItems'
}

var WS_PATH = '/api/v1/design/ws'
var ME_PATH = '/api/v1/auth/me'
var DRAG_THROTTLE_MS = 90
var MATERIALIZE_MS = 120
var PING_MS = 20000
var PONG_TIMEOUT_MS = 26000
var REMOTE_DRAG_TTL_MS = 4000
var REMOTE_DRAG_END_TTL_MS = 1500
var LOCAL_DRAG_TTL_MS = 15000
var INPUT_DEFER_MAX_MS = 8000
var RECONNECT_STEPS = [2000, 5000, 15000, 30000]
var MAX_RECONNECT_STEPS = 8

var api = null
var ydoc = null
var yroot = null
var baseline = null
var lastSerialized = ''
var ws = null
var status = 'idle'          /* idle → waiting → connecting → online / retrying / disabled */
var statusNote = ''
var peers = []
var retries = 0
var seedChecked = false
var reconnectTimer = null
var pingTimer = null
var materializeTimer = null
var materializeDeferSince = 0
var lastPongAt = 0
var localDragActive = null
var pendingDrag = null
var dragSendTimer = null
var lastDragSentAt = 0
var remoteDragIds = {}
var remoteDragNames = {}
var remoteDragFresh = {}
var chip = null

var LOCAL_ORIGIN = { local: true }
var REMOTE_ORIGIN = { remote: true }

/* ---------------- 基础工具 ---------------- */

function clone(v){ return v == null ? v : JSON.parse(JSON.stringify(v)) }

function b64(bytes){
  var bin = '', CHUNK = 0x8000
  for (var i = 0; i < bytes.length; i += CHUNK){
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}
function unb64(str){
  var bin = atob(str), out = new Uint8Array(bin.length)
  for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
function r2v(v){ return Math.round(v * 100) / 100 }

/* ---------------- Y.Doc 结构 ----------------
   yroot（Y.Map 'cfg'）下：
     OBJECTS 键 → Y.Map<字段, 值>（值可标量或嵌套对象，整存整取）
     COLLECTIONS 键 → Y.Map<id, Y.Map<字段, 值>>
   注：Yjs 对 set 的普通对象/数组按「值」存储，读出来可能是内部共享引用，
   因此所有出站入站一律做 JSON 深拷贝（clone）。 */

function ensureMap(key){
  var m = yroot.get(key)
  if (!m){ m = new Y.Map(); yroot.set(key, m) }
  return m
}

function yValueIn(v){
  /* 进入 Yjs 前：undefined → null（Yjs 不存 undefined），嵌套对象深拷贝 */
  if (v === undefined) return null
  if (v !== null && typeof v === 'object') return clone(v)
  return v
}
function yValueOut(v){
  if (v !== null && typeof v === 'object') return clone(v)
  return v
}
function yMapToPlain(ym){
  var out = {}
  ym.forEach(function(v, k){ out[k] = yValueOut(v) })
  return out
}

/* ---------------- diff：基线 → 当前配置 ---------------- */

function indexById(arr){
  var m = {}
  ;(arr || []).forEach(function(item){
    if (item && item.id != null) m[String(item.id)] = item
  })
  return m
}

function computeOps(prev, cfg){
  var ops = []
  var key, f, av, bv, ka, kb, keys

  OBJECTS.forEach(function(objKey){
    var a = (prev && prev[objKey]) || null
    var b = (cfg && cfg[objKey]) || null
    keys = {}
    if (a) for (ka in a) keys[ka] = 1
    if (b) for (kb in b) keys[kb] = 1
    for (f in keys){
      av = a ? a[f] : undefined
      bv = b ? b[f] : undefined
      if (JSON.stringify(av) === JSON.stringify(bv)) continue
      ops.push({ kind: 'obj-set', key: objKey, field: f, value: bv === undefined ? null : clone(bv) })
    }
  })

  COLLECTIONS.forEach(function(collKey){
    var aMap = indexById(prev ? prev[collKey] : null)
    var bArr = (cfg && cfg[collKey]) || []
    var bMap = indexById(bArr)
    var id
    for (id in aMap){
      if (!(id in bMap)) ops.push({ kind: 'coll-del', key: collKey, id: id })
    }
    bArr.forEach(function(item){
      if (!item || item.id == null) return
      var itemId = String(item.id)
      var old = aMap[itemId]
      if (!old){ ops.push({ kind: 'coll-add', key: collKey, id: itemId, obj: clone(item) }); return }
      if (JSON.stringify(old) === JSON.stringify(item)) return
      keys = {}
      for (ka in old) keys[ka] = 1
      for (kb in item) keys[kb] = 1
      for (f in keys){
        av = old[f]
        bv = item[f]
        if (JSON.stringify(av) === JSON.stringify(bv)) continue
        ops.push({ kind: 'coll-set', key: collKey, id: itemId, field: f, value: bv === undefined ? null : clone(bv) })
      }
    })
  })
  return ops
}

function applyOpsToYdoc(ops){
  if (!ops.length) return
  ydoc.transact(function(){
    ops.forEach(function(op){
      if (op.kind === 'obj-set'){
        var m = ensureMap(op.key)
        if (op.value === null) m.delete(op.field)
        else m.set(op.field, op.value)
        return
      }
      if (op.kind === 'coll-add'){
        var cm = ensureMap(op.key)
        var item = new Y.Map()
        var f2
        for (f2 in op.obj) item.set(f2, yValueIn(op.obj[f2]))
        cm.set(op.id, item)
        return
      }
      if (op.kind === 'coll-del'){
        ensureMap(op.key).delete(op.id)
        return
      }
      if (op.kind === 'coll-set'){
        var cm2 = ensureMap(op.key)
        var item2 = cm2.get(op.id)
        if (!item2){
          /* 本地 Y.Doc 还没有这个对象（例如首次连接前就有离线编辑、且
             房间非空）：用本地完整值创建条目——语义等价于「本地版本整体
             参与合并，同 id 冲突按 Yjs LWW」。概率极低，接受该降级。 */
          var localArr = (api && api.getCfg() ? api.getCfg()[op.key] : null) || []
          var found = null
          for (var i = 0; i < localArr.length; i++){
            if (String(localArr[i].id) === op.id){ found = localArr[i]; break }
          }
          if (found){
            var ni = new Y.Map()
            var f3
            for (f3 in found) ni.set(f3, yValueIn(found[f3]))
            cm2.set(op.id, ni)
          }
          return
        }
        item2.set(op.field, op.value)
        return
      }
    })
  }, LOCAL_ORIGIN)
}

/* ---------------- 物化：Y.Doc → 配置对象 ----------------
   以本地数组顺序为骨架（保持列表顺序稳定），叠加：
   - 远端删除的剔除；远端新增的追加；远端修改的逐字段更新。 */

function buildFromY(){
  var out = {}
  var cur = api.getCfg()

  OBJECTS.forEach(function(key){
    var ym = yroot.get(key)
    if (!ym) return
    var m = {}
    ym.forEach(function(v, f){ m[f] = yValueOut(v) })
    out[key] = m
  })

  COLLECTIONS.forEach(function(key){
    var cm = yroot.get(key)
    var localArr = cur[key] || []
    var outArr = []
    var seen = {}
    var i, id
    for (i = 0; i < localArr.length; i++){
      var item = localArr[i]
      if (!item || item.id == null){ outArr.push(clone(item)); continue }
      id = String(item.id)
      var y = cm ? cm.get(id) : null
      if (y){ outArr.push(yMapToPlain(y)); seen[id] = 1 }
    }
    if (cm){
      cm.forEach(function(y2, id2){
        if (seen[id2]) return
        outArr.push(yMapToPlain(y2))
      })
    }
    out[key] = outArr
  })

  /* 其余顶层键（v、bak 等本地元数据）沿用本地值 */
  for (var k in cur){ if (!(k in out)) out[k] = clone(cur[k]) }
  return out
}

function updateBaselineFromCfg(){
  var cfgNow = api.getCfg()
  baseline = clone(cfgNow)
  try { lastSerialized = JSON.stringify(cfgNow) } catch(e){ lastSerialized = '' }
}

/* 外部整体替换（云端图纸首载等**非编辑来源**）：把基线对齐到当前 cfg。
   此时 cfg 与基线的差异不是用户编辑，绝不能作为删除/修改广播给房间 ——
   房间（常驻工作区）优先，云端快照只作为本机起点。
   2026-09-17 实测事故：首载若抢在协作连接之前完成，随后一次 flush 就把
   「云端快照里没有、房间里刚加的工作台」当成用户删除广播了出去。 */
function afterExternalReplace(){
  if (!api || !ydoc) return
  updateBaselineFromCfg()
}

function materializeNow(){
  if (!api || !ydoc) return
  /* 1) 把本地未同步改动先写进 Y.Doc（保证远端更新不吞掉正在进行的本地编辑） */
  flushLocalChanges()
  /* 2) 从 Y.Doc 重建（含双方全部改动） */
  var next = buildFromY()
  switchToConfig(next)
  updateBaselineFromCfg()
}

function switchToConfig(next){
  if (api.applyRemoteConfig){
    api.applyRemoteConfig(next)
  } else if (api.setCfg){
    api.setCfg(next)
  }
}

function scheduleMaterialize(){
  if (materializeTimer) return
  materializeTimer = setTimeout(function(){
    materializeTimer = null
    /* 本地正在拖拽：全量重渲染会打断拖拽（重建 SVG 触发 pointercancel），
       推迟到拖拽结束再物化。 */
    if (localDragActive && Date.now() < localDragActive.expire){
      scheduleMaterialize()
      return
    }
    /* 本地正在输入（属性面板输入框聚焦）：重建面板会打断输入，短时推迟；
       超过上限则照常物化（极端情况优先保证远端改动可见）。 */
    var editing = false
    try { editing = api.isEditing ? api.isEditing() : false } catch(e){}
    if (editing){
      if (!materializeDeferSince) materializeDeferSince = Date.now()
      if (Date.now() - materializeDeferSince < INPUT_DEFER_MAX_MS){
        scheduleMaterialize()
        return
      }
    }
    materializeDeferSince = 0
    materializeNow()
  }, MATERIALIZE_MS)
}

/* ---------------- 本地收口（由 saveSoon 调用） ---------------- */

function flushLocalChanges(){
  if (!api || !ydoc) return
  var cfgNow
  try { cfgNow = api.getCfg() } catch(e){ return }
  var serialized
  try { serialized = JSON.stringify(cfgNow) } catch(e){ return }
  if (serialized === lastSerialized) return
  var ops = computeOps(baseline, cfgNow)
  if (ops.length) applyOpsToYdoc(ops)
  try { baseline = clone(cfgNow) } catch(e2){ baseline = cfgNow }
  lastSerialized = serialized
}

function absorbRemoteDragIntoBaseline(id){
  if (!baseline) return
  var parts = String(id).split(':')
  var key = ID_PREFIX[parts[0]]
  if (!key || parts.length < 2) return
  var cur = (api.getCfg()[key]) || []
  var cObj = null
  for (var i = 0; i < cur.length; i++){
    if (String(cur[i].id) === parts[1]){ cObj = cur[i]; break }
  }
  if (!cObj) return
  if (!baseline[key]) baseline[key] = []
  var bArr = baseline[key]
  for (var j = 0; j < bArr.length; j++){
    if (String(bArr[j].id) === parts[1]){
      /* 预览只改 x/y：把基线吸收到与现值一致，避免把预览值当本地改动广播 */
      bArr[j].x = cObj.x
      bArr[j].y = cObj.y
      return
    }
  }
  bArr.push(clone(cObj))
}

function pruneRemoteDrags(){
  var now = Date.now()
  for (var id in remoteDragIds){
    if (remoteDragIds[id] < now){
      delete remoteDragIds[id]
      delete remoteDragFresh[id]
      delete remoteDragNames[id]
    }
  }
}

/* ---------------- 出站：preview 与正式增量 ---------------- */

function sendRaw(payload){
  if (!ws || ws.readyState !== 1) return
  try { ws.send(JSON.stringify(payload)) } catch(e){}
}

function flushDrag(){
  dragSendTimer = null
  if (!pendingDrag) return
  var d = pendingDrag
  pendingDrag = null
  lastDragSentAt = Date.now()
  sendRaw({ t: 'drag', id: d.id, x: d.x, y: d.y })
}

function dragPreview(id, x, y){
  localDragActive = { id: id, expire: Date.now() + LOCAL_DRAG_TTL_MS }
  if (status !== 'online') return
  pendingDrag = { id: id, x: r2v(x), y: r2v(y) }
  if (Date.now() - lastDragSentAt >= DRAG_THROTTLE_MS){
    flushDrag()
  } else if (!dragSendTimer){
    dragSendTimer = setTimeout(flushDrag, DRAG_THROTTLE_MS)
  }
}

function dragEnd(id){
  localDragActive = null
  pendingDrag = null
  if (dragSendTimer){ clearTimeout(dragSendTimer); dragSendTimer = null }
  sendRaw({ t: 'dragend', id: id })
}

/* ---------------- 入站：服务端消息 ---------------- */

function serverVectorEmpty(svB64){
  try {
    var sv = svB64 ? unb64(svB64) : null
    return !sv || sv.length <= 2
  } catch(e){ return true }
}

function seedRoom(){
  /* 房间为空：把当前配置全量灌入作为种子（这也是「第一个进来的人
     定义初始内容」的语义）。用 diff(null, cfg) 生成全量 ops。 */
  try {
    var ops = computeOps(null, api.getCfg())
    applyOpsToYdoc(ops)
  } catch(e){}
}

/* 版本升级 / 首次接管：把「本地配置有、协作文档里还没有」的字段与条目补进文档。
   场景：房间已存在且是旧结构（例如新版给配置加了 studioItems），本地迁移结果
   必须先同步进文档 —— 否则第一次物化（从文档重建配置）会把它覆盖掉，
   表现为「刚加的东西刷新后消失」。
   只补「文档缺失」的键：文档已有的键一律以文档为准（绝不覆盖共享状态）。 */
function adoptMissing(){
  if (!api || !ydoc) return
  var cfgNow
  try { cfgNow = api.getCfg() } catch(e){ return }
  var ops = []
  OBJECTS.forEach(function(key){
    var ym = yroot.get(key)
    var local = cfgNow[key]
    if (!local || typeof local !== 'object') return
    for (var f in local){
      if (local[f] === undefined) continue
      if (ym && ym.get(f) !== undefined) continue
      ops.push({ kind:'obj-set', key:key, field:f, value: yValueIn(local[f]) })
    }
  })
  COLLECTIONS.forEach(function(key){
    var cm = yroot.get(key)
    var arr = cfgNow[key] || []
    for (var i = 0; i < arr.length; i++){
      var item = arr[i]
      if (!item || item.id == null) continue
      var id = String(item.id)
      if (cm && cm.get(id)) continue
      ops.push({ kind:'coll-add', key:key, id:id, obj: clone(item) })
    }
  })
  if (ops.length) applyOpsToYdoc(ops)
}

function handleMessage(data){
  if (typeof data !== 'string') return
  if (data === 'pong'){ lastPongAt = Date.now(); return }
  var msg
  try { msg = JSON.parse(data) } catch(e){ return }
  if (!msg || typeof msg !== 'object') return

  if (msg.t === 'sync'){
    var diff = null
    try { diff = msg.u ? unb64(msg.u) : null } catch(e1){ diff = null }
    var applied = false
    if (diff && diff.length > 2){
      try { Y.applyUpdate(ydoc, diff, REMOTE_ORIGIN); applied = true } catch(e2){}
    }
    /* 房间非空时：补传文档缺失的字段 / 条目（版本升级路径，见 adoptMissing 注释） */
    if (!serverVectorEmpty(msg.sv)) adoptMissing();
    if (applied) scheduleMaterialize()
    /* 双向对账：把「本地有而服务端缺的」回补上去 */
    var back = null
    try {
      back = msg.sv ? Y.encodeStateAsUpdate(ydoc, unb64(msg.sv)) : Y.encodeStateAsUpdate(ydoc)
    } catch(e3){ back = null }
    if (back && back.length > 2){
      sendRaw({ t: 'u', u: b64(back) })
    } else if (!seedChecked && serverVectorEmpty(msg.sv)){
      seedChecked = true
      seedRoom()
    }
    return
  }

  if (msg.t === 'u'){
    var u = null
    try { u = msg.u ? unb64(msg.u) : null } catch(e4){ u = null }
    if (u && u.length > 0){
      try { Y.applyUpdate(ydoc, u, REMOTE_ORIGIN) } catch(e5){}
      scheduleMaterialize()
      pruneRemoteDrags()
    }
    return
  }

  if (msg.t === 'drag'){
    /* 远端拖动预览：直接改本地 cfg 位移（视觉即时），基线同步吸收，
       保证这些值不会被当成本地改动广播回去。 */
    remoteDragIds[msg.id] = Date.now() + REMOTE_DRAG_TTL_MS
    remoteDragFresh[msg.id] = Date.now()
    remoteDragNames[msg.id] = msg.from || ''
    if (!(localDragActive && Date.now() < localDragActive.expire)){
      if (api.previewMove){
        try { api.previewMove(msg.id, msg.x, msg.y) } catch(e6){}
        absorbRemoteDragIntoBaseline(msg.id)
      }
    }
    paintChip()
    return
  }

  if (msg.t === 'dragend'){
    if (remoteDragIds[msg.id]){
      remoteDragIds[msg.id] = Date.now() + REMOTE_DRAG_END_TTL_MS
    }
    return
  }

  if (msg.t === 'peers'){
    peers = Array.isArray(msg.peers) ? msg.peers : []
    paintChip()
    return
  }
}

/* ---------------- 连接管理 ---------------- */

function startPing(){
  stopPing()
  pingTimer = setInterval(function(){
    if (!ws || ws.readyState !== 1) return
    if (Date.now() - lastPongAt > PONG_TIMEOUT_MS){
      /* 心跳超时（页面休眠恢复 / 中途断网）：主动断开走重连 */
      try { ws.close() } catch(e){}
      return
    }
    try { ws.send('ping') } catch(e){}
  }, PING_MS)
}
function stopPing(){
  if (pingTimer){ clearInterval(pingTimer); pingTimer = null }
}

function scheduleReconnect(){
  if (status === 'disabled') return
  retries += 1
  if (retries > MAX_RECONNECT_STEPS){
    status = 'disabled'
    statusNote = '实时协作暂不可用'
    paintChip()
    return
  }
  status = 'retrying'
  paintChip()
  var step = RECONNECT_STEPS[Math.min(retries - 1, RECONNECT_STEPS.length - 1)]
  var delay = step + Math.floor(Math.random() * 800)
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = setTimeout(startConnect, delay)
}

function startConnect(){
  if (status === 'online' || status === 'connecting' || status === 'disabled') return
  status = 'connecting'
  paintChip()
  var url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + WS_PATH
  var socket
  try { socket = new WebSocket(url) } catch(e){ scheduleReconnect(); return }
  ws = socket
  socket.onopen = function(){
    if (ws !== socket) return
    retries = 0
    seedChecked = false
    status = 'online'
    statusNote = ''
    lastPongAt = Date.now()
    try {
      var sv = b64(Y.encodeStateVector(ydoc))
      sendRaw({ t: 'hello', sv: sv })
    } catch(e1){}
    startPing()
    paintChip()
  }
  socket.onmessage = function(ev){ if (ws === socket) handleMessage(ev.data) }
  socket.onclose = function(){
    if (ws !== socket) return
    ws = null
    stopPing()
    scheduleReconnect()
  }
  socket.onerror = function(){ try { socket.close() } catch(e2){} }
}

/* ---------------- 状态胶囊 ---------------- */

function chipText(){
  var fresh = null
  var now = Date.now()
  for (var id in remoteDragFresh){
    if (now - remoteDragFresh[id] < 3000){ fresh = remoteDragNames[id] || ''; break }
  }
  if (status === 'online'){
    var n = peers.length || 1
    var text = '● ' + n + ' 人在线'
    if (fresh) text += ' · ' + fresh + ' 正在移动'
    return text
  }
  if (status === 'retrying' || status === 'connecting' || status === 'waiting') return '◌ 连接中…'
  if (status === 'disabled') return '— ' + (statusNote || '实时协作不可用')
  return ''
}

function paintChip(){
  if (!chip) return
  var text = chipText()
  if (!text){ chip.style.display = 'none'; return }
  chip.style.display = ''
  chip.textContent = text
  chip.setAttribute('data-state', status === 'online' ? 'online' : (status === 'disabled' ? 'off' : 'pending'))
}

function createChip(){
  if (chip) return
  chip = document.createElement('div')
  chip.className = 'sd-collab-chip'
  var st = chip.style
  st.position = 'fixed'
  st.right = '10px'
  st.bottom = '74px'
  st.zIndex = '60'
  st.padding = '4px 10px'
  st.borderRadius = '999px'
  st.font = '11px/1.6 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif'
  st.letterSpacing = '0.02em'
  st.color = '#f2f2f0'
  st.background = 'rgba(20, 22, 26, 0.72)'
  st.pointerEvents = 'auto'
  st.cursor = 'pointer'
  st.userSelect = 'none'
  st.display = 'none'
  chip.addEventListener('click', function(){
    /* 点击手动重连（不给普通用户暴露复杂操作，只作应急） */
    if (status === 'retrying' || status === 'connecting') return
    if (status === 'disabled'){
      retries = 0
      status = 'idle'
      startConnect()
    }
  })
  document.body.appendChild(chip)
}

/* ---------------- 会话检查与启动 ---------------- */

function checkSession(cb){
  try {
    fetch(ME_PATH, { credentials: 'same-origin', cache: 'no-store' }).then(function(res){
      if (res.status === 401){ cb('anon'); return null }
      if (!res.ok){ cb('error'); return null }
      return res.json().then(function(data){
        if (data && data.readOnly){ cb('readonly', data); return }
        cb('ok', data)
      })
    }).catch(function(){ cb('error') })
  } catch(e){ cb('error') }
}

function waitCloudReady(cb){
  /* 等「首次载入完成」（state.loaded），而不是「当前没在加载」——
     后者在载入请求还没发出时就为真，会让协作先连上、云快照后到，
     触发 2026-09-17 的全房间误删事故。上限 8 秒兜底。 */
  var t0 = Date.now()
  function tick(){
    var s = null
    try { s = window.SDCloud && SDCloud.state ? SDCloud.state() : null } catch(e){}
    var ok = false
    if (!s) ok = true
    else if (s.offline) ok = true
    else if (s.loaded) ok = true
    if (ok || Date.now() - t0 > 8000) cb()
    else setTimeout(tick, 120)
  }
  tick()
}

function attach(hooks){
  api = hooks
  ydoc = new Y.Doc()
  yroot = ydoc.getMap('cfg')
  ydoc.on('update', function(update, origin){
    if (origin === REMOTE_ORIGIN) return
    if (status === 'online') sendRaw({ t: 'u', u: b64(update) })
  })
  updateBaselineFromCfg()
  createChip()
  status = 'waiting'
  paintChip()
  waitCloudReady(function(){
    checkSession(function(result){
      if (result === 'anon'){
        /* 未登录：工具处于「仅存本机」模式，静默不显示状态 */
        status = 'disabled'
        statusNote = '未登录'
        chip && (chip.style.display = 'none')
        return
      }
      if (result === 'readonly'){
        status = 'disabled'
        statusNote = '只读模式'
        paintChip()
        return
      }
      if (result === 'error'){
        /* 会话检查失败（网络等）：短暂等待后重试一次，再失败则尝试直连 */
        setTimeout(function(){
          checkSession(function(r2){
            if (r2 === 'anon'){ status = 'disabled'; chip && (chip.style.display = 'none'); return }
            if (r2 === 'readonly'){ status = 'disabled'; statusNote = '只读模式'; paintChip(); return }
            startConnect()
          })
        }, 1500)
        return
      }
      startConnect()
    })
  })
}

window.SDCollab = {
  attach: attach,
  afterLocalChange: flushLocalChanges,
  afterExternalReplace: afterExternalReplace,
  dragPreview: dragPreview,
  dragEnd: dragEnd,
  state: function(){ return { status: status, peers: peers.slice(), retries: retries } }
}
})()
