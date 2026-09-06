import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (p) => readFile(new URL(`../apps/web/src/${p}`, import.meta.url), 'utf8')
const readWorker = (p) => readFile(new URL(`../apps/worker/src/${p}`, import.meta.url), 'utf8')

// ── Worker：周结定时拉取 ──
test('cron 挂载：BI 周结与 Shiphub 并行，scheduledTime 传递', async () => {
  const index = await readWorker('index.ts')
  assert.match(index, /Promise\.allSettled\(\[runScheduledShipHubSync\(env\), runScheduledBiSync\(env, fireTime\)\]\)/u)
  assert.match(index, /new Date\(controller\.scheduledTime\)/u)
  assert.match(index, /import \{ runScheduledBiSync \} from '\.\/services\/bi-weekly\.js'/u)
})

test('bi-weekly：窗口 09–23 北京时间、完结周口径、基线 W36、非数字门店码跳过', async () => {
  const svc = await readWorker('services/bi-weekly.ts')
  assert.match(svc, /BI_SYNC_TIMEZONE = 'Asia\/Shanghai'/u)
  assert.match(svc, /BI_SYNC_START_HOUR = 9/u)
  assert.match(svc, /BI_SYNC_END_HOUR = 23/u)
  assert.match(svc, /activeInStoreTimezone/u)
  assert.match(svc, /BI_WEEKLY_BASELINE_FROM = '2026-08-30'/u)
  assert.match(svc, /test\(store\.code\)/u, '非数字门店码必须跳过')
  assert.match(svc, /ensureStoreWeeks/u)
  // 完结周 = 本周 from - 7 天
  assert.match(svc, /7 \* 86400_000/u)
})

test('getStoreWeeks 路由 + schema 0025 落地', async () => {
  const route = await readWorker('routes/bi.ts')
  assert.match(route, /app\.get\('\/api\/v1\/bi\/store\/weeks'/u)
  assert.match(route, /listBiStoreWeeks/u)
  const schema = await readWorker('schema-version.ts')
  assert.match(schema, /'0025_bi_weekly_service_snapshots'/u)
  const migration = await readFile(new URL('../migrations/d1/0025_bi_weekly_service_snapshots.sql', import.meta.url), 'utf8')
  assert.match(migration, /CREATE TABLE bi_store_week/u)
  assert.match(migration, /CREATE TABLE bi_service_day/u)
  const adapter = await readFile(new URL('../apps/worker/security/d1-test-adapter.ts', import.meta.url), 'utf8')
  assert.match(adapter, /0025_bi_weekly_service_snapshots\.sql/u)
})

// ── Worker：安全检查 8538631 ──
test('getServicesDay：8538631 服务 SKU + bi_service_day 缓存', async () => {
  const svc = await readWorker('services/bi-bikes.ts')
  assert.match(svc, /SAFETY_CHECK_MODEL = '8538631'/u)
  assert.match(svc, /getServicesDay/u)
  assert.match(svc, /models: \[SAFETY_CHECK_MODEL\]/u)
  assert.match(svc, /FROM bi_service_day/u)
  assert.match(svc, /aggLevel: 'ARTICLES'/u)
})

test('bikes/day 组合返回：storeDay + safety 附加字段', async () => {
  const route = await readWorker('routes/bi.ts')
  assert.match(route, /storeDay: storeDay \?\? null/u)
  assert.match(route, /safety: safety \?\? null/u)
  assert.match(route, /Promise\.all\(\[/u)
})

// ── 前端：自动填写 ──
test('KpiDialog：安全检查自动填入（checks>0 + 型号单号补齐）+ 同步行扩展', async () => {
  const dialog = await read('components/dialogs/KpiDialog.jsx')
  assert.match(dialog, /bikeDay\.safety && bikeDay\.safety\.checks > 0 && placeholder\(next\.safetyChecks\)/u)
  assert.match(dialog, /next\.safetyModel = bikeDay\.safety\.model \|\| '8538631'/u)
  // 手动「填入实销」按钮同样带上安全检查
  assert.match(dialog, /if \(bikeDay\.safety && bikeDay\.safety\.checks > 0\) \{/u)
  assert.match(dialog, /安全检查 \$\{bikeDay\.safety\.checks\} 单/u)
  assert.match(dialog, /门店 ¥\$\{Math\.round\(bikeDay\.storeDay\.turnover\)/u)
})

test('useBikeDaySync：safety + storeDay 全状态透传', async () => {
  const hook = await read('hooks/useBikeDaySync.js')
  for (const state of ["status: 'idle'", "status: 'syncing'", "status: 'unavailable'", "status: 'error'"]) {
    const idx = hook.indexOf(state)
    const chunk = hook.slice(idx, idx + 240)
    assert.match(chunk, /safety: null/u, `${state} 必须重置 safety`)
    assert.match(chunk, /storeDay: null/u, `${state} 必须重置 storeDay`)
  }
  assert.match(hook, /safety: payload\.safety \?\? null/u)
  assert.match(hook, /storeDay: payload\.storeDay \?\? null/u)
})

// ── 前端：周结趋势卡 ──
test('useBiStoreWeeks：会话缓存 + weeks 数组守卫', async () => {
  const hook = await read('hooks/useBiStoreWeeks.js')
  assert.match(hook, /getBiStoreWeeks/u)
  assert.match(hook, /Array\.isArray\(payload\.weeks\)/u)
  assert.match(hook, /let sessionCache = null/u)
})

test('桌面 BiStoreWeekTrend：单周也渲染（首周出值，次周起环比），JWT 共享一次登录', async () => {
  const charts = await read('components/overview/BiInsightCharts.jsx')
  assert.match(charts, /weeks\.length >= 1/u, '单周必须出图（只有 W36 一行时不得永远 pending）')
  assert.match(charts, /首周（次周起展示环比）/u)
  assert.match(charts, /geom\.points\.length >= 2 \? <path data-biw-contour/u, '单点不得画折线')
  assert.match(charts, /拉取于 \$\{new Intl\.DateTimeFormat/u, '桌面卡必须展示拉取时间')
  const mobile = await read('components/overview/BiSalesMobile.jsx')
  assert.match(mobile, /拉取于 \$\{new Intl\.DateTimeFormat/u, '移动卡必须展示拉取时间')
  const route = await readWorker('routes/bi.ts')
  assert.match(route, /const jwtProvider = lazyLoginJwt\(c\.env\)/u, 'bikes/day 必须共享 JWT provider')
  assert.match(route, /businessDate, jwtProvider \}\)/u, '附加链路必须接收共享 provider')
  const svc = await readWorker('services/bi-bikes.ts')
  assert.match(svc, /options\.jwtProvider \?\? lazyLoginJwt\(env\)/u)
})

test('桌面 BiStoreWeekTrend：类名 JSX 与 CSS 双落地', async () => {
  const charts = await read('components/overview/BiInsightCharts.jsx')
  for (const cls of ['BiStoreWeekTrend', 'ops-bi-weeks-empty', 'data-biw-hair', 'data-biw-contour', 'data-biw-latest']) {
    assert.match(charts, new RegExp(cls.replaceAll('-', '\\-')), `${cls} 必须存在于桌面 BI 组件`)
  }
  assert.match(charts, /<BiStoreWeekTrend \/>/u)
  const css = await read('styles/desktop-workbench.css')
  assert.match(css, /\.ops-bi-weeks-empty \{/u)
})

test('移动 BimStoreWeekTrend：类名 JSX 与 CSS 双落地（memory 23 双端拆分）', async () => {
  const mobile = await read('components/overview/BiSalesMobile.jsx')
  for (const cls of ['BimStoreWeekTrend', 'ops-bim-weeks-rows', 'ops-bim-weeks-row', 'data-biw-row']) {
    assert.match(mobile, new RegExp(cls.replaceAll('-', '\\-')), `${cls} 必须存在于移动 BI 组件`)
  }
  assert.match(mobile, /<BimStoreWeekTrend \/>/u)
  const css = await read('styles/mobile-bi.css')
  assert.match(css, /\.ops-bim-weeks-rows \{/u)
  assert.match(css, /\.ops-bim-weeks-row \{/u)
})
