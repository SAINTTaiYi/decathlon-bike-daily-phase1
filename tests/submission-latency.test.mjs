import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const hookPath = new URL('../apps/web/src/hooks/useRemoteClosingWorkflow.js', import.meta.url)
const wranglerPath = new URL('../wrangler.jsonc', import.meta.url)

test('保存销售数据不再阻塞等待整个 bootstrap 往返', async () => {
  const source = await readFile(hookPath, 'utf8')

  // saveSales/clearSales return the authoritative `day`, so awaiting a full bootstrap on top
  // of it made this the slowest interaction in the app for no additional information.
  assert.match(source, /const saveKpi = useCallback\([^\n]*sync: 'background'/u, 'saveKpi 必须使用后台同步')
  assert.match(source, /const clearKpi = useCallback\([^\n]*sync: 'background'/u, 'clearKpi 必须使用后台同步')
  assert.match(source, /resetDay: \(\) => run\([^\n]*sync: 'background'/u, 'resetDay 必须使用后台同步')

  // Closing and reopening change record lifecycle (auto-cleanup of completed items), which the
  // response body does not describe, so they must keep the authoritative full refresh.
  assert.match(source, /completeClosing: \(\) => run\(closeDay, \{ sync: 'full' \}\)/u, '闭店必须保持完整刷新')
  assert.match(source, /reopenClosing: \(\) => run\(reopenDay, \{ sync: 'full' \}\)/u, '重开必须保持完整刷新')
})

test('并发的 bootstrap 刷新合并为同一次在途请求', async () => {
  const source = await readFile(hookPath, 'utf8')

  // The post-submit background refresh, the 45s poll and window focus could previously stack up
  // on the heaviest endpoint in the app and queue behind each other on D1.
  assert.match(source, /const inFlightRef = useRef\(null\)/u, '必须持有在途刷新引用')
  assert.match(source, /if \(!signal && inFlightRef\.current\) return inFlightRef\.current/u, '无信号的刷新必须复用在途请求')
  assert.match(source, /if \(!signal\) inFlightRef\.current = null/u, '在途引用必须在结束时释放')

  // Callers that pass their own AbortSignal (mount/unmount) must stay independent so an aborted
  // mount cannot cancel an unrelated caller's refresh.
  assert.match(source, /if \(!signal\) inFlightRef\.current = task/u, '仅无信号的刷新参与合并')
})

test('轮询降频与聚焦去抖：bootstrap 调用次数受 D1 限额预算控制', async () => {
  const source = await readFile(hookPath, 'utf8')

  // 2026-09-03 限额预算：45 秒轮询是单店单日上千次 bootstrap 的主要来源（开着页面即
  // 80 次/小时）。跨用户新鲜度由 5 分钟轮询 + 聚焦刷新 + 提交后刷新共同保障。
  assert.match(source, /window\.setInterval\(\(\) => \{ if \(!document\.hidden && navigator\.onLine\) void refresh\(\) \}, 300_000\)/u, '轮询必须降到 5 分钟')
  assert.doesNotMatch(source, /45_000/u, '45 秒轮询必须删除')
  assert.match(source, /const lastSyncRef = useRef\(0\)/u, '必须持有最近同步时间戳')
  assert.match(source, /Date\.now\(\) - lastSyncRef\.current > 60_000/u, '聚焦刷新必须 60 秒去抖')
  assert.match(source, /lastSyncRef\.current = Date\.now\(\)/u, '成功同步后必须记录时间戳')
})

test('bootstrap 仍然返回趋势，提交后不得读到陈旧的七天数据', async () => {
  const route = await readFile(new URL('../apps/worker/src/routes/bootstrap.ts', import.meta.url), 'utf8')

  // Deliberately NOT optimized away: trends read today's sales_vehicles/sales_saved_at and
  // today's repair add-record audit rows, so saving sales or adding a repair changes them
  // immediately. Skipping trends on a post-mutation refresh would show stale figures.
  assert.match(route, /buildBusinessTrends\(c\.env\.DB, context\.storeId, businessDate\)/u, '趋势必须仍在 bootstrap 中计算')
  assert.doesNotMatch(route, /trends.*skip|skipTrends/u, 'bootstrap 不得提供跳过趋势的开关')
})

test('Worker 启用 Smart Placement 以贴近 D1 主实例执行', async () => {
  const source = await readFile(wranglerPath, 'utf8')
  const config = JSON.parse(source.replace(/^\s*\/\/.*$/gmu, ''))

  // Each interactive write makes several sequential D1 calls. Without placement every one of
  // them pays the full user-to-primary round trip.
  assert.deepEqual(config.placement, { mode: 'smart' }, 'Smart Placement 必须启用')
  // Placement must not disturb the D1 binding or the edge-served asset binding.
  assert.equal(config.d1_databases?.[0]?.binding, 'DB')
  assert.equal(config.assets?.binding, 'ASSETS')
})
