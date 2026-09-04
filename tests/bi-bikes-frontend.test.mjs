import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (p) => readFile(new URL(`../apps/web/src/${p}`, import.meta.url), 'utf8')

// 2026-09-04 perfeco 整车换源（前端三件套：结构 + CSS 落地 + 反查链降级）。

test('API 层：perfeco 四端点 + 门店周对比端点封装齐全', async () => {
  const api = await read('api/bi.js')
  assert.match(api, /getBikeDay/u)
  assert.match(api, /getBikeWeek/u)
  assert.match(api, /getBiVehicles/u)
  assert.match(api, /getBiVehicleModels/u)
  assert.match(api, /getBiStoreWeek/u)
  assert.match(api, /\/api\/v1\/bi\/bikes\/day/u)
  assert.match(api, /\/api\/v1\/bi\/bikes\/week/u)
  assert.match(api, /\/api\/v1\/bi\/vehicles\?articles=/u)
  assert.match(api, /\/api\/v1\/bi\/vehicle-models\?codes=/u)
  assert.match(api, /\/api\/v1\/bi\/store\/week\?from=/u)
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

test('销售榜双端：全渠道/线上/线下 tab + 数据源与周期标注', async () => {
  const desktop = await read('components/overview/BiInsightCharts.jsx')
  const mobile = await read('components/overview/BiSalesMobile.jsx')
  for (const src of [desktop, mobile]) {
    assert.match(src, /useBiBikesWeek\(\)/u)
    assert.match(src, /const models = bikeWeek\.models/u)
    // 三个 tab（CIS perfeco 渠道桶）
    assert.match(src, /key: 'all', label: '全渠道'/u)
    assert.match(src, /key: 'online', label: '线上'/u)
    assert.match(src, /key: 'offline', label: '线下'/u)
    // 数据源标注：CIS / BI 回退
    assert.match(src, /数据源 \$\{models\.source === 'CIS' \? 'CIS（perfeco/u)
    assert.match(src, /BI M218 SNAPSHOT FALLBACK|BI M218 FALLBACK/u)
    // 周期标注：W 编号 + 日期范围
    assert.match(src, /models\.weekLabel/u)
    assert.match(src, /models\.weekRange/u)
    // 二手车标记
    assert.match(src, /row\.buyback \? /u)
  }
  assert.match(desktop, /销售榜：全渠道 \/ 线上 \/ 线下（整车）/u)
  assert.match(mobile, /销售榜：全渠道 \/ 线上 \/ 线下/u)
})

test('useBiBikesWeek：CIS 周榜（渠道拆分）+ 回退 BI 快照仅全渠道', async () => {
  const hook = await read('hooks/useBiBikesWeek.js')
  assert.match(hook, /getBikeWeek\(\)/u)
  // CIS 周榜行直接带渠道拆分字段
  assert.match(hook, /onlineQty/u)
  assert.match(hook, /offlineTo/u)
  // 上游不可用回退 BI 快照（M218 仅全渠道口径，线上/线下显式不可拆）
  assert.match(hook, /BI_SNAPSHOT\.models\.allChannel\.rows/u)
  assert.match(hook, /线上\/线下(无法拆|不可拆)/u)
  // 数据源与周期字段
  assert.match(hook, /source: 'CIS'/u)
  assert.match(hook, /weekLabel: week\.weekLabel/u)
  // 渠道口径注释明示
  assert.match(hook, /线上=电商发货\+到店自提/u)
})

test('useBiBikesWeek：会话级缓存 + TTL，场景切换不再重复打 API', async () => {
  const hook = await read('hooks/useBiBikesWeek.js')
  // 会话级模块缓存存在：面板随场景切换反复挂载时数据只拉一次
  assert.match(hook, /let sessionCache = null/u)
  assert.match(hook, /SESSION_TTL_MS = 30 \* 60 \* 1000/u)
  assert.match(hook, /freshCache\(\)/u)
  // 挂载时缓存新鲜则不 fetch
  assert.match(hook, /if \(freshCache\(\)\) return undefined/u)
  // 周榜成功才写缓存（available !== true / 异常不缓存，下次挂载自动重试）
  assert.match(hook, /payload\.available === true/u)
  assert.match(hook, /sessionCache = \{ at: Date\.now\(\), week: payload \}/u)
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

test('BI×CIS 对比卡：双端组件 + CIS 侧 hook + 周期标注', async () => {
  const desktop = await read('components/overview/BiInsightCharts.jsx')
  const mobile = await read('components/overview/BiSalesMobile.jsx')
  const hook = await read('hooks/useBiStoreCompare.js')
  const css = await read('styles/desktop-workbench.css')
  const mcss = await read('styles/mobile-bi.css')
  // 双端组件：TO 与 DIS 两行、BI/CIS 双列、CIS 不可用降级
  for (const src of [desktop, mobile]) {
    assert.match(src, /useBiStoreCompare\(\)/u)
    assert.match(src, /门店 TO \/ DIS/u)
    assert.match(src, /DIS 销售/u)
    assert.match(src, /eco\.dis\.total/u)
    assert.match(src, /CIS 暂不可用/u)
    assert.match(src, /turnover\.total/u)
    assert.match(src, /dis\.amount/u)
  }
  // 周期标注：BI 快照周（W35 · 08-23→08-29）+ CIS 同期
  assert.match(desktop, /eco\.weekLabel/u)
  assert.match(desktop, /BI 快照固定周 · CIS 按同期查询/u)
  // CIS 侧查询窗口 = BI 快照周
  assert.match(hook, /BI_SNAPSHOT\.economic\.from/u)
  assert.match(hook, /BI_SNAPSHOT\.economic\.to/u)
  // 口径披露：两源 DIS 定义不同
  assert.match(desktop, /BI DIS = M216 全渠道减让；CIS DIS = SPD 折扣减让流水合计/u)
  // CSS 落地（桌面 + 移动独立）
  assert.match(css, /\.ops-bi-compare-card\s*\{[^}]*grid-column: span 2/u)
  assert.match(css, /\.ops-bi-compare-head, \.ops-bi-compare-row\s*\{[^}]*grid-template-columns/u)
  assert.match(mcss, /\.ops-bim-compare-head, \.ops-bim-compare-row\s*\{[^}]*grid-template-columns/u)
  assert.match(css, /\[data-cis-state='unavailable'\]/u)
})

test('旧单源卡删除干净：BiStatCard/BiDisField/BimStat/BimDis 零残留', async () => {
  const desktop = await read('components/overview/BiInsightCharts.jsx')
  const mobile = await read('components/overview/BiSalesMobile.jsx')
  assert.doesNotMatch(desktop, /export function BiStatCard/u)
  assert.doesNotMatch(desktop, /export function BiDisField/u)
  assert.doesNotMatch(desktop, /DIS_SEGMENTS/u)
  assert.doesNotMatch(mobile, /function BimStat\(/u)
  assert.doesNotMatch(mobile, /function BimDis\(/u)
})

test('Worker 路由：store/week 端点 + week 端点保持读权限', async () => {
  const routes = await readFile(new URL('../apps/worker/src/routes/bi.ts', import.meta.url), 'utf8')
  assert.match(routes, /app\.get\('\/api\/v1\/bi\/store\/week', \.\.\.read/u)
  assert.match(routes, /getStoreWeek/u)
  assert.match(routes, /currentWeekWindow/u)
  assert.match(routes, /门店周数据同步暂时不可用/u)
})

