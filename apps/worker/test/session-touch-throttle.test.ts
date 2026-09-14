import assert from 'node:assert/strict'
import test from 'node:test'
import { handleRequest } from '../src/index.js'
import type { WorkerEnv } from '../src/env.js'
import { keyedHash } from '../src/lib/crypto.js'
import { migratedTestDatabase, TestD1Database } from '../security/d1-test-adapter.js'

// 会话活跃时间戳节流（2026-09-14 D1 写配额事故回归）。
//
// 事故：每个已登录请求都无条件 UPDATE auth_sessions.last_seen_at。长轮询把
// 单页请求量放大到约 3,500 次/天，「每请求一次写」成为门店规模下的写配额黑洞
// （2026-09-13 账号级写入 104,212 行），而该列全仓只写不读。
//
// 本测试直接数「请求打进去之后这一列有没有被写」，而不是断言源码里有没有
// setInterval 之类的形式——节流一旦被改回无条件写，这里立刻变红。

const STORE_ID = '30000000-0000-4000-8000-000000001299'
const USER_ID = '32000000-0000-4000-8000-000000001299'
const TOKEN = 'session-throttle-test-session'
const CSRF = 'session-throttle-csrf'
const SESSION_SECRET = 'session-secret-for-session-touch-throttle-tests-0123456789'
const CSRF_SECRET = 'csrf-secret-for-session-touch-throttle-tests-0123456789'
const ORIGIN = 'https://bike-ops-preview.geeklightonefish.workers.dev'

async function seededDatabase(lastSeenAt: string): Promise<TestD1Database> {
  const db = await migratedTestDatabase()
  const stamp = '2026-09-13T10:00:00.000Z'
  db.sqlite.prepare(`
    INSERT INTO users (id, username_key, display_name, email_key, password_hash, status, must_change_password, failed_login_count, is_platform_admin, created_at, updated_at)
    VALUES (?, 'throttle-user', '节流测试', 'throttle@example.decathlon.com', 'unused', 'active', 0, 0, 0, ?, ?)
  `).run(USER_ID, stamp, stamp)
  db.sqlite.prepare(`
    INSERT INTO store_members (id, store_id, user_id, role, status, effective_from, created_at)
    VALUES ('membership-throttle', ?, ?, 'operator', 'active', ?, ?)
  `).run(STORE_ID, USER_ID, stamp, stamp)
  db.sqlite.prepare(`
    INSERT INTO auth_sessions (token_hash, csrf_hash, user_id, expires_at, last_seen_at, created_at, user_agent)
    VALUES (?, ?, ?, '2099-01-01T00:00:00.000Z', ?, ?, 'session-throttle-test')
  `).run(await keyedHash(TOKEN, SESSION_SECRET), await keyedHash(CSRF, CSRF_SECRET), USER_ID, lastSeenAt, stamp)
  // 版本号 2 > since=0，长轮询立即返回（否则每次请求要挂满 25 秒，5 次就是两分钟）
  db.sqlite.prepare(`
    INSERT INTO store_change_log (store_id, version, updated_at) VALUES (?, 2, ?)
  `).run(STORE_ID, stamp)
  return db
}

function environment(db: TestD1Database): WorkerEnv {
  return {
    DB: db as unknown as D1Database,
    ASSETS: { fetch: async () => new Response('asset', { status: 200 }) } as Fetcher,
    APP_ENV: 'preview',
    APP_VERSION: '6.7.7',
    GIT_SHA: 'session-throttle-test',
    COOKIE_SECURE: 'true',
    SESSION_TTL_HOURS: '12',
    CORS_ALLOWED_ORIGINS: ORIGIN,
    SESSION_SECRET,
    CSRF_SECRET,
    PASSWORD_PEPPER: 'pepper-for-session-touch-throttle-tests-0123456789',
    CONTACT_ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    PLATFORM_ADMIN_SETUP_TOKEN_HASH: 'a'.repeat(64),
    REGISTRATION_SECRET: 'registration-secret-for-session-touch-throttle-tests-0123456789'
  }
}

// 收集 waitUntil 的 promise，测试里显式 await，保证写库动作已完成再断言。
function executionContext(sink: Promise<unknown>[]): ExecutionContext {
  return {
    waitUntil(promise: Promise<unknown>) { sink.push(Promise.resolve(promise).catch(() => undefined)) },
    passThroughOnException() {},
    props: {}
  } as ExecutionContext
}

async function hit(db: TestD1Database, path: string, sink: Promise<unknown>[]): Promise<Response> {
  return handleRequest(
    new Request(`${ORIGIN}${path}`, {
      headers: {
        cookie: `__Secure-bike_ops_session=${TOKEN}`,
        'x-store-id': STORE_ID,
        origin: ORIGIN
      }
    }),
    environment(db),
    executionContext(sink)
  )
}

function lastSeen(db: TestD1Database): string {
  const row = db.sqlite.prepare('SELECT last_seen_at AS v FROM auth_sessions').get() as { v: string } | undefined
  return row?.v ?? ''
}

test('会话刚活跃过：连续多个请求都不再写 last_seen_at', async () => {
  const fresh = new Date().toISOString()
  const db = await seededDatabase(fresh)
  try {
    const sink: Promise<unknown>[] = []
    for (let index = 0; index < 5; index += 1) {
      const response = await hit(db, '/api/v1/changes?since=0', sink)
      assert.equal(response.status, 200, `请求应被受理，实际 ${response.status}`)
    }
    await Promise.all(sink)
    // 5 次请求（含长轮询）之后这一列必须原封不动
    assert.equal(lastSeen(db), fresh, '节流生效时不得写 last_seen_at')
  } finally {
    db.close()
  }
})

test('会话已超过节流间隔：下一次请求把它推进（保底写仍然存在）', async () => {
  const stale = new Date(Date.now() - 20 * 60 * 1000).toISOString()
  const db = await seededDatabase(stale)
  try {
    const sink: Promise<unknown>[] = []
    const response = await hit(db, '/api/v1/changes?since=0', sink)
    assert.equal(response.status, 200)
    await Promise.all(sink)
    const after = lastSeen(db)
    assert.notEqual(after, stale, '超过间隔必须写一次，否则该列会永远停住')
    assert.ok(Date.parse(after) > Date.parse(stale), '时间戳必须前进')
  } finally {
    db.close()
  }
})

test('节流不改变鉴权语义：无效会话仍然 401', async () => {
  const db = await seededDatabase(new Date().toISOString())
  try {
    const sink: Promise<unknown>[] = []
    const response = await handleRequest(
      new Request(`${ORIGIN}/api/v1/changes?since=0`, {
        headers: { cookie: '__Secure-bike_ops_session=not-a-real-session', 'x-store-id': STORE_ID, origin: ORIGIN }
      }),
      environment(db),
      executionContext(sink)
    )
    assert.equal(response.status, 401)
    await Promise.all(sink)
  } finally {
    db.close()
  }
})
