import assert from 'node:assert/strict'
import test from 'node:test'
import type { AppConfig } from '../src/env.js'
import { FixtureShipHubClient, type ShipHubClient, type ShipHubOrder, type ShipHubPage } from '../src/lib/shiphub-client.js'
import { activeInStoreTimezone, getShipHubOrder, getShipHubSummary, listShipHubOrders, runScheduledShipHubSync, syncStoreCategory } from '../src/services/shiphub-sync.js'
import type { WorkerEnv } from '../src/env.js'
import { migratedTestDatabase, type TestD1Database } from '../security/d1-test-adapter.js'

const STORE = 'shiphub-test-store'
const NOW = new Date('2026-08-18T10:00:00.000Z')

const config: AppConfig = {
  APP_ENV: 'staging',
  APP_VERSION: '5.9.9',
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

function order(id: string, updatedAt: string, category: 'hand' | 'receive' | 'ship' = 'hand'): ShipHubOrder {
  return {
    id,
    category,
    displayLabel: `fixture-${id}`,
    orderNumber: `ORD-${id.toUpperCase()}`,
    sourceLabel: 'Shiphub fixture',
    customerPhone: '13800138000',
    vehicleInfo: '测试车辆·黑色·M码',
    status: 'pending',
    scheduledAt: '2026-08-18T12:00:00.000Z',
    updatedAt,
    items: [{ id: `${id}-item`, productLabel: 'Synthetic bike', vehicleInfo: '测试车辆·黑色·M码', sku: 'FIXTURE-SKU', quantity: 1, serialNumberMasked: '***123' }]
  }
}

async function database(): Promise<TestD1Database> {
  const db = await migratedTestDatabase()
  db.exec(`INSERT INTO stores (id, code, name, timezone, status, created_at, updated_at) VALUES ('${STORE}', 'SHIPHUB-TEST', 'Fixture Store', 'Asia/Shanghai', 'active', '2026-08-18T00:00:00.000Z', '2026-08-18T00:00:00.000Z')`)
  return db
}

test('fixture 同步只写规范化订单，完整对账能发现 count 不变的订单替换', async () => {
  const db = await database()
  try {
    const firstClient = new FixtureShipHubClient([order('old-order', '2026-08-18T09:00:00.000Z')])
    assert.equal((await syncStoreCategory(db as unknown as D1Database, config, STORE, 'hand', { client: firstClient, now: NOW })).status, 'succeeded')
    const firstList = await listShipHubOrders(db as unknown as D1Database, STORE, 'hand', null, 50)
    assert.deepEqual(firstList.orders.map((item) => item.upstream_order_id), ['old-order'])
    assert.equal(firstList.orders[0]?.items[0]?.productLabel, 'Synthetic bike')

    const countSameClient = new FixtureShipHubClient([order('new-order', '2026-08-18T09:30:00.000Z')])
    assert.equal((await syncStoreCategory(db as unknown as D1Database, config, STORE, 'hand', { client: countSameClient, now: new Date(NOW.getTime() + 6 * 60_000) })).status, 'succeeded')
    assert.deepEqual((await listShipHubOrders(db as unknown as D1Database, STORE, 'hand', null, 50)).orders.map((item) => item.upstream_order_id), ['old-order'])

    assert.equal((await syncStoreCategory(db as unknown as D1Database, config, STORE, 'hand', { client: countSameClient, now: new Date(NOW.getTime() + 16 * 60_000) })).status, 'succeeded')
    assert.deepEqual((await listShipHubOrders(db as unknown as D1Database, STORE, 'hand', null, 50)).orders.map((item) => item.upstream_order_id), ['new-order'])
    assert.equal(db.one<{ absent: string | null }>('SELECT upstream_absent_at AS absent FROM shiphub_orders WHERE upstream_order_id = ?', 'old-order')?.absent !== null, true)
    assert.equal((await getShipHubOrder(db as unknown as D1Database, STORE, 'hand', 'new-order'))?.localActionState, null)
  } finally {
    db.close()
  }
})

class FailingPagedClient implements ShipHubClient {
  readonly mode = 'fixture' as const
  count(): Promise<number> { return Promise.resolve(2) }
  list(_category: 'hand' | 'receive' | 'ship', cursor?: string | null): Promise<ShipHubPage> {
    if (!cursor) return Promise.resolve({ orders: [order('page-one', '2026-08-18T09:00:00.000Z')], nextCursor: 'next' })
    return Promise.reject(new Error('synthetic second page failure'))
  }
  detail(): Promise<ShipHubOrder> { return Promise.reject(new Error('detail must not be reached')) }
}

test('多页列表中途失败时不写入订单，也不标记旧订单上游消失', async () => {
  const db = await database()
  try {
    const result = await syncStoreCategory(db as unknown as D1Database, config, STORE, 'hand', { client: new FailingPagedClient(), now: NOW })
    assert.deepEqual(result.status, 'failed')
    assert.equal(db.one<{ count: number }>('SELECT COUNT(*) AS count FROM shiphub_orders WHERE store_id = ?', STORE)?.count, 0)
    assert.equal(db.one<{ status: string; error_code: string }>('SELECT status, error_code FROM shiphub_sync_runs WHERE store_id = ?', STORE)?.status, 'failed')
    assert.equal(db.one<{ last_error_code: string }>('SELECT last_error_code FROM shiphub_category_state WHERE store_id = ? AND category = ?', STORE, 'hand')?.last_error_code, 'SYNC_FAILED')
  } finally {
    db.close()
  }
})

test('summary 按门店和 category 隔离，并保留三类固定输出', async () => {
  const db = await database()
  try {
    await syncStoreCategory(db as unknown as D1Database, config, STORE, 'receive', {
      client: new FixtureShipHubClient([order('receive-order', '2026-08-18T09:00:00.000Z', 'receive')]),
      now: NOW
    })
    const summary = await getShipHubSummary(db as unknown as D1Database, config, STORE)
    assert.deepEqual(summary.categories.map((item) => item.category), ['hand', 'receive', 'ship'])
    assert.equal(summary.categories.find((item) => item.category === 'receive')?.count, 1)
    assert.equal(summary.categories.find((item) => item.category === 'hand')?.count, 0)
  } finally {
    db.close()
  }
})

test('人工同步批次串行覆盖三类，同时门店级两分钟冷却阻止下一次人工放大调用', async () => {
  const db = await database()
  try {
    const batchId = 'manual-batch-1'
    assert.equal((await syncStoreCategory(db as unknown as D1Database, config, STORE, 'hand', {
      trigger: 'manual', batchId, client: new FixtureShipHubClient([order('manual-hand', '2026-08-18T09:00:00.000Z')]), now: NOW
    })).status, 'succeeded')
    assert.equal((await syncStoreCategory(db as unknown as D1Database, config, STORE, 'receive', {
      trigger: 'manual', batchId, client: new FixtureShipHubClient([order('manual-receive', '2026-08-18T09:00:00.000Z', 'receive')]), now: NOW
    })).status, 'succeeded')
    const cooldown = await syncStoreCategory(db as unknown as D1Database, config, STORE, 'ship', {
      trigger: 'manual', client: new FixtureShipHubClient([order('must-not-run', '2026-08-18T09:00:00.000Z', 'ship')]), now: new Date(NOW.getTime() + 60_000)
    })
    assert.deepEqual(cooldown, { status: 'skipped', reason: 'MANUAL_COOLDOWN' })
  } finally {
    db.close()
  }
})

test('Preview fixture 在没有连接和 token 时仍只读加载人工构造数据', async () => {
  const db = await database()
  try {
    const result = await syncStoreCategory(db as unknown as D1Database, config, STORE, 'hand', {
      trigger: 'manual', batchId: 'preview-fixture-batch', now: NOW
    })
    assert.equal(result.status, 'succeeded')
    assert.equal(db.one<{ id: string }>('SELECT upstream_order_id AS id FROM shiphub_orders WHERE store_id = ? AND category = ?', STORE, 'hand')?.id, 'fixture-hand-001')
  } finally {
    db.close()
  }
})


test('营业时间硬规则：北京时间 10:00–22:00 内允许同步，其余时间一律拒绝', async () => {
  // Asia/Shanghai = UTC+8
  const at = (utcIso: string) => activeInStoreTimezone('Asia/Shanghai', new Date(utcIso), 10, 22)
  assert.equal(at('2026-08-19T01:59:59.000Z'), false, '09:59:59 北京 → 未营业')
  assert.equal(at('2026-08-19T02:00:00.000Z'), true, '10:00:00 北京 → 营业')
  assert.equal(at('2026-08-19T04:00:00.000Z'), true, '12:00 北京 → 营业')
  assert.equal(at('2026-08-19T13:59:59.000Z'), true, '21:59:59 北京 → 营业')
  assert.equal(at('2026-08-19T14:00:00.000Z'), false, '22:00:00 北京 → 停止调用')
  assert.equal(at('2026-08-19T17:00:00.000Z'), false, '凌晨 01:00 北京 → 停止调用')
  assert.equal(at('2026-08-19T16:00:00.000Z'), false, '00:00 北京（午夜）→ 停止调用')
})

test('定时同步固定按北京时间判定，门店时区误配不影响硬规则', async () => {
  const db = await database()
  // 把门店时区误配成 UTC：UTC 14:30 在 10–22 窗口内，但北京 22:30 已过营业时间
  db.exec("UPDATE stores SET timezone = 'UTC' WHERE id = '" + STORE + "'")
  try {
    const env = {
      DB: db as unknown as D1Database,
      SHIPHUB_ENABLED: 'true',
      SHIPHUB_MODE: 'fixture',
      SESSION_SECRET: 'x'.repeat(32),
      CSRF_SECRET: 'y'.repeat(32),
      PASSWORD_PEPPER: 'z'.repeat(32)
    } as unknown as WorkerEnv
    const inside = new Date('2026-08-19T13:59:00.000Z') // 北京 21:59 → 应同步
    await runScheduledShipHubSync(env, inside)
    const afterInside = db.one<{ id: string }>('SELECT upstream_order_id AS id FROM shiphub_orders WHERE store_id = ? LIMIT 1', STORE)
    assert.ok(afterInside, '北京时间 21:59 应执行同步并写入数据')

    const outside = new Date('2026-08-19T14:30:00.000Z') // 北京 22:30 → 禁止同步
    await runScheduledShipHubSync(env, outside)
    const attempt = db.one<{ last_attempt_at: string }>('SELECT last_attempt_at FROM shiphub_category_state WHERE store_id = ? AND category = ?', STORE, 'hand')
    assert.equal(attempt?.last_attempt_at, '2026-08-19T13:59:00.000Z', '北京时间 22:30 不得发起新的同步尝试')
  } finally {
    db.close()
  }
})


function liveConfig(): AppConfig {
  return {
    ...config,
    SHIPHUB: {
      ...config.SHIPHUB,
      mode: 'live',
      tokenEncryptionKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=='
    }
  }
}

async function liveEnv(db: TestD1Database): Promise<WorkerEnv> {
  return {
    DB: db as unknown as D1Database,
    SHIPHUB_ENABLED: 'true',
    SHIPHUB_MODE: 'live',
    SESSION_SECRET: 'x'.repeat(32),
    CSRF_SECRET: 'y'.repeat(32),
    PASSWORD_PEPPER: 'z'.repeat(32)
  } as unknown as WorkerEnv
}

test('live 定时同步只选已授权连接的门店，禁止对未连接门店自动 bootstrap（防共享 token 风暴）', async () => {
  const db = await database()
  db.exec(`INSERT INTO stores (id, code, name, timezone, status, created_at, updated_at) VALUES ('other-store', 'OTHER', 'Other Store', 'Asia/Shanghai', 'active', '2026-08-18T00:00:00.000Z', '2026-08-18T00:00:00.000Z')`)
  // 只有 STORE 有连接；other-store 没有连接，不得被 scheduled 同步 bootstrap
  db.exec(`INSERT INTO shiphub_connections (store_id, enabled, mode, refresh_token_ciphertext, refresh_token_nonce, refresh_token_key_version, authorization_status, created_at, updated_at)
           VALUES ('${STORE}', 1, 'live', '${'A'.repeat(78)}', '${'B'.repeat(16)}', 'v1', 'connected', '2026-08-18T00:00:00.000Z', '2026-08-18T00:00:00.000Z')`)
  try {
    await runScheduledShipHubSync(await liveEnv(db), new Date('2026-08-19T04:00:00.000Z')) // 北京 12:00
    const otherRuns = db.one<{ n: number }>('SELECT count(*) AS n FROM shiphub_sync_runs WHERE store_id = ?', 'other-store')
    assert.equal(otherRuns?.n, 0, '未连接门店不得产生任何同步运行')
    const otherConn = db.one<{ n: number }>('SELECT count(*) AS n FROM shiphub_connections WHERE store_id = ?', 'other-store')
    assert.equal(otherConn?.n, 0, 'scheduled 不得为未连接门店 bootstrap 连接')
    const connectedRuns = db.one<{ n: number }>('SELECT count(*) AS n FROM shiphub_sync_runs WHERE store_id = ?', STORE)
    assert.ok((connectedRuns?.n ?? 0) >= 1, '已授权连接的门店应被调度同步')
  } finally {
    db.close()
  }
})

test('live 定时同步排除 reauth_required 连接，不再对失效 token 空转', async () => {
  const db = await database()
  db.exec(`INSERT INTO shiphub_connections (store_id, enabled, mode, refresh_token_ciphertext, refresh_token_nonce, refresh_token_key_version, authorization_status, created_at, updated_at)
           VALUES ('${STORE}', 1, 'live', '${'A'.repeat(78)}', '${'B'.repeat(16)}', 'v1', 'reauth_required', '2026-08-18T00:00:00.000Z', '2026-08-18T00:00:00.000Z')`)
  try {
    await runScheduledShipHubSync(await liveEnv(db), new Date('2026-08-19T04:00:00.000Z'))
    const runs = db.one<{ n: number }>('SELECT count(*) AS n FROM shiphub_sync_runs WHERE store_id = ?', STORE)
    assert.equal(runs?.n, 0, 'reauth_required 连接不得被调度')
  } finally {
    db.close()
  }
})

test('同步引擎层硬门禁：live 模式营业时间外即使绕过路由也拒绝建立上游连接', async () => {
  const db = await database()
  try {
    const result = await syncStoreCategory(db as unknown as D1Database, liveConfig(), STORE, 'hand', {
      trigger: 'manual', now: new Date('2026-08-19T14:00:00.000Z') // 北京 22:00
    })
    assert.deepEqual(result, { status: 'skipped', reason: 'OUTSIDE_BUSINESS_HOURS' })
    const conn = db.one<{ n: number }>('SELECT count(*) AS n FROM shiphub_connections WHERE store_id = ?', STORE)
    assert.equal(conn?.n, 0, '营业时间外不得触发 bootstrap 或任何上游调用')
  } finally {
    db.close()
  }
})
