import assert from 'node:assert/strict'
import test from 'node:test'
import { handleRequest } from '../src/index.js'
import type { AppConfig, WorkerEnv } from '../src/env.js'
import { hashPassword } from '../src/lib/crypto.js'
import { readStoreDesign, saveStoreDesign } from '../src/services/store-design.js'
import { migratedTestDatabase, type TestD1Database } from '../security/d1-test-adapter.js'

// 门店设计云端图纸（2026-09-17）。
//
// 覆盖两件事：
//   ① 门店边界 —— 只按会话所属门店读写，请求体 / x-store-id 头都改不了目标门店；
//   ② 乐观锁 —— 版本失配返回 409 且**不覆盖**已存内容（同事之间不会静默互相盖掉）。

const STORE_A = '30000000-0000-4000-8000-000000001299'
const STORE_B = '30000000-0000-4000-8000-000000001670'
const USER_A = '33000000-0000-4000-8000-0000000000a1'
const USER_B = '33000000-0000-4000-8000-0000000000b1'
const USERNAME_A = 'designer-a'
const USERNAME_B = 'designer-b'
const PASSWORD = 'store-design-cloud-test-password'
const SESSION_SECRET = 'session-secret-for-store-design-tests-0123456789'
const CSRF_SECRET = 'csrf-secret-for-store-design-tests-0123456789'
const PASSWORD_PEPPER = 'pepper-for-store-design-tests-0123456789'
const ORIGIN = 'https://bike-ops-preview.geeklightonefish.workers.dev'
const STAMP = '2026-09-17T02:00:00.000Z'

// 最小可保存的图纸：工具端导出的形状（space + shelves 是必填的最外层结构）。
function design(seed: string): Record<string, unknown> {
  return {
    space: { w: 23, d: 17 },
    shelves: [{ id: 's1', kind: 'double', x: 1.5, y: 1.5, len: 7.5, orient: 'h' }],
    note: seed
  }
}

async function seededDatabase(): Promise<TestD1Database> {
  const db = await migratedTestDatabase()
  const passwordHash = await hashPassword(PASSWORD, PASSWORD_PEPPER)
  // 0006 已预置 1299 / 1670 两家门店（勿重复插入 —— 主键与 code 都是唯一的）。
  for (const [id, username, name, store] of [
    [USER_A, USERNAME_A, '设计员甲', STORE_A],
    [USER_B, USERNAME_B, '设计员乙', STORE_B]
  ] as const) {
    db.sqlite.prepare(`
      INSERT INTO users (id, username_key, display_name, email_key, password_hash, status, must_change_password, failed_login_count, is_platform_admin, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'active', 0, 0, 0, ?, ?)
    `).run(id, username, name, `${username}@example.com`, passwordHash, STAMP, STAMP)
    db.sqlite.prepare(`
      INSERT INTO store_members (id, store_id, user_id, role, status, effective_from, created_at)
      VALUES (?, ?, ?, 'operator', 'active', ?, ?)
    `).run(`membership-${username}`, store, id, STAMP, STAMP)
  }
  return db
}

function config(): AppConfig {
  return {
    APP_ENV: 'preview',
    APP_VERSION: '6.8.3',
    GIT_SHA: 'store-design-test',
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
    APP_VERSION: '6.8.3',
    GIT_SHA: 'store-design-test',
    COOKIE_SECURE: 'true',
    SESSION_TTL_HOURS: '12',
    CORS_ALLOWED_ORIGINS: ORIGIN,
    SESSION_SECRET,
    CSRF_SECRET,
    PASSWORD_PEPPER,
    CONTACT_ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    PLATFORM_ADMIN_SETUP_TOKEN_HASH: 'a'.repeat(64),
    REGISTRATION_SECRET: 'registration-secret-for-store-design-tests-0123456789'
  }
}

function executionContext(): ExecutionContext {
  return {
    waitUntil(promise: Promise<unknown>) { void Promise.resolve(promise).catch(() => undefined) },
    passThroughOnException() {},
    props: {}
  } as ExecutionContext
}

type Session = { cookie: string; csrf: string }

async function loginWith(env: WorkerEnv, username: string, storeId: string): Promise<Session> {
  const response = await handleRequest(
    new Request(`${ORIGIN}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN, 'x-store-id': storeId },
      body: JSON.stringify({ username, password: PASSWORD })
    }),
    env,
    executionContext()
  )
  const payload = await response.json() as { csrfToken?: string; user?: { displayName?: string } }
  assert.equal(response.status, 200, `登录必须成功：${JSON.stringify(payload)}`)
  const me = await handleRequest(
    new Request(`${ORIGIN}/api/v1/auth/me`, {
      headers: { cookie: cookieFrom(response), origin: ORIGIN, 'x-store-id': storeId }
    }),
    env,
    executionContext()
  )
  const mePayload = await me.json() as { csrfToken: string }
  return { cookie: cookieFrom(response), csrf: mePayload.csrfToken }
}

function cookieFrom(response: Response): string {
  return (response.headers.get('set-cookie') || '').split(';')[0]
}

function readDesign(env: WorkerEnv, session: Session, storeHeader: string | null = STORE_A) {
  const headers: Record<string, string> = { cookie: session.cookie, origin: ORIGIN }
  if (storeHeader) headers['x-store-id'] = storeHeader
  return handleRequest(new Request(`${ORIGIN}/api/v1/design`, { headers }), env, executionContext())
}

function writeDesign(env: WorkerEnv, session: Session, body: unknown, options: { csrf?: string | null; storeHeader?: string | null } = {}) {
  const csrf = options.csrf === undefined ? session.csrf : options.csrf
  const headers: Record<string, string> = { cookie: session.cookie, origin: ORIGIN, 'content-type': 'application/json' }
  const storeHeader = options.storeHeader === undefined ? STORE_A : options.storeHeader
  if (storeHeader) headers['x-store-id'] = storeHeader
  if (csrf) headers['x-csrf-token'] = csrf
  return handleRequest(
    new Request(`${ORIGIN}/api/v1/design`, { method: 'PUT', headers, body: JSON.stringify(body) }),
    env,
    executionContext()
  )
}

test('未登录不得读写云端图纸', async () => {
  const db = await seededDatabase()
  try {
    const env = baseEnv(db)
    const read = await handleRequest(new Request(`${ORIGIN}/api/v1/design`, { headers: { origin: ORIGIN } }), env, executionContext())
    assert.equal(read.status, 401)
    const write = await handleRequest(
      new Request(`${ORIGIN}/api/v1/design`, { method: 'PUT', headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify({ expectedRevision: 0, payload: design('anon') }) }),
      env,
      executionContext()
    )
    assert.equal(write.status, 401)
    const count = db.sqlite.prepare('SELECT COUNT(*) AS n FROM store_designs').get() as { n: number }
    assert.equal(count.n, 0, '未登录请求不得写入任何图纸')
  } finally {
    db.close()
  }
})

test('首次保存建立图纸，再保存版本递增，且能原样读回', async () => {
  const db = await seededDatabase()
  try {
    const env = baseEnv(db)
    const session = await loginWith(env, USERNAME_A, STORE_A)

    const empty = await readDesign(env, session)
    assert.equal(empty.status, 200)
    assert.deepEqual(await empty.json(), { design: null }, '还没人保存过时必须是 design: null')

    const first = await writeDesign(env, session, { expectedRevision: 0, payload: design('v1') })
    assert.equal(first.status, 200, JSON.stringify(await first.clone().json()))
    const firstPayload = await first.json() as { design: { revision: number; updatedByName: string; updatedAt: string } }
    assert.equal(firstPayload.design.revision, 1)
    assert.equal(firstPayload.design.updatedByName, '设计员甲')
    assert.ok(firstPayload.design.updatedAt, '必须返回保存时间')

    const second = await writeDesign(env, session, { expectedRevision: 1, payload: design('v2') })
    assert.equal(second.status, 200)
    assert.equal(((await second.json()) as { design: { revision: number } }).design.revision, 2)

    const loaded = await readDesign(env, session)
    const loadedPayload = await loaded.json() as { design: { payload: Record<string, unknown>; revision: number; updatedByName: string } }
    assert.equal(loadedPayload.design.revision, 2)
    assert.equal(loadedPayload.design.updatedByName, '设计员甲')
    assert.deepEqual(loadedPayload.design.payload, design('v2'), '读回的必须是最后一次保存的内容')
  } finally {
    db.close()
  }
})

test('版本失配返回 409 且绝不覆盖同事已保存的内容', async () => {
  const db = await seededDatabase()
  try {
    const env = baseEnv(db)
    const sessionA = await loginWith(env, USERNAME_A, STORE_A)
    await writeDesign(env, sessionA, { expectedRevision: 0, payload: design('by-a') })

    // 乙（另一个浏览器/设备）拿的是旧版本号 0，此时云端已是 1
    const stale = await writeDesign(env, sessionA, { expectedRevision: 0, payload: design('by-stale') })
    assert.equal(stale.status, 409)
    const stalePayload = await stale.json() as { error: string; message: string; design: { revision: number } }
    assert.equal(stalePayload.error, 'DESIGN_CONFLICT')
    assert.equal(stalePayload.design.revision, 1)
    assert.match(stalePayload.message, /先载入/u, '必须提示先载入最新版本')

    const loaded = await readDesign(env, sessionA)
    const loadedPayload = await loaded.json() as { design: { payload: Record<string, unknown>; revision: number } }
    assert.equal(loadedPayload.design.revision, 1)
    assert.deepEqual(loadedPayload.design.payload, design('by-a'), '冲突请求不得改动已存内容')
  } finally {
    db.close()
  }
})

test('门店边界：只能操作自己是成员的门店，换不了目标门店', async () => {
  const db = await seededDatabase()
  try {
    const env = baseEnv(db)
    const sessionA = await loginWith(env, USERNAME_A, STORE_A)
    const sessionB = await loginWith(env, USERNAME_B, STORE_B)
    await writeDesign(env, sessionA, { expectedRevision: 0, payload: design('store-a') })

    // x-store-id 头只是「选择哪个门店」，成员关系不成立时直接拒绝：
    // 乙拿着 A 店的头只会 401，读不到 A 店图纸。
    const cross = await readDesign(env, sessionB, STORE_A)
    assert.equal(cross.status, 401, '不是该门店成员时不得访问那家门店的数据')

    // 乙正常读取（不带头，落到自己所属门店）→ 看不到 A 店内容
    const own = await readDesign(env, sessionB, null)
    assert.equal(own.status, 200)
    assert.deepEqual(await own.json(), { design: null }, '其他门店不得读到本店图纸')

    // 乙保存自己的图纸：即使带 A 店头也只能被拒；正常请求则写进 B 店那一行
    const crossWrite = await writeDesign(env, sessionB, { expectedRevision: 0, payload: design('store-b') }, { storeHeader: STORE_A })
    assert.equal(crossWrite.status, 401, '不得借请求头写进别家门店')
    const ownWrite = await writeDesign(env, sessionB, { expectedRevision: 0, payload: design('store-b') }, { storeHeader: null })
    assert.equal(ownWrite.status, 200)

    const rows = db.sqlite.prepare('SELECT store_id FROM store_designs ORDER BY store_id').all() as Array<{ store_id: string }>
    assert.deepEqual(rows.map((row) => row.store_id).sort(), [STORE_A, STORE_B].sort(), '两店的图纸各存各的行')

    const a = await readDesign(env, sessionA)
    const aPayload = await a.json() as { design: { payload: Record<string, unknown> } }
    assert.deepEqual(aPayload.design.payload, design('store-a'), 'A 店内容不得被 B 店请求改动')
  } finally {
    db.close()
  }
})

test('缺少 / 错误 CSRF 令牌不得保存', async () => {
  const db = await seededDatabase()
  try {
    const env = baseEnv(db)
    const session = await loginWith(env, USERNAME_A, STORE_A)
    const missing = await writeDesign(env, session, { expectedRevision: 0, payload: design('x') }, { csrf: null })
    assert.equal(missing.status, 403)
    const wrong = await writeDesign(env, session, { expectedRevision: 0, payload: design('x') }, { csrf: 'not-the-token' })
    assert.equal(wrong.status, 403)
    const count = db.sqlite.prepare('SELECT COUNT(*) AS n FROM store_designs').get() as { n: number }
    assert.equal(count.n, 0, 'CSRF 校验失败不得落库')
  } finally {
    db.close()
  }
})

test('图纸体积超限被拒（413），不落库', async () => {
  const db = await seededDatabase()
  try {
    const env = baseEnv(db)
    const session = await loginWith(env, USERNAME_A, STORE_A)
    const huge = { ...design('huge'), blob: 'x'.repeat(520_000) }
    const response = await writeDesign(env, session, { expectedRevision: 0, payload: huge })
    assert.equal(response.status, 413)
    const payload = await response.json() as { error: string }
    assert.equal(payload.error, 'DESIGN_TOO_LARGE')
    const count = db.sqlite.prepare('SELECT COUNT(*) AS n FROM store_designs').get() as { n: number }
    assert.equal(count.n, 0)
  } finally {
    db.close()
  }
})

test('形状校验：缺少 space / shelves 的载荷不得入库', async () => {
  const db = await seededDatabase()
  try {
    const env = baseEnv(db)
    const session = await loginWith(env, USERNAME_A, STORE_A)
    const bad = await writeDesign(env, session, { expectedRevision: 0, payload: { shelves: [] } })
    assert.equal(bad.status, 400, '缺少 space 必须被契约拦下')
    const alsoBad = await writeDesign(env, session, { expectedRevision: 0, payload: { space: { w: 1, d: 1 } } })
    assert.equal(alsoBad.status, 400, '缺少 shelves 必须被契约拦下')
  } finally {
    db.close()
  }
})

test('并发写入：两份同时提交只有一份成功，另一份得到冲突', async () => {
  const db = await seededDatabase()
  try {
    await saveStoreDesign(db, STORE_A, { userId: USER_A, displayName: '设计员甲' }, { expectedRevision: 0, payload: JSON.stringify(design('base')) })
    const [one, two] = await Promise.all([
      saveStoreDesign(db, STORE_A, { userId: USER_A, displayName: '设计员甲' }, { expectedRevision: 1, payload: JSON.stringify(design('one')) }),
      saveStoreDesign(db, STORE_A, { userId: USER_A, displayName: '设计员甲' }, { expectedRevision: 1, payload: JSON.stringify(design('two')) })
    ])
    const okCount = [one, two].filter((item) => item.ok).length
    const conflictCount = [one, two].filter((item) => !item.ok && item.reason === 'conflict').length
    assert.equal(okCount, 1, '只允许一份写入成功')
    assert.equal(conflictCount, 1, '另一份必须被判成冲突')
    const stored = await readStoreDesign(db, STORE_A)
    assert.equal(stored?.revision, 2)
  } finally {
    db.close()
  }
})

test('服务层体积上限与「首次必须 expectedRevision=0」', async () => {
  const db = await seededDatabase()
  try {
    const tooLarge = await saveStoreDesign(db, STORE_A, { userId: USER_A, displayName: '设计员甲' }, { expectedRevision: 0, payload: 'x'.repeat(512_001) })
    assert.equal(tooLarge.ok, false)
    assert.equal(tooLarge.reason, 'too_large')

    // 云端还没有图纸时，客户端若声称自己是第 3 版 → 冲突（不能凭空续号）
    const wrong = await saveStoreDesign(db, STORE_A, { userId: USER_A, displayName: '设计员甲' }, { expectedRevision: 3, payload: JSON.stringify(design('nope')) })
    assert.equal(wrong.ok, false)
    assert.equal(wrong.reason, 'conflict')
    assert.equal(await readStoreDesign(db, STORE_A), null)
  } finally {
    db.close()
  }
})

test('schema 版本跟版：0038 食品自动登记影子系统', async () => {
  const schemaVersion = await import('node:fs/promises').then((fs) => fs.readFile(new URL('../src/schema-version.ts', import.meta.url), 'utf8'))
  assert.match(schemaVersion, /'0038_food_auto_shadow'/u)
})
