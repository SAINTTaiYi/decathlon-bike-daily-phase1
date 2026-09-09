import assert from 'node:assert/strict'
import test from 'node:test'
import type { AppConfig, WorkerEnv } from '../src/env.js'
import { FixtureShipHubClient, type ShipHubOrder } from '../src/lib/shiphub-client.js'
import { ENSURE_FRESH_MS, ensureFreshStoreCategories, syncStoreCategory } from '../src/services/shiphub-sync.js'
import { migratedTestDatabase, type TestD1Database } from '../security/d1-test-adapter.js'

// ── 页面打开时的「确保新鲜」与实时化间隔（2026-09-09）──────────────────
// 目标：打开 ops 后不需要任何操作，有新自提后几秒内自动出现。
// 三条链路共同保证：
//   ① cron 每分钟一次（wrangler.jsonc triggers.crons）
//   ② hand/pick 的 count 轮询 55 秒（只拉计数，变了才拉列表）
//   ③ 页面挂载/回前台 + 长轮询唤醒 → ensure-fresh（60 秒门禁）
// 本文件锁死 ②③ 的服务端语义；①在 tests/shiphub-realtime-cadence.test.mjs 断言。

const STORE = 'ensure-fresh-store'
const NOW = new Date('2026-09-09T04:00:00.000Z') // 北京 12:00，营业时间内

const config: AppConfig = {
  APP_ENV: 'staging',
  APP_VERSION: '6.7.6-2',
  GIT_SHA: 'test',
  COOKIE_SECURE: true,
  SESSION_TTL_HOURS: 12,
  allowedOrigins: ['https://example.test'],
  SESSION_SECRET: 'x'.repeat(32),
  CSRF_SECRET: 'y'.repeat(32),
  PASSWORD_PEPPER: 'z'.repeat(32),
  SHIPHUB: {
    enabled: true,
    mode: 'fixture',
    liveConfirmed: false,
    requestTimeoutMs: 1000,
    activeStartHour: 10,
    activeEndHour: 22
  }
}

function order(id: string, updatedAt: string, category: 'hand' | 'pick' | 'receive' | 'ship' = 'hand'): ShipHubOrder {
  return {
    id,
    category,
    displayLabel: `fixture-${id}`,
    orderNumber: `ORD-${id.toUpperCase()}`,
    sourceLabel: 'Shiphub fixture',
    customerPhone: '13800138000',
    vehicleInfo: '测试车辆·黑色·M码',
    status: 'pending',
    scheduledAt: '2026-09-09T06:00:00.000Z',
    updatedAt,
    items: [{ id: `${id}-item`, productLabel: 'Synthetic bike', vehicleInfo: '测试车辆·黑色·M码', sku: 'FIXTURE-SKU', quantity: 1, serialNumberMasked: '***123' }]
  }
}

async function database(): Promise<TestD1Database> {
  const db = await migratedTestDatabase()
  db.exec(`INSERT INTO stores (id, code, name, timezone, status, created_at, updated_at) VALUES ('${STORE}', 'ENSURE-TEST', 'Ensure Store', 'Asia/Shanghai', 'active', '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z')`)
  return db
}

function envFor(db: TestD1Database): WorkerEnv {
  return {
    DB: db as unknown as D1Database,
    SHIPHUB_ENABLED: 'true',
    SHIPHUB_MODE: 'fixture',
    SHIPHUB_LIVE_CONFIRMED: 'false',
    SHIPHUB_ACTIVE_START_HOUR: '10',
    SHIPHUB_ACTIVE_END_HOUR: '22',
    APP_ENV: 'staging',
    GIT_SHA: 'test',
    SESSION_SECRET: 'x'.repeat(32),
    CSRF_SECRET: 'y'.repeat(32),
    PASSWORD_PEPPER: 'z'.repeat(32),
    COOKIE_SECURE: 'true',
    SESSION_TTL_HOURS: '12'
  } as unknown as WorkerEnv
}

test('ensureFreshStoreCategories：数据从未同步过时判定为 stale 并完成同步', async () => {
  const db = await database()
  try {
    const env = envFor(db)
    const result = await ensureFreshStoreCategories(env, STORE, ['hand', 'pick'], NOW)
    assert.equal(result.stale, true, '无任何同步记录时必须认为数据过期')
    // fixture 模式下 syncStoreCategory 用真实 client（合成数据），两个分类都应成功。
    assert.deepEqual(result.synced.sort(), ['hand', 'pick'])
    assert.deepEqual(result.skipped, [])
  } finally {
    db.close()
  }
})

test('ensureFreshStoreCategories：数据新鲜（< 门禁）时完全不打上游', async () => {
  const db = await database()
  try {
    const env = envFor(db)
    // 先同步一次建立 last_success_at
    await syncStoreCategory(db as unknown as D1Database, config, STORE, 'hand', {
      client: new FixtureShipHubClient([order('o1', '2026-09-09T03:00:00.000Z')]),
      now: NOW
    })
    // 门禁内再调用：应全部 skipped，且不产生新的 sync run
    const before = db.one<{ count: number }>('SELECT COUNT(*) AS count FROM shiphub_sync_runs')?.count ?? 0
    const result = await ensureFreshStoreCategories(env, STORE, ['hand'], new Date(NOW.getTime() + ENSURE_FRESH_MS - 1000))
    assert.equal(result.stale, false, '门禁内不得判定为过期')
    assert.deepEqual(result.synced, [])
    assert.deepEqual(result.skipped, ['hand'])
    const after = db.one<{ count: number }>('SELECT COUNT(*) AS count FROM shiphub_sync_runs')?.count ?? 0
    assert.equal(after, before, '新鲜时不得产生任何上游同步记录')
  } finally {
    db.close()
  }
})

test('ensureFreshStoreCategories：超过门禁后重新打上游', async () => {
  const db = await database()
  try {
    const env = envFor(db)
    await syncStoreCategory(db as unknown as D1Database, config, STORE, 'hand', {
      client: new FixtureShipHubClient([order('o1', '2026-09-09T03:00:00.000Z')]),
      now: NOW
    })
    const result = await ensureFreshStoreCategories(env, STORE, ['hand'], new Date(NOW.getTime() + ENSURE_FRESH_MS + 1000))
    assert.equal(result.stale, true, '超过门禁必须判定为过期')
    assert.deepEqual(result.synced, ['hand'])
  } finally {
    db.close()
  }
})

test('ensureFreshStoreCategories：只碰指定分类，不越界同步 receive/ship', async () => {
  const db = await database()
  try {
    const env = envFor(db)
    const result = await ensureFreshStoreCategories(env, STORE, ['hand'], NOW)
    assert.deepEqual(result.synced, ['hand'])
    const rows = db.query<{ category: string }>('SELECT DISTINCT category FROM shiphub_sync_runs')
    assert.deepEqual(rows.map((row) => row.category), ['hand'], '默认只同步 hand，不得顺带拉其它分类')
  } finally {
    db.close()
  }
})

test('ensureFreshStoreCategories：上游失败不抛错，返回 skipped（页面不能因同步失败白屏）', async () => {
  const db = await database()
  try {
    // live 模式 + 无连接 → connectionForSync 抛错 → ensureFresh 必须吞掉
    const env = { ...envFor(db), SHIPHUB_MODE: 'live', SHIPHUB_LIVE_CONFIRMED: 'true' } as unknown as WorkerEnv
    const result = await ensureFreshStoreCategories(env, STORE, ['hand'], NOW)
    assert.equal(result.stale, true)
    assert.deepEqual(result.synced, [])
    assert.deepEqual(result.skipped, ['hand'], '上游失败必须降级为 skipped 而不是冒泡异常')
  } finally {
    db.close()
  }
})

test('实时化间隔：hand/pick 计数轮询压到 55 秒，receive/ship 保持 10 分钟', async () => {
  const source = await import('node:fs').then((fs) => fs.promises.readFile(new URL('../src/services/shiphub-sync.ts', import.meta.url), 'utf8'))
  const match = source.match(/const COUNT_INTERVAL_MS[^=]*= \{([^}]*)\}/u)
  assert.ok(match, 'COUNT_INTERVAL_MS 必须存在且为字面量对象（便于断言）')
  const body = match![1]
  assert.match(body, /hand:\s*55_000/u, 'hand 必须压到 55 秒（cron 每分钟，保证每 tick 命中）')
  assert.match(body, /pick:\s*55_000/u, 'pick 必须压到 55 秒')
  assert.match(body, /receive:\s*10 \* 60_000/u, 'receive 保持 10 分钟，不必为实时化付出调用成本')
  assert.match(body, /ship:\s*10 \* 60_000/u, 'ship 保持 10 分钟')
  assert.match(source, /export const ENSURE_FRESH_MS = 60_000/u, '门禁必须是 60 秒')
})
