import assert from 'node:assert/strict'
import test from 'node:test'
import { encryptShipHubSecret } from '../src/lib/shiphub-crypto.js'
import { BIKE_FAMILY_IDS, currentWeekWindow, getBikeWeek, getStoreWeek, isPerfecoConfigured, readBikeDay, resolveArticleVehicleInfo, resolveModelVehicleInfo, syncBikeDay } from '../src/services/bi-bikes.js'
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
    BI_PERFECO_API_KEY: 'api-key-perfeco',
    BI_SPD_API_KEY: 'api-key-spd'
  } as unknown as WorkerEnv
}

// 登录 + perfeco + masterdata 三段 mock（fetch 按顺序路由）。
function mockFetch(handlers: { perfeco?: () => unknown; articleinfo?: () => unknown; modelslist?: () => unknown; spd?: () => unknown }) {
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
    if (u.includes('/consolidated_spd/')) {
      const body = handlers.spd?.() ?? ''
      const text = typeof body === 'string' ? body : JSON.stringify(body)
      return { url: u, ok: true, status: 200, text: async () => text, json: async () => JSON.parse(text), headers: new Headers() } as unknown as Response
    }
    if (u.includes('/perfeco/')) {
      // 真实链路读 text()（空 body = 当日无数据），mock 同样走 text 通道。
      const body = handlers.perfeco?.() ?? ''
      const text = typeof body === 'string' ? body : JSON.stringify(body)
      return { url: u, ok: true, status: 200, text: async () => text, json: async () => JSON.parse(text), headers: new Headers() } as unknown as Response
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

test('BIKE_FAMILY_IDS：11 个整车 fam 含 BUYBACK 34906，不含配件/滑板车族', () => {
  assert.equal(BIKE_FAMILY_IDS.length, 11)
  assert.ok(BIKE_FAMILY_IDS.includes(34906))
  for (const accessory of [4159, 5294, 5572, 5190, 69, 886, 1117, 11630, 10339, 34875]) {
    assert.ok(!BIKE_FAMILY_IDS.includes(accessory), `fam ${accessory} 不应是整车`)
  }
  // 2026-09-04 事故：10338 是滑板车族（OXELO MOVE 900/GT 100/GLOBBER），不是 BMX
  assert.ok(!BIKE_FAMILY_IDS.includes(10338), 'fam 10338 是滑板车族，必须排除')
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

test('currentWeekWindow：Sun→Sat 周口径对齐 BI（W 编号取周六 ISO 周）', () => {
  // 2026-09-04（周五，Asia/Shanghai）：本周日 08-30 → 周六 09-05，W36，未完结。
  const w1 = currentWeekWindow(new Date('2026-09-04T03:00:00.000Z'))
  assert.equal(w1.from, '2026-08-30')
  assert.equal(w1.to, '2026-09-04')
  assert.equal(w1.toComplete, false)
  assert.equal(w1.weekLabel, 'W36')
  // 周六当天：完整周。
  const w2 = currentWeekWindow(new Date('2026-09-05T03:00:00.000Z'))
  assert.equal(w2.to, '2026-09-05')
  assert.equal(w2.toComplete, true)
  assert.equal(w2.weekLabel, 'W36')
  // 周日当天：新一周开始，窗口=当天→下周六。
  const w3 = currentWeekWindow(new Date('2026-09-06T03:00:00.000Z'))
  assert.equal(w3.from, '2026-09-06')
  assert.equal(w3.to, '2026-09-06')
  assert.equal(w3.weekLabel, 'W37')
})

test('getBikeWeek：当前周窗口 + 渠道拆分（线上/线下）+ buyback 标记', async () => {
  const env = await makeEnv()
  const mocked = mockFetch({
    perfeco: () => ({ date_list: [{ agg_level_list: [
      { id: '9010483', currency: 'CNY', quantity: { amount_other: 0, amount_physical_store: 2, amount_click_and_collect: 1 }, turnover: { amount_other: 0, amount_physical_store: 2939.8, amount_click_and_collect: 1469.9 } },
      { id: '8898957', currency: 'CNY', quantity: { amount_loyalty_card: 3 }, turnover: { amount_loyalty_card: 999.7 } },
      { id: '8640568', currency: 'CNY', quantity: { amount_physical_store: 1 }, turnover: { amount_physical_store: 258.7 } }
    ] }] }),
    modelslist: () => [
      { r3code: '9010483', label: 'RC100 V3 CN SILVER', store_treeview: { universe_id: 2, family_id: 35132 } },
      { r3code: '8898957', label: 'CN BUYBACK KIDS BIKE', store_treeview: { universe_id: 2, family_id: 34906 } },
      { r3code: '8640568', label: 'RS ILS FIT3 CN LIGHT PURPLE', store_treeview: { universe_id: 2, family_id: 886 } }
    ]
  })
  try {
    const payload = await getBikeWeek(env, { ...STORE, now: NOW })
    assert.equal(payload?.from, '2026-08-30')
    assert.equal(payload?.to, '2026-09-04')
    assert.equal(payload?.weekLabel, 'W36')
    // 轮滑鞋（fam 886 非整车）被剔除
    assert.equal(payload?.rows.length, 2)
    const rc = payload?.rows.find((r) => r.code === '9010483')
    assert.equal(rc?.qty, 3)
    assert.equal(rc?.onlineQty, 1)
    assert.equal(rc?.offlineQty, 2)
    assert.equal(rc?.onlineTo, 1469.9)
    assert.equal(rc?.offlineTo, 2939.8)
    // buyback 行保留并带标记（loyalty 归线下）
    const bb = payload?.rows.find((r) => r.code === '8898957')
    assert.equal(bb?.buyback, true)
    assert.equal(bb?.offlineQty, 3)
    assert.equal(bb?.onlineQty, 0)
    // 总计三分
    assert.equal(payload?.totals.all.qty, 6)
    assert.equal(payload?.totals.online.qty, 1)
    assert.equal(payload?.totals.offline.qty, 5)
    assert.equal(payload?.totals.all.to, 5409.4)
    assert.equal(payload?.totals.online.to, 1469.9)
    assert.equal(payload?.totals.offline.to, 3939.5)
  } finally { mocked.restore() }
})

test('getStoreWeek：perfeco STORES TO + SPD DIS + 30 分钟缓存', async () => {
  const env = await makeEnv()
  const mocked = mockFetch({
    perfeco: () => ({ date_list: [{ agg_level_list: [{ id: '1299', currency: 'CNY', quantity: { amount_physical_store: 561 }, turnover: { amount_other: 0, amount_physical_store: 38518.79, amount_click_and_collect: 1580.77, amount_digital_store: 155.21, amount_loyalty_card: 2896.05 } }] }] }),
    spd: () => ({ date_list: [{ time_value: '2026', currency_list: [{ currency: 'CNY', agg_level_list: [{ id: '1299', spd_amount: -24581.71, spd_amount_tax_excluded: -21754.85, spd_quantity: 1315 }] }] }] })
  })
  try {
    const payload = await getStoreWeek(env, { ...STORE, from: '2026-08-23', to: '2026-08-29', now: NOW })
    assert.equal(payload?.turnover.total, 43150.82)
    assert.equal(payload?.turnover.online, 1735.98)
    assert.equal(payload?.turnover.offline, 41414.84)
    assert.equal(payload?.turnover.quantity, 561)
    assert.equal(payload?.dis?.amount, 24581.71)
    assert.equal(payload?.dis?.quantity, 1315)
    // 缓存命中：二次调用零上游
    const calls = mocked.calls.length
    const again = await getStoreWeek(env, { ...STORE, from: '2026-08-23', to: '2026-08-29', now: new Date(NOW.getTime() + 5 * 60000) })
    assert.equal(mocked.calls.length, calls)
    assert.equal(again?.turnover.total, 43150.82)
  } finally { mocked.restore() }
})

test('getStoreWeek：SPD 空 body（周期无折扣）= DIS 0 而非故障', async () => {
  const env = await makeEnv()
  const mocked = mockFetch({
    perfeco: () => ({ date_list: [{ agg_level_list: [{ id: '1299', currency: 'CNY', quantity: {}, turnover: {} }] }] }),
    spd: () => ''
  })
  try {
    const payload = await getStoreWeek(env, { ...STORE, from: '2026-08-23', to: '2026-08-29', now: NOW })
    assert.equal(payload?.turnover.total, 0)
    assert.deepEqual(payload?.dis, { amount: 0, taxExcluded: 0, quantity: 0 })
  } finally { mocked.restore() }
})

test('getStoreWeek：缺 SPD key → dis null（TO 照常）', async () => {
  const env = await makeEnv()
  const unconfigured = { ...env, BI_SPD_API_KEY: undefined } as WorkerEnv
  const mocked = mockFetch({
    perfeco: () => ({ date_list: [{ agg_level_list: [{ id: '1299', currency: 'CNY', quantity: { amount_physical_store: 10 }, turnover: { amount_physical_store: 1000 } }] }] })
  })
  try {
    const payload = await getStoreWeek(unconfigured, { ...STORE, from: '2026-08-23', to: '2026-08-29', now: NOW })
    assert.equal(payload?.turnover.total, 1000)
    assert.equal(payload?.dis, null)
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

test('resolveModelInfo：迁移前旧行（family_id NULL）不污染分类，强制重拉白名单', async () => {
  const env = await makeEnv()
  // 事故复刻：登录同步时代写入的 seed 行，迁移 0023 给它 is_bike 默认 0、family_id NULL。
  // 8797823 = 20" EXPL 120 CN（fam 5039 整车），绝不能因默认值被误判为非整车。
  await env.DB.prepare(`INSERT INTO bi_sku_names (code, label, production_label, conception_code, product_type, universe_id, family_id, is_bike, is_buyback, synced_at) VALUES (?, ?, NULL, NULL, 'Z001', NULL, NULL, 0, 0, ?)`)
    .bind('8797823', '20" EXPL 120 CN', new Date().toISOString()).run()
  const mocked = mockFetch({
    articleinfo: () => [{ item_id: '4810987', model_id: '8797823' }],
    modelslist: () => [{ r3code: '8797823', label: '20" EXPL 120 CN', store_treeview: { universe_id: 2, family_id: 5039 } }]
  })
  try {
    const info = await resolveArticleVehicleInfo(env, ['4810987'])
    const articleinfo = await (env.DB as TestD1Database).prepare('SELECT model_code FROM bi_article_map WHERE article_code = ?').bind('4810987').first()
    // article → model 缓存先行
    assert.equal((articleinfo as any)?.model_code, '8797823')
    // model 重新分类：整车判定生效
    assert.equal(info.get('4810987')?.isBike, true)
    // 分类结果回写，旧行被升级
    const row = await (env.DB as TestD1Database).prepare('SELECT family_id, is_bike FROM bi_sku_names WHERE code = ?').bind('8797823').first()
    assert.equal((row as any)?.family_id, 5039)
    assert.equal((row as any)?.is_bike, 1)
  } finally { mocked.restore() }
})

test('resolveArticleVehicleInfo：D1 缓存全覆盖 → 零上游调用（读行/登录预算）', async () => {
  const env = await makeEnv()
  // 预置缓存：article→model 映射 + 已分类 model 行（family_id 非空）。
  const stamp = new Date().toISOString()
  await env.DB.prepare(`INSERT INTO bi_article_map (article_code, model_code, synced_at) VALUES (?, ?, ?)`).bind('4810987', '8797823', stamp).run()
  await env.DB.prepare(`INSERT INTO bi_sku_names (code, label, universe_id, family_id, is_bike, is_buyback, synced_at) VALUES (?, ?, 2, 5039, 1, 0, ?)`).bind('8797823', '20" EXPL 120 CN', stamp).run()
  // 任何 fetch 都记为违规：缓存全覆盖时连 IdP 登录都不该发生。
  const calls: string[] = []
  const original = globalThis.fetch
  globalThis.fetch = (async (url: any) => {
    calls.push(String(url))
    throw new Error('unexpected upstream call')
  }) as typeof fetch
  try {
    const info = await resolveArticleVehicleInfo(env, ['4810987'])
    assert.equal(info.get('4810987')?.isBike, true)
    assert.equal(info.get('4810987')?.label, '20" EXPL 120 CN')
    assert.equal(calls.length, 0)
  } finally { globalThis.fetch = original }
})

test('resolveModelVehicleInfo：已分类 model → 零上游调用（不登录 IdP）', async () => {
  const env = await makeEnv()
  const stamp = new Date().toISOString()
  await env.DB.prepare(`INSERT INTO bi_sku_names (code, label, universe_id, family_id, is_bike, is_buyback, synced_at) VALUES (?, ?, 2, 886, 0, 0, ?)`).bind('8640568', 'RS ILS FIT3 CN LIGHT PURPLE', stamp).run()
  const calls: string[] = []
  const original = globalThis.fetch
  globalThis.fetch = (async (url: any) => {
    calls.push(String(url))
    throw new Error('unexpected upstream call')
  }) as typeof fetch
  try {
    const info = await resolveModelVehicleInfo(env, ['8640568'])
    assert.equal(info.get('8640568')?.isBike, false)
    assert.equal(calls.length, 0)
  } finally { globalThis.fetch = original }
})

test('GLOBBER/OXELO 品牌硬排除：滑板车即使落入白名单 fam 也不得算整车（2026-09-04 事故回归）', async () => {
  const env = await makeEnv()
  // 事故复刻：GLOBBER ELITE GLOW 的 model 在 bi_sku_names 中 family_id=10338、
  // 旧缓存 is_bike=1（10338 移除前写入）。修正后 isBike 按 family+label 现算：
  // 10338 不在白名单 → 非整车；即使未来某 GLOBBER 被归入真自行车族，label 品牌词也拦下。
  const stamp = new Date().toISOString()
  await env.DB.prepare(`INSERT INTO bi_sku_names (code, label, universe_id, family_id, is_bike, is_buyback, synced_at) VALUES (?, ?, 2, 10338, 1, 0, ?)`)
    .bind('9000448', 'GLOBBER ELITE GLOW LIGHTS-DARK MINT', stamp).run()
  await env.DB.prepare(`INSERT INTO bi_sku_names (code, label, universe_id, family_id, is_bike, is_buyback, synced_at) VALUES (?, ?, 2, 11038, 1, 0, ?)`)
    .bind('8480274', 'TUC 100 ELOPS LF CN BLACK', stamp).run()
  await env.DB.prepare(`INSERT INTO bi_sku_names (code, label, universe_id, family_id, is_bike, is_buyback, synced_at) VALUES (?, ?, 2, 5033, 1, 0, ?)`)
    .bind('8618643', '20" MOVE 100 CN', stamp).run()
  const mocked = mockFetch({}) // 零上游：全部走缓存现算
  try {
    const info = await resolveModelVehicleInfo(env, ['9000448', '8480274', '8618643'])
    assert.equal(info.get('9000448')?.isBike, false, 'GLOBBER 滑板车不得算整车')
    assert.equal(info.get('8480274')?.isBike, true, 'TUC 城市车仍为整车')
    assert.equal(info.get('8618643')?.isBike, true, 'MOVE 100 童车仍为整车（品牌排除不得误伤 MOVE 车系）')
  } finally { mocked.restore() }
})

test('syncBikeDay：上游空 body（当日数据未入库）= 0 台而非 503', async () => {
  const env = await makeEnv()
  const mocked = mockFetch({
    // 真实行为复刻：营业前查当日，perfeco 返回 200 + 空 body
    perfeco: () => ''
  })
  try {
    const snapshot = await syncBikeDay(env, { ...STORE, businessDate: '2026-09-04', now: NOW })
    assert.equal(snapshot?.newBikes, 0)
    assert.equal(snapshot?.usedBikes, 0)
    assert.deepEqual(snapshot?.detail, [])
  } finally { mocked.restore() }
})

test('syncBikeDay：未配置凭据 → null（优雅降级）', async () => {
  const env = await makeEnv()
  const unconfigured = { ...env, BI_PERFECO_API_KEY: undefined } as WorkerEnv
  const result = await syncBikeDay(unconfigured, { ...STORE, businessDate: '2026-09-03' })
  assert.equal(result, null)
})
