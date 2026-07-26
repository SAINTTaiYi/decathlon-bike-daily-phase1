import assert from 'node:assert/strict'
import test from 'node:test'
import { handleRequest } from '../src/index.js'
import { getPath } from 'hono/utils/url'
import { localBusinessDate } from '@bike-ops/domain'
import type { WorkerEnv } from '../src/env.js'
import { hashPassword, keyedHash, sha256 } from '../src/lib/crypto.js'
import { encryptContact } from '../src/lib/contact-crypto.js'
import { migratedTestDatabase, TestD1Database } from './d1-test-adapter.js'

const STORE_1299 = '30000000-0000-4000-8000-000000001299'
const STORE_1670 = '30000000-0000-4000-8000-000000001670'
const STORE_0994 = '30000000-0000-4000-8000-000000000994'
const PASSWORD = 'CorrectHorseBatteryStaple!'
const STAMP = '2026-07-26T10:00:00.000Z'
const SESSION_SECRET = 'session-secret-for-isolated-security-tests-0123456789'
const CSRF_SECRET = 'csrf-secret-for-isolated-security-tests-0123456789'
const PASSWORD_PEPPER = 'pepper-for-isolated-security-tests-0123456789'
const REGISTRATION_SECRET = 'registration-secret-isolated-security-tests-0123456789'
const CONTACT_KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

function executionContext(): ExecutionContext {
  return {
    waitUntil(promise: Promise<unknown>) { void promise.catch(() => undefined) },
    passThroughOnException() {},
    props: {}
  } as ExecutionContext
}

function environment(db: TestD1Database, overrides: Partial<WorkerEnv> = {}): WorkerEnv {
  return {
    DB: db as unknown as D1Database,
    ASSETS: { fetch: async () => new Response('asset', { status: 200 }) } as Fetcher,
    APP_ENV: 'staging',
    APP_VERSION: '5.7.8',
    GIT_SHA: 'security-audit',
    COOKIE_SECURE: 'true',
    SESSION_TTL_HOURS: '12',
    CORS_ALLOWED_ORIGINS: 'https://bike-ops-preview.geeklightonefish.workers.dev',
    SESSION_SECRET,
    CSRF_SECRET,
    PASSWORD_PEPPER,
    CONTACT_ENCRYPTION_KEY: CONTACT_KEY,
    PLATFORM_ADMIN_SETUP_TOKEN_HASH: 'a'.repeat(64),
    REGISTRATION_SECRET,
    RESEND_API_KEY: 're_test_isolated_only',
    RESEND_FROM: 'Workshop <security@example.com>',
    ...overrides
  }
}

async function seedUser(db: TestD1Database, input: {
  id: string
  username: string
  storeId: string
  role?: 'operator' | 'manager' | 'admin'
  email?: string | null
  platformAdmin?: boolean
}): Promise<void> {
  const passwordHash = await hashPassword(PASSWORD, PASSWORD_PEPPER)
  db.sqlite.prepare(`
    INSERT INTO users (
      id, username_key, display_name, email_key, password_hash, status,
      must_change_password, failed_login_count, is_platform_admin, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'active', 0, 0, ?, ?, ?)
  `).run(
    input.id,
    input.username.toLocaleLowerCase('en-US'),
    input.username,
    input.email ?? null,
    passwordHash,
    input.platformAdmin ? 1 : 0,
    STAMP,
    STAMP
  )
  db.sqlite.prepare(`
    INSERT INTO store_members (id, store_id, user_id, role, status, effective_from, created_at)
    VALUES (?, ?, ?, ?, 'active', ?, ?)
  `).run(`membership-${input.id}`, input.storeId, input.id, input.role ?? 'operator', STAMP, STAMP)
}

async function seedSession(db: TestD1Database, userId: string, token: string, csrf: string): Promise<void> {
  const tokenHash = await keyedHash(token, SESSION_SECRET)
  const csrfHash = await keyedHash(csrf, CSRF_SECRET)
  db.sqlite.prepare(`
    INSERT INTO auth_sessions (token_hash, csrf_hash, user_id, expires_at, last_seen_at, created_at, user_agent)
    VALUES (?, ?, ?, ?, ?, ?, 'security-audit')
  `).run(tokenHash, csrfHash, userId, '2099-01-01T00:00:00.000Z', STAMP, STAMP)
}

function headers(token?: string, csrf?: string, storeId?: string): HeadersInit {
  return {
    ...(token ? { cookie: `__Host-bike_ops_session=${token}` } : {}),
    ...(csrf ? { 'x-csrf-token': csrf } : {}),
    ...(storeId ? { 'x-store-id': storeId } : {}),
    origin: 'https://bike-ops-preview.geeklightonefish.workers.dev'
  }
}

async function request(db: TestD1Database, path: string, init: RequestInit = {}, envOverrides: Partial<WorkerEnv> = {}): Promise<Response> {
  return requestUrl(db, `https://bike-ops-preview.geeklightonefish.workers.dev${path}`, init, envOverrides)
}

async function requestUrl(db: TestD1Database, url: string, init: RequestInit = {}, envOverrides: Partial<WorkerEnv> = {}): Promise<Response> {
  return handleRequest(
    new Request(url, init),
    environment(db, envOverrides),
    executionContext()
  )
}

async function json(response: Response): Promise<any> {
  return response.json().catch(() => null)
}

function seedWorkItem(db: TestD1Database, input: { id: string; storeId: string; userId: string; ticketNo: number; title: string }): void {
  db.sqlite.prepare(`
    INSERT INTO work_items (
      id, store_id, ticket_no, kind, title, detail, meta, status, lifecycle, revision,
      created_by, updated_by, created_at, updated_at
    ) VALUES (?, ?, ?, 'handover', ?, 'detail', '', '待处理', 'active', 1, ?, ?, ?, ?)
  `).run(input.id, input.storeId, input.ticketNo, input.title, input.userId, input.userId, STAMP, STAMP)
  db.sqlite.prepare('INSERT INTO handover_details (work_item_id) VALUES (?)').run(input.id)
}

async function seedRepairWorkItem(db: TestD1Database, input: { id: string; storeId: string; userId: string; ticketNo: number; title: string }): Promise<void> {
  db.sqlite.prepare(`
    INSERT INTO work_items (
      id, store_id, ticket_no, kind, title, detail, meta, status, lifecycle, revision,
      created_by, updated_by, created_at, updated_at
    ) VALUES (?, ?, ?, 'repair', ?, '初始维修项目', '付费', '维修中', 'active', 1, ?, ?, ?, ?)
  `).run(input.id, input.storeId, input.ticketNo, input.title, input.userId, input.userId, STAMP, STAMP)
  db.sqlite.prepare(`
    INSERT INTO repair_details (
      work_item_id, contact_type, contact_ciphertext, contact_fingerprint,
      repair_type, repair_project, pickup_date, repair_status
    ) VALUES (?, 'phone', ?, NULL, '付费', '初始维修项目', '2026-07-27', '维修中')
  `).run(input.id, await encryptContact('13900000000', CONTACT_KEY))
}

test('跨门店会话伪造、记录读取和直接 ID 修改均被服务端门店范围拒绝', async () => {
  const db = await migratedTestDatabase()
  try {
    await seedUser(db, { id: 'user-a', username: 'USERA', storeId: STORE_1299 })
    await seedUser(db, { id: 'user-b', username: 'USERB', storeId: STORE_1670 })
    await seedSession(db, 'user-a', 'token-a', 'csrf-a')
    seedWorkItem(db, { id: 'item-a', storeId: STORE_1299, userId: 'user-a', ticketNo: 1, title: '1299 only' })
    seedWorkItem(db, { id: 'item-b', storeId: STORE_1670, userId: 'user-b', ticketNo: 1, title: '1670 secret' })

    const own = await request(db, '/api/v1/work-items', { headers: headers('token-a', undefined, STORE_1299) })
    assert.equal(own.status, 200)
    assert.deepEqual((await json(own)).records.map((record: any) => record.id), ['item-a'])

    const forgedStore = await request(db, '/api/v1/work-items', { headers: headers('token-a', undefined, STORE_1670) })
    assert.equal(forgedStore.status, 401)

    const update = await request(db, '/api/v1/work-items/item-b', {
      method: 'PATCH',
      headers: {
        ...headers('token-a', 'csrf-a', STORE_1299),
        'content-type': 'application/json',
        'idempotency-key': '11111111-1111-4111-8111-111111111111'
      },
      body: JSON.stringify({ expectedRevision: 1, values: { title: 'stolen', detail: 'stolen', meta: '', status: 'stolen' } })
    })
    assert.equal(update.status, 404)
    assert.equal(db.one<{ title: string }>('SELECT title FROM work_items WHERE id = ?', 'item-b')?.title, '1670 secret')
  } finally {
    db.close()
  }
})

test('跨门店审计事件无法被其它门店账号撤回', async () => {
  const db = await migratedTestDatabase()
  try {
    await seedUser(db, { id: 'user-a', username: 'USERA', storeId: STORE_1299 })
    await seedUser(db, { id: 'user-b', username: 'USERB', storeId: STORE_1670 })
    await seedSession(db, 'user-a', 'token-a', 'csrf-a')
    seedWorkItem(db, { id: 'item-b', storeId: STORE_1670, userId: 'user-b', ticketNo: 1, title: '1670 secret' })
    db.sqlite.prepare(`
      INSERT INTO audit_events (
        id, store_id, actor_user_id, actor_name_snapshot, action, entity_type, entity_id,
        entity_revision, business_date, summary, before_state, after_state, reversible,
        request_id, audit_module, created_at
      ) VALUES ('audit-b', ?, 'user-b', 'USERB', 'edit-record', 'work-item', 'item-b', 1,
        '2026-07-26', 'foreign event', NULL, NULL, 1,
        '22222222-2222-4222-8222-222222222222', 'handover', ?)
    `).run(STORE_1670, STAMP)

    const response = await request(db, '/api/v1/audit-events/audit-b/undo', {
      method: 'POST',
      headers: {
        ...headers('token-a', 'csrf-a', STORE_1299),
        'content-type': 'application/json',
        'idempotency-key': '33333333-3333-4333-8333-333333333333'
      },
      body: '{}'
    })
    assert.equal(response.status, 409)
    assert.equal(db.one<{ lifecycle: string }>('SELECT lifecycle FROM work_items WHERE id = ?', 'item-b')?.lifecycle, 'active')
    assert.equal(db.one<{ count: number }>('SELECT COUNT(*) AS count FROM audit_events WHERE reverted_event_id = ?', 'audit-b')?.count, 0)
  } finally {
    db.close()
  }
})

test('安全要求：并发五次错误登录必须累计到锁定阈值', async () => {
  const db = await migratedTestDatabase()
  try {
    await seedUser(db, { id: 'race-login', username: 'RACELOGIN', storeId: STORE_1299 })
    db.barrier(/FROM users WHERE username_key = \?/u, 5)
    const responses = await Promise.all(Array.from({ length: 5 }, () => request(db, '/api/v1/auth/login', {
      method: 'POST',
      headers: { origin: 'https://bike-ops-preview.geeklightonefish.workers.dev', 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'RACELOGIN', password: 'wrong-password' })
    })))
    assert.deepEqual(responses.map((response) => response.status), [401, 401, 401, 401, 401])
    const user = db.one<{ failed_login_count: number; locked_until: string | null }>('SELECT failed_login_count, locked_until FROM users WHERE id = ?', 'race-login')!
    assert.equal(user.failed_login_count, 5)
    assert.ok(user.locked_until && Date.parse(user.locked_until) > Date.now())
  } finally {
    db.close()
  }
})

test('安全要求：并发五次错误 OTP 必须原子耗尽尝试次数并使 challenge 过期', async () => {
  const db = await migratedTestDatabase()
  try {
    const challengeId = '44444444-4444-4444-8444-444444444444'
    const otpHash = await keyedHash(`${challengeId}:123456`, REGISTRATION_SECRET)
    db.sqlite.prepare(`
      INSERT INTO registration_challenges (
        id, email_key, username_key, display_name, store_id, otp_hash, client_hash,
        status, attempts, resend_count, expires_at, created_at, updated_at
      ) VALUES (?, 'race@decathlon.com', 'raceotp', 'RACEOTP', ?, ?, 'client', 'pending', 0, 1, ?, ?, ?)
    `).run(challengeId, STORE_1299, otpHash, '2099-01-01T00:00:00.000Z', STAMP, STAMP)
    db.barrier(/FROM registration_challenges WHERE id = \?/u, 5)
    const responses = await Promise.all(Array.from({ length: 5 }, () => request(db, '/api/v1/registration/verify-otp', {
      method: 'POST',
      headers: { origin: 'https://bike-ops-preview.geeklightonefish.workers.dev', 'content-type': 'application/json' },
      body: JSON.stringify({ challengeId, otp: '000000' })
    })))
    assert.deepEqual(responses.map((response) => response.status), [400, 400, 400, 400, 400])
    const challenge = db.one<{ attempts: number; status: string }>('SELECT attempts, status FROM registration_challenges WHERE id = ?', challengeId)!
    assert.equal(challenge.attempts, 5)
    assert.equal(challenge.status, 'expired')
  } finally {
    db.close()
  }
})

test('安全要求：OTP 请求响应不能泄露邮箱或 Profile 是否已注册', async () => {
  const db = await migratedTestDatabase()
  const originalFetch = globalThis.fetch
  try {
    await seedUser(db, { id: 'existing', username: 'EXISTING', storeId: STORE_1299, email: 'existing@decathlon.com' })
    globalThis.fetch = async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
    const commonHeaders = { origin: 'https://bike-ops-preview.geeklightonefish.workers.dev', 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.10' }
    const existing = await request(db, '/api/v1/registration/otp', {
      method: 'POST', headers: commonHeaders,
      body: JSON.stringify({ username: 'FRESHNAME', email: 'existing@decathlon.com', storeId: STORE_1299 })
    })
    const fresh = await request(db, '/api/v1/registration/otp', {
      method: 'POST', headers: commonHeaders,
      body: JSON.stringify({ username: 'FRESHNAME', email: 'fresh@decathlon.com', storeId: STORE_1299 })
    })
    assert.equal(existing.status, 200)
    assert.equal(fresh.status, 200)
    assert.deepEqual(Object.keys(await json(existing)).sort(), Object.keys(await json(fresh)).sort())
  } finally {
    globalThis.fetch = originalFetch
    db.close()
  }
})

test('安全要求：唯一平台管理员不能停用自己当前且唯一可管理的门店', async () => {
  const db = await migratedTestDatabase()
  try {
    await seedUser(db, { id: 'chu13-user', username: 'CHU13', storeId: STORE_1299, role: 'admin', platformAdmin: true })
    await seedSession(db, 'chu13-user', 'chu-token', 'chu-csrf')
    const response = await request(db, `/api/v1/governance/directory/stores/${STORE_1299}`, {
      method: 'PATCH',
      headers: { ...headers('chu-token', 'chu-csrf', STORE_1299), 'content-type': 'application/json' },
      body: JSON.stringify({ name: '五象店', status: 'disabled' })
    })
    assert.ok(response.status >= 400)
    assert.equal(db.one<{ status: string }>('SELECT status FROM stores WHERE id = ?', STORE_1299)?.status, 'active')
  } finally {
    db.close()
  }
})

test('安全基线：登录 Cookie 属性完整，API 响应显式禁止缓存并发送防嗅探头', async () => {
  const db = await migratedTestDatabase()
  try {
    await seedUser(db, { id: 'cookie-user', username: 'COOKIEUSER', storeId: STORE_0994 })
    const login = await request(db, '/api/v1/auth/login', {
      method: 'POST',
      headers: { origin: 'https://bike-ops-preview.geeklightonefish.workers.dev', 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'COOKIEUSER', password: PASSWORD })
    })
    assert.equal(login.status, 200)
    const cookie = login.headers.get('set-cookie') ?? ''
    assert.match(cookie, /^__Host-bike_ops_session=/u)
    assert.match(cookie, /; Path=\//u)
    assert.match(cookie, /; HttpOnly/u)
    assert.match(cookie, /; SameSite=Lax/u)
    assert.match(cookie, /; Secure/u)
    assert.doesNotMatch(cookie, /Domain=/iu)
    assert.match(login.headers.get('cache-control') ?? '', /no-store/iu)
    assert.equal(login.headers.get('x-content-type-options'), 'nosniff')
  } finally {
    db.close()
  }
})

test('非平台管理员不能修改目录，非目标门店管理员不能审批调店', async () => {
  const db = await migratedTestDatabase()
  try {
    await seedUser(db, { id: 'operator-a', username: 'OPERATORA', storeId: STORE_1299, role: 'operator' })
    await seedUser(db, { id: 'admin-a', username: 'ADMINA', storeId: STORE_1299, role: 'admin' })
    await seedUser(db, { id: 'admin-b', username: 'ADMINB', storeId: STORE_1670, role: 'admin' })
    await seedSession(db, 'admin-a', 'admin-a-token', 'admin-a-csrf')
    await seedSession(db, 'operator-a', 'operator-token', 'operator-csrf')
    db.sqlite.prepare(`
      INSERT INTO store_transfer_requests (
        id, user_id, source_store_id, target_store_id, reason, status,
        expires_at, revision, created_at, updated_at
      ) VALUES ('transfer-b', 'operator-a', ?, ?, 'security test', 'pending',
        '2099-01-01T00:00:00.000Z', 1, ?, ?)
    `).run(STORE_1299, STORE_1670, STAMP, STAMP)

    const directory = await request(db, `/api/v1/governance/directory/stores/${STORE_1670}`, {
      method: 'PATCH',
      headers: { ...headers('operator-token', 'operator-csrf', STORE_1299), 'content-type': 'application/json' },
      body: JSON.stringify({ name: '民族东店', status: 'disabled' })
    })
    assert.equal(directory.status, 403)
    assert.equal(db.one<{ status: string }>('SELECT status FROM stores WHERE id = ?', STORE_1670)?.status, 'active')

    const decision = await request(db, '/api/v1/governance/transfer-requests/transfer-b/decision', {
      method: 'POST',
      headers: { ...headers('admin-a-token', 'admin-a-csrf', STORE_1299), 'content-type': 'application/json' },
      body: JSON.stringify({ approve: true, reason: 'not my target store', expectedRevision: 1 })
    })
    assert.equal(decision.status, 403)
    assert.equal(db.one<{ status: string }>('SELECT status FROM store_transfer_requests WHERE id = ?', 'transfer-b')?.status, 'pending')
    assert.equal(db.one<{ store_id: string }>("SELECT store_id FROM store_members WHERE user_id = 'operator-a' AND status = 'active'")?.store_id, STORE_1299)
  } finally {
    db.close()
  }
})

test('安全要求：幂等键在成功响应后必须返回已缓存结果，而不是触发唯一约束错误', async () => {
  const db = await migratedTestDatabase()
  try {
    await seedUser(db, { id: 'idem-user', username: 'IDEMUSER', storeId: STORE_1299 })
    await seedSession(db, 'idem-user', 'idem-token', 'idem-csrf')
    const idempotencyKey = '55555555-5555-4555-8555-555555555555'
    const makeRequest = () => request(db, '/api/v1/work-items', {
      method: 'POST',
      headers: {
        ...headers('idem-token', 'idem-csrf', STORE_1299),
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey
      },
      body: JSON.stringify({ scene: 'poster', values: { title: '幂等测试', detail: '只应创建一次', meta: '', status: '待处理' } })
    })
    const firstResponse = await makeRequest()
    const secondResponse = await makeRequest()
    assert.equal(firstResponse.status, 201)
    assert.equal(secondResponse.status, 201)
    assert.equal(db.one<{ count: number }>("SELECT COUNT(*) AS count FROM work_items WHERE title = '幂等测试'")?.count, 1)
  } finally {
    db.close()
  }
})

test('安全要求：失败写操作不得永久占用幂等键形成自我拒绝服务', async () => {
  const db = await migratedTestDatabase()
  try {
    await seedUser(db, { id: 'idem-fail-user', username: 'IDEMFAIL', storeId: STORE_1299 })
    await seedSession(db, 'idem-fail-user', 'idem-fail-token', 'idem-fail-csrf')
    const idempotencyKey = '66666666-6666-4666-8666-666666666666'
    const makeRequest = () => request(db, '/api/v1/work-items/not-found', {
      method: 'PATCH',
      headers: {
        ...headers('idem-fail-token', 'idem-fail-csrf', STORE_1299),
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey
      },
      body: JSON.stringify({ expectedRevision: 1, values: { title: '不存在', detail: '不存在', meta: '', status: '不存在' } })
    })
    const firstResponse = await makeRequest()
    const secondResponse = await makeRequest()
    assert.equal(firstResponse.status, 404)
    assert.equal(secondResponse.status, 404)
  } finally {
    db.close()
  }
})

test('安全要求：攻击者不能通过五次顺序错误密码远程锁死唯一平台管理员', async () => {
  const db = await migratedTestDatabase()
  try {
    await seedUser(db, { id: 'chu-lock', username: 'CHU13', storeId: STORE_1299, role: 'admin', platformAdmin: true })
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await request(db, '/api/v1/auth/login', {
        method: 'POST',
        headers: { origin: 'https://bike-ops-preview.geeklightonefish.workers.dev', 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'CHU13', password: 'wrong-password' })
      })
      assert.equal(response.status, 401)
    }
    const valid = await request(db, '/api/v1/auth/login', {
      method: 'POST',
      headers: { origin: 'https://bike-ops-preview.geeklightonefish.workers.dev', 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'CHU13', password: PASSWORD })
    })
    assert.equal(valid.status, 200)
  } finally {
    db.close()
  }
})

test('安全要求：超大 JSON 在完整解析前应由明确请求体上限返回 413', async () => {
  const db = await migratedTestDatabase()
  try {
    const response = await request(db, '/api/v1/auth/login', {
      method: 'POST',
      headers: { origin: 'https://bike-ops-preview.geeklightonefish.workers.dev', 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'nobody', password: 'x', padding: 'a'.repeat(2 * 1024 * 1024) })
    })
    assert.equal(response.status, 413)
  } finally {
    db.close()
  }
})


test('Session/CSRF 基线：CSRF 不能跨 Session 复用，登出后旧 Session 必须立即失效', async () => {
  const db = await migratedTestDatabase()
  try {
    await seedUser(db, { id: 'csrf-user', username: 'CSRFUSER', storeId: STORE_1299 })
    await seedSession(db, 'csrf-user', 'session-a', 'csrf-a')
    await seedSession(db, 'csrf-user', 'session-b', 'csrf-b')

    const crossSession = await request(db, '/api/v1/users', {
      method: 'POST',
      headers: { ...headers('session-a', 'csrf-b', STORE_1299), 'content-type': 'application/json' },
      body: '{}'
    })
    assert.equal(crossSession.status, 403)

    const ownSession = await request(db, '/api/v1/users', {
      method: 'POST',
      headers: { ...headers('session-a', 'csrf-a', STORE_1299), 'content-type': 'application/json' },
      body: '{}'
    })
    assert.equal(ownSession.status, 410)

    const logout = await request(db, '/api/v1/auth/logout', {
      method: 'POST',
      headers: { ...headers('session-a', 'csrf-a', STORE_1299), 'content-type': 'application/json' },
      body: '{}'
    })
    assert.equal(logout.status, 204)
    assert.ok(db.one<{ revoked_at: string | null }>('SELECT revoked_at FROM auth_sessions WHERE token_hash = ?', await keyedHash('session-a', SESSION_SECRET))?.revoked_at)

    const afterLogout = await request(db, '/api/v1/auth/me', { headers: headers('session-a', undefined, STORE_1299) })
    assert.equal(afterLogout.status, 401)
  } finally {
    db.close()
  }
})

test('安全要求：同一 Session 的多个标签页恢复后，已下发 CSRF 令牌不能互相失效', async () => {
  const db = await migratedTestDatabase()
  try {
    await seedUser(db, { id: 'tabs-user', username: 'TABSUSER', storeId: STORE_1299 })
    await seedSession(db, 'tabs-user', 'tabs-session', 'initial-csrf')

    const firstRestore = await request(db, '/api/v1/auth/me', { headers: headers('tabs-session', undefined, STORE_1299) })
    const secondRestore = await request(db, '/api/v1/auth/me', { headers: headers('tabs-session', undefined, STORE_1299) })
    assert.equal(firstRestore.status, 200)
    assert.equal(secondRestore.status, 200)
    const firstCsrf = (await json(firstRestore)).csrfToken as string
    const secondCsrf = (await json(secondRestore)).csrfToken as string
    assert.notEqual(firstCsrf, secondCsrf)

    const firstTabWrite = await request(db, '/api/v1/users', {
      method: 'POST',
      headers: { ...headers('tabs-session', firstCsrf, STORE_1299), 'content-type': 'application/json' },
      body: '{}'
    })
    const secondTabWrite = await request(db, '/api/v1/users', {
      method: 'POST',
      headers: { ...headers('tabs-session', secondCsrf, STORE_1299), 'content-type': 'application/json' },
      body: '{}'
    })
    assert.equal(firstTabWrite.status, 410)
    assert.equal(secondTabWrite.status, 410)
  } finally {
    db.close()
  }
})

test('审计基线：维修联系方式只以密文进入审计快照，不得出现明文', async () => {
  const db = await migratedTestDatabase()
  try {
    await seedUser(db, { id: 'audit-contact-user', username: 'AUDITCONTACT', storeId: STORE_1299 })
    await seedSession(db, 'audit-contact-user', 'audit-contact-token', 'audit-contact-csrf')
    const phone = '13812345678'
    const response = await request(db, '/api/v1/work-items', {
      method: 'POST',
      headers: {
        ...headers('audit-contact-token', 'audit-contact-csrf', STORE_1299),
        'content-type': 'application/json',
        'idempotency-key': '77777777-7777-4777-8777-777777777777'
      },
      body: JSON.stringify({
        scene: 'repair',
        values: {
          title: '联系方式审计', contactType: 'phone', contactValue: phone,
          repairType: '付费', repairProject: '更换刹车线', pickupDate: '2026-07-27', status: '维修中'
        }
      })
    })
    assert.equal(response.status, 201)
    const audit = db.one<{ before_state: string | null; after_state: string | null }>(
      "SELECT before_state, after_state FROM audit_events WHERE action = 'add-record' ORDER BY created_at DESC LIMIT 1"
    )!
    assert.doesNotMatch(`${audit.before_state ?? ''}${audit.after_state ?? ''}`, new RegExp(phone, 'u'))
    assert.match(audit.after_state ?? '', /contactCiphertext/u)
  } finally {
    db.close()
  }
})

test('审计基线：历史 API 不直接返回 before/after 快照中的敏感字段', async () => {
  const db = await migratedTestDatabase()
  try {
    await seedUser(db, { id: 'audit-api-user', username: 'AUDITAPI', storeId: STORE_1299 })
    await seedSession(db, 'audit-api-user', 'audit-api-token', 'audit-api-csrf')
    db.sqlite.prepare(`
      INSERT INTO audit_events (
        id, store_id, actor_user_id, actor_name_snapshot, action, entity_type, entity_id,
        entity_revision, business_date, summary, before_state, after_state, reversible,
        request_id, audit_module, created_at
      ) VALUES ('audit-sensitive-api', ?, 'audit-api-user', 'AUDITAPI', 'edit-record', 'work-item', 'item-sensitive', 2,
        '2026-07-26', '敏感快照边界测试', ?, ?, 0,
        '89999999-9999-4999-8999-999999999999', 'repair', ?)
    `).run(
      STORE_1299,
      JSON.stringify({ email: 'before.secret@decathlon.com', contactValue: '13800000000' }),
      JSON.stringify({ email: 'after.secret@decathlon.com', contactValue: '13900000000' }),
      STAMP
    )

    const response = await request(db, '/api/v1/audit-events/history', {
      headers: headers('audit-api-token', undefined, STORE_1299)
    })
    assert.equal(response.status, 200)
    const text = await response.text()
    assert.doesNotMatch(text, /before\.secret@decathlon\.com|after\.secret@decathlon\.com|13800000000|13900000000/u)
    const event = JSON.parse(text).events.find((candidate: any) => candidate.id === 'audit-sensitive-api')
    assert.ok(event)
    assert.equal('beforeState' in event, false)
    assert.equal('afterState' in event, false)
  } finally {
    db.close()
  }
})

test('安全要求：账号注册审计不得永久保存完整公司邮箱明文', async () => {
  const db = await migratedTestDatabase()
  try {
    const challengeId = '88888888-8888-4888-8888-888888888888'
    const completionToken = 'completion-token-for-sensitive-audit-test-0123456789'
    const completionHash = await keyedHash(`${challengeId}:${completionToken}`, REGISTRATION_SECRET)
    const email = 'sensitive.registration@decathlon.com'
    db.sqlite.prepare(`
      INSERT INTO registration_challenges (
        id, email_key, username_key, display_name, store_id, otp_hash, completion_token_hash,
        client_hash, status, attempts, resend_count, expires_at, created_at, updated_at, verified_at
      ) VALUES (?, ?, 'sensitiveprofile', 'SENSITIVEPROFILE', ?, ?, ?, 'client', 'verified', 0, 1,
        '2099-01-01T00:00:00.000Z', ?, ?, ?)
    `).run(challengeId, email, STORE_1299, 'a'.repeat(64), completionHash, STAMP, STAMP, STAMP)

    const response = await request(db, '/api/v1/registration/complete', {
      method: 'POST',
      headers: { origin: 'https://bike-ops-preview.geeklightonefish.workers.dev', 'content-type': 'application/json' },
      body: JSON.stringify({ challengeId, completionToken, password: PASSWORD })
    })
    assert.equal(response.status, 201)
    const audit = db.one<{ after_state: string | null }>(
      "SELECT after_state FROM audit_events WHERE action = 'self-register' ORDER BY created_at DESC LIMIT 1"
    )!
    assert.doesNotMatch(audit.after_state ?? '', new RegExp(email.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'))
  } finally {
    db.close()
  }
})

test('业务并发基线：普通交接记录的同 revision 并发编辑只能成功一次', async () => {
  const db = await migratedTestDatabase()
  try {
    await seedUser(db, { id: 'generic-race-user', username: 'GENERICRACE', storeId: STORE_1299 })
    await seedSession(db, 'generic-race-user', 'generic-race-token', 'generic-race-csrf')
    seedWorkItem(db, { id: 'generic-race-item', storeId: STORE_1299, userId: 'generic-race-user', ticketNo: 1, title: '原始交接' })
    db.barrier(/SELECT \* FROM work_items WHERE store_id = \? AND id = \?/u, 2)

    const edit = (suffix: string, key: string) => request(db, '/api/v1/work-items/generic-race-item', {
      method: 'PATCH',
      headers: {
        ...headers('generic-race-token', 'generic-race-csrf', STORE_1299),
        'content-type': 'application/json',
        'idempotency-key': key
      },
      body: JSON.stringify({ expectedRevision: 1, values: { title: `并发交接-${suffix}`, detail: `详情-${suffix}`, meta: '', status: '待处理' } })
    })
    const responses = await Promise.all([
      edit('A', '91111111-1111-4111-8111-111111111111'),
      edit('B', '92222222-2222-4222-8222-222222222222')
    ])
    assert.deepEqual(responses.map((response) => response.status).sort((a, b) => a - b), [200, 409])
    const item = db.one<{ title: string; revision: number }>('SELECT title, revision FROM work_items WHERE id = ?', 'generic-race-item')!
    assert.ok(['并发交接-A', '并发交接-B'].includes(item.title))
    assert.equal(item.revision, 2)
    assert.equal(db.one<{ count: number }>("SELECT COUNT(*) AS count FROM audit_events WHERE action = 'edit-record' AND entity_id = 'generic-race-item'")?.count, 1)
  } finally {
    db.close()
  }
})

test('业务并发基线：同门店并发新增必须分配唯一连续工单号', async () => {
  const db = await migratedTestDatabase()
  try {
    await seedUser(db, { id: 'ticket-race-user', username: 'TICKETRACE', storeId: STORE_1299 })
    await seedSession(db, 'ticket-race-user', 'ticket-race-token', 'ticket-race-csrf')
    const create = (index: number) => request(db, '/api/v1/work-items', {
      method: 'POST',
      headers: {
        ...headers('ticket-race-token', 'ticket-race-csrf', STORE_1299),
        'content-type': 'application/json',
        'idempotency-key': `a${String(index).repeat(7)}-${String(index).repeat(4)}-4${String(index).repeat(3)}-8${String(index).repeat(3)}-${String(index).repeat(12)}`
      },
      body: JSON.stringify({
        scene: 'poster',
        values: { title: `并发新增-${index}`, detail: `详情-${index}`, meta: '', status: '待处理' }
      })
    })
    const responses = await Promise.all([1, 2, 3, 4, 5].map(create))
    assert.deepEqual(responses.map((response) => response.status), [201, 201, 201, 201, 201])
    assert.deepEqual(
      db.query<{ ticket_no: number }>('SELECT ticket_no FROM work_items WHERE store_id = ? ORDER BY ticket_no', STORE_1299).map((row) => row.ticket_no),
      [1, 2, 3, 4, 5]
    )
    assert.equal(db.one<{ count: number }>('SELECT COUNT(DISTINCT ticket_no) AS count FROM work_items WHERE store_id = ?', STORE_1299)?.count, 5)
  } finally {
    db.close()
  }
})

test('安全要求：维修并发编辑失败时不得留下与主记录不一致的子表改动', async () => {
  const db = await migratedTestDatabase()
  try {
    await seedUser(db, { id: 'repair-race-user', username: 'REPAIRRACE', storeId: STORE_1299 })
    await seedSession(db, 'repair-race-user', 'repair-race-token', 'repair-race-csrf')
    await seedRepairWorkItem(db, { id: 'repair-race-item', storeId: STORE_1299, userId: 'repair-race-user', ticketNo: 1, title: '原始维修' })
    const gate = db.readGate(/SELECT \* FROM work_items WHERE store_id = \? AND id = \?/u, 1)

    const edit = (title: string, project: string, contact: string, key: string) => request(db, '/api/v1/work-items/repair-race-item', {
      method: 'PATCH',
      headers: {
        ...headers('repair-race-token', 'repair-race-csrf', STORE_1299),
        'content-type': 'application/json',
        'idempotency-key': key
      },
      body: JSON.stringify({
        expectedRevision: 1,
        values: {
          title, contactType: 'phone', contactValue: contact,
          repairType: '付费', repairProject: project, pickupDate: '2026-07-27', status: '维修中'
        }
      })
    })

    const staleRequest = edit('第一请求标题', '第一请求维修项目', '13800000001', '93333333-3333-4333-8333-333333333333')
    await gate.entered
    const winner = await edit('第二请求标题', '第二请求维修项目', '13800000002', '94444444-4444-4444-8444-444444444444')
    gate.release()
    const stale = await staleRequest

    assert.equal(winner.status, 200)
    assert.equal(stale.status, 409)
    const finalState = db.one<{ title: string; detail: string; revision: number; repair_project: string }>(`
      SELECT w.title, w.detail, w.revision, r.repair_project
      FROM work_items w JOIN repair_details r ON r.work_item_id = w.id
      WHERE w.id = 'repair-race-item'
    `)!
    assert.deepEqual({ ...finalState }, {
      title: '第二请求标题',
      detail: '第二请求维修项目',
      revision: 2,
      repair_project: '第二请求维修项目'
    })
  } finally {
    db.close()
  }
})

test('闭店原子守卫覆盖新增、编辑、业务动作、通知、取车、删除和审计撤回', async () => {
  const db = await migratedTestDatabase()
  try {
    await seedUser(db, { id: 'closed-guard-user', username: 'CLOSEDGUARD', storeId: STORE_1299 })
    await seedSession(db, 'closed-guard-user', 'closed-guard-token', 'closed-guard-csrf')
    const businessDate = localBusinessDate('Asia/Shanghai')
    db.sqlite.prepare(`
      INSERT INTO daily_closings (
        id, store_id, business_date, sales_vehicles, sales_saved_at, sales_saved_by,
        closing_status, closed_at, closed_by, revision, created_at, updated_at
      ) VALUES ('closed-guard-day', ?, ?, 1, ?, 'closed-guard-user', 'closed', ?, 'closed-guard-user', 2, ?, ?)
    `).run(STORE_1299, businessDate, STAMP, STAMP, STAMP, STAMP)

    const commonHeaders = (key: string) => ({
      ...headers('closed-guard-token', 'closed-guard-csrf', STORE_1299),
      'content-type': 'application/json',
      'idempotency-key': key
    })
    const cases: Array<{ path: string; method: string; key: string; body: unknown }> = [
      {
        path: '/api/v1/work-items', method: 'POST', key: 'b1111111-1111-4111-8111-111111111111',
        body: { scene: 'poster', values: { title: '闭店新增', detail: '不得落账', meta: '', status: '待处理' } }
      },
      {
        path: '/api/v1/work-items/missing-edit', method: 'PATCH', key: 'b2222222-2222-4222-8222-222222222222',
        body: { expectedRevision: 1, values: { title: '闭店编辑', detail: '不得落账', meta: '', status: '待处理' } }
      },
      {
        path: '/api/v1/work-items/missing-action/complete-handover', method: 'POST', key: 'b3333333-3333-4333-8333-333333333333',
        body: { expectedRevision: 1 }
      },
      {
        path: '/api/v1/work-items/missing-notification/notification', method: 'POST', key: 'b4444444-4444-4444-8444-444444444444',
        body: { expectedRevision: 1, notificationStatus: 'notified' }
      },
      {
        path: '/api/v1/work-items/missing-pickup/pick-up', method: 'POST', key: 'b5555555-5555-4555-8555-555555555555',
        body: { expectedRevision: 1, pickupCode: '' }
      },
      {
        path: '/api/v1/work-items/missing-delete', method: 'DELETE', key: 'b6666666-6666-4666-8666-666666666666',
        body: { expectedRevision: 1 }
      },
      {
        path: '/api/v1/audit-events/missing-audit/undo', method: 'POST', key: 'b7777777-7777-4777-8777-777777777777',
        body: {}
      }
    ]

    for (const entry of cases) {
      const response = await request(db, entry.path, {
        method: entry.method,
        headers: commonHeaders(entry.key),
        body: JSON.stringify(entry.body)
      })
      assert.equal(response.status, 423, `${entry.method} ${entry.path}`)
      assert.equal((await json(response)).error, 'DAY_CLOSED')
    }
    assert.equal(db.one<{ count: number }>('SELECT COUNT(*) AS count FROM work_items WHERE store_id = ?', STORE_1299)?.count, 0)
    assert.equal(db.one<{ count: number }>('SELECT COUNT(*) AS count FROM audit_events WHERE store_id = ?', STORE_1299)?.count, 0)
  } finally {
    db.close()
  }
})

test('安全要求：写请求通过开店检查后若并发闭店，必须在提交前再次拒绝写入', async () => {
  const db = await migratedTestDatabase()
  try {
    await seedUser(db, { id: 'close-race-user', username: 'CLOSERACE', storeId: STORE_1299 })
    await seedSession(db, 'close-race-user', 'close-race-token', 'close-race-csrf')
    seedWorkItem(db, { id: 'close-race-item', storeId: STORE_1299, userId: 'close-race-user', ticketNo: 1, title: '闭店前标题' })
    const businessDate = localBusinessDate('Asia/Shanghai')
    db.sqlite.prepare(`
      INSERT INTO daily_closings (
        id, store_id, business_date, sales_vehicles, safety_checks, safety_model,
        valid_reviews, used_sold, used_received, sales_saved_at, sales_saved_by,
        closing_status, revision, created_at, updated_at
      ) VALUES ('close-race-day', ?, ?, 1, 0, '', 0, 0, 0, ?, ?, 'open', 1, ?, ?)
    `).run(STORE_1299, businessDate, STAMP, 'close-race-user', STAMP, STAMP)
    const gate = db.readGate(/SELECT closing_status FROM daily_closings WHERE store_id = \? AND business_date = \?/u, 1)

    const editPromise = request(db, '/api/v1/work-items/close-race-item', {
      method: 'PATCH',
      headers: {
        ...headers('close-race-token', 'close-race-csrf', STORE_1299),
        'content-type': 'application/json',
        'idempotency-key': '95555555-5555-4555-8555-555555555555'
      },
      body: JSON.stringify({ expectedRevision: 1, values: { title: '闭店后不应写入', detail: '闭店后不应写入', meta: '', status: '待处理' } })
    })
    await gate.entered
    const close = await request(db, '/api/v1/daily-closing/current/close', {
      method: 'POST',
      headers: {
        ...headers('close-race-token', 'close-race-csrf', STORE_1299),
        'content-type': 'application/json',
        'idempotency-key': '96666666-6666-4666-8666-666666666666'
      },
      body: '{}'
    })
    gate.release()
    const edit = await editPromise

    assert.equal(close.status, 200)
    assert.equal(db.one<{ closing_status: string }>('SELECT closing_status FROM daily_closings WHERE id = ?', 'close-race-day')?.closing_status, 'closed')
    assert.equal(db.one<{ title: string }>('SELECT title FROM work_items WHERE id = ?', 'close-race-item')?.title, '闭店前标题')
    assert.equal(edit.status, 423)
  } finally {
    db.close()
  }
})

test('安全要求：并发平台管理员初始化必须返回一个成功与一个受控冲突，不能泄漏 500', async () => {
  const db = await migratedTestDatabase()
  try {
    const setupToken = 'platform-admin-concurrency-token-0123456789'
    const setupHash = await sha256(setupToken)
    db.barrier(/SELECT COUNT\(\*\) AS count FROM users WHERE is_platform_admin = 1/u, 2)
    const initialize = (storeId: string) => request(db, '/api/v1/registration/platform-admin', {
      method: 'POST',
      headers: { origin: 'https://bike-ops-preview.geeklightonefish.workers.dev', 'content-type': 'application/json' },
      body: JSON.stringify({ token: setupToken, password: PASSWORD, storeId })
    }, { PLATFORM_ADMIN_SETUP_TOKEN_HASH: setupHash })

    const responses = await Promise.all([initialize(STORE_1299), initialize(STORE_1670)])
    assert.equal(db.one<{ count: number }>('SELECT COUNT(*) AS count FROM users WHERE is_platform_admin = 1')?.count, 1)
    assert.equal(db.one<{ count: number }>(`
      SELECT COUNT(*) AS count FROM store_members sm
      JOIN users u ON u.id = sm.user_id
      WHERE u.is_platform_admin = 1 AND sm.status = 'active' AND sm.role = 'admin'
    `)?.count, 1)
    assert.deepEqual(responses.map((response) => response.status).sort((a, b) => a - b), [201, 409])
  } finally {
    db.close()
  }
})

test('Hono 路径解析安全回归：补丁版本与 WHATWG 对畸形 absolute-form 保持一致，外层路由继续守住 API 边界', async () => {
  const db = await migratedTestDatabase()
  try {
    const makeRawRequest = (rawUrl: string, canonicalPath: string): Request => {
      const canonical = new Request(`https://bike-ops-preview.geeklightonefish.workers.dev${canonicalPath}`, {
        headers: { origin: 'https://bike-ops-preview.geeklightonefish.workers.dev' }
      })
      return new Proxy(canonical, {
        get(target, property) {
          if (property === 'url') return rawUrl
          const value = Reflect.get(target, property, target)
          return typeof value === 'function' ? value.bind(target) : value
        }
      })
    }
    const assets = {
      fetch: async () => new Response('asset-sentinel', { status: 299 })
    } as Fetcher

    const benignOuterPath = 'https://a:/foo/api/v1/work-items'
    assert.equal(new URL(benignOuterPath).pathname, '/foo/api/v1/work-items')
    assert.equal(getPath({ url: benignOuterPath } as Request), new URL(benignOuterPath).pathname)
    const outerGate = await handleRequest(
      makeRawRequest(benignOuterPath, '/foo/api/v1/work-items'),
      environment(db, { ASSETS: assets }),
      executionContext()
    )
    assert.equal(outerGate.status, 299)
    assert.equal(await outerGate.text(), 'asset-sentinel')

    const sensitiveOuterPath = 'https://a:/api/v1/work-items'
    assert.equal(new URL(sensitiveOuterPath).pathname, '/api/v1/work-items')
    assert.equal(getPath({ url: sensitiveOuterPath } as Request), new URL(sensitiveOuterPath).pathname)
    const routedApi = await handleRequest(
      makeRawRequest(sensitiveOuterPath, '/api/v1/work-items'),
      environment(db, { ASSETS: assets }),
      executionContext()
    )
    assert.equal(routedApi.status, 401)
    assert.notEqual(await routedApi.text(), 'asset-sentinel')
  } finally {
    db.close()
  }
})
