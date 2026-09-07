import assert from 'node:assert/strict'
import test from 'node:test'
import { encryptShipHubSecret } from '../src/lib/shiphub-crypto.js'
import { currentWeekWindow, getServicesDay, getStoreDay } from '../src/services/bi-bikes.js'
import { BI_SYNC_END_HOUR, BI_SYNC_START_HOUR, BI_SYNC_TIMEZONE, ensureStoreWeeks, lastCompletedWeek, listBiStoreWeeks, runScheduledBiSync } from '../src/services/bi-weekly.js'
import { migratedTestDatabase } from '../security/d1-test-adapter.js'
import type { WorkerEnv } from '../src/env.js'

const LOGIN_KEY = Buffer.from('b'.repeat(32)).toString('base64')
function blob(plain: string): Promise<string> {
  return encryptShipHubSecret(plain, LOGIN_KEY).then(({ ciphertext, nonce }) => `${ciphertext}.${nonce}`)
}

async function makeEnv(): Promise<WorkerEnv> {
  const db = await migratedTestDatabase()
  return {
    DB: db,
    ASSETS: {} as Fetcher,
    APP_ENV: 'staging',
    APP_VERSION: '6.6.8',
    COOKIE_SECURE: 'true',
    SESSION_TTL_HOURS: '12',
    SESSION_SECRET: 'x'.repeat(32),
    CSRF_SECRET: 'y'.repeat(32),
    PASSWORD_PEPPER: 'z'.repeat(32),
    SHIPHUB_LOGIN_KEY: LOGIN_KEY,
    SHIPHUB_TOKEN_ENCRYPTION_KEY: Buffer.from('t'.repeat(32)).toString('base64'),
    BI_MASTERDATA_CLIENT_ID: 'cid',
    BI_MASTERDATA_CLIENT_SECRET: 'sec',
    BI_MASTERDATA_API_KEY: 'api-key-md',
    BI_MASTERDATA_LOGIN_KEY: LOGIN_KEY,
    BI_MASTERDATA_LOGIN_USERNAME_ENC: await blob('CHU13'),
    BI_MASTERDATA_LOGIN_PASSWORD_ENC: await blob('Pass/123'),
    BI_PERFECO_API_KEY: 'api-key-perfeco',
    BI_SPD_API_KEY: 'api-key-spd'
  } as unknown as WorkerEnv
}

// 1299 由迁移 0006 预置（id 30000000-0000-4000-8000-000000001299），直接引用；
// 额外门店用不撞 UNIQUE 约束的独立 code 插入。
const STORE_1299 = '30000000-0000-4000-8000-000000001299'
// 门店边界（2026-09-08）：cron 只同步持有本店凭据的门店——seed 一条带账密的连接行。
async function seedConnection(db: D1Database, storeId: string): Promise<void> {
  const [userEnc, passEnc] = await Promise.all([blob('STORE-LOGIN'), blob('Secret/9')])
  await db.prepare(`
    INSERT INTO shiphub_connections (store_id, enabled, mode, authorization_status, login_username_enc, login_password_enc, login_key_version, created_at, updated_at)
    VALUES (?, 1, 'live', 'connected', ?, ?, 'v1', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')
  `).bind(storeId, userEnc, passEnc).run()
}
const storeJwt = async () => 'jwt-store'

async function seedStore(db: D1Database, id: string, code: string): Promise<void> {
  await db.prepare(`INSERT INTO stores (id, code, name, timezone, status, created_at, updated_at) VALUES (?, ?, ?, 'Asia/Shanghai', 'active', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`).bind(id, code, `门店 ${code}`).run()
}

function perfecoEntry(id: string, qty: number, to: number, extra: Record<string, unknown> = {}) {
  return { id, currency: 'CNY', quantity: { amount_physical_store: qty }, turnover: { amount_physical_store: to }, ...extra }
}

// 登录 + perfeco + SPD 三段 mock；handlers.perfeco 可按 URL 分流。
function mockFetch(perfeco: (url: string) => unknown, spd: () => unknown = () => '') {
  const calls: string[] = []
  let lastAuthorizeUrl = ''
  const original = globalThis.fetch
  globalThis.fetch = (async (url: any, init?: any) => {
    const u = String(url)
    calls.push(u)
    if (u.includes('/as/authorization.oauth2')) {
      lastAuthorizeUrl = u
      const html = '<html><body><form method="post" action="/as/r/resume/as/authorization.ping"><input name="pf.username"><input name="pf.pass"></form></body></html>'
      return { url: u, ok: true, status: 200, text: async () => html, json: async () => ({}), headers: new Headers({ 'set-cookie': 'PF=s' }) } as unknown as Response
    }
    if (u.includes('/resume/as/authorization.ping')) {
      const state = new URL(lastAuthorizeUrl).searchParams.get('state') ?? ''
      return { url: u, ok: false, status: 302, text: async () => '', json: async () => ({}), headers: new Headers({ location: `com.decathlon.authentication://app?code=CD&state=${state}` }) } as unknown as Response
    }
    if (u.includes('/as/token.oauth2')) {
      return { url: u, ok: true, status: 200, text: async () => '', json: async () => ({ access_token: 'jwt-x' }), headers: new Headers() } as unknown as Response
    }
    if (u.includes('/consolidated_spd/')) {
      const body = spd()
      const text = typeof body === 'string' ? body : JSON.stringify(body)
      return { url: u, ok: true, status: 200, text: async () => text, json: async () => JSON.parse(text), headers: new Headers() } as unknown as Response
    }
    if (u.includes('/perfeco/')) {
      const body = perfeco(u)
      const text = typeof body === 'string' ? body : JSON.stringify(body)
      return { url: u, ok: true, status: 200, text: async () => text, json: async () => JSON.parse(text), headers: new Headers() } as unknown as Response
    }
    if (u.includes('/modelslist/')) {
      return { url: u, ok: true, status: 200, text: async () => '', json: async () => [{ r3code: '1299', label: '20\" MOVE 100 CN', store_treeview: { universe_id: 2, family_id: 5033 } }], headers: new Headers() } as unknown as Response
    }
    throw new Error(`unexpected fetch: ${u}`)
  }) as typeof fetch
  return { restore: () => { globalThis.fetch = original }, calls }
}

const PERFECO_CALLS = (calls: readonly string[]) => calls.filter((u) => u.includes('/perfeco/'))

// ── lastCompletedWeek ──
test('lastCompletedWeek：周日清早取上一 Sun→Sat 周，周六当天本周仍未完结', () => {
  // 2026-09-06 周日 → 完结周 08-30→09-05（W36）
  assert.deepEqual(lastCompletedWeek(new Date('2026-09-06T01:00:00Z')), { from: '2026-08-30', to: '2026-09-05' })
  // 2026-09-02 周三 → 本周未完，完结周是 08-23→08-29（W35）
  assert.deepEqual(lastCompletedWeek(new Date('2026-09-02T08:00:00Z')), { from: '2026-08-23', to: '2026-08-29' })
  // 2026-09-05 周六晚 → 本周六仍在营业，完结周仍是 W35
  assert.deepEqual(lastCompletedWeek(new Date('2026-09-05T15:00:00Z')), { from: '2026-08-23', to: '2026-08-29' })
})

// ── ensureStoreWeeks ──
test('ensureStoreWeeks：缺失完结周自动拉取落库，已存在则零上游调用', async () => {
  const env = await makeEnv()
  const perfecoPayload = { date_list: [{ agg_level_list: [perfecoEntry('1299', 912, 70106.62)] }] }
  const spdPayload = { date_list: [{ currency_list: [{ currency: 'CNY', agg_level_list: [{ id: '1299', spd_amount: -3210.5, spd_amount_tax_excluded: -2800.4, spd_quantity: 15 }] }] }] }
  const mocked = mockFetch(() => perfecoPayload, () => spdPayload)
  try {
    // 2026-09-06 周日：完结周 W36（08-30→09-05）缺失 → 拉取落库
    const result = await ensureStoreWeeks(env, { jwtProvider: storeJwt, storeId: STORE_1299, storeCode: '1299', now: new Date('2026-09-06T02:00:00Z') })
    assert.equal(result.pulled, 1)
    const weeks = await listBiStoreWeeks(env.DB, STORE_1299)
    assert.equal(weeks.length, 1)
    assert.equal(weeks[0].weekLabel, 'W36')
    assert.equal(weeks[0].from, '2026-08-30')
    assert.equal(weeks[0].to, '2026-09-05')
    assert.equal(weeks[0].turnover.total, 70106.62)
    assert.equal(weeks[0].dis.amount, 3210.5)
    // 再跑一次：零新拉取（幂等守卫）
    const callsBefore = PERFECO_CALLS(mocked.calls).length
    const again = await ensureStoreWeeks(env, { jwtProvider: storeJwt, storeId: STORE_1299, storeCode: '1299', now: new Date('2026-09-06T02:30:00Z') })
    assert.equal(again.pulled, 0)
    assert.equal(PERFECO_CALLS(mocked.calls).length, callsBefore)
  } finally { mocked.restore() }
})

// ── getServicesDay（安全检查 8538631）──
test('getServicesDay：models 过滤安全检查 SKU，当日开单量聚合，10 分钟缓存', async () => {
  const env = await makeEnv()
  const mocked = mockFetch((url) => {
    assert.ok(url.includes('models=8538631'), '必须按 8538631 过滤')
    assert.ok(url.includes('aggLevel=ARTICLES'))
    return { date_list: [{ agg_level_list: [perfecoEntry('2852698', 1, 69.9)] }] }
  })
  try {
    const payload = await getServicesDay(env, { jwtProvider: storeJwt, storeId: 'store-1', storeCode: '1299', businessDate: '2026-09-05', now: new Date('2026-09-06T02:00:00Z') })
    assert.ok(payload)
    assert.equal(payload!.model, '8538631')
    assert.equal(payload!.checks, 1)
    assert.equal(payload!.to, 69.9)
    const callsBefore = PERFECO_CALLS(mocked.calls).length
    const cached = await getServicesDay(env, { jwtProvider: storeJwt, storeId: 'store-1', storeCode: '1299', businessDate: '2026-09-05', now: new Date('2026-09-06T02:05:00Z') })
    assert.equal(cached!.checks, 1)
    assert.equal(PERFECO_CALLS(mocked.calls).length, callsBefore, '10 分钟内命中缓存零上游')
    // 超过 TTL → 重新拉取
    await getServicesDay(env, { jwtProvider: storeJwt, storeId: 'store-1', storeCode: '1299', businessDate: '2026-09-05', now: new Date('2026-09-06T02:30:00Z') })
    assert.ok(PERFECO_CALLS(mocked.calls).length > callsBefore)
  } finally { mocked.restore() }
})

// ── getStoreDay（当日销售概况）──
test('getStoreDay：当日 STORES 聚合返回 TO/件数/单数，缓存行 storeday:<date>', async () => {
  const env = await makeEnv()
  const mocked = mockFetch(() => ({ date_list: [{ agg_level_list: [{ ...perfecoEntry('1299', 912, 70106.62), ticket: { amount_physical_store: 440 } }] }] }))
  try {
    const payload = await getStoreDay(env, { jwtProvider: storeJwt, storeId: 'store-1', storeCode: '1299', businessDate: '2026-09-06', now: new Date('2026-09-06T08:00:00Z') })
    assert.ok(payload)
    assert.equal(payload!.turnover, 70106.62)
    assert.equal(payload!.quantity, 912)
    assert.equal(payload!.tickets, 440)
    const row = await env.DB.prepare(`SELECT business_date FROM bi_bikes_snapshot WHERE store_id = 'store-1' AND business_date = 'storeday:2026-09-06'`).first()
    assert.ok(row, '缓存行必须落库')
  } finally { mocked.restore() }
})

// ── runScheduledBiSync ──
test('runScheduledBiSync：窗口外零上游；窗口内补齐周结并预热当前周；非数字门店码跳过', async () => {
  const env = await makeEnv()
  await seedStore(env.DB, 'store-x-1', 'TEST-99') // 非数字码：必须跳过
  await seedConnection(env.DB, STORE_1299) // 本店凭据：cron 纳入的唯一条件
  const perfecoPayload = { date_list: [{ agg_level_list: [perfecoEntry('1299', 912, 70106.62)] }] }
  const mocked = mockFetch(() => perfecoPayload)
  try {
    // 北京时间 03:00（窗口 09-23 外）→ 零 fetch：2026-09-05T19:00:00Z = 北京 09-06 03:00
    const outsideCalls = mocked.calls.length
    await runScheduledBiSync(env, new Date('2026-09-05T19:00:00Z'))
    assert.equal(mocked.calls.length, outsideCalls, '窗口外必须零上游调用')
    // 北京时间 09-06 12:05（04:05Z，窗口内）→ 周结 + 当前周预热
    await runScheduledBiSync(env, new Date('2026-09-06T04:05:00Z'))
    const perfecoCalls = PERFECO_CALLS(mocked.calls)
    assert.ok(perfecoCalls.length >= 3, `窗口内应有 perfeco 调用（周结+车型周+门店周），实际 ${perfecoCalls.length}`)
    assert.ok(perfecoCalls.some((u) => u.includes('aggLevel=MODELS')), '车型周榜预热')
    assert.ok(perfecoCalls.some((u) => u.includes('aggLevel=STORES')), '门店周 TO 预热/周结')
    const weeks = await listBiStoreWeeks(env.DB, STORE_1299)
    assert.equal(weeks.length, 1)
    assert.equal(weeks[0].weekLabel, 'W36')
  } finally { mocked.restore() }
})

// ── 门店白名单（2026-09-06 用户定案：凭据=1299 CHU13，绝不越权拉其他门店）──
test('runScheduledBiSync：无本店凭据的门店零上游（门店边界铁律 fail-closed）', async () => {
  const perfecoPayload = { date_list: [{ agg_level_list: [perfecoEntry('1299', 912, 70106.62)] }] }
  // 白名单机制已废除（2026-09-08）：即使部署级 BI 凭据配置齐全
  // （makeEnv 注入 BI_MASTERDATA_LOGIN_*），无本店凭据的门店也绝不拉取。
  const envNone = await makeEnv()
  const mockedNone = mockFetch(() => perfecoPayload)
  try {
    await runScheduledBiSync(envNone, new Date('2026-09-06T04:05:00Z'))
    assert.equal(mockedNone.calls.length, 0, '无本店凭据连接行时 cron 必须零上游（含 1299）')
  } finally { mockedNone.restore() }
  // 断开（enabled=0）或只有无凭据连接的门店同样不拉
  const envDisabled = await makeEnv()
  await seedConnection(envDisabled.DB, STORE_1299)
  await envDisabled.DB.prepare('UPDATE shiphub_connections SET enabled = 0 WHERE store_id = ?').bind(STORE_1299).run()
  const mockedDisabled = mockFetch(() => perfecoPayload)
  try {
    await runScheduledBiSync(envDisabled, new Date('2026-09-06T04:05:00Z'))
    assert.equal(mockedDisabled.calls.length, 0, 'enabled=0 的连接不得参与同步')
  } finally { mockedDisabled.restore() }
})

// ── cron 窗口常量 ──
test('BI 同步窗口固定北京时间 09–23（KPI 常在 21–22 点填写，晚于 Shiphub 收窗）', () => {
  assert.equal(BI_SYNC_TIMEZONE, 'Asia/Shanghai')
  assert.equal(BI_SYNC_START_HOUR, 9)
  assert.equal(BI_SYNC_END_HOUR, 23)
  // 与车型周榜同一周口径（Sun→Sat）
  const w = currentWeekWindow(new Date('2026-09-06T01:00:00Z'))
  assert.equal(w.from, '2026-09-06')
  assert.equal(w.toComplete, false)
})
