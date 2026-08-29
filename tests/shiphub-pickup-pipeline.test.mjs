import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const [board, guide, pipeline, surfaceMobile, surfaceDesktop, pipelineCss, ledger, hook, overview, client, sync, routes] = await Promise.all([
  read('apps/web/src/components/shiphub/ShipHubOrderBoard.jsx'),
  // 定位脚本引导已抽成独立组件，被单类看板与整合看板共用
  read('apps/web/src/components/shiphub/ShipHubLocatorGuide.jsx'),
  read('apps/web/src/components/shiphub/ShipHubPipelineBoard.jsx'),
  read('apps/web/src/components/shiphub/ShipHubPipelineMobile.jsx'),
  read('apps/web/src/components/shiphub/ShipHubPipelineDesktop.jsx'),
  read('apps/web/src/styles/pickup-ledger.css'),
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

test('待取车模块把 hand/pick/receive 整合为单一看板，其它交接保持单类', () => {
  // 待取车场景：三类合成一个 ShipHubPipelineBoard（分段切换），不再纵向堆三块
  assert.match(ledger, /<ShipHubPipelineBoard/u)
  assert.match(ledger, /summaryCategories=\{shiphub\?\.summary\?\.categories \|\| \[\]\}/u)
  assert.match(ledger, /\['shiphub', 'Shiphub 车辆'\]/u)
  // 其它交接场景仍走单类 ShipHubOrderBoard，variant 固定 handover
  assert.match(ledger, /<ShipHubOrderBoard[\s\S]{0,2000}?variant="handover"/u)
  assert.match(ledger, /\[\['other', '其它交接'\], \['receive', '待收货'\], \['ship', '待发货'\]\]/u)
})

test('整合看板：分段切换、汇总计数与同步时间共用单一头部', () => {
  // 三类固定在组件内，切换只换 activeCategory 不重挂看板
  assert.match(pipeline, /const PIPELINE_CATEGORIES = \['hand', 'pick', 'receive'\]/u)
  assert.match(pipeline, /const \[activeCategory, setActiveCategory\] = useState\('hand'\)/u)
  // 单一头部：一条同步时间由 describeSyncState 汇总，而不是每类各一套
  assert.match(pipeline, /describeSyncState\(summaryCategories\)/u)
  // 定位脚本引导只在自提分段出现
  assert.match(pipeline, /const locatorVisible = viewport === 'mobile' \? activeCategory === 'hand' : true/u)
  assert.match(pipeline, /<ShipHubLocatorGuide visible=\{locatorVisible\} \/>/u)
})

test('整合看板按双端拆分成两套整面实现，由视口择一挂载', () => {
  // memory 23：桌面/移动两套独立 DOM，不靠 @media 硬凑
  assert.match(pipeline, /useViewportKind/u)
  assert.match(pipeline, /import ShipHubPipelineMobile from '\.\/ShipHubPipelineMobile\.jsx'/u)
  assert.match(pipeline, /import ShipHubPipelineDesktop from '\.\/ShipHubPipelineDesktop\.jsx'/u)
  assert.match(pipeline, /if \(viewport === 'mobile'\) \{/u)
  // 两端根节点各自独立类名，样式互不覆盖
  assert.match(surfaceMobile, /className="shiphub-pipeline shiphub-pipeline-mobile"/u)
  assert.match(surfaceDesktop, /className="shiphub-pipeline shiphub-pipeline-desktop"/u)
  // 老看板 .shiphub-order-board > header (0,1,1) 会压过 .shiphub-pipeline-head (0,1,0)
  // 把页头压成单行 flex（中文竖排 = 「挤在一起」），因此两端都不得再挂该类
  for (const surface of [surfaceMobile, surfaceDesktop]) {
    // 只查 className 实际用法，注释里解释这条约束的散文不算违规
    assert.doesNotMatch(surface, /className="[^"]*shiphub-order-board/u)
  }
})

test('移动端保留分段切换，桌面端改为三列并排且空列显示「无」', () => {
  // 移动端：分段 tablist，一次看一类，页面不被拉长
  assert.match(surfaceMobile, /role="tablist"/u)
  assert.match(surfaceMobile, /role="tab"/u)
  assert.match(surfaceMobile, /aria-label="待取车分类"/u)
  // 桌面端：三列并排，无分段
  assert.doesNotMatch(surfaceDesktop, /role="tablist"/u)
  assert.match(surfaceDesktop, /className="shiphub-pipeline-columns"/u)
  assert.match(surfaceDesktop, /columns\.map\(\(column\) =>/u)
  // 空列显示「无」而不是隐藏：列骨架恒定三列，宽度不跳
  assert.match(surfaceDesktop, /data-placeholder="none">无<\/p>/u)
  assert.match(surfaceDesktop, /data-empty=\{column\.orders\.length \? 'false' : 'true'\}/u)
  // 三列由数据层一次构建，含各列计数 / 载入 / 错误态
  assert.match(pipeline, /const columns = useMemo\(\(\) => PIPELINE_CATEGORIES\.map/u)
  assert.match(pipeline, /orders: ordersByCategory\[category\] \|\| \[\]/u)
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
  assert.match(guide, /const readLocatorOutdated = \(\)/u)
  assert.match(guide, /data-shiphub-locator-outdated/u)
  assert.match(guide, /locatorInstalled && locatorOutdated/u)
  assert.match(guide, /去更新脚本/u)
  assert.match(guide, /定位脚本有新版本 v\{locatorOutdated\}/u)
  // 单类看板与整合看板都必须挂上引导组件，否则安装/更新提示会在某个视图消失
  assert.match(board, /<ShipHubLocatorGuide visible=\{category === 'hand'\} \/>/u)
})

test('待取车看板展示连接状态，未连接时提示手动重连', () => {
  // 状态由 hook 从 summary 归一化（fixture 不当故障），看板不自己猜。
  // preview 模拟开关可在其前叠加一层覆盖值，故此处不锚定行首。
  assert.match(hook, /summary\?\.mode === 'fixture' \? 'fixture' : \(summary\?\.connection\?\.authorizationStatus \|\| 'disconnected'\)/u)
  assert.match(hook, /connectionStatus: (?:simulatedStatus \|\| )?\(?summary\?\.mode === 'fixture'/u)
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

test('整合看板的每个类名都有样式落地（防样式缺失回归）', () => {
  // 上一轮真实事故：JSX 与测试都通过，但分段样式整块缺失，线上会渲染成裸列表。
  // 从三个组件源码里抽出所有 shiphub-pipeline-* 类名，逐个要求样式表里有对应选择器。
  const used = new Set()
  for (const src of [pipeline, surfaceMobile, surfaceDesktop]) {
    for (const [, value] of src.matchAll(/className="([^"]+)"/gu)) {
      for (const name of value.split(/\s+/u)) {
        if (name.startsWith('shiphub-pipeline')) used.add(name)
      }
    }
  }
  assert.ok(used.size >= 8, `应抽到整合看板类名，实际 ${used.size}`)
  const missing = [...used].filter((name) => !new RegExp(`\\.${name}[\\s,{:[]`, 'u').test(pipelineCss))
  assert.deepEqual(missing, [], `以下类名缺少样式: ${missing.join(', ')}`)
})

test('桌面三列与移动分段各有独立布局规则，同步按钮不再是裸按钮', () => {
  // 两端布局规则必须分别落地，且不共用同一条 display 声明
  assert.match(pipelineCss, /\.shiphub-pipeline-mobile \.shiphub-pipeline-head \{[^}]*display: grid/u)
  assert.match(pipelineCss, /\.shiphub-pipeline-desktop \.shiphub-pipeline-head \{[^}]*display: flex/u)
  // 桌面三列：恒定三轨，可收缩（memory 25：单列容器漏 minmax(0,…) 会撑破）
  assert.match(pipelineCss, /\.shiphub-pipeline-columns \{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/u)
  // 空列占位「无」有独立样式，保证三列基线高度一致
  assert.match(pipelineCss, /\.shiphub-pipeline-empty\[data-placeholder="none"\]/u)
  // 同步按钮此前零样式（渲染成裸按钮），必须有实体表面
  assert.match(pipelineCss, /\.shiphub-pipeline-sync \{[^}]*background:/u)
})

test('分段选中态使用实心主色，不引入 blur 或缩放', () => {
  // memory 19/22：大面积表面禁 filter blur 与 scale
  const block = pipelineCss.slice(pipelineCss.indexOf('.shiphub-pipeline-segments'))
  assert.match(block, /aria-selected="true"\]\s*\{[^}]*var\(--ops-yellow/u)
  assert.doesNotMatch(block, /filter:\s*blur/u)
  assert.doesNotMatch(block, /transform:\s*scale/u)
})
