// 工作室组件（2026-09-17）：洞洞板 / 工作台 / 维修架 / 工具柜 + 玻璃 / 玻璃幕墙 / 围栏侧墙。
// 同时锁死用户报障的回归：平面图点选工作室（data-id="st"）后属性栏必须能编辑
// （此前平面 id 与大纲 id 不一致，属性栏显示「未选中元素」）。
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const read = (p) => readFile(new URL(`../apps/web/public/store-design/${p}`, import.meta.url), 'utf8')

async function loadSandbox(){
  const [engine, schema] = await Promise.all([read('engine.js'), read('sd-schema.js')])
  const vm = await import('node:vm')
  const sandbox = vm.createContext({ module: { exports: {} }, exports: {}, console, window: {} })
  vm.runInContext(engine, sandbox, { filename: 'engine.js' })
  sandbox.window.Engine = sandbox.module.exports
  sandbox.module = { exports: {} }
  vm.runInContext(schema, sandbox, { filename: 'sd-schema.js' })
  return { engine: sandbox.window.Engine, schema: sandbox.window.SD_SCHEMA }
}

test('平面选中工作室后属性栏必须可编辑（平面 id 与大纲 id 一致）', async () => {
  const { engine, schema } = await loadSandbox()
  const plan = engine.renderPlan(engine.defaultConfig(), {})
  assert.ok(plan.includes('data-id="st"'), '平面图里工作室的 data-id 必须是 st')
  const vm = schema.buildVM(engine.defaultConfig(), { sel: 'st' })
  assert.ok(vm.selection, '按平面图的 id 选中工作室必须命中（此前 id 不一致 → 显示「未选中元素」）')
  assert.ok(vm.selection.fields.length > 0, '工作室必须有可编辑字段')
  assert.ok(vm.selection.fields.some((f) => f.path === 'studio.w'), '工作室尺寸字段必须在')
  const outlineItem = vm.elements.find((g) => g.key === 'st').items[0]
  assert.equal(outlineItem.id, 'st', '大纲里的工作室 id 必须与平面一致')
})

test('工作室组件：添加入口 / 独立大纲分组 / 各自的编辑字段与删除', async () => {
  const { engine, schema } = await loadSandbox()
  const cfg = engine.defaultConfig()
  const vm = schema.buildVM(cfg, { sel: 'st' })
  const stActs = vm.elements.find((g) => g.key === 'st').items[0].actions.map((a) => a.act)
  assert.ok(stActs.includes('addStudioItem'), '选中工作室必须有「＋组件」按钮')
  const group = vm.elements.find((g) => g.key === 'si')
  assert.ok(group, '工作室组件必须有独立大纲分组')
  assert.equal(group.items.length, cfg.studioItems.length)
  assert.equal(group.items[0].id, 'si:peg-1')
  const sel = schema.buildVM(cfg, { sel: 'si:peg-1' }).selection
  const paths = sel.fields.map((f) => f.path)
  for (const p of ['studioItems.0.kind', 'studioItems.0.rot', 'studioItems.0.w', 'studioItems.0.x', 'studioItems.0.y']) {
    assert.ok(paths.includes(p), `组件字段 ${p} 必须在`)
  }
  assert.ok(sel.actions.some((a) => a.act === 'delStudioItem'), '组件必须可删除')
})

test('平面图：组件独立可点选，旋转写进 transform', async () => {
  const { engine } = await loadSandbox()
  const cfg = engine.defaultConfig()
  cfg.studioItems = [
    { id: 'b1', kind: 'bench', x: 10, y: 8, rot: 0, w: 1.6 },
    { id: 'p1', kind: 'pegboard', x: 12, y: 8, rot: 90, w: 1.4 }
  ]
  const plan = engine.renderPlan(cfg, {})
  assert.ok(plan.includes('data-id="si:b1"') && plan.includes('data-id="si:p1"'), '组件必须能单独点选')
  assert.ok(plan.includes('rotate(90 12 8)'), '90° 旋转必须写进平面 SVG（选中框 / 拖动才与视觉一致）')
  const bounds = engine.studioItemBounds(cfg.studioItems[1])
  assert.ok(Math.abs(bounds.w - 0.06) < 0.01 && Math.abs(bounds.h - 1.4) < 0.01, '旋转后占地包围盒必须交换长宽')
})

test('3D：四类组件渲染为实心体（含 occl 登记）', async () => {
  const { engine } = await loadSandbox()
  const cfg = engine.defaultConfig()
  cfg.studioItems = ['pegboard', 'bench', 'stand', 'cabinet'].map((k, i) => ({
    id: 'i' + i, kind: k, x: 10 + i * 2, y: 8, rot: 0, w: engine.studioItemDef(k).w
  }))
  const svg = engine.render3D(cfg, { az: 90, el: 30, zoom: 1, vw: 900, vh: 620 })
  for (let i = 0; i < 4; i++) assert.ok(svg.includes('si:i' + i), `组件 i${i} 必须在 3D 里渲染`)
})

test('迁移：旧 peg 设置 → 组件数组（幂等）；新配置默认一块洞洞板', async () => {
  const { engine } = await loadSandbox()
  assert.equal(engine.defaultConfig().studioItems.length, 1, '新配置默认一块洞洞板（沿用旧默认观感）')
  assert.equal(engine.defaultConfig().studio.peg, undefined, 'peg 字段必须已下线')
  const old = engine.defaultConfig()
  old.studio = { name:'工作室', x:16, y:9, w:4, h:4, wallH:2.2,
    sides:{ n:'wall', e:'none', s:'door', w:'window' }, doorW:1.2,
    peg:{ on:true, side:'e', face:'in', panels:2 } }
  delete old.studioItems
  const m = engine.migrateLegacy(old)
  assert.equal(m.studioItems.length, 2, '两块旧洞洞板必须逐块迁移')
  assert.ok(m.studioItems.every((it) => it.kind === 'pegboard' && it.rot === 90), '东墙洞洞板必须竖放')
  assert.ok(m.studioItems.every((it) => Math.abs(it.x - 19.86) < 0.001), '迁移位置必须贴东墙内侧（旧渲染口径）')
  assert.equal(m.studio.peg, undefined, 'peg 字段必须被清掉')
  /* 快照式断言：deepMerge 对数组是「原样引用」，用引用比较或共享对象比较都会假绿 */
  const migratedSnapshot = JSON.stringify(m.studioItems)
  const again = engine.migrateLegacy(m)
  assert.equal(JSON.stringify(again.studioItems), migratedSnapshot, '迁移必须幂等（刷新不会重复添加）')
  /* 守卫的真实场景：实时协作会把旧的 peg 字段从房间文档回灌进配置（字段已死但还在），
     迁移标记必须压过它 —— 否则每次加载都会按 peg 再迁移一遍，数组里出现重复组件。 */
  const dupInput = JSON.parse(JSON.stringify(Object.assign({}, m, {
    studio: Object.assign({}, m.studio, { peg: { on: true, side: 'e', face: 'in', panels: 2 } })
  })))
  const resurrected = engine.migrateLegacy(dupInput)
  assert.equal(resurrected.studioItems.length, 2, 'itemsMigrated 标记必须压住「复活的 peg」，不得重复迁移')
  const off = engine.defaultConfig()
  off.studio = Object.assign({}, off.studio, { peg: { on: false } })
  delete off.studio.itemsMigrated
  delete off.studioItems
  assert.equal(engine.migrateLegacy(off).studioItems.length, 0, '旧洞洞板关闭时不应迁移出组件')
})

test('侧墙类型：玻璃 / 玻璃幕墙 / 围栏在选项与双视图里都有', async () => {
  const { engine, schema } = await loadSandbox()
  const vm = schema.buildVM(engine.defaultConfig(), { sel: 'st' })
  const sides = vm.selection.fields.find((f) => f.path === 'studio.sides.n')
  for (const v of ['glass', 'curtain', 'fence']) {
    assert.ok(sides.options.some((o) => o[0] === v), `侧墙选项必须有 ${v}`)
  }
  const cfg = engine.defaultConfig()
  cfg.studio.sides = { n: 'curtain', e: 'fence', s: 'door', w: 'glass' }
  const plan = engine.renderPlan(cfg, {})
  assert.ok(plan.includes('#5f8ba8'), '平面必须画玻璃幕墙的竖梃')
  assert.ok(plan.includes('0.28 0.16'), '平面必须画围栏虚线')
  const svg = engine.render3D(cfg, { az: 90, el: 30, zoom: 1, vw: 900, vh: 620 })
  assert.ok(svg.length > 1000, '3D 渲染三种新侧墙不得抛错')
})

test('实时协作：组件进同步清单 + 版本升级补传机制在位', async () => {
  const collab = await read('sd-collab.js')
  assert.match(collab, /var COLLECTIONS = \[[^\]]*'studioItems'/u, 'COLLECTIONS 必须包含 studioItems（只出现在 ID_PREFIX 里不够）')
  assert.match(collab, /si: 'studioItems'/u, 'ID_PREFIX 必须有 si（远端拖动预览与物化要用）')
  assert.match(collab, /function adoptMissing\(\)/u, '必须有版本升级补传函数')
  assert.match(collab, /if \(!serverVectorEmpty\(msg\.sv\)\) adoptMissing\(\);/u, 'sync 时必须调用补传（否则新字段首次物化即被覆盖）')
  const app = await read('app.js')
  assert.match(app, /\|\| k === 'ct' \|\| k === 'si'\)\) return;/u, '远端拖动预览白名单必须放行 si')
})

test('双端快捷条：组件可旋转 / 转正 / 删除', async () => {
  const [d, m] = await Promise.all([read('sd-ui-desktop.js'), read('sd-ui-mobile.js')])
  for (const [name, src] of [['desktop', d], ['mobile', m]]) {
    assert.match(src, /k === 'si'/u, `${name} 快捷条必须有组件分支`)
    assert.ok(src.includes('data-bact="resetRotItem"'), `${name} 必须有「转正」按钮`)
    assert.ok(src.includes("itemLabel("), `${name} 必须显示组件名（洞洞板 / 工作台 …）`)
  }
})

test('云端 / 协作两条载入路径同样走版本迁移（旧快照的 peg 要升级为组件）', async () => {
  const app = await read('app.js')
  /* 取实现片段（到定界注释或下一段为止），避免被缩进差异干扰 */
  const sliceAfter = (marker, len) => {
    const i = app.indexOf(marker)
    assert.ok(i >= 0, `找不到 ${marker}`)
    return app.slice(i, i + len)
  }
  assert.match(sliceAfter('setCfg: function(obj){', 400), /cfg = E\.migrateLegacy\(obj\)/u, '云端图纸载入必须走 migrateLegacy')
  assert.match(sliceAfter('applyRemoteConfig: function(obj){', 400), /cfg = E\.migrateLegacy\(obj\)/u, '协作物化必须走 migrateLegacy')
})

test('app.js：云端 / 协作接线必须是短重试（依赖脚本可能晚于 boot 就绪）', async () => {
  const app = await read('app.js')
  assert.match(app, /function wireServices\(\)/u, '接线必须收进可重试的 wireServices')
  assert.match(app, /setTimeout\(wireServices, 25\)/u, '未就绪时必须重试（否则实时协作静默失效）')
  assert.ok(app.includes('wireServices.cloud') && app.includes('wireServices.collab'), '两条接线各自幂等')
  /* 旧的「一次性 if (window.SDCollab) …attach」写法必须消失（它是静默失效的根因） */
  assert.ok(!/\n    if \(window\.SDCollab\) window\.SDCollab\.attach\(\{/u.test(app), '不要退回一次性接线')
})

test('app.js 接线：拖动 / 跟随工作室 / 增删 / 类型切换夹长度', async () => {
  const app = await read('app.js')
  assert.ok(app.includes("si:'studioItems'"), 'SEC_OF 必须映射组件桶')
  assert.ok(app.includes('delStudioItem: function') && app.includes('addStudioItem: function'), '组件增删动作必须在')
  assert.match(app, /\(cfg\.studioItems \|\| \[\]\)\.forEach\(function\(siF\)/u, '拖动工作室时组件必须跟随')
  assert.match(app, /studioItems\\\.\\d\+\\\.kind/u, '切换组件类型必须把长度夹回新类型范围')
})

test('云快照迟到不得覆盖实时工作区（等 loaded + 首次载入让位）', async () => {
  const collab = await read('sd-collab.js')
  assert.match(collab, /else if \(s\.loaded\) ok = true/u, 'waitCloudReady 必须等「首次载入完成」')
  assert.ok(!collab.includes('s.attached && !s.loading'), '旧的「没在加载」判据必须消失（它在载入发出前就为真）')

  const cloud = await read('sd-cloud.js')
  assert.match(cloud, /loaded: false/u, '云端状态必须有首次载入标记')
  const marker = 'if (options && options.first && collabLive) {'
  const i = cloud.indexOf(marker)
  assert.ok(i >= 0, '迟到的首次载入必须有让位分支')
  const j = cloud.indexOf('applyCloud(', i)
  assert.ok(j > i, '让位分支之后必须紧跟正常载入路径')
  const branch = cloud.slice(i, j)
  assert.ok(branch.includes('state.loaded = true'), '让位分支要标记载入完成（否则协作永远等下去）')
  assert.ok(branch.includes('return'), '让位分支必须提前返回（不覆盖 cfg，否则 diff 会把房间新内容当本地删除广播）')
  assert.match(cloud, /load\(\{ silent: true, announce: false, first: true \}\)/u, '重连补载必须标记 first（走同一条让位规则）')
})
