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

test('门店边界：仅本店凭据（白名单机制废除，2026-09-08 铁律）', async () => {
  const svc = await readWorker('services/bi-weekly.ts')
  const env = await readWorker('env.ts')
  const route = await readWorker('routes/bi.ts')
  // cron 只认本店凭据连接行：fail-closed，部署级共享凭据绝不再用
  assert.match(svc, /JOIN shiphub_connections c ON c\.store_id = s\.id/u, 'cron 必须内连接凭据行')
  assert.match(svc, /c\.enabled = 1 AND c\.login_username_enc IS NOT NULL AND c\.login_password_enc IS NOT NULL/u, 'cron 只同步持有本店凭据的门店')
  assert.match(svc, /lazyStoreCubeJwt\(env, store\.id\)/u, 'cron 必须用本店 Cube 身份')
  assert.doesNotMatch(svc, /syncStoreCodes|whitelist/u, 'cron 不得读白名单（部署级共享凭据语义已废除）')
  // 白名单机制全链移除：env / 路由
  assert.doesNotMatch(env, /BI_SYNC_STORE_CODES|syncStoreCodes/u, '白名单 env 必须移除')
  assert.doesNotMatch(route, /syncStoreCodes|storeAllowed/u, '路由不得有白名单门禁')
  assert.doesNotMatch(route, /lazyLoginJwt/u, '门店数据端点不得使用部署级共享凭据 provider')
  let gates = 0
  for (const ep of ['bikes/day', 'services/day', 'store/weeks', 'store/week', 'bikes/week']) {
    const idx = route.indexOf(`/api/v1/bi/${ep}`)
    assert.ok(idx > 0, `${ep} 路由存在`)
    const chunk = route.slice(idx, idx + 600)
    assert.match(chunk, /resolveStoreJwtProvider\(c\.env, context\.storeId\)/u, `${ep} 必须走门店身份解析门禁`)
    assert.match(chunk, /if \(!(jwtProvider|gate)\) return c\.json\(\{ available: false \}\)/u, `${ep} 身份缺失必须 available:false`)
    gates += 1
  }
  assert.equal(gates, 5)
  // 身份解析语义：只有本店 Cube 身份一条路（fail-closed）
  assert.match(route, /if \(!info\.hasCredentials\) return null/u, '无本店凭据必须 fail-closed')
  assert.match(route, /return lazyStoreCubeJwt\(env, storeId\)/u, '有本店凭据走 per-store 派生')
  // 门店数据函数凭据必传（结构性边界，杜绝静默回退共享凭据）
  const bikes = await readWorker('services/bi-bikes.ts')
  assert.doesNotMatch(bikes, /options\.jwtProvider \?\? lazyLoginJwt\(env\)/u, '门店数据函数不得回退部署级共享凭据')
  assert.match(bikes, /jwtProvider: JwtProvider \}/u, '门店数据函数 jwtProvider 必传')
  // 部署模板不得再注入白名单
  for (const wf of ['../.github/workflows/deploy-cloudflare-staging.yml', '../.github/workflows/deploy-cloudflare-preview.yml']) {
    const tpl = await readFile(new URL(wf, import.meta.url), 'utf8')
    assert.doesNotMatch(tpl, /BI_SYNC_STORE_CODES/u, `${wf} 不得注入白名单`)
  }
  // 全局商品分类端点不受门店门禁（品名数据非门店经营数据）
  for (const ep of ['vehicles', 'vehicle-models']) {
    const idx = route.indexOf(`/api/v1/bi/${ep}`)
    const chunk = route.slice(idx, idx + 600)
    assert.doesNotMatch(chunk, /resolveStoreJwtProvider/u, `${ep} 不得误加门店门禁`)
  }
})

test('getStoreWeeks 路由 + schema 0025 落地', async () => {
  const route = await readWorker('routes/bi.ts')
  assert.match(route, /app\.get\('\/api\/v1\/bi\/store\/weeks'/u)
  assert.match(route, /listBiStoreWeeks/u)
  const schema = await readWorker('schema-version.ts')
  assert.match(schema, /'0027_shiphub_cube_identity'/u)
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
  assert.match(route, /const jwtProvider = await resolveStoreJwtProvider\(c\.env, context\.storeId\)/u, 'bikes/day 必须解析门店身份 provider')
  assert.match(route, /businessDate, jwtProvider \}\)/u, '附加链路必须接收共享 provider')
  const svc = await readWorker('services/bi-bikes.ts')
  // jwtProvider 已改为必传（门店边界铁律）：门店数据函数不得回退部署级共享凭据
  assert.doesNotMatch(svc, /options\.jwtProvider \?\? lazyLoginJwt\(env\)/u, '不得回退部署级共享凭据')
  assert.match(svc, /jwtProvider: JwtProvider \}/u, 'jwtProvider 必传')
})

test('桌面 BiStoreWeekTrend：类名 JSX 与 CSS 双落地', async () => {
  const charts = await read('components/overview/BiInsightCharts.jsx')
  for (const cls of ['BiStoreWeekTrend', 'ops-bi-weeks-empty', 'data-biw-hair', 'data-biw-contour', 'data-biw-latest']) {
    assert.match(charts, new RegExp(cls.replaceAll('-', '\\-')), `${cls} 必须存在于桌面 BI 组件`)
  }
  assert.match(charts, /<BiStoreWeekTrend storeCode=\{storeCode\} \/>/u)
  const css = await read('styles/desktop-workbench.css')
  assert.match(css, /\.ops-bi-weeks-empty \{/u)
})

test('移动 BimStoreWeekTrend：类名 JSX 与 CSS 双落地（memory 23 双端拆分）', async () => {
  const mobile = await read('components/overview/BiSalesMobile.jsx')
  for (const cls of ['BimStoreWeekTrend', 'ops-bim-weeks-rows', 'ops-bim-weeks-row', 'data-biw-row']) {
    assert.match(mobile, new RegExp(cls.replaceAll('-', '\\-')), `${cls} 必须存在于移动 BI 组件`)
  }
  assert.match(mobile, /<BimStoreWeekTrend storeCode=\{storeCode\} \/>/u)
  const css = await read('styles/mobile-bi.css')
  assert.match(css, /\.ops-bim-weeks-rows \{/u)
  assert.match(css, /\.ops-bim-weeks-row \{/u)
})

// ── Web：BiStoreWeekTrend 单周不崩（2026-09-07 线上事故回归）──
// 事故：首个已完结周落库后（仅 W36 一条），桌面端 BiStoreWeekTrend 的 useMemo 里
// points[points.length - 2] 取到 undefined，prev.value 抛 TypeError，
// 整个总览崩进 AppErrorBoundary（"日报界面暂时无法显示"）。
test('BiStoreWeekTrend：单周数据 prev 必须为 null，禁止无守卫的 points[-2] 访问', async () => {
  const src = await read('components/overview/BiInsightCharts.jsx')
  assert.match(src, /const prev = points\.length >= 2 \? points\[points\.length - 2\] : null/u,
    '单周时 points[points.length-2] 是 undefined，无守卫访问会崩进 AppErrorBoundary')
  assert.doesNotMatch(src, /const prev = points\[points\.length - 2\]\r?\n/u, '不允许回退到无守卫写法')
  assert.match(src, /const wow = prev && prev\.value \? /u, 'wow 计算必须同时守卫 prev 存在')
  assert.match(src, /geom\.points\.length >= 2 \? `，环比/u, '无障碍 label 单周不得无条件读 wow')
})
