import assert from 'node:assert/strict'
import test from 'node:test'
import { handleRequest } from '../src/index.js'
import type { WorkerEnv } from '../src/env.js'
import { hashPassword } from '../src/lib/crypto.js'
import { LEGACY_SESSION_COOKIE, sessionCookieDomainAttribute, sessionCookieName } from '../src/auth/session.js'
import { migratedTestDatabase, TestD1Database } from '../security/d1-test-adapter.js'

// 三站 SSO 会话 cookie（2026-09-15 用户定案）。
//
// 需求原话：「第一次登录后，选择进入食品登记模块就不要再一次登录了」。
// 背景：原 cookie 名 `__Host-bike_ops_session` —— `__Host-` 前缀在规范上**禁止**
// 携带 Domain，于是 workshop.skin / eat.workshop.skin / mass.workshop.skin 各自
// 独立登录。修复 = `__Secure-` 前缀 + 仅正式域名带 `Domain=.workshop.skin`。
//
// 本测试锁三件事：①判定表（哪些域共享、哪些域必须保持 host-only）
// ②端到端（workshop.skin 登录拿到的 cookie，直接拿到 eat 子域请求上仍然认得）
// ③过渡期（旧 `__Host-` cookie 仍可读；登出会同时清掉两种名字）。

const STORE_ID = '30000000-0000-4000-8000-000000001299'
const USER_ID = '34000000-0000-4000-8000-000000001299'
const USERNAME = 'sso-user'
const PASSWORD = 'sso-cookie-password-2026'
const SESSION_SECRET = 'session-secret-for-session-sso-tests-0123456789'
const CSRF_SECRET = 'csrf-secret-for-session-sso-tests-0123456789'
const PASSWORD_PEPPER = 'pepper-for-session-sso-tests-0123456789'
const PRODUCTION_HOST = 'https://workshop.skin'
const PREVIEW_HOST = 'https://bike-ops-preview.geeklightonefish.workers.dev'
const ALLOWED_ORIGINS = [PRODUCTION_HOST, 'https://www.workshop.skin', 'https://eat.workshop.skin', 'https://mass.workshop.skin', PREVIEW_HOST].join(',')

function environment(db: TestD1Database, overrides: Partial<WorkerEnv> = {}): WorkerEnv {
  return {
    DB: db as unknown as D1Database,
    ASSETS: { fetch: async () => new Response('asset', { status: 200 }) } as Fetcher,
    APP_ENV: 'staging',
    APP_VERSION: '6.7.9',
    GIT_SHA: 'session-sso-test',
    COOKIE_SECURE: 'true',
    SESSION_TTL_HOURS: '12',
    CORS_ALLOWED_ORIGINS: ALLOWED_ORIGINS,
    SESSION_SECRET,
    CSRF_SECRET,
    PASSWORD_PEPPER,
    ...overrides
  }
}

async function seededDatabase(): Promise<TestD1Database> {
  const db = await migratedTestDatabase()
  const stamp = '2026-09-15T02:00:00.000Z'
  const passwordHash = await hashPassword(PASSWORD, PASSWORD_PEPPER)
  db.sqlite.prepare(`
    INSERT INTO users (id, username_key, display_name, email_key, password_hash, status, must_change_password, failed_login_count, is_platform_admin, created_at, updated_at)
    VALUES (?, ?, 'SSO 测试', 'sso@example.decathlon.com', ?, 'active', 0, 0, 0, ?, ?)
  `).run(USER_ID, USERNAME, passwordHash, stamp, stamp)
  db.sqlite.prepare(`
    INSERT INTO store_members (id, store_id, user_id, role, status, effective_from, created_at)
    VALUES ('membership-sso', ?, ?, 'manager', 'active', ?, ?)
  `).run(STORE_ID, USER_ID, stamp, stamp)
  return db
}

async function call(db: TestD1Database, origin: string, path: string, init: RequestInit = {}, env?: WorkerEnv): Promise<Response> {
  const headers = new Headers(init.headers ?? {})
  headers.set('origin', origin)
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json')
  const pending: Promise<unknown>[] = []
  const ctx = { waitUntil(promise: Promise<unknown>) { pending.push(promise) }, passThroughOnException() {}, props: {} } as ExecutionContext
  const response = await handleRequest(new Request(`${origin}${path}`, { ...init, headers }), env ?? environment(db), ctx)
  await Promise.allSettled(pending)
  return response
}

async function loginOn(db: TestD1Database, origin: string): Promise<Response> {
  return call(db, origin, '/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ username: USERNAME, password: PASSWORD }) })
}

// ── 判定表 ────────────────────────────────────────────────────────────

test('会话 cookie 名：HTTPS 环境带 __Secure- 前缀，且不得再是 __Host-', () => {
  assert.equal(sessionCookieName({ COOKIE_SECURE: true }), '__Secure-bike_ops_session')
  assert.equal(sessionCookieName({ COOKIE_SECURE: false }), 'bike_ops_session')
  // `__Host-` 前缀在规范上禁止 Domain 属性 —— 留着它就等于放弃跨子域共享
  assert.doesNotMatch(sessionCookieName({ COOKIE_SECURE: true }), /^__Host-/u)
  assert.equal(LEGACY_SESSION_COOKIE, '__Host-bike_ops_session', '旧名常量保留给过渡期读取/清理')
})

test('cookie Domain：仅 workshop.skin 及其子域共享，其余保持 host-only', () => {
  for (const host of ['workshop.skin', 'www.workshop.skin', 'eat.workshop.skin', 'mass.workshop.skin']) {
    assert.equal(sessionCookieDomainAttribute(host), '; Domain=.workshop.skin', `${host} 应跨子域共享`)
  }
  for (const host of [
    'bike-ops-preview.geeklightonefish.workers.dev',
    'bike-ops-staging.geeklightonefish.workers.dev',
    'localhost',
    '127.0.0.1',
    'workshop.skin.evil.com', // 后缀拼接：不能因为「以 workshop.skin 结尾」就放行
    'evilworkshop.skin',
    'notworkshop.skin'
  ]) {
    assert.equal(sessionCookieDomainAttribute(host), '', `${host} 必须保持 host-only`)
  }
})

// ── 端到端 ────────────────────────────────────────────────────────────

test('SSO 端到端：workshop.skin 登录 → eat 子域免登录，mass 子域同样', async () => {
  const db = await seededDatabase()
  try {
    const login = await loginOn(db, PRODUCTION_HOST)
    assert.equal(login.status, 200, '登录必须成功')
    const setCookie = login.headers.get('set-cookie') ?? ''
    assert.match(setCookie, /^(?:__Secure-)?bike_ops_session=/u)
    assert.match(setCookie, /; Domain=\.workshop\.skin/u, '正式域名必须带共享 Domain')
    assert.match(setCookie, /; HttpOnly/u)
    assert.match(setCookie, /; SameSite=Lax/u)
    assert.match(setCookie, /; Secure/u)
    const cookiePair = setCookie.split(';', 1)[0] ?? ''
    assert.ok(cookiePair.includes('='), 'cookie 必须成对')

    // 浏览器会自动把 Domain 化的 cookie 带到各子域 —— 这里模拟同一份 cookie
    // 直接打到 eat / mass 子域：必须认得，且不要求重新登录。
    for (const host of ['https://eat.workshop.skin', 'https://mass.workshop.skin', 'https://www.workshop.skin']) {
      const me = await call(db, host, '/api/v1/auth/me', { headers: { cookie: cookiePair } })
      assert.equal(me.status, 200, `${host} 上必须免登录（当前 ${me.status}）`)
      const payload = await me.json() as any
      assert.equal(payload.user?.displayName, 'SSO 测试')
      assert.ok(payload.csrfToken, `${host} 上必须返回 CSRF（否则进去也没法写）`)
      assert.equal(payload.currentStoreId, STORE_ID)
    }
  } finally {
    db.close()
  }
})

test('预览站不共享：cookie 不带 Domain，且同域仍是 host-only 语义', async () => {
  const db = await seededDatabase()
  try {
    const login = await loginOn(db, PREVIEW_HOST)
    assert.equal(login.status, 200)
    const setCookie = login.headers.get('set-cookie') ?? ''
    assert.match(setCookie, /^__Secure-bike_ops_session=/u)
    assert.doesNotMatch(setCookie, /Domain=/iu, '预览站不得扩大 cookie 作用域')
  } finally {
    db.close()
  }
})

test('过渡期：旧 __Host- 会话仍可读，登出同时清掉新旧两个名字', async () => {
  const db = await seededDatabase()
  try {
    const login = await loginOn(db, PRODUCTION_HOST)
    const cookiePair = (login.headers.get('set-cookie') ?? '').split(';', 1)[0] ?? ''
    const token = cookiePair.slice(cookiePair.indexOf('=') + 1)

    // 换名前签发的会话（浏览器里还在旧名下）必须继续可用，不能因为改名把用户踢出去
    const legacy = await call(db, PRODUCTION_HOST, '/api/v1/auth/me', { headers: { cookie: `${LEGACY_SESSION_COOKIE}=${token}` } })
    assert.equal(legacy.status, 200, '旧名 cookie 必须仍被接受')

    const csrf = ((await legacy.json()) as any).csrfToken
    const logout = await call(db, PRODUCTION_HOST, '/api/v1/auth/logout', {
      method: 'POST',
      headers: { cookie: `${LEGACY_SESSION_COOKIE}=${token}`, 'x-csrf-token': csrf },
      body: '{}'
    })
    assert.equal(logout.status, 204)
    const cleared = logout.headers.getSetCookie()
    assert.ok(cleared.some((entry) => entry.startsWith('__Secure-bike_ops_session=')), '必须清当前名')
    assert.ok(cleared.some((entry) => entry.startsWith(`${LEGACY_SESSION_COOKIE}=`)), '必须同时清旧名')
    // 清 cookie 的作用域必须与签发时一致，否则浏览器里会残留一份未失效的令牌
    const current = cleared.find((entry) => entry.startsWith('__Secure-bike_ops_session=')) ?? ''
    assert.match(current, /; Domain=\.workshop\.skin/u, '清除时的 Domain 必须与签发一致')
  } finally {
    db.close()
  }
})
