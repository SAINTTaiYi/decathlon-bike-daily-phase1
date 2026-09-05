import assert from 'node:assert/strict'
import test from 'node:test'
import { handleRequest } from '../src/index.js'
import type { WorkerEnv } from '../src/env.js'
import { keyedHash } from '../src/lib/crypto.js'
import { migratedTestDatabase, TestD1Database } from '../security/d1-test-adapter.js'

const STORE_ID = '30000000-0000-4000-8000-000000001299'
const ACTOR_ID = '31000000-0000-4000-8000-000000001301'
const ASSIGNEE_ID = '31000000-0000-4000-8000-000000001302'
const ACTOR_TOKEN = 'handover-assignee-actor-session'
const ASSIGNEE_TOKEN = 'handover-assignee-target-session'
const CSRF = 'handover-assignee-csrf'
const SESSION_SECRET = 'session-secret-for-handover-assignee-tests-0123456789'
const CSRF_SECRET = 'csrf-secret-for-handover-assignee-tests-0123456789'
const CONTACT_KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const ORIGIN = 'https://bike-ops-preview.geeklightonefish.workers.dev'
const STAMP = '2026-08-14T10:00:00.000Z'
let requestSequence = 1

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
    APP_ENV: 'preview',
    APP_VERSION: '5.9.4',
    GIT_SHA: 'handover-assignee-test',
    COOKIE_SECURE: 'true',
    SESSION_TTL_HOURS: '12',
    CORS_ALLOWED_ORIGINS: ORIGIN,
    SESSION_SECRET,
    CSRF_SECRET,
    PASSWORD_PEPPER: 'pepper-for-handover-assignee-tests-0123456789',
    CONTACT_ENCRYPTION_KEY: CONTACT_KEY,
    PLATFORM_ADMIN_SETUP_TOKEN_HASH: 'a'.repeat(64),
    REGISTRATION_SECRET: 'registration-secret-handover-assignee-tests-0123456789'
  }
}

function idempotencyKey(): string {
  return `81000000-0000-4000-8000-${String(requestSequence++).padStart(12, '0')}`
}

function headersFor(sessionToken: string): HeadersInit {
  return {
    cookie: `__Host-bike_ops_session=${sessionToken}`,
    'x-csrf-token': CSRF,
    'x-store-id': STORE_ID,
    'content-type': 'application/json',
    'idempotency-key': idempotencyKey(),
    origin: ORIGIN
  }
}

async function send(db: TestD1Database, token: string, method: string, path: string, body: unknown): Promise<Response> {
  return handleRequest(
    new Request(`${ORIGIN}${path}`, { method, headers: headersFor(token), body: JSON.stringify(body) }),
    environment(db),
    executionContext()
  )
}

async function bootstrap(db: TestD1Database, token: string): Promise<any> {
  const response = await handleRequest(
    new Request(`${ORIGIN}/api/v1/bootstrap`, { headers: { cookie: `__Host-bike_ops_session=${token}`, 'x-store-id': STORE_ID, origin: ORIGIN } }),
    environment(db),
    executionContext()
  )
  assert.equal(response.status, 200)
  return response.json()
}

async function seedIdentity(db: TestD1Database): Promise<void> {
  for (const [id, key, name] of [[ACTOR_ID, 'handover-assignee-actor', '交接指派测试甲'], [ASSIGNEE_ID, 'handover-assignee-target', '交接指派测试乙']] as const) {
    db.sqlite.prepare(`
      INSERT INTO users (id, username_key, display_name, email_key, password_hash, status, must_change_password, failed_login_count, is_platform_admin, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'unused', 'active', 0, 0, 0, ?, ?)
    `).run(id, key, name, `${key}@example.decathlon.com`, STAMP, STAMP)
    db.sqlite.prepare(`
      INSERT INTO store_members (id, store_id, user_id, role, status, effective_from, created_at)
      VALUES (?, ?, ?, 'operator', 'active', ?, ?)
    `).run(`membership-${id}`, STORE_ID, id, STAMP, STAMP)
  }
  for (const [token, userId] of [[ACTOR_TOKEN, ACTOR_ID], [ASSIGNEE_TOKEN, ASSIGNEE_ID]] as const) {
    db.sqlite.prepare(`
      INSERT INTO auth_sessions (token_hash, csrf_hash, user_id, expires_at, last_seen_at, created_at, user_agent)
      VALUES (?, ?, ?, '2099-01-01T00:00:00.000Z', ?, ?, 'handover-assignee-test')
    `).run(await keyedHash(token, SESSION_SECRET), await keyedHash(CSRF, CSRF_SECRET), userId, STAMP, STAMP)
  }
}

function handoverValues(assignedTo: string | null = null): Record<string, unknown> {
  return { title: '跟进团购车辆交付', detail: '跟进团购车辆交付', meta: '', status: '继续跟进', assignedTo }
}

test('创建交接事项时可指定交接人，被@同事的 bootstrap 待办列表包含该事项', async () => {
  const db = await migratedTestDatabase()
  try {
    await seedIdentity(db)
    const response = await send(db, ACTOR_TOKEN, 'POST', '/api/v1/work-items', { scene: 'poster', values: handoverValues(ASSIGNEE_ID) })
    const payload = await response.json() as any
    assert.equal(response.status, 201, JSON.stringify(payload))
    assert.equal(payload.record.assignedTo, ASSIGNEE_ID)
    assert.equal(payload.record.assigneeName, '交接指派测试乙')

    const mine = await bootstrap(db, ASSIGNEE_TOKEN)
    assert.ok(Array.isArray(mine.assignedToMe))
    assert.equal(mine.assignedToMe.length, 1)
    assert.equal(mine.assignedToMe[0].id, payload.record.id)
    assert.equal(mine.assignedToMe[0].assigneeName, '交接指派测试乙')
    assert.ok(mine.members.some((member: any) => member.id === ACTOR_ID && member.role === 'operator'))

    const others = await bootstrap(db, ACTOR_TOKEN)
    assert.equal(others.assignedToMe.length, 0)
  } finally {
    db.close()
  }
})

test('assign 端点指定/清除交接人并写入操作记录，完成交接后从待办消失', async () => {
  const db = await migratedTestDatabase()
  try {
    await seedIdentity(db)
    const created = await (await send(db, ACTOR_TOKEN, 'POST', '/api/v1/work-items', { scene: 'poster', values: handoverValues() })).json() as any
    assert.equal(created.record.assignedTo, undefined)

    const assigned = await (await send(db, ACTOR_TOKEN, 'POST', `/api/v1/work-items/${created.record.id}/assign`, { expectedRevision: created.record.revision, assignedTo: ASSIGNEE_ID })).json() as any
    assert.equal(assigned.record.assignedTo, ASSIGNEE_ID)
    assert.equal(assigned.record.assigneeName, '交接指派测试乙')
    assert.equal(assigned.record.revision, created.record.revision + 1)

    let mine = await bootstrap(db, ASSIGNEE_TOKEN)
    assert.equal(mine.assignedToMe.length, 1)

    const cleared = await (await send(db, ACTOR_TOKEN, 'POST', `/api/v1/work-items/${created.record.id}/assign`, { expectedRevision: assigned.record.revision, assignedTo: null })).json() as any
    assert.equal(cleared.record.assignedTo, undefined)

    mine = await bootstrap(db, ASSIGNEE_TOKEN)
    assert.equal(mine.assignedToMe.length, 0)

    // Re-assign, then complete the handover; the todo list must drop the item.
    const reassigned = await (await send(db, ACTOR_TOKEN, 'POST', `/api/v1/work-items/${created.record.id}/assign`, { expectedRevision: cleared.record.revision, assignedTo: ASSIGNEE_ID })).json() as any
    const completed = await (await send(db, ASSIGNEE_TOKEN, 'POST', `/api/v1/work-items/${created.record.id}/complete-handover`, { expectedRevision: reassigned.record.revision })).json() as any
    assert.equal(completed.record.lifecycle, 'completed')

    mine = await bootstrap(db, ASSIGNEE_TOKEN)
    assert.equal(mine.assignedToMe.length, 0)

    const audit = await bootstrap(db, ACTOR_TOKEN)
    const assignEvents = audit.events.filter((event: any) => event.action === 'assign-handover')
    assert.equal(assignEvents.length, 3)
    assert.equal(assignEvents.filter((event: any) => event.label.includes('指定交接人：交接指派测试乙')).length, 2)
    assert.equal(assignEvents.filter((event: any) => event.label.includes('清除交接人')).length, 1)
  } finally {
    db.close()
  }
})

test('交接人必须是本店在职成员，跨店或不存在成员被拒绝', async () => {
  const db = await migratedTestDatabase()
  try {
    await seedIdentity(db)
    const created = await (await send(db, ACTOR_TOKEN, 'POST', '/api/v1/work-items', { scene: 'poster', values: handoverValues() })).json() as any

    const unknown = await send(db, ACTOR_TOKEN, 'POST', `/api/v1/work-items/${created.record.id}/assign`, { expectedRevision: created.record.revision, assignedTo: '99999999-9999-4999-8999-999999999999' })
    assert.equal(unknown.status, 400)
    const unknownPayload = await unknown.json() as any
    assert.equal(unknownPayload.error, 'INVALID_ASSIGNEE')

    const record = db.one<{ assigned_to: string | null }>('SELECT assigned_to FROM work_items WHERE id = ?', created.record.id)
    assert.equal(record?.assigned_to, null)
  } finally {
    db.close()
  }
})
