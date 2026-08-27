import assert from 'node:assert/strict'
import test from 'node:test'
import type { AppConfig } from '../src/env.js'
import { FixtureShipHubClient, type ShipHubClient, type ShipHubOrder, type ShipHubPage } from '../src/lib/shiphub-client.js'
import { activeInStoreTimezone, getShipHubConnection, getShipHubOrder, getShipHubSummary, listShipHubOrders, runScheduledShipHubSync, syncStoreCategory } from '../src/services/shiphub-sync.js'
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
  list(_category: 'hand' | 'pick' | 'receive' | 'ship', cursor?: string | null): Promise<ShipHubPage> {
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

test('summary 按门店和 category 隔离，并保留四类固定输出', async () => {
  const db = await database()
  try {
    await syncStoreCategory(db as unknown as D1Database, config, STORE, 'receive', {
      client: new FixtureShipHubClient([order('receive-order', '2026-08-18T09:00:00.000Z', 'receive')]),
      now: NOW
    })
    const summary = await getShipHubSummary(db as unknown as D1Database, config, STORE)
    assert.deepEqual(summary.categories.map((item) => item.category), ['hand', 'pick', 'receive', 'ship'])
    assert.equal(summary.categories.find((item) => item.category === 'receive')?.count, 1)
    assert.equal(summary.categories.find((item) => item.category === 'hand')?.count, 0)
  } finally {
    db.close()
  }
})

test('pick 分类同步写入 shiphub_orders 并进入待取车管线', async () => {
  const db = await database()
  try {
    const result = await syncStoreCategory(db as unknown as D1Database, config, STORE, 'pick', {
      client: new FixtureShipHubClient([order('pick-order-1', '2026-08-18T09:00:00.000Z', 'pick')]),
      now: NOW
    })
    assert.equal(result.status, 'succeeded')
    const orders = await listShipHubOrders(db as unknown as D1Database, STORE, 'pick', null, 50)
    assert.equal(orders.orders.length, 1)
    assert.equal(orders.orders[0].upstream_order_id, 'pick-order-1')
    assert.equal(orders.orders[0].source_label, 'Shiphub fixture')
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

test('live 同步引擎层拒绝未连接门店：不再自动 bootstrap 共享 token，且不产生连接行', async () => {
  const db = await database()
  try {
    const result = await syncStoreCategory(db as unknown as D1Database, liveConfig(), STORE, 'hand', {
      trigger: 'manual', now: new Date('2026-08-19T02:00:00.000Z') // 北京 10:00 营业时间内
    })
    assert.equal(result.status, 'failed')
    assert.equal(result.reason, 'CONNECTION_DISABLED')
    const conn = db.one<{ n: number }>('SELECT count(*) AS n FROM shiphub_connections WHERE store_id = ?', STORE)
    assert.equal(conn?.n, 0, '未连接门店不得被自动 bootstrap')
    const run = db.one<{ status: string }>('SELECT status FROM shiphub_sync_runs WHERE store_id = ? ORDER BY started_at DESC LIMIT 1', STORE)
    assert.equal(run?.status, 'failed')
  } finally {
    db.close()
  }
})

test('同一上游身份的 token 轮换互斥：身份租约被其他门店持有时跳过本轮，不轮换、不误标 reauth_required', async () => {
  const db = await database()
  db.exec(`INSERT INTO shiphub_connections (store_id, enabled, mode, refresh_token_ciphertext, refresh_token_nonce, refresh_token_key_version, location_num, identity_fingerprint, authorization_status, created_at, updated_at)
           VALUES ('${STORE}', 1, 'live', '${'A'.repeat(78)}', '${'B'.repeat(16)}', 'v1', '1299', 'fp-shared-identity', 'connected', '2026-08-18T00:00:00.000Z', '2026-08-18T00:00:00.000Z')`)
  db.exec(`INSERT INTO shiphub_identity_leases (fingerprint, lease_owner, lease_expires_at, updated_at)
           VALUES ('fp-shared-identity', 'other-store', '2099-01-01T00:00:00.000Z', '2026-08-18T00:00:00.000Z')`)
  try {
    const result = await syncStoreCategory(db as unknown as D1Database, liveConfig(), STORE, 'hand', {
      trigger: 'manual', now: new Date('2026-08-19T02:00:00.000Z')
    })
    assert.equal(result.status, 'skipped')
    assert.equal(result.reason, 'IDENTITY_LEASE_BUSY')
    const run = db.one<{ status: string }>('SELECT status FROM shiphub_sync_runs WHERE store_id = ? ORDER BY started_at DESC LIMIT 1', STORE)
    assert.equal(run?.status, 'skipped', '租约竞争不得记为失败')
    const conn = db.one<{ authorization_status: string; consecutive_failures: number }>(`SELECT authorization_status FROM shiphub_connections WHERE store_id = ?`, STORE)
    assert.equal(conn?.authorization_status, 'connected', '租约竞争不得误标 reauth_required')
    const lease = db.one<{ lease_owner: string }>('SELECT lease_owner FROM shiphub_identity_leases WHERE fingerprint = ?', 'fp-shared-identity')
    assert.equal(lease?.lease_owner, 'other-store', '他人租约不得被释放')
  } finally {
    db.close()
  }
})

test('连接公共视图只暴露是否配置本店凭据，绝不暴露凭据本身', async () => {
  const db = await database()
  db.exec(`INSERT INTO shiphub_connections (store_id, enabled, mode, refresh_token_ciphertext, refresh_token_nonce, refresh_token_key_version, login_username_enc, login_password_enc, login_key_version, location_num, identity_fingerprint, authorization_status, created_at, updated_at)
           VALUES ('${STORE}', 1, 'live', '${'A'.repeat(78)}', '${'B'.repeat(16)}', 'v1', 'enc-user', 'enc-pass', 'v1', '1299', 'fp-per-store', 'connected', '2026-08-18T00:00:00.000Z', '2026-08-18T00:00:00.000Z')`)
  try {
    const conn = await getShipHubConnection(db as unknown as D1Database, STORE)
    assert.ok(conn)
    assert.equal(conn.hasPerStoreLogin, true)
    assert.equal(conn.locationNum, '1299')
    const keys = Object.keys(conn as object)
    assert.ok(!keys.some((key) => /username_enc|password_enc|refresh_token|credential/i.test(key)), `公共视图泄露敏感字段: ${keys.join(',')}`)
    assert.ok(!keys.includes('identityFingerprint'), '身份指纹属内部字段，不进公共视图')
  } finally {
    db.close()
  }
})

test('connect/start 路由实现同一上游身份冲突拒绝（SHIPHUB_IDENTITY_IN_USE）', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../src/routes/shiphub.ts', import.meta.url), 'utf8')
  assert.match(source, /SHIPHUB_IDENTITY_IN_USE/u)
  assert.match(source, /SHIPHUB_LOGIN_INCOMPLETE/u)
  assert.match(source, /SHIPHUB_LOGIN_INVALID/u)
  assert.match(source, /identity_fingerprint = \? AND c\.store_id != \?/u)
  assert.match(source, /COALESCE\(excluded\.login_username_enc, shiphub_connections\.login_username_enc\)/u)
  assert.match(source, /loginUsernameEnc, loginPasswordEnc, loginUsernameEnc \? 'v1' : null/u)
})

test('ShipHub connect 权限拆分：重连任意门店角色，添加账号仅 manager/admin', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../src/routes/shiphub.ts', import.meta.url), 'utf8')
  // connect/start 不再要求 manager/admin 角色（操作员可重连已存凭据）
  assert.match(source, /connect\/start', requireJsonBody, auth\.loadSession, auth\.requirePasswordChanged, auth\.requireCsrf/u)
  assert.doesNotMatch(source, /connect\/start', requireJsonBody, \.\.\.managerWrite/u)
  // 携带 login 凭据（添加/更换账号）时必须为门店管理员
  assert.match(source, /const perStoreLogin = Boolean\(login && \(login\.username \|\| login\.password \|\| login\.locationNum\)\)\n    \/\/ 添加\/更换本店账号仅限门店管理员；操作员只用已存凭据重连\n    if \(perStoreLogin\) requireManager\(context\)/u)
  // 未携带凭据（纯重连）不触发管理员门槛
  assert.match(source, /if \(config\.SHIPHUB\.loginKey && \(config\.SHIPHUB\.loginUsernameEnc && config\.SHIPHUB\.loginPasswordEnc \|\| perStoreLogin\)\)/u)
})
