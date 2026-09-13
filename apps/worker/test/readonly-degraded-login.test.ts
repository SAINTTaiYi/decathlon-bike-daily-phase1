import assert from 'node:assert/strict'
import test from 'node:test'
import { handleRequest } from '../src/index.js'
import type { AppConfig, WorkerEnv } from '../src/env.js'
import { hashPassword } from '../src/lib/crypto.js'
import { createReadOnlySessionToken, verifyReadOnlySessionToken } from '../src/auth/session.js'
import { migratedTestDatabase, type TestD1Database } from '../security/d1-test-adapter.js'

// 只读降级登录（2026-09-14 D1 写额度事故回归）。
//
// 事故：写额度耗尽后，**登录本身也写库**（会话行 + 用户表 + 审计事件），
// 于是门店连「进去看数据」都做不到——V6.7.7-6 承诺的「期间可正常查看数据」
// 是假的。修复：写被拒时登录改用无状态只读会话（不写一行），所有写操作
// 统一拦成结构化额度提示。
//
// 本测试用「batch 抛额度错误、prepare 正常」的数据库代理模拟真实限额现场，
// 而不是断言源码里的字符串。

const STORE_ID = '30000000-0000-4000-8000-000000001299'
const USER_ID = '33000000-0000-4000-8000-000000001299'
const USERNAME = 'readonly-user'
const PASSWORD = 'readonly-degraded-login-password'
const SESSION_SECRET = 'session-secret-for-readonly-degraded-tests-0123456789'
const CSRF_SECRET = 'csrf-secret-for-readonly-degraded-tests-0123456789'
const PASSWORD_PEPPER = 'pepper-for-readonly-degraded-tests-0123456789'
const ORIGIN = 'https://bike-ops-preview.geeklightonefish.workers.dev'

// 平台原文（D1 免费层每日写额度耗尽）
const QUOTA_MESSAGE = "D1_RUN_FAILED: Your account has exceeded D1's free tier daily row write limit. Upgrade to a paid plan or wait until tomorrow (midnight UTC) to continue."

async function seededDatabase(): Promise<TestD1Database> {
  const db = await migratedTestDatabase()
  const stamp = '2026-09-13T10:00:00.000Z'
  const passwordHash = await hashPassword(PASSWORD, PASSWORD_PEPPER)
  db.sqlite.prepare(`
    INSERT INTO users (id, username_key, display_name, email_key, password_hash, status, must_change_password, failed_login_count, is_platform_admin, created_at, updated_at)
    VALUES (?, ?, '只读测试', 'readonly@example.decathlon.com', ?, 'active', 0, 0, 0, ?, ?)
  `).run(USER_ID, USERNAME, passwordHash, stamp, stamp)
  db.sqlite.prepare(`
    INSERT INTO store_members (id, store_id, user_id, role, status, effective_from, created_at)
    VALUES ('membership-readonly', ?, ?, 'operator', 'active', ?, ?)
  `).run(STORE_ID, USER_ID, stamp, stamp)
  return db
}

function config(): AppConfig {
  return {
    APP_ENV: 'preview',
    APP_VERSION: '6.7.7',
    GIT_SHA: 'readonly-degraded-test',
    COOKIE_SECURE: true,
    SESSION_TTL_HOURS: 12,
    allowedOrigins: [ORIGIN],
    SESSION_SECRET,
    CSRF_SECRET,
    PASSWORD_PEPPER
  } as AppConfig
}

function baseEnv(db: D1Database): WorkerEnv {
  return {
    DB: db,
    ASSETS: { fetch: async () => new Response('asset', { status: 200 }) } as Fetcher,
    APP_ENV: 'preview',
    APP_VERSION: '6.7.7',
    GIT_SHA: 'readonly-degraded-test',
    COOKIE_SECURE: 'true',
    SESSION_TTL_HOURS: '12',
    CORS_ALLOWED_ORIGINS: ORIGIN,
    SESSION_SECRET,
    CSRF_SECRET,
    PASSWORD_PEPPER,
    CONTACT_ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    PLATFORM_ADMIN_SETUP_TOKEN_HASH: 'a'.repeat(64),
    REGISTRATION_SECRET: 'registration-secret-for-readonly-degraded-tests-0123456789'
  }
}

// 写全部被平台拒绝、读照常：只有 batch 与写语句抛额度错误。
function quotaBlockedEnvironment(db: TestD1Database): WorkerEnv {
  const target = db as unknown as D1Database
  const isWriteStatement = (sql: string) => /^\s*(?:INSERT|UPDATE|DELETE)/iu.test(sql)
  const proxy = new Proxy(target, {
    get(object, property, receiver) {
      if (property === 'batch') {
        return async () => { throw new Error(QUOTA_MESSAGE) }
      }
      if (property === 'prepare') {
        return (sql: string) => {
          const statement = object.prepare(sql)
          if (!isWriteStatement(sql)) return statement
          // 写语句在真实限额下会由平台抛错——这里复刻同一行为，
          // 让「降级路径」必须在真实的失败点上被触发。
          return new Proxy(statement, {
            get(stmt, key) {
              if (key === 'run') return async () => { throw new Error(QUOTA_MESSAGE) }
              if (key === 'bind') return () => proxy.prepare(sql)
              const value = Reflect.get(stmt as object, key)
              return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(stmt) : value
            }
          })
        }
      }
      const value = Reflect.get(object, property, receiver)
      return typeof value === 'function' ? value.bind(target) : value
    }
  })
  return baseEnv(proxy) // eslint-disable-line @typescript-eslint/no-explicit-any
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

test('写额度耗尽时登录降级为只读会话，不写任何一行数据库', async () => {
  const db = await seededDatabase()
  try {
    const env = quotaBlockedEnvironment(db)
    const response = await login(env)
    const payload = await response.json() as any
    assert.equal(response.status, 200, `登录必须成功（只读降级），实际 ${response.status}: ${JSON.stringify(payload)}`)
    assert.equal(payload.readOnly, true, '必须标记为只读会话')
    assert.equal(payload.user.displayName, '只读测试')
    assert.ok(payload.recoveryAt, '必须给出恢复时间')
    const cookie = cookieFrom(response)
    assert.match(cookie, /=ro1\./u, `必须签发只读令牌，实际 cookie: ${cookie}`)
    // 关键：没有写入任何会话行
    const sessions = db.sqlite.prepare('SELECT COUNT(*) AS n FROM auth_sessions').get() as { n: number }
    assert.equal(sessions.n, 0, '只读降级不得写 auth_sessions')
  } finally {
    db.close()
  }
})

test('只读会话可以正常读取（含当日行未建立时的默认值渲染）', async () => {
  const db = await seededDatabase()
  try {
    const env = quotaBlockedEnvironment(db)
    const cookie = cookieFrom(await login(env))

    const me = await get(env, '/api/v1/auth/me', cookie)
    const mePayload = await me.json() as any
    assert.equal(me.status, 200, JSON.stringify(mePayload))
    assert.equal(mePayload.readOnly, true, '刷新后仍应识别为只读会话')

    const bootstrap = await get(env, '/api/v1/bootstrap', cookie)
    const bootstrapPayload = await bootstrap.json() as any
    assert.equal(bootstrap.status, 200, `只读会话必须能打开工作台：${JSON.stringify(bootstrapPayload).slice(0, 200)}`)
    assert.ok(bootstrapPayload.day, '必须返回当日数据（未建立时用默认值）')
    assert.equal(bootstrapPayload.day.kpi.salesVehicles, 0)
    assert.ok(Array.isArray(bootstrapPayload.records), '台账记录必须是数组')
    assert.equal(bootstrapPayload.store.role, 'operator')
  } finally {
    db.close()
  }
})

test('只读会话的写操作被拦成结构化额度提示，而不是数据库错误', async () => {
  const db = await seededDatabase()
  try {
    const env = quotaBlockedEnvironment(db)
    const cookie = cookieFrom(await login(env))
    const response = await handleRequest(
      new Request(`${ORIGIN}/api/v1/work-items`, {
        method: 'POST',
        headers: { cookie, 'x-store-id': STORE_ID, origin: ORIGIN, 'content-type': 'application/json', 'x-csrf-token': 'anything', 'idempotency-key': '34000000-0000-4000-8000-000000000001' },
        body: JSON.stringify({ scene: 'poster', values: { title: '只读测试', detail: '', meta: '', status: '继续跟进' } })
      }),
      env,
      executionContext()
    )
    const payload = await response.json() as any
    assert.equal(response.status, 503, `写操作应被拦下，实际 ${response.status}`)
    assert.equal(payload.error, 'D1_WRITE_LIMIT')
    assert.ok(payload.recoveryAt, '必须给出恢复时间，前端据此提示门店')
    assert.match(String(payload.message), /只读/u, '提示必须说明当前是只读模式')
  } finally {
    db.close()
  }
})

test('只读令牌防篡改与过期：签名不匹配或过期一律 401', async () => {
  const db = await seededDatabase()
  try {
    const env = quotaBlockedEnvironment(db)
    const good = await createReadOnlySessionToken(config(), { userId: USER_ID, storeId: STORE_ID })

    // 篡改签名最后一位
    const tampered = `${good.slice(0, -1)}${good.endsWith('a') ? 'b' : 'a'}`
    const tamperedResponse = await get(env, '/api/v1/auth/me', `__Host-bike_ops_session=${tampered}`)
    assert.equal(tamperedResponse.status, 401, '篡改的令牌必须被拒')

    // 篡改载荷（换一个用户 id）——签名随即失效
    const forgedPayload = Buffer.from(JSON.stringify({ v: 1, u: 'somebody-else', s: STORE_ID, e: new Date(Date.now() + 3_600_000).toISOString() })).toString('base64url')
    const forged = `ro1.${forgedPayload}.${good.slice(good.lastIndexOf('.') + 1)}`
    const forgedResponse = await get(env, '/api/v1/auth/me', `__Host-bike_ops_session=${forged}`)
    assert.equal(forgedResponse.status, 401, '伪造载荷必须被拒')

    // 过期令牌
    const expired = await createReadOnlySessionToken({ ...config(), SESSION_TTL_HOURS: -1 }, { userId: USER_ID, storeId: STORE_ID })
    const expiredResponse = await get(env, '/api/v1/auth/me', `__Host-bike_ops_session=${expired}`)
    assert.equal(expiredResponse.status, 401, '过期令牌必须被拒')

    // 有效令牌可被解析（正例，确认上面的拒绝不是「一律拒绝」）
    const parsed = await verifyReadOnlySessionToken(good, config())
    assert.ok(parsed, '有效令牌必须能解析')
    assert.equal(parsed?.userId, USER_ID)
  } finally {
    db.close()
  }
})

test('写额度正常时不受影响：仍签发数据库会话（无回归）', async () => {
  const db = await seededDatabase()
  try {
    const response = await login(baseEnv(db as unknown as D1Database))
    const payload = await response.json() as any
    assert.equal(response.status, 200, JSON.stringify(payload))
    assert.equal(payload.readOnly, undefined, '正常路径不得标记只读')
    const cookie = cookieFrom(response)
    assert.doesNotMatch(cookie, /ro1\./u, '正常路径必须签发数据库会话')
    const sessions = db.sqlite.prepare('SELECT COUNT(*) AS n FROM auth_sessions').get() as { n: number }
    assert.equal(sessions.n, 1, '正常路径必须写入会话行')
    // 正常会话的写操作不受只读拦截影响
    const bootstrap = await get(baseEnv(db as unknown as D1Database), '/api/v1/bootstrap', cookie)
    assert.equal(bootstrap.status, 200)
  } finally {
    db.close()
  }
})
