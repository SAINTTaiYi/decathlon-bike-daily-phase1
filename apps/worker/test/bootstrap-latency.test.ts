import assert from 'node:assert/strict'
import test from 'node:test'
import { handleRequest } from '../src/index.js'
import type { AppConfig, WorkerEnv } from '../src/env.js'
import { hashPassword } from '../src/lib/crypto.js'
import { migratedTestDatabase, type TestD1Database } from '../security/d1-test-adapter.js'
import { listBootstrapAuditFeed } from '../src/routes/audit.js'

// 启动延迟优化（2026-09-18）。三条契约，全部用「记录 D1 操作时间线」的代理实测，
// 而不是断言源码字符串：
//   ① bootstrap 随响应下发 changeVersion（与门店版本号同源）——前端长轮询从它起步，
//      消除「since=0 → 必然收到变了 → 再拉一轮 bootstrap + ensure-fresh」的重复重活；
//   ② bootstrap 的审计 feed 两条查询合并成一次 batch 往返（原先串行两次 await）；
//   ③ /auth/me 的 CSRF 轮换（写）与成员门店读取（读）合并成一次 batch 往返。

const STORE_ID = '30000000-0000-4000-8000-000000001299'
const USER_ID = '33000000-0000-4000-8000-000000001299'
const USERNAME = 'latency-user'
const PASSWORD = 'bootstrap-latency-password-0123456789'
const SESSION_SECRET = 'session-secret-for-bootstrap-latency-tests-0123456789'
const CSRF_SECRET = 'csrf-secret-for-bootstrap-latency-tests-0123456789'
const PASSWORD_PEPPER = 'pepper-for-bootstrap-latency-tests-0123456789'
const ORIGIN = 'https://bike-ops-preview.geeklightonefish.workers.dev'
const SEED_VERSION = 4

async function seededDatabase(): Promise<TestD1Database> {
  const db = await migratedTestDatabase()
  const stamp = '2026-09-18T02:00:00.000Z'
  const passwordHash = await hashPassword(PASSWORD, PASSWORD_PEPPER)
  db.sqlite.prepare(`
    INSERT INTO users (id, username_key, display_name, email_key, password_hash, status, must_change_password, failed_login_count, is_platform_admin, created_at, updated_at)
    VALUES (?, ?, '延迟测试', 'latency@example.decathlon.com', ?, 'active', 0, 0, 0, ?, ?)
  `).run(USER_ID, USERNAME, passwordHash, stamp, stamp)
  db.sqlite.prepare(`
    INSERT INTO store_members (id, store_id, user_id, role, status, effective_from, created_at)
    VALUES ('membership-latency', ?, ?, 'admin', 'active', ?, ?)
  `).run(STORE_ID, USER_ID, stamp, stamp)
  db.sqlite.prepare('INSERT INTO store_change_log (store_id, version, updated_at) VALUES (?, ?, ?)').run(STORE_ID, SEED_VERSION, stamp)
  // 审计 feed 用例：当天一条 + 在册记录 R1 的跨天历史一条。
  const insertEvent = db.sqlite.prepare(`INSERT INTO audit_events (id, store_id, actor_name_snapshot, action, entity_type, entity_id, business_date, summary, reversible, request_id, audit_module, created_at) VALUES (?, ?, '延迟测试', 'add-record', 'work-item', ?, ?, ?, ?, ?, 'repair', ?)`)
  insertEvent.run('lat-today', STORE_ID, 'R1', '2026-09-18', '今天的事件', 1, 'req-lat-1', '2026-09-18T02:30:00.000Z')
  insertEvent.run('lat-old', STORE_ID, 'R1', '2026-09-17', '跨天历史', 0, 'req-lat-2', '2026-09-17T01:00:00.000Z')
  return db
}

type D1Op = { kind: 'first' | 'all' | 'run' | 'batch'; sql: string[] }

// D1 是网络服务：每个被 await 的语句（以及每次 batch）都是一次往返。
// 这个代理把完整操作时间线记下来，供断言「合并成一次 batch」而不是「别再串行」。
function instrument(db: TestD1Database): { database: D1Database; ops: D1Op[] } {
  const ops: D1Op[] = []
  const wrapStatement = (statement: any): any => new Proxy(statement, {
    get(target, key) {
      const value = Reflect.get(target, key)
      if (key === 'bind') return (...args: unknown[]) => wrapStatement(target.bind(...args))
      if (key === 'first' || key === 'all' || key === 'run') {
        return (...args: unknown[]) => {
          ops.push({ kind: key as D1Op['kind'], sql: [String(target.sql)] })
          return value.apply(target, args)
        }
      }
      return typeof value === 'function' ? value.bind(target) : value
    }
  })
  const database = new Proxy(db as unknown as D1Database, {
    get(target, key) {
      const value = Reflect.get(target, key)
      if (key === 'prepare') return (sql: string) => wrapStatement(target.prepare(sql))
      if (key === 'batch') {
        return (statements: any[]) => {
          ops.push({ kind: 'batch', sql: statements.map((statement) => String(statement.sql)) })
          return target.batch(statements)
        }
      }
      return typeof value === 'function' ? value.bind(target) : value
    }
  }) as D1Database
  return { database, ops }
}

function baseEnv(db: D1Database): WorkerEnv {
  return {
    DB: db,
    ASSETS: { fetch: async () => new Response('asset', { status: 200 }) } as Fetcher,
    APP_ENV: 'preview',
    APP_VERSION: '6.8.5',
    GIT_SHA: 'bootstrap-latency-test',
    COOKIE_SECURE: 'true',
    SESSION_TTL_HOURS: '12',
    CORS_ALLOWED_ORIGINS: ORIGIN,
    SESSION_SECRET,
    CSRF_SECRET,
    PASSWORD_PEPPER,
    CONTACT_ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    PLATFORM_ADMIN_SETUP_TOKEN_HASH: 'a'.repeat(64),
    REGISTRATION_SECRET: 'registration-secret-for-bootstrap-latency-tests-0123456789'
  } as AppConfig & WorkerEnv
}

function executionContext(): ExecutionContext {
  return {
    waitUntil(promise: Promise<unknown>) { void Promise.resolve(promise).catch(() => undefined) },
    passThroughOnException() {},
    props: {}
  } as ExecutionContext
}

async function login(env: WorkerEnv): Promise<Response> {
  return handleRequest(
    new Request(`${ORIGIN}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({ username: USERNAME, password: PASSWORD })
    }),
    env,
    executionContext()
  )
}

function cookieFrom(response: Response): string {
  const raw = response.headers.get('set-cookie') || ''
  return raw.split(';')[0]
}

async function get(env: WorkerEnv, path: string, cookie: string): Promise<Response> {
  return handleRequest(
    new Request(`${ORIGIN}${path}`, { headers: { cookie, 'x-store-id': STORE_ID, origin: ORIGIN } }),
    env,
    executionContext()
  )
}

test('bootstrap 审计 feed 两条查询合并为一次 batch 往返', async () => {
  const db = await seededDatabase()
  try {
    const { database, ops } = instrument(db)
    const events = await listBootstrapAuditFeed(database, STORE_ID, '2026-09-18', ['R1'])
    assert.deepEqual(
      events.map((event: any) => event.id),
      ['lat-today', 'lat-old'],
      'feed 语义必须保持：当天事件 + 在册记录事件史'
    )
    const batches = ops.filter((op) => op.kind === 'batch')
    assert.equal(batches.length, 1, `两条 feed 查询必须合并成一次 batch 往返，实际 ${batches.length} 次`)
    assert.equal(batches[0].sql.length, 2, 'batch 内应是「当天事件 + 在册记录事件史」两条')
    assert.match(batches[0].sql[0], /business_date = \?/u, 'batch 第一条必须是当天查询')
    assert.match(batches[0].sql[1], /INDEXED BY audit_events_entity_idx/u, 'batch 第二条必须是在册记录事件史（显式索引）')
    assert.equal(ops.filter((op) => op.kind !== 'batch').length, 0, '不得再保留逐条 await 的读往返')
  } finally {
    db.close()
  }
})

test('/api/v1/bootstrap 下发与门店版本号同源的 changeVersion', async () => {
  const db = await seededDatabase()
  try {
    const env = baseEnv(db as unknown as D1Database)
    const cookie = cookieFrom(await login(env))
    const first = await get(env, '/api/v1/bootstrap', cookie)
    assert.equal(first.status, 200, `bootstrap 必须成功，实际 ${first.status}`)
    const payload = await first.json() as any
    assert.equal(payload.changeVersion, SEED_VERSION, 'changeVersion 必须等于门店当前版本号')
    // 任何业务写都会 bump 版本号：下一次 bootstrap 必须跟上（否则前端会漏推变更）。
    db.sqlite.prepare('UPDATE store_change_log SET version = version + 1 WHERE store_id = ?').run(STORE_ID)
    const second = await get(env, '/api/v1/bootstrap', cookie)
    const next = await second.json() as any
    assert.equal(next.changeVersion, SEED_VERSION + 1, 'bump 后 bootstrap 必须下发新版本号')
  } finally {
    db.close()
  }
})

test('/auth/me 的 CSRF 轮换与成员门店读取合并为一次 batch 往返', async () => {
  const db = await seededDatabase()
  try {
    const { database, ops } = instrument(db)
    const env = baseEnv(database)
    const cookie = cookieFrom(await login(env))
    // 登录自身的写入（会话 + 审计）不计入本次断言；等微任务清空后重置时间线。
    await new Promise((resolve) => setTimeout(resolve, 0))
    ops.length = 0
    const response = await get(env, '/api/v1/auth/me', cookie)
    assert.equal(response.status, 200, `auth/me 必须成功，实际 ${response.status}`)
    const payload = await response.json() as any
    assert.ok(payload.csrfToken, 'CSRF 轮换必须保持')
    assert.equal(payload.currentStoreId, STORE_ID)
    const batches = ops.filter((op) => op.kind === 'batch')
    assert.equal(batches.length, 1, `轮换（写）+ 成员读取（读）必须合并成一次 batch，实际 ${batches.length} 次`)
    assert.match(batches[0].sql[0], /UPDATE auth_sessions SET csrf_hash/u, 'batch 第一条是 CSRF 轮换')
    assert.match(batches[0].sql[1], /store_members/u, 'batch 第二条是成员门店读取')
    assert.equal(
      ops.filter((op) => op.kind === 'run' && /UPDATE auth_sessions/u.test(op.sql[0])).length,
      0,
      'CSRF 轮换不得再以独立 run 往返发出'
    )
  } finally {
    db.close()
  }
})
