import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const appPath = new URL('../apps/web/src/App.jsx', import.meta.url)
const realtimePath = new URL('../apps/web/src/hooks/useStoreRealtime.js', import.meta.url)
const workflowHookPath = new URL('../apps/web/src/hooks/useRemoteClosingWorkflow.js', import.meta.url)
const apiPath = new URL('../apps/web/src/api/workflow.js', import.meta.url)
const bootstrapRoutePath = new URL('../apps/worker/src/routes/bootstrap.ts', import.meta.url)

// 启动延迟优化（2026-09-18）。门店体感「载入很慢」由两件事叠加：
//   ① 首屏 /auth/me → /bootstrap 严格串行，白等一个完整往返；
//   ② 长轮询从 since=0 起步，第一次 /changes 必然收到「变了」→ 原地再拉一轮
//      bootstrap + ensure-fresh（全站最重的两个请求白做一遍）。
// 这些契约锁住两处修复，防止静默回退。

test('长轮询从 bootstrap 下发的版本号起步，且等首个 bootstrap 完成后再订阅', async () => {
  const app = await readFile(appPath, 'utf8')
  assert.match(app, /initialVersion: workflow\.changeVersion/u, '必须把 bootstrap 版本号交给长轮询（否则 since=0 必然触发重复刷新）')
  assert.match(
    app,
    /enabled: authenticated && !introLocked && opsDataNeeded && workflow\.hydrated/u,
    '长轮询必须等首个 bootstrap 完成（hydrated）后再订阅'
  )

  const hook = await readFile(workflowHookPath, 'utf8')
  assert.match(hook, /const \[changeVersion, setChangeVersion\] = useState\(0\)/u, 'workflow hook 必须持有 changeVersion 状态')
  assert.match(hook, /setChangeVersion\(Math\.max\(0, Math\.floor\(Number\(payload\.changeVersion\)\)\)\)/u, 'changeVersion 必须取自 bootstrap 响应')
  assert.match(hook, /^ {4}changeVersion,$/mu, 'changeVersion 必须通过 hook 返回值暴露给 App')

  const route = await readFile(bootstrapRoutePath, 'utf8')
  assert.match(route, /readStoreVersion\(c\.env\.DB, context\.storeId\)/u, 'bootstrap 路由必须读取门店版本号')
  assert.match(route, /^ {6}changeVersion,$/mu, 'bootstrap 响应必须携带 changeVersion')
})

test('useStoreRealtime 以 initialVersion 为起点，不再从 0 起步', async () => {
  const hook = await readFile(realtimePath, 'utf8')
  assert.match(hook, /initialVersion = 0/u, '必须接受 initialVersion 参数')
  assert.match(hook, /initialVersionRef\.current/u, '版本号种子必须只在启动时读取一次')
  assert.doesNotMatch(hook, /let version = 0\n/u, '版本号不得再从 0 起步')
})

test('冷启动并行预取：会话恢复期间发出 bootstrap，可被消费一次且有过期保护', async () => {
  const api = await readFile(apiPath, 'utf8')
  assert.match(api, /export function prefetchBootstrap\(/u, '必须提供预取入口')
  assert.match(api, /export function takePrefetchedBootstrap\(/u, '必须提供单次消费入口')
  assert.match(api, /BOOTSTRAP_PREFETCH_TTL_MS/u, '预取必须有 TTL，避免陈旧数据开机')

  const app = await readFile(appPath, 'utf8')
  assert.match(app, /import \{ prefetchBootstrap \} from '\.\/api\/workflow\.js'/u, 'App 必须接线预取')
  assert.match(
    app,
    /if \(auth\.status !== 'restoring' \|\| !opsDataNeeded \|\| introLocked\) return/u,
    '预取只在会话恢复中、且将要加载 Ops 时发出'
  )

  const hook = await readFile(workflowHookPath, 'utf8')
  assert.match(hook, /takePrefetchedBootstrap\(\)/u, 'refresh 必须先消费预取')
})
