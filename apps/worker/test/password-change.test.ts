import assert from 'node:assert/strict'
import test from 'node:test'
import { handleRequest } from '../src/index.js'
import type { WorkerEnv } from '../src/env.js'
import { hashPassword, verifyPassword } from '../src/lib/crypto.js'
import { migratedTestDatabase, TestD1Database } from '../security/d1-test-adapter.js'

const ORIGIN = 'https://bike-ops-preview.geeklightonefish.workers.dev'
const STORE_ID = '30000000-0000-4000-8000-000000001299'
const USER_ID = 'password-change-user'
const USERNAME = 'passwordchange'
const CURRENT_PASSWORD = 'CurrentPassword!2026'
const NEXT_PASSWORD = 'ReplacementPassword!2026'
const SESSION_SECRET = 'session-secret-for-password-change-test-0123456789'
const CSRF_SECRET = 'csrf-secret-for-password-change-test-0123456789'
const PASSWORD_PEPPER = 'pepper-for-password-change-test-0123456789'
const STAMP = '2026-08-11T10:00:00.000Z'
const DEFAULT_KEY = '00000000-0000-4000-8000-000000000001'
const RETRY_KEY = '00000000-0000-4000-8000-000000000002'
const CONCURRENT_KEY_A = '00000000-0000-4000-8000-000000000003'
const CONCURRENT_KEY_B = '00000000-0000-4000-8000-000000000004'

type Session = { cookie: string; csrfToken: string; storeId: string }

function environment(db: TestD1Database): WorkerEnv {
  return {
    DB: db as unknown as D1Database,
    ASSETS: { fetch: async () => new Response('asset', { status: 200 }) } as Fetcher,
    APP_ENV: 'preview',
    APP_VERSION: '5.9.2',
    GIT_SHA: 'password-change-test',
    COOKIE_SECURE: 'true',
    SESSION_TTL_HOURS: '12',
    CORS_ALLOWED_ORIGINS: ORIGIN,
    SESSION_SECRET,
    CSRF_SECRET,
    PASSWORD_PEPPER
  }
}

async function request(db: TestD1Database, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers ?? {})
  headers.set('origin', ORIGIN)
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json')
  const pending: Promise<unknown>[] = []
  const executionContext = {
    waitUntil(promise: Promise<unknown>) { pending.push(promise) },
    passThroughOnException() {},
    props: {}
  } as ExecutionContext
  const response = await handleRequest(new Request(`${ORIGIN}${path}`, { ...init, headers }), environment(db), executionContext)
  await Promise.allSettled(pending)
  return response
}

async function seedUser(db: TestD1Database): Promise<void> {
  const passwordHash = await hashPassword(CURRENT_PASSWORD, PASSWORD_PEPPER)
  db.sqlite.prepare(`
    INSERT INTO users (
      id, username_key, display_name, email_key, password_hash, status, must_change_password,
      failed_login_count, locked_until, is_platform_admin, created_at, updated_at
    ) VALUES (?, ?, ?, NULL, ?, 'active', 0, 0, NULL, 0, ?, ?)
  `).run(USER_ID, USERNAME, '改密测试用户', passwordHash, STAMP, STAMP)
  db.sqlite.prepare(`
    INSERT INTO store_members (id, store_id, user_id, role, status, effective_from, created_at)
    VALUES (?, ?, ?, 'operator', 'active', ?, ?)
  `).run('password-change-membership', STORE_ID, USER_ID, STAMP, STAMP)
}

async function login(db: TestD1Database, password = CURRENT_PASSWORD): Promise<{ response: Response; session?: Session }> {
  const response = await request(db, '/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: USERNAME, password })
  })
  if (!response.ok) return { response }
  const body: any = await response.json()
  const cookie = (response.headers.get('set-cookie') ?? '').split(';', 1)[0] ?? ''
  assert.match(cookie, /^__Host-bike_ops_session=/u)
  return { response, session: { cookie, csrfToken: body.csrfToken, storeId: body.currentStoreId } }
}

function sessionHeaders(session: Session, includeCsrf = false): HeadersInit {
  return {
    cookie: session.cookie,
    'x-store-id': session.storeId,
    ...(includeCsrf ? { 'x-csrf-token': session.csrfToken } : {})
  }
}

async function changePassword(
  db: TestD1Database,
  session: Session,
  currentPassword: string,
  nextPassword: string,
  { includeCsrf = true, key = DEFAULT_KEY }: { includeCsrf?: boolean; key?: string } = {}
): Promise<Response> {
  return request(db, '/api/v1/auth/change-password', {
    method: 'POST',
    headers: { ...sessionHeaders(session, includeCsrf), 'idempotency-key': key },
    body: JSON.stringify({ currentPassword, nextPassword })
  })
}

test('已登录用户修改密码后保留当前会话、撤销其它会话并写入无敏感信息审计', async () => {
  const db = await migratedTestDatabase()
  try {
    await seedUser(db)
    const first = await login(db)
    const second = await login(db)
    assert.equal(first.response.status, 200)
    assert.equal(second.response.status, 200)
    assert.ok(first.session && second.session)
    assert.equal(db.one<{ count: number }>('SELECT COUNT(*) AS count FROM auth_sessions WHERE user_id = ? AND revoked_at IS NULL', USER_ID)!.count, 2)

    // A valid signed-in user may still carry stale failure state from an earlier login attempt.
    db.sqlite.prepare('UPDATE users SET failed_login_count = 4, locked_until = ? WHERE id = ?')
      .run('2099-01-01T00:00:00.000Z', USER_ID)

    const changed = await changePassword(db, second.session!, CURRENT_PASSWORD, NEXT_PASSWORD)
    assert.equal(changed.status, 200)
    assert.deepEqual(await changed.json(), { ok: true })

    const user = db.one<{ password_hash: string; must_change_password: number; failed_login_count: number; locked_until: string | null }>(
      'SELECT password_hash, must_change_password, failed_login_count, locked_until FROM users WHERE id = ?', USER_ID
    )!
    assert.equal(await verifyPassword(user.password_hash, CURRENT_PASSWORD, PASSWORD_PEPPER), false)
    assert.equal(await verifyPassword(user.password_hash, NEXT_PASSWORD, PASSWORD_PEPPER), true)
    assert.equal(user.must_change_password, 0)
    assert.equal(user.failed_login_count, 0)
    assert.equal(user.locked_until, null)

    const sessions = db.one<{ active: number; revoked: number }>(`
      SELECT
        SUM(CASE WHEN revoked_at IS NULL THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN revoked_at IS NOT NULL THEN 1 ELSE 0 END) AS revoked
      FROM auth_sessions WHERE user_id = ?
    `, USER_ID)!
    assert.equal(sessions.active, 1)
    assert.equal(sessions.revoked, 1)

    const currentSession = await request(db, '/api/v1/auth/me', { headers: sessionHeaders(second.session!) })
    const otherSession = await request(db, '/api/v1/auth/me', { headers: sessionHeaders(first.session!) })
    assert.equal(currentSession.status, 200, '发起改密的当前会话必须继续有效')
    assert.equal(otherSession.status, 401, '其它设备或浏览器会话必须立即失效')

    const oldLogin = await login(db, CURRENT_PASSWORD)
    const newLogin = await login(db, NEXT_PASSWORD)
    assert.equal(oldLogin.response.status, 401, '旧密码不得继续登录')
    assert.equal(newLogin.response.status, 200, '新密码必须可以登录')

    const audits = db.query<{ summary: string; before_state: string | null; after_state: string | null; audit_module: string }>(
      `SELECT summary, before_state, after_state, audit_module FROM audit_events WHERE action = 'change-password' AND actor_user_id = ?`, USER_ID
    )
    assert.equal(audits.length, 1)
    assert.equal(audits[0]!.audit_module, 'account')
    assert.match(audits[0]!.summary, /修改密码/u)
    const serializedAudit = JSON.stringify(audits[0])
    assert.doesNotMatch(serializedAudit, new RegExp(CURRENT_PASSWORD.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'))
    assert.doesNotMatch(serializedAudit, new RegExp(NEXT_PASSWORD.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'))
  } finally { db.close() }
})

test('当前密码错误时不修改哈希、不撤销会话也不写成功审计', async () => {
  const db = await migratedTestDatabase()
  try {
    await seedUser(db)
    const loginResult = await login(db)
    assert.ok(loginResult.session)
    const before = db.one<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', USER_ID)!.password_hash

    const response = await changePassword(db, loginResult.session!, 'WrongCurrentPassword!2026', NEXT_PASSWORD)
    assert.equal(response.status, 400)
    assert.equal((await response.json() as any).error, 'INVALID_CURRENT_PASSWORD')
    assert.equal(db.one<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', USER_ID)!.password_hash, before)
    assert.equal(db.one<{ count: number }>('SELECT COUNT(*) AS count FROM auth_sessions WHERE user_id = ? AND revoked_at IS NULL', USER_ID)!.count, 1)
    assert.equal(db.one<{ count: number }>(`SELECT COUNT(*) AS count FROM audit_events WHERE action = 'change-password'`)!.count, 0)
  } finally { db.close() }
})

test('同一幂等键可安全重试，不会再写一次密码、审计或撤销会话', async () => {
  const db = await migratedTestDatabase()
  try {
    await seedUser(db)
    const first = await login(db)
    const second = await login(db)
    assert.ok(first.session && second.session)

    const changed = await changePassword(db, second.session!, CURRENT_PASSWORD, NEXT_PASSWORD, { key: RETRY_KEY })
    const retried = await changePassword(db, second.session!, CURRENT_PASSWORD, NEXT_PASSWORD, { key: RETRY_KEY })
    assert.equal(changed.status, 200)
    assert.equal(retried.status, 200, '服务端成功但响应丢失时，同 key 重试必须取得原成功结果')
    assert.deepEqual(await retried.json(), { ok: true })
    assert.equal(db.one<{ count: number }>(`SELECT COUNT(*) AS count FROM audit_events WHERE action = 'change-password'`)!.count, 1)
    assert.equal(db.one<{ count: number }>(`SELECT COUNT(*) AS count FROM auth_sessions WHERE user_id = ? AND revoked_at IS NOT NULL`, USER_ID)!.count, 1)
    const request = db.one<{ request_hash: string; response_body: string }>(`
      SELECT request_hash, response_body FROM idempotency_requests
      WHERE user_id = ? AND idempotency_key = ?
    `, USER_ID, RETRY_KEY)!
    assert.match(request.request_hash, /^[a-f0-9]{64}$/iu)
    assert.doesNotMatch(JSON.stringify(request), new RegExp(CURRENT_PASSWORD.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'))
    assert.doesNotMatch(JSON.stringify(request), new RegExp(NEXT_PASSWORD.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'))
  } finally { db.close() }
})

test('两个设备并发改成不同密码时只允许一个写入，失败请求不得误撤销会话', async () => {
  const db = await migratedTestDatabase()
  try {
    await seedUser(db)
    const first = await login(db)
    const second = await login(db)
    assert.ok(first.session && second.session)
    const firstNextPassword = 'ConcurrentFirstPassword!2026'
    const secondNextPassword = 'ConcurrentSecondPassword!2026'

    // Both requests observe the same old hash before either reaches the conditional write.
    db.barrier(/SELECT password_hash FROM users WHERE id = \?/u, 2)
    const results = await Promise.all([
      changePassword(db, first.session!, CURRENT_PASSWORD, firstNextPassword, { key: CONCURRENT_KEY_A }),
      changePassword(db, second.session!, CURRENT_PASSWORD, secondNextPassword, { key: CONCURRENT_KEY_B })
    ])
    const outcomes = await Promise.all(results.map(async (response, index) => ({
      response,
      body: await response.json() as any,
      session: index === 0 ? first.session! : second.session!,
      nextPassword: index === 0 ? firstNextPassword : secondNextPassword
    })))
    const winner = outcomes.find((item) => item.response.status === 200)
    const loser = outcomes.find((item) => item.response.status === 409)
    assert.ok(winner, '并发请求中必须有一个成功')
    assert.ok(loser, '并发请求中必须有一个明确冲突')
    assert.deepEqual(winner.body, { ok: true })
    assert.equal(loser.body.error, 'PASSWORD_CHANGE_CONFLICT')

    const user = db.one<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', USER_ID)!
    assert.equal(await verifyPassword(user.password_hash, winner.nextPassword, PASSWORD_PEPPER), true)
    assert.equal(await verifyPassword(user.password_hash, loser.nextPassword, PASSWORD_PEPPER), false)
    assert.equal(db.one<{ count: number }>(`SELECT COUNT(*) AS count FROM audit_events WHERE action = 'change-password'`)!.count, 1)
    assert.equal(db.one<{ count: number }>(`SELECT COUNT(*) AS count FROM auth_sessions WHERE user_id = ? AND revoked_at IS NULL`, USER_ID)!.count, 1)
    assert.equal((await request(db, '/api/v1/auth/me', { headers: sessionHeaders(winner.session) })).status, 200)
    assert.equal((await request(db, '/api/v1/auth/me', { headers: sessionHeaders(loser.session) })).status, 401)
  } finally { db.close() }
})

test('缺失幂等键时在任何密码校验和数据库写入之前被拒绝', async () => {
  const db = await migratedTestDatabase()
  try {
    await seedUser(db)
    const loginResult = await login(db)
    assert.ok(loginResult.session)
    const before = db.one<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', USER_ID)!.password_hash

    const response = await request(db, '/api/v1/auth/change-password', {
      method: 'POST',
      headers: sessionHeaders(loginResult.session!, true),
      body: JSON.stringify({ currentPassword: CURRENT_PASSWORD, nextPassword: NEXT_PASSWORD })
    })
    assert.equal(response.status, 400)
    assert.equal((await response.json() as any).error, 'IDEMPOTENCY_KEY_REQUIRED')
    assert.equal(db.one<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', USER_ID)!.password_hash, before)
    assert.equal(db.one<{ count: number }>('SELECT COUNT(*) AS count FROM idempotency_requests WHERE user_id = ?', USER_ID)!.count, 0)
  } finally { db.close() }
})

test('密码复用与缺失 CSRF 都被拒绝且不产生改密副作用', async () => {
  const db = await migratedTestDatabase()
  try {
    await seedUser(db)
    const loginResult = await login(db)
    assert.ok(loginResult.session)
    const before = db.one<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', USER_ID)!.password_hash

    const reused = await changePassword(db, loginResult.session!, CURRENT_PASSWORD, CURRENT_PASSWORD)
    assert.equal(reused.status, 400)
    assert.equal((await reused.json() as any).error, 'PASSWORD_REUSE')

    const missingCsrf = await changePassword(db, loginResult.session!, CURRENT_PASSWORD, NEXT_PASSWORD, { includeCsrf: false, key: '00000000-0000-4000-8000-000000000005' })
    assert.equal(missingCsrf.status, 403)
    assert.equal((await missingCsrf.json() as any).error, 'INVALID_CSRF')

    assert.equal(db.one<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', USER_ID)!.password_hash, before)
    assert.equal(db.one<{ count: number }>(`SELECT COUNT(*) AS count FROM audit_events WHERE action = 'change-password'`)!.count, 0)
  } finally { db.close() }
})
