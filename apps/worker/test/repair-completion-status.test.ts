import assert from 'node:assert/strict'
import test from 'node:test'
import { handleRequest } from '../src/index.js'
import type { WorkerEnv } from '../src/env.js'
import { keyedHash } from '../src/lib/crypto.js'
import { encryptContact } from '../src/lib/contact-crypto.js'
import { migratedTestDatabase, TestD1Database } from '../security/d1-test-adapter.js'

const STORE_ID = '30000000-0000-4000-8000-000000001299'
const USER_ID = 'repair-status-user'
const SESSION_TOKEN = 'repair-status-session'
const CSRF_TOKEN = 'repair-status-csrf'
const SESSION_SECRET = 'session-secret-for-repair-status-tests-0123456789'
const CSRF_SECRET = 'csrf-secret-for-repair-status-tests-0123456789'
const CONTACT_KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const ORIGIN = 'https://bike-ops-preview.geeklightonefish.workers.dev'
const STAMP = '2026-07-27T10:00:00.000Z'
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
    APP_VERSION: '5.7.8',
    GIT_SHA: 'repair-status-test',
    COOKIE_SECURE: 'true',
    SESSION_TTL_HOURS: '12',
    CORS_ALLOWED_ORIGINS: ORIGIN,
    SESSION_SECRET,
    CSRF_SECRET,
    PASSWORD_PEPPER: 'pepper-for-repair-status-tests-0123456789',
    CONTACT_ENCRYPTION_KEY: CONTACT_KEY,
    PLATFORM_ADMIN_SETUP_TOKEN_HASH: 'a'.repeat(64),
    REGISTRATION_SECRET: 'registration-secret-repair-status-tests-0123456789'
  }
}

function idempotencyKey(): string {
  return `70000000-0000-4000-8000-${String(requestSequence++).padStart(12, '0')}`
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

async function request(db: TestD1Database, path: string, body: unknown): Promise<Response> {
  return handleRequest(
    new Request(`${ORIGIN}${path}`, { method: 'POST', headers: writeHeaders(), body: JSON.stringify(body) }),
    environment(db),
    executionContext()
  )
}

async function patch(db: TestD1Database, id: string, body: unknown): Promise<Response> {
  return handleRequest(
    new Request(`${ORIGIN}/api/v1/work-items/${id}`, { method: 'PATCH', headers: writeHeaders(), body: JSON.stringify(body) }),
    environment(db),
    executionContext()
  )
}

async function json(response: Response): Promise<any> {
  return response.json().catch(() => null)
}

async function seedIdentity(db: TestD1Database): Promise<void> {
  db.sqlite.prepare(`
    INSERT INTO users (
      id, username_key, display_name, email_key, password_hash, status,
      must_change_password, failed_login_count, is_platform_admin, created_at, updated_at
    ) VALUES (?, 'repair-status-user', '维修状态测试', 'seed@example.decathlon.com', 'unused', 'active', 0, 0, 0, ?, ?)
  `).run(USER_ID, STAMP, STAMP)
  db.sqlite.prepare(`
    INSERT INTO store_members (id, store_id, user_id, role, status, effective_from, created_at)
    VALUES ('repair-status-membership', ?, ?, 'operator', 'active', ?, ?)
  `).run(STORE_ID, USER_ID, STAMP, STAMP)
  db.sqlite.prepare(`
    INSERT INTO auth_sessions (token_hash, csrf_hash, user_id, expires_at, last_seen_at, created_at, user_agent)
    VALUES (?, ?, ?, '2099-01-01T00:00:00.000Z', ?, ?, 'repair-status-test')
  `).run(
    await keyedHash(SESSION_TOKEN, SESSION_SECRET),
    await keyedHash(CSRF_TOKEN, CSRF_SECRET),
    USER_ID,
    STAMP,
    STAMP
  )
}

async function seedRepair(db: TestD1Database, input: {
  id: string
  ticketNo: number
  repairType: string
  status: string
  title?: string
}): Promise<void> {
  const title = input.title ?? `测试车辆 ${input.ticketNo}`
  db.sqlite.prepare(`
    INSERT INTO work_items (
      id, store_id, ticket_no, kind, title, detail, meta, status, lifecycle, revision,
      created_by, updated_by, created_at, updated_at
    ) VALUES (?, ?, ?, 'repair', ?, '原维修项目', ?, ?, 'active', 1, ?, ?, ?, ?)
  `).run(input.id, STORE_ID, input.ticketNo, title, input.repairType, input.status, USER_ID, USER_ID, STAMP, STAMP)
  db.sqlite.prepare(`
    INSERT INTO repair_details (
      work_item_id, contact_type, contact_ciphertext, contact_fingerprint,
      repair_type, repair_project, pickup_date, repair_status
    ) VALUES (?, 'phone', ?, NULL, ?, '原维修项目', '2026-07-30', ?)
  `).run(input.id, await encryptContact('13900000000', CONTACT_KEY), input.repairType, input.status)
}

function repairValues(status: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: '已编辑车辆',
    contactType: 'phone',
    contactValue: '13900000001',
    repairType: '付费',
    repairProject: '编辑后的维修项目',
    pickupDate: '2026-07-31',
    status,
    ...overrides
  }
}

test('五种维修完毕状态在 Worker 路由中一一映射并同步主记录与维修详情', async () => {
  const db = await migratedTestDatabase()
  try {
    await seedIdentity(db)
    const cases = [
      ['paid', 1, '付费', '已开付款单', '维修完成-已开付款单'],
      ['repair-order', 2, '付费', '已开维修单', '维修完成-已开维修单'],
      ['warranty-repair', 3, '质保', '已开质保维修单', '维修完成-已开质保维修单'],
      ['warranty-paid', 4, '质保', '已开质保付款单-请过机', '维修完成-已开质保付款单-请过机'],
      ['quick-free', 5, '免费', '快速服务免费', '维修完成-快速服务免费']
    ] as const

    for (const [id, ticketNo, repairType, status, completedStatus] of cases) {
      await seedRepair(db, { id, ticketNo, repairType, status })
      const response = await request(db, `/api/v1/work-items/${id}/complete-repair`, { expectedRevision: 1 })
      assert.equal(response.status, 200, JSON.stringify(await json(response.clone())))
      const payload = await json(response)
      assert.equal(payload.route, 'pickup')
      assert.equal(payload.record.scene, 'pickup')
      assert.equal(payload.record.status, completedStatus)
      assert.deepEqual({ ...db.one<{ kind: string; status: string }>('SELECT kind, status FROM work_items WHERE id = ?', id)! }, { kind: 'pickup', status: completedStatus })
      assert.equal(db.one<{ repair_status: string }>('SELECT repair_status FROM repair_details WHERE work_item_id = ?', id)?.repair_status, completedStatus)
      assert.equal(db.one<{ pickup_source: string }>('SELECT pickup_source FROM pickup_details WHERE work_item_id = ?', id)?.pickup_source, 'repair')
    }
  } finally {
    db.close()
  }
})

test('维修中状态不能绕过五种开单提醒直接完成', async () => {
  const db = await migratedTestDatabase()
  try {
    await seedIdentity(db)
    await seedRepair(db, { id: 'blocked-complete', ticketNo: 6, repairType: '付费', status: '维修中' })
    const response = await request(db, '/api/v1/work-items/blocked-complete/complete-repair', { expectedRevision: 1 })
    assert.equal(response.status, 400)
    const payload = await json(response)
    assert.match(payload.message, /请先将当前状态选择为.*已开付款单.*快速服务免费/u)
    assert.deepEqual({ ...db.one<{ kind: string; status: string }>('SELECT kind, status FROM work_items WHERE id = ?', 'blocked-complete')! }, { kind: 'repair', status: '维修中' })
    assert.equal(db.one('SELECT work_item_id FROM pickup_details WHERE work_item_id = ?', 'blocked-complete'), null)
  } finally {
    db.close()
  }
})

test('维修完成记录可直接编辑，但状态只能在五个完成状态之间切换', async () => {
  const db = await migratedTestDatabase()
  try {
    await seedIdentity(db)
    await seedRepair(db, { id: 'completed-edit', ticketNo: 7, repairType: '付费', status: '已开付款单' })
    const completed = await json(await request(db, '/api/v1/work-items/completed-edit/complete-repair', { expectedRevision: 1 }))
    assert.equal(completed.record.status, '维修完成-已开付款单')

    const editedResponse = await patch(db, 'completed-edit', {
      expectedRevision: completed.record.revision,
      values: repairValues('维修完成-已开维修单')
    })
    assert.equal(editedResponse.status, 200, JSON.stringify(await json(editedResponse.clone())))
    const edited = await json(editedResponse)
    assert.equal(edited.record.scene, 'pickup')
    assert.equal(edited.record.status, '维修完成-已开维修单')
    assert.equal(edited.record.repairProject, '编辑后的维修项目')
    assert.equal(db.one<{ repair_status: string }>('SELECT repair_status FROM repair_details WHERE work_item_id = ?', 'completed-edit')?.repair_status, '维修完成-已开维修单')

    const invalidResponse = await patch(db, 'completed-edit', {
      expectedRevision: edited.record.revision,
      values: repairValues('已开付款单')
    })
    assert.equal(invalidResponse.status, 400)
    assert.match((await json(invalidResponse)).message, /只能在五个.*维修完成/u)
    assert.equal(db.one<{ status: string }>('SELECT status FROM work_items WHERE id = ?', 'completed-edit')?.status, '维修完成-已开维修单')
  } finally {
    db.close()
  }
})

test('确认取车阻止维修单状态，放行付款、质保付款和快速服务免费状态', async () => {
  const db = await migratedTestDatabase()
  try {
    await seedIdentity(db)
    const cases = [
      ['pickup-paid', 8, '付费', '已开付款单', 200],
      ['pickup-repair-order', 9, '付费', '已开维修单', 409],
      ['pickup-warranty-repair', 10, '质保', '已开质保维修单', 409],
      ['pickup-warranty-paid', 11, '质保', '已开质保付款单-请过机', 200],
      ['pickup-quick-free', 12, '免费', '快速服务免费', 200]
    ] as const

    for (const [id, ticketNo, repairType, status, expectedPickupStatus] of cases) {
      await seedRepair(db, { id, ticketNo, repairType, status })
      const completed = await json(await request(db, `/api/v1/work-items/${id}/complete-repair`, { expectedRevision: 1 }))
      const pickupResponse = await request(db, `/api/v1/work-items/${id}/pick-up`, { expectedRevision: completed.record.revision, pickupCode: '' })
      assert.equal(pickupResponse.status, expectedPickupStatus)
      const pickupPayload = await json(pickupResponse)
      if (status === '已开维修单') assert.match(pickupPayload.message, /维修完成-已开付款单/u)
      if (status === '已开质保维修单') assert.match(pickupPayload.message, /维修完成-已开质保付款单-请过机/u)
      if (expectedPickupStatus === 200) assert.equal(db.one<{ lifecycle: string }>('SELECT lifecycle FROM work_items WHERE id = ?', id)?.lifecycle, 'picked-up')
      else assert.equal(db.one<{ lifecycle: string }>('SELECT lifecycle FROM work_items WHERE id = ?', id)?.lifecycle, 'active')
    }
  } finally {
    db.close()
  }
})

test('操作记录撤回维修完毕时恢复精确完成前状态、维修场景和原始数据', async () => {
  const db = await migratedTestDatabase()
  try {
    await seedIdentity(db)
    await seedRepair(db, { id: 'undo-complete', ticketNo: 13, repairType: '质保', status: '已开质保付款单-请过机', title: '撤回测试车' })
    const completedResponse = await request(db, '/api/v1/work-items/undo-complete/complete-repair', { expectedRevision: 1 })
    assert.equal(completedResponse.status, 200)
    const completed = await json(completedResponse)
    assert.equal(completed.record.status, '维修完成-已开质保付款单-请过机')

    const undoResponse = await request(db, `/api/v1/audit-events/${completed.eventId}/undo`, {})
    assert.equal(undoResponse.status, 200, JSON.stringify(await json(undoResponse.clone())))
    assert.deepEqual({ ...db.one<{ kind: string; title: string; detail: string; status: string; lifecycle: string }>(
      'SELECT kind, title, detail, status, lifecycle FROM work_items WHERE id = ?', 'undo-complete'
    )! }, {
      kind: 'repair',
      title: '撤回测试车',
      detail: '原维修项目',
      status: '已开质保付款单-请过机',
      lifecycle: 'active'
    })
    assert.deepEqual({ ...db.one<{ repair_type: string; repair_project: string; repair_status: string; repair_completed_at: string | null }>(
      'SELECT repair_type, repair_project, repair_status, repair_completed_at FROM repair_details WHERE work_item_id = ?', 'undo-complete'
    )! }, {
      repair_type: '质保',
      repair_project: '原维修项目',
      repair_status: '已开质保付款单-请过机',
      repair_completed_at: null
    })
    assert.equal(db.one('SELECT work_item_id FROM pickup_details WHERE work_item_id = ?', 'undo-complete'), null)
  } finally {
    db.close()
  }
})
