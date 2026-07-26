import assert from 'node:assert/strict'
import test from 'node:test'
import { handleRequest } from '../src/index.js'
import type { WorkerEnv } from '../src/env.js'
import { hashPassword, keyedHash } from '../src/lib/crypto.js'
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

function executionContext(): ExecutionContext {
  return {
    waitUntil(promise: Promise<unknown>) { void promise.catch(() => undefined) },
    passThroughOnException() {},
    props: {}
  } as ExecutionContext
}

function environment(db: TestD1Database): WorkerEnv {
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
    CONTACT_ENCRYPTION_KEY: 'contact-key-for-isolated-security-tests-0123456789',
    PLATFORM_ADMIN_SETUP_TOKEN_HASH: 'a'.repeat(64),
    REGISTRATION_SECRET,
    RESEND_API_KEY: 're_test_isolated_only',
    RESEND_FROM: 'Workshop <security@example.com>'
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

async function request(db: TestD1Database, path: string, init: RequestInit = {}): Promise<Response> {
  return handleRequest(
    new Request(`https://bike-ops-preview.geeklightonefish.workers.dev${path}`, init),
    environment(db),
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
