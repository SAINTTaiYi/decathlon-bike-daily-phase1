import assert from 'node:assert/strict'
import test from 'node:test'
import { encryptShipHubSecret } from '../src/lib/shiphub-crypto.js'
import { BIKE_FAMILY_IDS, getBikeWeek, isPerfecoConfigured, readBikeDay, resolveArticleVehicleInfo, syncBikeDay } from '../src/services/bi-bikes.js'
import { loadConfig, type WorkerEnv } from '../src/env.js'
import { migratedTestDatabase, type TestD1Database } from '../security/d1-test-adapter.js'

const LOGIN_KEY = Buffer.from('b'.repeat(32)).toString('base64')
function blob(plain: string): Promise<string> {
  return encryptShipHubSecret(plain, LOGIN_KEY).then(({ ciphertext, nonce }) => `${ciphertext}.${nonce}`)
}

// perfeco 渠道分桶样例（与线上真实响应形状一致）。
function perfecoEntry(id: string, qty: number, to: number) {
  return { id, currency: 'CNY', quantity: { amount_other: 0, amount_physical_store: qty }, turnover: { amount_other: 0, amount_physical_store: to } }
}

async function makeEnv(): Promise<WorkerEnv> {
  const db = await migratedTestDatabase()
  return {
    DB: db,
    ASSETS: {} as Fetcher,
    APP_ENV: 'staging',
    APP_VERSION: '6.5.3',
    COOKIE_SECURE: 'true',
    SESSION_TTL_HOURS: '12',
    SESSION_SECRET: 'x'.repeat(32),
    CSRF_SECRET: 'y'.repeat(32),
    PASSWORD_PEPPER: 'z'.repeat(32),
    BI_MASTERDATA_CLIENT_ID: 'cid',
    BI_MASTERDATA_CLIENT_SECRET: 'sec',
    BI_MASTERDATA_API_KEY: 'api-key-md',
    BI_MASTERDATA_LOGIN_KEY: LOGIN_KEY,
    BI_MASTERDATA_LOGIN_USERNAME_ENC: await blob('CHU13'),
    BI_MASTERDATA_LOGIN_PASSWORD_ENC: await blob('Pass/123'),
    BI_PERFECO_API_KEY: 'api-key-perfeco'
  } as unknown as WorkerEnv
}

// 登录 + perfeco + masterdata 三段 mock（fetch 按顺序路由）。
function mockFetch(handlers: { perfeco?: () => unknown; articleinfo?: () => unknown; modelslist?: () => unknown }) {
  const calls: string[] = []
  let lastAuthorizeUrl = ''
  const original = globalThis.fetch
  globalThis.fetch = (async (url: any, init?: any) => {
    const u = String(url)
    calls.push(u)
    if (u.includes('/as/authorization.oauth2')) {
      lastAuthorizeUrl = u
      const html = '<html><body><form method="post" action="/as/r/resume/as/authorization.ping"><input type="hidden" name="pf.adapterId" value="DataHtmlForm"><input name="pf.username"><input name="pf.pass"></form></body></html>'
      return { url: u, ok: true, status: 200, text: async () => html, json: async () => ({}), headers: new Headers({ 'set-cookie': 'PF=s' }) } as unknown as Response
    }
    if (u.includes('/resume/as/authorization.ping')) {
      const state = new URL(lastAuthorizeUrl).searchParams.get('state') ?? ''
      return { url: u, ok: false, status: 302, text: async () => '', json: async () => ({}), headers: new Headers({ location: `com.decathlon.authentication://com.oxylane.android.cubeinstore?code=CD&state=${state}` }) } as unknown as Response
    }
    if (u.includes('/as/token.oauth2')) {
      return { url: u, ok: true, status: 200, text: async () => '', json: async () => ({ access_token: 'jwt-x' }), headers: new Headers() } as unknown as Response
    }
    if (u.includes('/perfeco/')) {
      return { url: u, ok: true, status: 200, text: async () => '', json: async () => handlers.perfeco?.() ?? { date_list: [] }, headers: new Headers() } as unknown as Response
    }
    if (u.includes('/arbo/articleinfos/')) {
      return { url: u, ok: true, status: 200, text: async () => '', json: async () => handlers.articleinfo?.() ?? [], headers: new Headers() } as unknown as Response
    }
    if (u.includes('/modelslist/')) {
      return { url: u, ok: true, status: 200, text: async () => '', json: async () => handlers.modelslist?.() ?? [], headers: new Headers() } as unknown as Response
    }
    throw new Error(`unexpected fetch: ${u}`)
  }) as typeof fetch
  return { restore: () => { globalThis.fetch = original }, calls }
}

const STORE = { storeId: 'store-1', storeCode: '1299' }
const NOW = new Date('2026-09-04T03:00:00.000Z')

test('BIKE_FAMILY_IDS：12 个整车 fam 含 BUYBACK 34906，不含配件 fam', () => {
  assert.equal(BIKE_FAMILY_IDS.length, 12)
  assert.ok(BIKE_FAMILY_IDS.includes(34906))
  for (const accessory of [4159, 5294, 5572, 5190, 69, 886, 1117, 11630, 10339, 34875]) {
    assert.ok(!BIKE_FAMILY_IDS.includes(accessory), `fam ${accessory} 不应是整车`)
  }
})

test('isPerfecoConfigured：缺 perfeco key 时 false', async () => {
  const env = await makeEnv()
  assert.ok(isPerfecoConfigured(env))
  const partial = { ...env, BI_PERFECO_API_KEY: undefined } as WorkerEnv
  assert.equal(isPerfecoConfigured(partial), false)
  assert.equal(loadConfig(env).MASTERDATA.perfecoApiKey, 'api-key-perfeco')
})

test('syncBikeDay：新车/二手分离、article→model 缓存、快照落库', async () => {
  const env = await makeEnv()
  const mocked = mockFetch({
    perfeco: () => ({ date_list: [{ agg_level_list: [perfecoEntry('5145686', 1, 649.3), perfecoEntry('5312006', 3, 999.7)] }] }),
    articleinfo: () => [
      { item_id: '5145686', model_id: '8871304' },
      { item_id: '5312006', model_id: '8898957' }
    ],
    modelslist: () => [
      { r3code: '8871304', label: '16" BIKE 500 PINK CN', store_treeview: { universe_id: 2, family_id: 5045 } },
      { r3code: '8898957', label: 'CN BUYBACK KIDS BIKE', store_treeview: { universe_id: 2, family_id: 34906 } }
    ]
  })
  try {
    const snapshot = await syncBikeDay(env, { ...STORE, businessDate: '2026-09-03', now: NOW })
    assert.equal(snapshot?.newBikes, 1)
    assert.equal(snapshot?.usedBikes, 3)
    assert.equal(snapshot?.newTo, 649.3)
    assert.equal(snapshot?.usedTo, 999.7)
    assert.equal(snapshot?.detail.length, 2)
    // article 映射与分类都落库
    const mapRow = await (env.DB as TestD1Database).prepare('SELECT model_code FROM bi_article_map WHERE article_code = ?').bind('5145686').first()
    assert.equal((mapRow as any)?.model_code, '8871304')
    const classRow = await (env.DB as TestD1Database).prepare('SELECT is_bike, is_buyback FROM bi_sku_names WHERE code = ?').bind('8898957').first()
    assert.equal((classRow as any)?.is_bike, 1)
    assert.equal((classRow as any)?.is_buyback, 1)
    // 快照可读回
    const reread = await readBikeDay(env, STORE.storeId, '2026-09-03')
    assert.equal(reread?.newBikes, 1)
    assert.equal(reread?.usedBikes, 3)
  } finally { mocked.restore() }
})

test('syncBikeDay：非整车（families 白名单外）不计入快照', async () => {
  const env = await makeEnv()
  const mocked = mockFetch({
    perfeco: () => ({ date_list: [{ agg_level_list: [perfecoEntry('4265914', 1, 258.7), perfecoEntry('5493775', 1, 1299)] }] }),
    articleinfo: () => [
      { item_id: '4265914', model_id: '8640568' }, // 轮滑鞋
      { item_id: '5493775', model_id: '8480274' } // TUC 城市车
    ],
    modelslist: () => [
      { r3code: '8640568', label: 'RS ILS FIT3 CN LIGHT PURPLE', store_treeview: { universe_id: 2, family_id: 886 } },
      { r3code: '8480274', label: 'TUC 100 ELOPS LF CN BLACK', store_treeview: { universe_id: 2, family_id: 11038 } }
    ]
  })
  try {
    const snapshot = await syncBikeDay(env, { ...STORE, businessDate: '2026-09-03', now: NOW })
    assert.equal(snapshot?.newBikes, 1) // 只有城市车
    assert.equal(snapshot?.detail.length, 1)
    assert.equal(snapshot?.detail[0]?.label, 'TUC 100 ELOPS LF CN BLACK')
  } finally { mocked.restore() }
})

test('syncBikeDay：10 分钟快照缓存内零上游调用', async () => {
  const env = await makeEnv()
  const mocked = mockFetch({
    perfeco: () => ({ date_list: [{ agg_level_list: [perfecoEntry('5312006', 3, 999.7)] }] }),
    articleinfo: () => [{ item_id: '5312006', model_id: '8898957' }],
    modelslist: () => [{ r3code: '8898957', label: 'CN BUYBACK KIDS BIKE', store_treeview: { universe_id: 2, family_id: 34906 } }]
  })
  try {
    await syncBikeDay(env, { ...STORE, businessDate: '2026-09-03', now: NOW })
    const callsAfterFirst = mocked.calls.length
    const again = await syncBikeDay(env, { ...STORE, businessDate: '2026-09-03', now: new Date(NOW.getTime() + 5 * 60 * 1000) })
    assert.equal(mocked.calls.length, callsAfterFirst) // 缓存命中，没有新请求
    assert.equal(again?.usedBikes, 3)
    // 超过 10 分钟 → 重新同步
    await syncBikeDay(env, { ...STORE, businessDate: '2026-09-03', now: new Date(NOW.getTime() + 11 * 60 * 1000) })
    assert.ok(mocked.calls.length > callsAfterFirst)
  } finally { mocked.restore() }
})

test('getBikeWeek：本周/上周 wow、二手车不进新车榜', async () => {
  const env = await makeEnv()
  let perfecoCalls = 0
  const mocked = mockFetch({
    perfeco: () => {
      perfecoCalls += 1
      // 前半周（当前窗口）：RC 2 台 + EXPL 1 台 + BUYBACK 3 台；上周：RC 5 台、EXPL 1 台
      const list = perfecoCalls === 1
        ? [perfecoEntry('9010483', 2, 2939.8), perfecoEntry('8797823', 1, 769.9), perfecoEntry('8898957', 3, 999.7)]
        : [perfecoEntry('9010483', 5, 7349.5), perfecoEntry('8797823', 1, 769.9)]
      return { date_list: [{ agg_level_list: list }] }
    },
    modelslist: () => [
      { r3code: '9010483', label: 'RC100 V3 CN SILVER', store_treeview: { universe_id: 2, family_id: 35132 } },
      { r3code: '8797823', label: '20" EXPL 120 CN', store_treeview: { universe_id: 2, family_id: 5039 } },
      { r3code: '8898957', label: 'CN BUYBACK KIDS BIKE', store_treeview: { universe_id: 2, family_id: 34906 } }
    ]
  })
  try {
    const payload = await getBikeWeek(env, { ...STORE, now: NOW })
    assert.equal(perfecoCalls, 2) // 本周 + 上周
    assert.equal(payload?.rows.length, 2) // BUYBACK 不进新车榜
    const rc = payload?.rows.find((row) => row.code === '9010483')
    assert.equal(rc?.qty, 2)
    assert.equal(rc?.wow, -60) // (2-5)/5 = -60%
    assert.equal(payload?.total.qty, 3)
  } finally { mocked.restore() }
})

test('resolveArticleVehicleInfo：日报分类（整车/非整车/二手三态）', async () => {
  const env = await makeEnv()
  const mocked = mockFetch({
    articleinfo: () => [
      { item_id: '4810987', model_id: '8797823' },
      { item_id: '4265914', model_id: '8640568' },
      { item_id: '5312006', model_id: '8898957' }
    ],
    modelslist: () => [
      { r3code: '8797823', label: '20" EXPL 120 CN', store_treeview: { universe_id: 2, family_id: 5039 } },
      { r3code: '8640568', label: 'RS ILS FIT3 CN LIGHT PURPLE', store_treeview: { universe_id: 2, family_id: 886 } },
      { r3code: '8898957', label: 'CN BUYBACK KIDS BIKE', store_treeview: { universe_id: 2, family_id: 34906 } }
    ]
  })
  try {
    const info = await resolveArticleVehicleInfo(env, ['4810987', '4265914', '5312006'])
    assert.equal(info.get('4810987')?.isBike, true)
    assert.equal(info.get('4810987')?.label, '20" EXPL 120 CN')
    assert.equal(info.get('4265914')?.isBike, false) // 轮滑鞋 → 日报剔除
    assert.equal(info.get('5312006')?.isBike, true)
    assert.equal(info.get('5312006')?.isBuyback, true)
  } finally { mocked.restore() }
})

test('syncBikeDay：未配置凭据 → null（优雅降级）', async () => {
  const env = await makeEnv()
  const unconfigured = { ...env, BI_PERFECO_API_KEY: undefined } as WorkerEnv
  const result = await syncBikeDay(unconfigured, { ...STORE, businessDate: '2026-09-03' })
  assert.equal(result, null)
})
