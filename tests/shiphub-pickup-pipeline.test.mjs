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
  // \u540c\u6b65\u540e\u7b49\u56db\u7c7b\u771f\u6b63\u56de\u635e\u5b8c\u624d\u89e3\u9664\u6309\u94ae\u7981\u7528\uff08\u4e0d\u80fd fire-and-forget\uff0c\u5426\u5219\u65cb\u8f6c\u52a8\u6548\u63d0\u524d\u7ed3\u675f\uff09
  assert.match(hook, /await Promise\.all\(CATEGORIES\.map\(\(category\) => loadOrders\(category\)\)\)/u)
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

test('待取车看板展示连接状态，未连接时提示手动重连', () => {
  // 状态由 hook 从 summary 归一化（fixture 不当故障），看板不自己猜
  assert.match(hook, /connectionStatus: summary\?\.mode === 'fixture' \? 'fixture' : \(summary\?\.connection\?\.authorizationStatus \|\| 'disconnected'\)/u)
  // 仅在非 connected 且非 fixture 时展示提示条
  assert.match(board, /connectionStatus !== 'connected' && connectionStatus !== 'fixture'/u)
  assert.match(board, /shiphub-connection-notice/u)
  // 区分「授权失效」与「从未授权」两种文案
  assert.match(board, /connectionStatus === 'reauth_required'/u)
  // 手动重连入口，且由台账透传到设置弹窗
  assert.match(board, /onOpenConnection \? <button type="button" className="shiphub-connection-open"/u)
  assert.match(ledger, /onOpenConnection=\{onOpenShipHubSettings\}/u)
})

test('cron 同步前自愈 reauth_required 连接，并按门店节流', () => {
  assert.match(sync, /const SELF_HEAL_COOLDOWN_MS = 30 \* 60_000/u)
  assert.match(sync, /async function healShipHubConnections/u)
  // 只挑 reauth_required 且启用的连接
  assert.match(sync, /authorization_status = 'reauth_required'/u)
  // 节流依据 updated_at，避免每轮 cron 重打上游登录
  assert.match(sync, /updated_at IS NULL OR updated_at <= \?/u)
  // 成功后回写 connected 并清空错误码
  assert.match(sync, /authorization_status = 'connected',\s*\n\s*last_auth_error_code = NULL/u)
  // 失败只记错误码，绝不落凭据内容
  assert.match(sync, /last_auth_error_code = 'SELF_HEAL_FAILED'/u)
  // fixture 模式不碰上游；自愈受营业时间窗口约束
  assert.match(sync, /if \(config\.SHIPHUB\.mode !== 'fixture' && activeInStoreTimezone\(/u)
})
