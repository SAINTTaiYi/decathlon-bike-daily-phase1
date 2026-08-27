import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const [board, ledger, hook, overview, client, sync, routes] = await Promise.all([
  read('apps/web/src/components/shiphub/ShipHubOrderBoard.jsx'),
  read('apps/web/src/components/pickup/PickupLedger.jsx'),
  read('apps/web/src/hooks/useShipHub.js'),
  read('apps/web/src/components/overview/WorkshopOverviewPage.jsx'),
  read('apps/worker/src/lib/shiphub-client.ts'),
  read('apps/worker/src/services/shiphub-sync.ts'),
  read('apps/worker/src/routes/shiphub.ts')
])

test('上游新增 pick 分类：计数路径、来源标签与同步节奏', () => {
  assert.match(client, /\['hand', 'pick', 'receive', 'ship'\] as const/u)
  assert.match(client, /pick: 'to_pick_count'/u)
  assert.match(client, /pick: 'Shiphub 待拣货'/u)
  assert.match(sync, /const CATEGORIES: readonly ShipHubCategory\[\] = \['hand', 'pick', 'receive', 'ship'\]/u)
  // 待拣货对齐待取节奏（计数 5 分钟 / 全量 15 分钟），顾客取车链路保持高频新鲜
  assert.match(sync, /pick: 5 \* 60_000/u)
  assert.match(sync, /pick: 15 \* 60_000/u)
  // 手动同步与授权后同步都覆盖 pick
  assert.equal(routes.split("for (const selected of ['hand', 'pick', 'receive', 'ship'] as const) {").length - 1, 2)
  assert.match(routes, /value !== 'pick'/u)
  // pick 的本地确认归属 pickup 审计模块（它只出现在待取车模块）
  assert.match(routes, /module: selected === 'hand' \|\| selected === 'pick' \? 'pickup' : 'handover'/u)
})

test('待取车模块呈现 hand/pick/receive 三块并透传 pickup 展示口径', () => {
  assert.match(ledger, /const shiphubCategories = handoverMode \? \[shiphubTab\] : \['hand', 'pick', 'receive'\]/u)
  assert.match(ledger, /\['shiphub', 'Shiphub 车辆'\]/u)
  assert.match(ledger, /variant=\{handoverMode \? 'handover' : 'pickup'\}/u)
  // 其它交接场景保持单类呈现不动
  assert.match(ledger, /\[\['other', '其它交接'\], \['receive', '待收货'\], \['ship', '待发货'\]\]/u)
})

test('看板按待取车口径标注：待门店拣货 与 在途车辆', () => {
  assert.match(board, /pick: \{ en: 'SHIPHUB PICKING', cn: '待门店拣货', action: '去 Shiphub 拣货', actionType: 'pick' \}/u)
  assert.match(board, /receive: \{ en: 'SHIPHUB IN-TRANSIT', cn: '在途车辆' \}/u)
  assert.match(board, /const headLabel = variantTitle \? variantTitle\.cn : \(order\.sourceLabel \|\| meta\.cn\)/u)
  assert.match(board, /const boardTitle = variantTitle \|\| meta/u)
  assert.match(board, /<strong id=\{`shiphub-\$\{category\}-title`\}>\{boardTitle\.cn\}<\/strong>/u)
  // 其它交接口径的 receive/ship 标题保持原样
  assert.match(board, /receive: \{ en: 'SHIPHUB RECEIVE', cn: '待收货', action: '去 Shiphub 收货', actionType: 'receive' \}/u)
  assert.match(board, /ship: \{ en: 'SHIPHUB SHIP', cn: '待发货', action: '确认发货', actionType: 'ship' \}/u)
})

test('useShipHub 支持 pick 分类并在同步后刷新全部四类', () => {
  assert.match(hook, /const EMPTY = \{ hand: \[\], pick: \[\], receive: \[\], ship: \[\] \}/u)
  assert.match(hook, /const CATEGORIES = \['hand', 'pick', 'receive', 'ship'\]/u)
  assert.match(hook, /if \(!enabled \|\| !CATEGORIES\.includes\(category\)\) return \[\]/u)
  assert.match(hook, /for \(const category of CATEGORIES\) void loadOrders\(category\)/u)
})

test('概览待取车辆计数覆盖完整取车管线（含待拣货与在途）', () => {
  assert.match(overview, /manualCount \+ shiphubCount\('hand'\) \+ shiphubCount\('pick'\) \+ shiphubCount\('receive'\)/u)
  assert.match(overview, /const pickupCount = \(workflow\.recordsByScene\.pickup\?\.length \?\? 0\) \+ shiphubCount\('hand'\) \+ shiphubCount\('pick'\) \+ shiphubCount\('receive'\)/u)
  // 其它交接计数保持 receive/ship 原口径
  assert.match(overview, /manualCount \+ shiphubCount\('receive'\) \+ shiphubCount\('ship'\)/u)
})


test('pick/receive 主按钮跳转 Shiphub 对应页面，ship 与本地确认保持原样', () => {
  // 跳转目标映射：hand→待交接核销，pick→待门店拣货，receive→待门店收货
  assert.match(board, /hand: \{ path: '\/to_handover', hashKey: 'pickup'/u)
  assert.match(board, /pick: \{ path: '\/to_pick', hashKey: 'pickup'/u)
  assert.match(board, /receive: \{ path: '\/to_receive', hashKey: 'pickup'/u)
  assert.match(board, /\$\{target\.path\}#\$\{target\.hashKey\}=/u)
  // pick/receive 主按钮 = 跳转（拣货/收货操作在官方页完成）；已完成态保留撤销入口
  assert.match(board, /category === 'hand' \|\| category === 'ship'/u)
  assert.match(board, /\{meta\.action\} ↗<\/button>/u)
  assert.match(board, /aria-hidden="true" \/>\{meta\.action\} ↗<\/button>/u)
  // pick/receive 完成态保留撤销 + 跳转双按钮
  assert.match(board, /\{completed \? <button type="button" onClick=\{\(\) => void onAction\(category, order\.id, 'revoked'\)\}/u)
})

test('脚本更新检测：过期标记驱动更新提示条', () => {
  assert.match(board, /const readLocatorOutdated = \(\)/u)
  assert.match(board, /data-shiphub-locator-outdated/u)
  assert.match(board, /locatorInstalled && locatorOutdated/u)
  assert.match(board, /去更新脚本/u)
  assert.match(board, /定位脚本有新版本 v\{locatorOutdated\}/u)
})
