import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const read = (rel) => readFile(new URL(rel, import.meta.url), 'utf8')

const [panel, mobile, overview, app, css, stylesIndex] = await Promise.all([
  read('../apps/web/src/components/overview/D1MetricsPanel.jsx'),
  read('../apps/web/src/components/overview/D1MetricsMobile.jsx'),
  read('../apps/web/src/components/overview/WorkshopOverviewPage.jsx'),
  read('../apps/web/src/App.jsx'),
  read('../apps/web/src/styles/d1-metrics.css'),
  read('../apps/web/src/styles/index.css')
])
const workerService = await read('../apps/worker/src/services/d1-metrics.ts')
const workerRoute = await read('../apps/worker/src/routes/d1-metrics.ts')
const workerIndex = await read('../apps/worker/src/index.ts')
const envTs = await read('../apps/worker/src/env.ts')
const previewWf = await readFile(new URL('../.github/workflows/deploy-cloudflare-preview.yml', import.meta.url), 'utf8')
const stagingWf = await readFile(new URL('../.github/workflows/deploy-cloudflare-staging.yml', import.meta.url), 'utf8')

test('worker：D1 监控端点路由挂载与鉴权（仅 admin）', () => {
  assert.match(workerIndex, /app\.route\('\/', d1MetricsRoutes\(\)\)/u)
  assert.match(workerRoute, /app\.get\('\/api\/v1\/d1\/metrics'/u)
  assert.match(workerRoute, /auth\.requireRole\('admin'\)/u)
  assert.match(workerRoute, /isD1MetricsConfigured\(c\.env\)/u)
  assert.match(workerRoute, /available: false/u)
})

test('worker：服务层零 D1 查询 + 60s 缓存 + 上游故障不泄细节', () => {
  assert.doesNotMatch(workerService, /env\.DB|c\.env\.DB|\.prepare\(/u)
  assert.match(workerService, /D1_METRICS_CACHE_TTL_MS = 60_000/u)
  assert.match(workerService, /D1MetricsUpstreamError/u)
  assert.match(workerService, /sum_rowsRead_DESC/u)
  assert.match(workerService, /AbortSignal\.timeout/u)
  assert.match(workerService, /token\.length === 0.*throw/u)
  assert.doesNotMatch(workerRoute, /token\}/u)
})

test('前端：总览页接线（admin gating + 双端择一 + 插入位置）', () => {
  assert.match(overview, /import \{ D1MetricsPanel \} from '\.\/D1MetricsPanel\.jsx'/u)
  assert.match(overview, /import D1MetricsMobile from '\.\/D1MetricsMobile\.jsx'/u)
  assert.match(overview, /useD1Metrics\(isAdmin\)/u)
  assert.match(overview, /viewport === 'desktop' \? <D1MetricsPanel[\s\S]*?D1MetricsMobile/u)
  assert.match(app, /isAdmin=\{role === 'admin'\}/u)
  const insert = overview.indexOf('isAdmin && d1Snapshot')
  assert.ok(insert > 0)
  assert.ok(insert > overview.indexOf('showAnalytics ? <OverviewAnalytics'))
  assert.ok(insert < overview.indexOf('<ReleaseStrip'))
  assert.ok(insert > overview.indexOf('<SalesVehiclesPanel'))
})

test('前端：桌面面板 JSX 结构（三卡 + 图型血缘注释）', () => {
  for (const name of ['D1UsageCard', 'D1HourlyCard', 'D1TopQueriesCard', 'D1MetricsPanel']) {
    assert.ok(panel.includes(`export function ${name}`), `missing export ${name}`)
  }
  assert.match(panel, /G18 Draw-in \+ Counter/u)
  assert.match(panel, /B2 Hairline Line/u)
  assert.match(panel, /C1 Tick Rows/u)
  assert.match(panel, /data-d1-counter/u)
  assert.match(panel, /data-d1-bar-fill/u)
  assert.match(panel, /data-d1-line/u)
  assert.match(panel, /const N = 24/u)
  // 旧表盘零残留（memory 23②：删旧不覆盖）
  assert.doesNotMatch(panel, /D1UsageGaugeCard|data-d1-tick\b|const GAUGE/u)
  // Top5 中文标签
  assert.match(panel, /审计事件流/u)
  assert.match(panel, /Shiphub 同步/u)
})

test('前端：移动端独立实现（memory 23：双端两套 DOM 两套 CSS）', () => {
  assert.match(mobile, /export default function D1MetricsMobile/u)
  assert.ok(mobile.includes('d1-mm-') && !mobile.includes('d1-md-'))
  assert.ok(!panel.includes('d1-mm-'))
  assert.match(mobile, /data-d1m-counter/u)
  assert.match(mobile, /data-d1m-bar-fill/u)
  assert.match(mobile, /审计事件流/u)
  assert.doesNotMatch(mobile, /D1MobileGauge|d1-mm-gauge-body/u)
})

test('CSS：落地断言——每个 JSX 类名都有样式', () => {
  const cssClasses = new Set([...css.matchAll(/\.([a-z0-9-]+)/gu)].map((m) => m[1]))
  const jsxClassNames = [...panel.matchAll(/className="([^"]+)"/gu), ...mobile.matchAll(/className="([^"]+)"/gu)]
    .flatMap((m) => m[1].split(/\s+/u))
    .filter((name) => /^d1-(?:md|mm)-[a-z0-9-]+$/u.test(name))
  const missing = [...new Set(jsxClassNames.filter((name) => !cssClasses.has(name)))]
  assert.deepEqual(missing, [], `以下类名无 CSS 落地：${missing.join(', ')}`)
})

test('CSS：布局约束断言（桌面列数唯一 + 桌面规则包媒体块）', () => {
  const gridDecls = [...css.matchAll(/\.d1-md-grid\s*\{[^}]*\}/gu)]
  assert.equal(gridDecls.length, 1, 'd1-md-grid 只允许一处声明')
  assert.match(gridDecls[0][0], /grid-template-columns: minmax\(0, 1\.05fr\) minmax\(0, 1\.35fr\)/u)
  const desktopBlock = css.indexOf('@media (min-width: 768px)')
  assert.ok(desktopBlock >= 0)
  const desktopEnd = css.indexOf('\n}\n', desktopBlock)
  for (const decl of ['.d1-md-panel', '.d1-md-card', '.d1-md-usage-bar']) {
    const pos = css.indexOf(decl + ' {')
    assert.ok(pos > desktopBlock && pos < desktopEnd, `${decl} 必须在桌面媒体块内`)
  }
  const mobileBlockStart = css.indexOf('.d1-mm-panel')
  const mobileBlock = css.slice(mobileBlockStart)
  assert.doesNotMatch(mobileBlock, /d1-md-/u)
  assert.match(stylesIndex, /@import '\.\/d1-metrics\.css';/u)
})

test('workflow：preview 与 staging 均有可选 token 注入步骤', () => {
  for (const wf of [previewWf, stagingWf]) {
    assert.match(wf, /Inject D1 metrics read token/u)
    assert.match(wf, /wrangler secret put D1_METRICS_TOKEN/u)
    assert.match(wf, /if \[ -n "\$D1_METRICS_TOKEN" \]/u)
  }
  assert.match(envTs, /D1_METRICS_TOKEN\?: string/u)
})
