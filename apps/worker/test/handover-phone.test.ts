import assert from 'node:assert/strict'
import test from 'node:test'
import { handleRequest } from '../src/index.js'
import type { WorkerEnv } from '../src/env.js'
import { keyedHash } from '../src/lib/crypto.js'
import { migratedTestDatabase, TestD1Database } from '../security/d1-test-adapter.js'

const STORE_ID = '30000000-0000-4000-8000-000000001299'
const USER_ID = 'handover-phone-user'
const SESSION_TOKEN = 'handover-phone-session'
const CSRF_TOKEN = 'handover-phone-csrf'
const SESSION_SECRET = 'session-secret-for-handover-phone-tests-0123456789'
const CSRF_SECRET = 'csrf-secret-for-handover-phone-tests-0123456789'
const CONTACT_KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const ORIGIN = 'https://bike-ops-preview.geeklightonefish.workers.dev'
const STAMP = '2026-08-12T10:00:00.000Z'
let requestSequence = 1

function executionContext(): ExecutionContext {
  return {
    waitUntil(promise: Promise<unknown>) { void promise.catch(() => undefined) },
    passThroughOnException() {},
    props: {}
  } as ExecutionContext
}

function environment(db: TestD1Database, contactKey: string | undefined = CONTACT_KEY): WorkerEnv {
  return {
    DB: db as unknown as D1Database,
    ASSETS: { fetch: async () => new Response('asset', { status: 200 }) } as Fetcher,
    APP_ENV: 'preview',
    APP_VERSION: '5.9.2',
    GIT_SHA: 'handover-phone-test',
    COOKIE_SECURE: 'true',
    SESSION_TTL_HOURS: '12',
    CORS_ALLOWED_ORIGINS: ORIGIN,
    SESSION_SECRET,
    CSRF_SECRET,
    PASSWORD_PEPPER: 'pepper-for-handover-phone-tests-0123456789',
    CONTACT_ENCRYPTION_KEY: contactKey,
    PLATFORM_ADMIN_SETUP_TOKEN_HASH: 'a'.repeat(64),
    REGISTRATION_SECRET: 'registration-secret-handover-phone-tests-0123456789'
  }
}

function idempotencyKey(): string {
  return `81000000-0000-4000-8000-${String(requestSequence++).padStart(12, '0')}`
}

function writeHeaders(): HeadersInit {
  return {
    cookie: `__Host-bike_ops_session=${SESSION_TOKEN}`,
    'x-csrf-token': CSRF_TOKEN,
    'x-store-id': STORE_ID,
    'content-type': 'application/json',
    'idempotency-key': idempotencyKey(),
    origin: ORIGIN
  }
}

async function send(db: TestD1Database, method: 'POST' | 'PATCH', path: string, body: unknown, contactKey: string | undefined = CONTACT_KEY): Promise<Response> {
  return handleRequest(
    new Request(`${ORIGIN}${path}`, { method, headers: writeHeaders(), body: JSON.stringify(body) }),
    environment(db, contactKey),
    executionContext()
  )
}

async function readWorkItems(db: TestD1Database): Promise<any> {
  const response = await handleRequest(
    new Request(`${ORIGIN}/api/v1/work-items`, {
      headers: {
        cookie: `__Host-bike_ops_session=${SESSION_TOKEN}`,
        'x-store-id': STORE_ID,
        origin: ORIGIN
      }
    }),
    environment(db),
    executionContext()
  )
  assert.equal(response.status, 200)
  return response.json()
}

async function seedIdentity(db: TestD1Database): Promise<void> {
  db.sqlite.prepare(`
    INSERT INTO users (
      id, username_key, display_name, email_key, password_hash, status,
      must_change_password, failed_login_count, is_platform_admin, created_at, updated_at
    ) VALUES (?, 'handover-phone-user', '交接电话测试', 'seed@example.decathlon.com', 'unused', 'active', 0, 0, 0, ?, ?)
  `).run(USER_ID, STAMP, STAMP)
  db.sqlite.prepare(`
    INSERT INTO store_members (id, store_id, user_id, role, status, effective_from, created_at)
    VALUES ('handover-phone-membership', ?, ?, 'operator', 'active', ?, ?)
  `).run(STORE_ID, USER_ID, STAMP, STAMP)
  db.sqlite.prepare(`
    INSERT INTO auth_sessions (token_hash, csrf_hash, user_id, expires_at, last_seen_at, created_at, user_agent)
    VALUES (?, ?, ?, '2099-01-01T00:00:00.000Z', ?, ?, 'handover-phone-test')
  `).run(
    await keyedHash(SESSION_TOKEN, SESSION_SECRET),
    await keyedHash(CSRF_TOKEN, CSRF_SECRET),
    USER_ID,
    STAMP,
    STAMP
  )
}

function values(contactValue?: string): Record<string, unknown> {
  return {
    title: '跟进团购车辆交付',
    detail: '跟进团购车辆交付',
    meta: '',
    status: '继续跟进',
    ...(contactValue === undefined ? {} : { contactValue })
  }
}

test('交接电话号码可留空，且留空时不依赖联系方式加密密钥', async () => {
  const db = await migratedTestDatabase()
  try {
    await seedIdentity(db)
    const response = await send(db, 'POST', '/api/v1/work-items', { scene: 'poster', values: values('') }, undefined)
    const payload = await response.json() as any
    assert.equal(response.status, 201, JSON.stringify(payload))
    assert.equal(payload.record.scene, 'poster')
    assert.equal(payload.record.contactValue, undefined)
    assert.deepEqual(
      { ...db.one<{ contact_ciphertext: string | null; contact_fingerprint: string | null }>('SELECT contact_ciphertext, contact_fingerprint FROM handover_details WHERE work_item_id = ?', payload.record.id)! },
      { contact_ciphertext: null, contact_fingerprint: null }
    )
  } finally {
    db.close()
  }
})

test('交接电话号码加密保存，旧客户端编辑保留号码，新版留空可清除', async () => {
  const db = await migratedTestDatabase()
  try {
    await seedIdentity(db)
    const phone = '138 0013 8000'
    const createdResponse = await send(db, 'POST', '/api/v1/work-items', { scene: 'poster', values: values(phone) })
    const created = await createdResponse.json() as any
    assert.equal(createdResponse.status, 201, JSON.stringify(created))
    assert.equal(created.record.contactValue, phone)

    const stored = db.one<{ contact_ciphertext: string; contact_fingerprint: string }>(
      'SELECT contact_ciphertext, contact_fingerprint FROM handover_details WHERE work_item_id = ?',
      created.record.id
    )!
    assert.ok(stored.contact_ciphertext.startsWith('v1.'))
    assert.ok(!stored.contact_ciphertext.includes(phone))
    assert.equal(stored.contact_fingerprint.length, 64)

    const legacyResponse = await send(db, 'PATCH', `/api/v1/work-items/${created.record.id}`, {
      expectedRevision: 1,
      values: values()
    })
    const legacy = await legacyResponse.json() as any
    assert.equal(legacyResponse.status, 200, JSON.stringify(legacy))
    assert.equal(legacy.record.contactValue, phone)
    assert.equal(
      db.one<{ contact_ciphertext: string }>('SELECT contact_ciphertext FROM handover_details WHERE work_item_id = ?', created.record.id)?.contact_ciphertext,
      stored.contact_ciphertext
    )

    const clearedResponse = await send(db, 'PATCH', `/api/v1/work-items/${created.record.id}`, {
      expectedRevision: 2,
      values: values('')
    })
    const cleared = await clearedResponse.json() as any
    assert.equal(clearedResponse.status, 200, JSON.stringify(cleared))
    assert.equal(cleared.record.contactValue, undefined)
    assert.deepEqual(
      { ...db.one<{ contact_ciphertext: string | null; contact_fingerprint: string | null }>('SELECT contact_ciphertext, contact_fingerprint FROM handover_details WHERE work_item_id = ?', created.record.id)! },
      { contact_ciphertext: null, contact_fingerprint: null }
    )

    const undoResponse = await send(db, 'POST', `/api/v1/audit-events/${cleared.eventId}/undo`, {})
    const undone = await undoResponse.json() as any
    assert.equal(undoResponse.status, 200, JSON.stringify(undone))
    const refreshed = await readWorkItems(db)
    assert.equal(refreshed.records.find((record: any) => record.id === created.record.id)?.contactValue, phone)
  } finally {
    db.close()
  }
})
