import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

// ── Shiphub 实时化节奏（2026-09-09）──────────────────────────────────
// 用户目标：打开 ops 后不做任何操作，有新自提后几秒内自动出现。
// 链路 = 上游同步节奏 × 服务端新鲜度门禁 × 前端长轮询，三者缺一不可：
//   ① cron 每分钟一次（否则同步最快也要等 5 分钟）
//   ② 页面打开/回前台 + 长轮询唤醒 → ensure-fresh（服务端按 60 秒门禁决定是否打上游）
//   ③ 长轮询唤醒必须重拉**订单列表**，不能只刷 summary
//      （只刷 summary 会出现「计数 3 单、列表 2 单」的割裂，本轮实测发现）

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('cron 每分钟触发一次（staging / preview / wrangler 三处一致）', async () => {
  const [wrangler, staging, preview] = await Promise.all([
    read('../wrangler.jsonc'),
    read('../.github/workflows/deploy-cloudflare-staging.yml'),
    read('../.github/workflows/deploy-cloudflare-preview.yml')
  ])
  for (const [label, source] of [['wrangler.jsonc', wrangler], ['staging workflow', staging], ['preview workflow', preview]]) {
    assert.match(source, /"crons": \["\* \* \* \* \*"\]/u, `${label} 必须每分钟触发一次（实时化前提）`)
    assert.doesNotMatch(source, /"crons": \["\*\/5 \* \* \* \*"\]/u, `${label} 不得残留旧的 5 分钟频率`)
  }
})

test('前端 API 暴露 ensure-fresh 端点', async () => {
  const source = await read('../apps/web/src/api/shiphub.js')
  assert.match(source, /export const ensureShipHubFresh/u, '必须导出 ensureShipHubFresh')
  assert.match(source, /\/api\/v1\/shiphub\/ensure-fresh/u, '必须调用 /api/v1/shiphub/ensure-fresh')
})

test('useShipHub 在挂载与回到前台时调用 ensureFresh', async () => {
  const source = await read('../apps/web/src/hooks/useShipHub.js')
  assert.match(source, /const ensureFresh = useCallback/u, '必须定义 ensureFresh')
  assert.match(source, /void ensureFreshRef\.current\(\)/u, '挂载时必须调用 ensureFresh')
  assert.match(source, /document\.addEventListener\('visibilitychange', onVisible\)/u, '回到前台必须重新检查新鲜度（真实监听，不是注释）')
  assert.match(source, /document\.removeEventListener\('visibilitychange', onVisible\)/u, '卸载时必须移除监听（防泄漏）')
  assert.match(source, /ensureFresh,\n\s+refresh: refreshSummary/u, '必须导出 ensureFresh 供 App 接线')
})

test('长轮询唤醒必须重拉订单列表，不能只刷 summary', async () => {
  const [app, hook] = await Promise.all([
    read('../apps/web/src/App.jsx'),
    read('../apps/web/src/hooks/useShipHub.js')
  ])
  // App.jsx：实时回调必须走 ensureFresh（它内部会 loadOrders），而不是只 refresh summary。
  assert.match(app, /void shiphub\.ensureFresh\(\)/u, '长轮询唤醒必须调用 ensureFresh')
  assert.doesNotMatch(app, /void shiphub\.refresh\(\)/u, '不得只刷新 summary（会导致计数与列表割裂）')
  // hook：ensureFresh 必须真的重拉订单列表，且按计数变化挑选分类。
  assert.match(hook, /const targets = prev/u, '必须按 summary 计数变化挑选要重拉的分类')
  assert.match(hook, /loadOrders\(category\)\)\)/u, 'ensureFresh 必须调用 loadOrders 重拉列表')
  assert.match(hook, /summaryRef\.current = next/u, 'summary 镜像必须在 setSummary 同一步更新（effect 有一帧延迟）')
})

test('服务端 ensure-fresh 路由：write 权限 + 只在真同步时 bump 版本号', async () => {
  const source = await read('../apps/worker/src/routes/shiphub.ts')
  assert.match(source, /app\.post\('\/api\/v1\/shiphub\/ensure-fresh', requireJsonBody, \.\.\.write/u, 'ensure-fresh 必须要求登录态（write 中间件）')
  assert.match(source, /if \(result\.synced\.length > 0\) await bumpStoreVersion/u, '只有确实同步到新数据才 bump（否则每次开页面都白唤醒所有在线页面）')
  assert.match(source, /ensureFreshStoreCategories\(c\.env, context\.storeId, \['hand', 'pick'\]\)/u, '默认只检查 hand/pick')
})

test('BI cron 的 bump 必须精确到「本轮确实写库」，不能无条件 bump', async () => {
  const source = await read('../apps/worker/src/services/bi-weekly.ts')
  assert.match(source, /const stampBefore = await biWriteStamp/u, '必须记录写库前水位')
  assert.match(source, /if \(stampAfter !== stampBefore\) await bumpStoreVersion/u, '必须仅在水位变化时 bump')
  assert.match(source, /async function biWriteStamp/u, '必须有 biWriteStamp 实现')
  // 旧的「无条件 bump」写法必须彻底消失（否则每分钟白唤醒前端一次）。
  assert.doesNotMatch(source, /\n\s+await bumpStoreVersion\(env\.DB, store\.id\)\n/u, '不得残留无条件 bump')
})
