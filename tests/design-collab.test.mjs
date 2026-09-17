// 门店设计实时协作（2026-09-17）：Super Mass 多人同时编辑。
// 这些断言锁死三层接线：静态资源加载顺序、客户端核心机制、app.js 接入点。
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile, stat } from 'node:fs/promises'

const read = (p) => readFile(new URL(`../apps/web/public/store-design/${p}`, import.meta.url), 'utf8')

test('index.html 按序加载 yjs 与 sd-collab', async () => {
  const html = await read('index.html')
  const iCloud = html.indexOf('sd-cloud.js')
  const iYjs = html.indexOf('vendor/yjs.min.js')
  const iCollab = html.indexOf('sd-collab.js')
  assert.ok(iCloud >= 0 && iYjs >= 0 && iCollab >= 0, '三个脚本都必须加载')
  assert.ok(iCloud < iYjs && iYjs < iCollab, '加载顺序必须是：sd-cloud → yjs → sd-collab')
})

test('vendor yjs 产物存在且以全局 Y 暴露（IIFE）', async () => {
  const info = await stat(new URL('../apps/web/public/store-design/vendor/yjs.min.js', import.meta.url))
  assert.ok(info.size > 50_000, 'yjs 产物不应为空壳')
  const head = (await read('vendor/yjs.min.js')).slice(0, 400)
  assert.match(head, /var Y\s*=/u, 'IIFE 必须导出全局名 Y')
})

test('sd-collab：连接、对账、心跳、退避、降级机制齐全', async () => {
  const src = await read('sd-collab.js')
  assert.match(src, /'\/api\/v1\/design\/ws'/u)
  assert.match(src, /t: 'hello', sv/u)
  // 双向对账：把「本地有而服务端缺的」回补
  assert.match(src, /encodeStateAsUpdate\(ydoc, unb64\(msg\.sv\)\)/u)
  // 房间为空的种子灌入
  assert.match(src, /seedRoom/u)
  // 心跳与 DO auto-response 对齐（'ping' → 'pong'）
  assert.match(src, /ws\.send\('ping'\)/u)
  assert.match(src, /=== 'pong'/u)
  // 指数退避与降级
  assert.match(src, /RECONNECT_STEPS = \[2000, 5000, 15000, 30000\]/u)
  assert.match(src, /status = 'disabled'/u)
  // 拖动预览节流
  assert.match(src, /DRAG_THROTTLE_MS = 90/u)
  // 本地拖拽/输入期间推迟物化（防打断）
  assert.match(src, /localDragActive/u)
  assert.match(src, /api\.isEditing/u)
})

test('sd-collab：同步键清单与引擎 defaultConfig 对齐', async () => {
  const src = await read('sd-collab.js')
  for (const key of ['space', 'opt', 'studio', 'walls']) {
    assert.ok(src.includes(`'${key}'`), `OBJECTS 必须包含 ${key}`)
  }
  for (const key of ['wallSegs', 'pillars', 'zones', 'shelves', 'meshes', 'markers', 'bikes', 'entrances', 'curtains', 'studioItems']) {
    assert.ok(src.includes(`'${key}'`), `COLLECTIONS 必须包含 ${key}`)
  }
  const engine = await read('engine.js')
  for (const key of ['space', 'opt', 'studio', 'walls', 'wallSegs', 'shelves', 'bikes', 'curtains']) {
    assert.ok(engine.includes(key + ':') || engine.includes(key + ' '), `defaultConfig 应有 ${key}（同步清单来源于它）`)
  }
})

test('app.js：实时协作接入点全部到位', async () => {
  const src = await read('app.js')
  // 出站收口：saveSoon 里同步进房间
  assert.match(src, /window\.SDCollab\) window\.SDCollab\.afterLocalChange\(\)/u)
  // 拖动预览与结束（平面拖动）
  assert.match(src, /window\.SDCollab\) window\.SDCollab\.dragPreview\(id, cur\.x, cur\.y\)/u)
  assert.match(src, /window\.SDCollab\) window\.SDCollab\.dragEnd\(id\)/u)
  // attach（2026-09-17 起经 wireServices 短重试接线：sd-boot 动态加载的界面脚本
  //   可能先于 body 里的 sd-collab.js 就绪，一次性判断会静默丢掉实时协作）
  assert.match(src, /window\.SDCollab && !wireServices\.collab/u)
  assert.match(src, /window\.SDCollab\.attach\(\{/u)
  assert.match(src, /applyRemoteConfig: function\(obj\)\{/u)
  assert.match(src, /previewMove: function\(id, x, y\)\{/u)
  assert.match(src, /isEditing: function\(\)\{/u)
  // 物化保留当前选中（物化高频发生，不能清掉正在编辑的对象）
  assert.match(src, /ui\.sel = selStillExists\(keepSel\) \? keepSel : null/u)
})

test('sd-cloud：载入云端提示覆盖在线同事的联动', async () => {
  const src = await read('sd-cloud.js')
  assert.match(src, /在线同事会同步看到这次载入/u)
})
