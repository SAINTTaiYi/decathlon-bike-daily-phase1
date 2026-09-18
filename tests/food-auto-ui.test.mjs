import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const read = (rel) => readFile(new URL(rel, import.meta.url), 'utf8')

const [
  appJsx,
  siteApp,
  autoApp,
  autoMobile,
  autoDesktop,
  autoCss,
  autoHook,
  autoApi,
  presentation,
  foodApp,
  foodMobileShell,
  foodDesktopShell,
  styleIndex,
  workerRoutes,
  workerService,
  workerDiscovery,
  workerAggregate,
  envSource,
  clickableTest
] = await Promise.all([
  read('../apps/web/src/App.jsx'),
  read('../apps/web/src/components/food/FoodSiteApp.jsx'),
  read('../apps/web/src/components/food/FoodAutoApp.jsx'),
  read('../apps/web/src/components/food/FoodAutoShellMobile.jsx'),
  read('../apps/web/src/components/food/FoodAutoShellDesktop.jsx'),
  read('../apps/web/src/styles/food-auto.css'),
  read('../apps/web/src/hooks/useFoodAuto.js'),
  read('../apps/web/src/api/foodAuto.js'),
  read('../apps/web/src/utils/foodAutoPresentation.js'),
  read('../apps/web/src/components/food/FoodApp.jsx'),
  read('../apps/web/src/components/food/FoodShellMobile.jsx'),
  read('../apps/web/src/components/food/FoodShellDesktop.jsx'),
  read('../apps/web/src/styles/index.css'),
  read('../apps/worker/src/routes/food-auto.ts'),
  read('../apps/worker/src/services/food-auto.ts'),
  read('../apps/worker/src/services/food-auto-discovery.ts'),
  read('../apps/worker/src/services/food-auto-aggregate.ts'),
  read('../apps/worker/src/env.ts'),
  read('../tests/food-ledger.test.mjs')
])

// ── 食品自动登记影子系统 · 界面与接线（2026-09-18）──
// 教训（memory 26/27）：结构断言与样式落地断言必须成对，否则会出现
// 「测试全绿但界面没样式」。本文件对两套 shell 逐类名验证 CSS 落地。

function classesIn(source, prefix) {
  const found = new Set()
  for (const match of source.matchAll(/className="([^"]+)"/gu)) {
    for (const token of match[1].split(/\s+/u)) {
      if (token.startsWith(prefix)) found.add(token)
    }
  }
  for (const match of source.matchAll(/className=\{`([^`]+)`\}/gu)) {
    for (const token of match[1].split(/\s+/u)) {
      if (token.startsWith(prefix)) found.add(token)
    }
  }
  return found
}

test('影子系统入口：eat 站根是 FoodSiteApp，默认自动登记，台账是可达的次级视图', () => {
  assert.match(appJsx, /import FoodSiteApp from '\.\/components\/food\/FoodSiteApp\.jsx'/u, 'App.jsx 必须渲染 FoodSiteApp')
  assert.doesNotMatch(appJsx, /import FoodApp from '\.\/components\/food\/FoodApp\.jsx'/u, 'App.jsx 不应再直接渲染 FoodApp')
  assert.match(appJsx, /<FoodSiteApp enabled=\{authenticated && !introLocked\}/u, 'eat 站入口 props 保持既有口径')
  // 默认视图 = 自动登记；useFoodAuto 挂在 FoodSiteApp（切台账不打断运行）
  assert.match(siteApp, /useState\('auto'\)/u, '默认视图必须是自动登记')
  assert.match(siteApp, /const auto = useFoodAuto\(\)/u, '自动登记状态必须挂在这一层（切视图不卸载）')
  assert.match(siteApp, /onOpenLedger=\{\(\) => setMode\('ledger'\)\}/u, '影子系统需提供台账入口')
  assert.match(siteApp, /onOpenAuto=\{\(\) => setMode\('auto'\)\}/u, '台账需提供返回自动登记入口')
})

test('影子系统壳：按视口择一两套实现（memory 23）', () => {
  assert.match(autoApp, /useViewportKind/u)
  assert.match(autoApp, /return viewport === 'mobile' \? <FoodAutoShellMobile \{\.\.\.shared\} \/> : <FoodAutoShellDesktop \{\.\.\.shared\} \/>/u)
})

test('移动端 shell：主操作 / 阶段 / 进度 / 捕捉看板 / 日志 / 结果全部就位', () => {
  assert.match(autoMobile, /开始自动登记/u)
  assert.match(autoMobile, /取消运行/u)
  assert.match(autoMobile, /fa-m-start/u)
  assert.match(autoMobile, /fa-m-bar/u, '必须有进度条')
  assert.match(autoMobile, /percentOf\(progress\.done, progress\.total\)/u, '进度必须来自真实遍历计数')
  assert.match(autoMobile, /fa-m-phase/u, '必须有当前阶段行')
  assert.match(autoMobile, /实时捕捉/u)
  assert.match(autoMobile, /算法日志/u)
  assert.match(autoMobile, /formatClock\(event\.at\)/u, '日志逐条渲染（一个字也要更新）')
  assert.match(autoMobile, /event\.text/u)
  assert.match(autoMobile, /本次判定结果/u)
  assert.match(autoMobile, /productionDate/u)
  assert.match(autoMobile, /warnOn/u)
  // 自动滚动跟随
  assert.match(autoMobile, /node\.scrollTop = node\.scrollHeight/u)
})

test('桌面端 shell：主操作 / 阶段 / 进度 / 捕捉看板 / 日志 / 结果全部就位', () => {
  assert.match(autoDesktop, /开始自动登记/u)
  assert.match(autoDesktop, /取消运行/u)
  assert.match(autoDesktop, /fa-d-start/u)
  assert.match(autoDesktop, /fa-d-bar/u)
  assert.match(autoDesktop, /fa-d-phase/u)
  assert.match(autoDesktop, /实时捕捉/u)
  assert.match(autoDesktop, /算法日志/u)
  assert.match(autoDesktop, /本次判定结果/u)
  assert.match(autoDesktop, /<table>/u)
  assert.match(autoDesktop, /node\.scrollTop = node\.scrollHeight/u)
})

test('双端独立：移动 shell 不出现桌面类名，桌面 shell 不出现移动类名', () => {
  const mobile = classesIn(autoMobile, 'fa-')
  const desktop = classesIn(autoDesktop, 'fa-')
  for (const name of mobile) assert.match(name, /^fa-m(-|$)/u, `移动端仅允许 fa-m-*：${name}`)
  for (const name of desktop) assert.match(name, /^fa-d(-|$)/u, `桌面端仅允许 fa-d-*：${name}`)
  // 根节点命名空间互斥（fa-m / fa-d）
  assert.ok(mobile.has('fa-m'), '移动端根节点应为 .fa-m')
  assert.ok(desktop.has('fa-d'), '桌面端根节点应为 .fa-d')
})

test('每个类名都有样式落地（JSX → CSS 全覆盖，memory 26/27 教训）', () => {
  const expected = new Set([
    ...classesIn(autoMobile, 'fa-m-'),
    ...classesIn(autoDesktop, 'fa-d-'),
    'food-m-auto',
    'food-d-auto'
  ])
  assert.ok(expected.size >= 20, `类名应当足量，实际 ${expected.size}`)
  // 精确匹配：`.fa-d-start` 不能被 `.fa-d-start-INJECTED` 命中（注入验证实测的假绿）
  const missing = [...expected].filter((name) => !new RegExp(`(^|[\\s,>+~])\\.${name}(?![\\w-])`, 'mu').test(autoCss))
  assert.deepEqual(missing, [], `以下类名缺样式：${missing.join(', ')}`)
  // 台账入口两个按钮分别在两个 shell 中出现（双端各自实现）
  assert.match(foodMobileShell, /className="food-m-auto"/u)
  assert.match(foodDesktopShell, /className="food-d-auto"/u)
})

test('CSS 作用域：移动规则裸写、桌面规则包在桌面断点内（memory 29 防泄漏）', () => {
  const desktopMarker = '@media (min-width: 768px)'
  const index = autoCss.indexOf(desktopMarker)
  assert.ok(index > 0, '必须存在桌面断点段')
  const mobileSection = autoCss.slice(0, index)
  const desktopSection = autoCss.slice(index)
  assert.match(mobileSection, /\.fa-m-start/u, '移动规则必须在断点之前')
  assert.doesNotMatch(mobileSection, /\.fa-d-start/u)
  assert.match(desktopSection, /\.fa-d-start/u, '桌面规则必须在断点之内')
  assert.doesNotMatch(desktopSection, /\.fa-m-/u, '移动规则不得泄漏进桌面段')
  // 样式表已挂进总入口，且位于 food-ledger 之后（顺序稳定）
  const ledgerIndex = styleIndex.indexOf("food-ledger.css")
  const autoIndex = styleIndex.indexOf("food-auto.css")
  assert.ok(ledgerIndex > 0 && autoIndex > ledgerIndex, 'food-auto.css 需在 food-ledger.css 之后 import')
})

test('编排 hook：全链路调用顺序与实时事件流（一个字也要更新）', () => {
  // ① 顺序：状态 → 收货单 → （空则回查）→ 明细 → 计划 → 扫描 → 判定 → 落库
  // 用调用点（带参数）而非裸函数名——import 块是字母序，会干扰 indexOf 判断。
  const sequence = [
    'getFoodAutoStatus(signal)',
    'fetchFoodAutoReceptions(signal)',
    'discoverFoodAutoReceptions(signal)',
    'fetchFoodAutoReceptionItems({ receptionId',
    'buildFoodAutoPlan({ items: planItems }, signal)',
    'scanFoodAutoSegment({ item: segment.item',
    'judgeFoodAutoRecords({ items: planItems, aggregates }',
    'saveFoodAutoRun({'
  ]
  let last = -1
  for (const name of sequence) {
    const at = autoHook.indexOf(name)
    assert.ok(at > last, `${name} 必须按序出现`)
    last = at
  }
  // ② 并发扫描 + 逐段回报
  assert.match(autoHook, /SCAN_CONCURRENCY = 8/u)
  assert.match(autoHook, /applySegment\(result, segment/u, '每段必须回报（进度与命中实时更新）')
  assert.match(autoHook, /emit\(\s*`段 \$\{planProgress\.done\}\/\$\{planProgress\.total\}/u, '逐段事件必须带进度')
  assert.match(autoHook, /🎯 捕捉/u, '捕捉到新批次必须实时上屏')
  assert.match(autoHook, /setProgress\(\{ done, total \}\)/u)
  // ③ 事件上限与取消
  assert.match(autoHook, /MAX_EVENTS = 2400/u)
  assert.match(autoHook, /abortRef\.current\?\.abort/u)
  assert.match(autoHook, /运行已取消/u, '取消必须走 AbortController 并在事件流留痕')
  // ④ 失败段不阻断整批
  assert.match(autoHook, /段失败/u)
  // ⑤ 判定载荷必须走「批次摘要」（免费层 CPU 约束：原始记录直传会 5 倍超限）
  assert.match(autoHook, /function buildAggregates\(recordsByItem\)/u, '必须有客户端摘要压缩')
  assert.match(autoHook, /const aggregates = buildAggregates\(recordsRef\.current\)/u)
  assert.doesNotMatch(autoHook, /judgeFoodAutoRecords\(\{ items: planItems, records/u, '不得直传原始记录')
  assert.match(autoHook, /coOccur/u, '摘要必须含跨商品共现计数')
})

test('API 层与 Worker 路由一一对应', () => {
  for (const path of ['/status', '/receptions', '/discover', '/reception-items', '/plan', '/scan', '/judge', '/save']) {
    assert.ok(autoApi.includes(`/api/v1/food-auto${path}`), `API 层缺少 ${path}`)
    assert.ok(workerRoutes.includes(`/api/v1/food-auto${path}`), `路由层缺少 ${path}`)
  }
  // 门店边界：绑定门店校验必须存在（铁律）
  assert.match(workerRoutes, /FOOD_AUTO_STORE_MISMATCH/u)
  assert.match(workerRoutes, /assertBoundStore/u)
  // 凭据为部署级 secret，绝不出现在路由/服务源码
  assert.doesNotMatch(workerRoutes, /CHU13/u)
  assert.doesNotMatch(workerService, /Fish31415926/u)
})

test('Worker 服务：RDS 侧过滤 / 36 小时窗口 / 分片 10k / 效期换算', () => {
  assert.match(workerService, /filterRecentRecords/u, 'RDS 响应必须在 Worker 侧过滤（1.1-1.4MB/万 EPC）')
  assert.match(workerService, /SCAN_WINDOW_HOURS = 36/u)
  assert.match(workerService, /SEGMENT_SIZE = 10_000/u)
  assert.match(workerService, /export \{ edate, deriveProductionDate, aggregateRecords, judgeAggregates, sanitizeAggregates \}/u, '日期与聚合的唯一实现在 aggregate 模块')
  assert.match(workerAggregate, /deriveProductionDate/u)
  assert.match(workerAggregate, /edate\(productionDate, months - 1\)/u, '预警日 = EDATE(生产日期, M−1)')
  assert.match(workerAggregate, /AGGREGATE_LIMIT = 200/u)
  assert.match(workerAggregate, /coOccur >= 10 \|\| \(best\.coOccur >= 3 && best\.count >= 8\)/u, '置信度阈值')
  // 401/403 时强制重登重试一次（token 被上游提前失效的兜底）
  assert.match(workerService, /getSnbToken\(config, \{ force: true \}\)/u)
  // 收货单发现：reference 解析 + 今日窗口
  assert.match(workerDiscovery, /reception_id/u)
  assert.match(workerDiscovery, /receipt/u)
})

test('Worker env：SNB 凭据接线（secret 名 + 绑定门店）', () => {
  for (const key of ['SNB_CLIENT_ID', 'SNB_CLIENT_SECRET', 'SNB_RDS_API_KEY', 'SNB_RECEPTION_API_KEY', 'SNB_MOVEMENTS_API_KEY', 'SNB_LOGIN_KEY', 'SNB_LOGIN_USERNAME_ENC', 'SNB_LOGIN_PASSWORD_ENC', 'FOOD_AUTO_BOUND_STORE']) {
    assert.ok(envSource.includes(key), `env 缺少 ${key}`)
  }
})

test('展示辅助：时长 / 时钟 / 百分比口径', () => {
  assert.match(presentation, /formatDuration/u)
  assert.match(presentation, /formatClock/u)
  assert.match(presentation, /percentOf/u)
})

test('台账双端均带自动登记入口（FoodApp 透传）', () => {
  assert.match(foodApp, /onOpenAuto/u)
  assert.match(foodMobileShell, /onOpenAuto \? \(/u)
  assert.match(foodDesktopShell, /onOpenAuto \? \(/u)
  // 影子系统页头的台账入口
  assert.match(autoMobile || '', /台账 ↗/u)
})

test('旧断言不回归：food-ledger 测试里的 schema 版本已随 0038 前移', () => {
  assert.match(clickableTest, /'0038_food_auto_shadow'/u)
})
