import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { bumpStoreVersion, bumpStoreVersionMany, readStoreVersion } from '../src/services/store-changes.js'
import { migratedTestDatabase } from '../security/d1-test-adapter.js'

// 门店变更版本号回归（2026-09-09 实时推送第一批）。
// 前端长轮询靠这个版本号判断「数据变了没」，所以：
// ① 版本号必须单调递增，且能跨 store 隔离；
// ② bump 失败绝不能抛错阻断业务写入（否则一次 D1 抖动会让用户操作失败）；
// ③ 所有写路由都必须调用 bump（漏一处 = 该模块永远不推送）。

const STORE_A = '30000000-0000-4000-8000-000000001299'
const STORE_B = '30000000-0000-4000-8000-000000001670'

async function seed(db: Awaited<ReturnType<typeof migratedTestDatabase>>) {
  // migratedTestDatabase 已包含 stores 种子（1299/1670）
  await db.prepare('DELETE FROM store_change_log').run()
}

test('版本号初始为 0，bump 后单调递增', async () => {
  const db = await migratedTestDatabase()
  await seed(db)
  assert.equal(await readStoreVersion(db, STORE_A), 0)
  await bumpStoreVersion(db, STORE_A)
  assert.equal(await readStoreVersion(db, STORE_A), 1)
  await bumpStoreVersion(db, STORE_A)
  await bumpStoreVersion(db, STORE_A)
  assert.equal(await readStoreVersion(db, STORE_A), 3)
})

test('版本号按门店隔离，互不影响', async () => {
  const db = await migratedTestDatabase()
  await seed(db)
  await bumpStoreVersion(db, STORE_A)
  await bumpStoreVersion(db, STORE_A)
  await bumpStoreVersion(db, STORE_B)
  assert.equal(await readStoreVersion(db, STORE_A), 2)
  assert.equal(await readStoreVersion(db, STORE_B), 1)
})

test('批量 bump 去重，同一门店只加一次', async () => {
  const db = await migratedTestDatabase()
  await seed(db)
  await bumpStoreVersionMany(db, [STORE_A, STORE_A, STORE_B, STORE_A])
  assert.equal(await readStoreVersion(db, STORE_A), 1, '去重后同一门店只 +1')
  assert.equal(await readStoreVersion(db, STORE_B), 1)
})

test('bump 失败不抛错（业务写入不能被版本号阻断）', async () => {
  const broken = {
    prepare() { return { bind: () => ({ run: async () => { throw new Error('D1_UNAVAILABLE') } }) } }
  } as unknown as D1Database
  await assert.doesNotReject(() => bumpStoreVersion(broken, STORE_A), 'bump 必须吞掉错误')
})

test('迁移 0029 建立 store_change_log 且主键为 store_id', async () => {
  const sql = await readFile(new URL('../../../migrations/d1/0029_store_change_log.sql', import.meta.url), 'utf8')
  assert.match(sql, /CREATE TABLE store_change_log/u)
  assert.match(sql, /store_id TEXT PRIMARY KEY/u)
  assert.match(sql, /version INTEGER NOT NULL DEFAULT 0/u)
})

test('所有写路由都接入了 bumpStoreVersion（漏一处则该模块永不推送）', async () => {
  const routes = ['work-items', 'closing', 'shiphub']
  for (const name of routes) {
    const src = await readFile(new URL(`../src/routes/${name}.ts`, import.meta.url), 'utf8')
    assert.match(src, /import \{ bumpStoreVersion \}/u, `${name} 必须导入 bumpStoreVersion`)
    assert.match(src, /await bumpStoreVersion\(c\.env\.DB/u, `${name} 必须在写操作后调用`)
  }
  // 后台同步也要推：Shiphub cron 与 BI cron
  const sync = await readFile(new URL('../src/services/shiphub-sync.ts', import.meta.url), 'utf8')
  assert.match(sync, /bumpStoreVersion\(db, storeId\)/u, 'Shiphub 后台同步必须 bump')
  const weekly = await readFile(new URL('../src/services/bi-weekly.ts', import.meta.url), 'utf8')
  assert.match(weekly, /bumpStoreVersion\(env\.DB, store\.id\)/u, 'BI 定时拉取必须 bump')
})

test('长轮询端点：挂起参数与鉴权齐全', async () => {
  const src = await readFile(new URL('../src/routes/changes.ts', import.meta.url), 'utf8')
  assert.match(src, /app\.get\('\/api\/v1\/changes'/u)
  assert.match(src, /auth\.loadSession/u, '必须要求登录')
  assert.match(src, /auth\.requirePasswordChanged/u)
  assert.match(src, /since/u, '必须接受 since 参数')
  assert.match(src, /HOLD_MS/u, '必须有挂起时长上限')
  // 挂起等待不得用忙等（CPU 时间在免费层只有 10ms）
  assert.match(src, /setTimeout/u, '必须用 setTimeout 等待而非忙等')
  assert.doesNotMatch(src, /while \(true\)/u, '禁止无限循环')
})

test('前端 hook：暂停/恢复/退避/版本号单调', async () => {
  const src = await readFile(new URL('../../../apps/web/src/hooks/useStoreRealtime.js', import.meta.url), 'utf8')
  assert.match(src, /document\.hidden/u, '页面隐藏时暂停')
  assert.match(src, /visibilitychange/u, '回前台恢复')
  assert.match(src, /RETRY_MAX_MS/u, '有退避上限')
  assert.match(src, /Math\.max\(version, next\)/u, '版本号只前进不回退')
  assert.match(src, /onChangeRef/u, '回调用 ref 持有，避免重连风暴')
})

test('App 接线：工作流与 Shiphub 都接入实时刷新', async () => {
  const src = await readFile(new URL('../../../apps/web/src/App.jsx', import.meta.url), 'utf8')
  assert.match(src, /import useStoreRealtime/u)
  assert.match(src, /useStoreRealtime\(/u)
  assert.match(src, /void workflow\.refresh\(\)/u, '实时变更必须刷新工作流')
  assert.match(src, /void shiphub\.refresh\(\)/u, '实时变更必须刷新 Shiphub')
  assert.match(src, /enabled: authenticated && !introLocked/u, '未登录/锁定态不轮询')
})
