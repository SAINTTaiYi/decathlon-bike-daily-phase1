import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (p) => readFile(new URL(`../apps/web/src/${p}`, import.meta.url), 'utf8')

// 2026-09-04 perfeco 整车换源（前端三件套：结构 + CSS 落地 + 反查链降级）。

test('API 层：perfeco 四端点封装齐全', async () => {
  const api = await read('api/bi.js')
  assert.match(api, /getBikeDay/u)
  assert.match(api, /getBikeWeek/u)
  assert.match(api, /getBiVehicles/u)
  assert.match(api, /getBiVehicleModels/u)
  assert.match(api, /\/api\/v1\/bi\/bikes\/day/u)
  assert.match(api, /\/api\/v1\/bi\/bikes\/week/u)
  assert.match(api, /\/api\/v1\/bi\/vehicles\?articles=/u)
  assert.match(api, /\/api\/v1\/bi\/vehicle-models\?codes=/u)
})

test('KpiDialog：点击填写数据自动同步新车/二手并填入空字段', async () => {
  const dialog = await read('components/dialogs/KpiDialog.jsx')
  // 接收 bikeDay 同步状态
  assert.match(dialog, /bikeDay \}/u)
  // 未保存过的空字段自动填入（salesVehicles=新车、usedSold=二手分开）
  assert.match(dialog, /next\.salesVehicles === ''/u)
  assert.match(dialog, /next\.usedSold === ''/u)
  assert.match(dialog, /String\(bikeDay\.newBikes\)/u)
  assert.match(dialog, /String\(bikeDay\.usedBikes\)/u)
  // 同步状态行存在（syncing/error/ok 三态）
  assert.match(dialog, /data-bike-sync=\{bikeDay\.status\}/u)
  assert.match(dialog, /正在同步今日自行车实销/u)
  // 手动填入入口
  assert.match(dialog, /fillFromBikeDay/u)
  // 已保存过（savedAt 存在）不自动覆盖的守卫：自动填入只在空值时生效
  assert.match(dialog, /next\.salesVehicles == null/u)
})

test('KpiDialog 同步提示行样式落地（CSS 不缺类）', async () => {
  const css = await read('styles/components.css')
  assert.match(css, /\.bike-day-sync \{/u)
  assert.match(css, /\.bike-day-sync\[data-bike-sync='syncing'\]/u)
  assert.match(css, /\.bike-day-sync\[data-bike-sync='ok'\]/u)
  assert.match(css, /\.bike-day-sync \.text-action/u)
})

test('App：弹窗打开触发同步 + 日报反查链注入与降级', async () => {
  const app = await read('App.jsx')
  assert.match(app, /useBikeDaySync\(kpiOpen\)/u)
  assert.match(app, /bikeDay=\{bikeDay\}/u)
  // 日报：收集 shiphub item sku → getBiVehicles → shiphubVehicleLookup
  assert.match(app, /getBiVehicles\(vehicleSkus\)/u)
  assert.match(app, /shiphubVehicleLookup,/u)
  // 反查失败降级：catch 后保持 null，不阻塞导出
  assert.match(app, /catch \{ \/\* 分类接口失败 → 降级旧行为 \*\/ \}/u)
})

test('BI 车型榜双端换源：useBiBikesWeek 接入 + 整车口径文案', async () => {
  const desktop = await read('components/overview/BiInsightCharts.jsx')
  const mobile = await read('components/overview/BiSalesMobile.jsx')
  assert.match(desktop, /useBiBikesWeek\(\)/u)
  assert.match(desktop, /const models = bikeWeek\.models/u)
  assert.match(mobile, /useBiBikesWeek\(\)/u)
  assert.match(mobile, /const models = bikeWeek\.models/u)
  assert.match(desktop, /销售榜已按整车口径过滤/u)
  assert.match(mobile, /销售榜已按整车口径过滤/u)
  assert.match(desktop, /口径=整车/u)
  assert.doesNotMatch(desktop, /Universe=\$\{'Cycling \+ Workshop'\}/u)
})

test('useBiBikesWeek：perfeco 周榜适配 + allChannel 整车过滤 + 回退旧快照', async () => {
  const hook = await read('hooks/useBiBikesWeek.js')
  assert.match(hook, /getBikeWeek\(\)/u)
  assert.match(hook, /getBiVehicleModels\(codes\)/u)
  // 上游不可用回退 BI_SNAPSHOT（面板永远有数据）
  assert.match(hook, /BI_SNAPSHOT\.models/u)
  // allChannel 行按 isBike 过滤（分类失败时保留旧行为不误删）
  assert.match(hook, /info\.isBike/u)
  // wow 环比与 share 占比字段映射
  assert.match(hook, /row\.wow/u)
  assert.match(hook, /row\.share/u)
})

test('useBikeDaySync：失败静默降级，不影响表单', async () => {
  const hook = await read('hooks/useBikeDaySync.js')
  assert.match(hook, /getBikeDay\(\)/u)
  assert.match(hook, /status: 'unavailable'/u)
  assert.match(hook, /catch\(\(\) =>/u)
})

test('Worker 路由：perfeco 四个读端点挂载且无 CSRF/角色门槛', async () => {
  const routes = await readFile(new URL('../apps/worker/src/routes/bi.ts', import.meta.url), 'utf8')
  assert.match(routes, /app\.get\('\/api\/v1\/bi\/bikes\/day', \.\.\.read/u)
  assert.match(routes, /app\.get\('\/api\/v1\/bi\/bikes\/week', \.\.\.read/u)
  assert.match(routes, /app\.get\('\/api\/v1\/bi\/vehicles', \.\.\.read/u)
  assert.match(routes, /app\.get\('\/api\/v1\/bi\/vehicle-models', \.\.\.read/u)
  // 未配置 → available:false（优雅降级，不 503）
  assert.match(routes, /return c\.json\(\{ available: false \}\)/u)
  // 上游错误统一 503，不泄细节
  assert.match(routes, /PerfecoUpstreamError/u)
})

test('日报图：Shiphub 标识换渠道名（在途后缀），车型名来自 perfeco 分类', async () => {
  const image = await read('utils/closingReportImage.js')
  // 标识 = 渠道 + 在途后缀
  assert.match(image, /shiphubChannel/u)
  assert.match(image, /record\.shiphubCategory === 'receive' \? '在途' : ''/u)
  // 旧的阶段词只作无渠道时的回退
  assert.match(image, /const labels = \{ hand: '待交接', pick: '待拣货', receive: '在途' \}/u)
  // 非整车剔除 + 官方车型名优先
  assert.match(image, /if \(info && !info\.isBike\) return null/u)
  assert.match(image, /const bikeTitle = info\?\.label \|\| null/u)
  // lookup 从模型层透传
  assert.match(image, /shiphubVehicleLookup = null/u)
  assert.match(image, /shiphubReportRecord\(category, \{ \.\.\.order \}, shiphubVehicleLookup\)\)\.filter\(Boolean\)/u)
})

test('Worker 渠道标签：JDDJ/Meituan 翻译成中文', async () => {
  const client = await readFile(new URL('../apps/worker/src/lib/shiphub-client.ts', import.meta.url), 'utf8')
  assert.match(client, /jddj: '京东到家'/u)
  assert.match(client, /meituan: '美团'/u)
})
