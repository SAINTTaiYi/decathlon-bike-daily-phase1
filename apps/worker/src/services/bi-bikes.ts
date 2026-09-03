import { loadConfig, isMasterDataConfigured, type WorkerEnv } from '../env.js'
import { all, first } from '../db.js'
import { performMasterDataLogin, MasterDataUpstreamError } from '../lib/masterdata-login.js'

// BI 整车销量（perfeco API，2026-09-04 接入）：
// GET {baseUrl}/perfeco/v2/period/economic_performances?from&to&aggLevel&stores&families
// 头 = Bearer JWT（CubeInStore 原生受众，masterdata 登录链路复用）+ x-api-key(perfeco key)
// + target-country: CN。跨参校验硬要求带 stores 过滤（本地货币不跨国家求和）。
//
// families 白名单 = masterdata store_treeview.family_id 实测定案的整车族：
// 服务端过滤后响应天然只含整车，轮滑鞋/头盔/手套/脚撑/水壶架等配件族全部排除。
// 34906 = BUYBACK 二手车族（计入 usedBikes，不进新车榜）。
export const BIKE_FAMILY_IDS: readonly number[] = [
  738, // RUNRIDE 儿童平衡车
  3869, // TREKKING 旅行车
  5033, // MOVE / RIVERSIDE
  5039, // EXPL 山地
  5045, // BIKE 500/900/100 童车
  10218, // TRIBAN 公路
  10338, // GT / MOVE 900（BMX/城市）
  11036, // TILT / F120 折叠
  11038, // TUC 城市车
  34290, // ST RR / MTB EXPL
  35132, // RC 公路
  34906 // BUYBACK 二手车
]
const BUYBACK_FAMILY_ID = 34906

export const BI_BIKES_TZ = 'Asia/Shanghai'
const SNAPSHOT_MAX_AGE_MS = 10 * 60 * 1000
const CHUNK_SIZE = 20

export type BikeDaySnapshot = {
  available: true
  businessDate: string
  newBikes: number
  usedBikes: number
  newTo: number
  usedTo: number
  detail: Array<{ model: string; label: string | null; qty: number; to: number; buyback: boolean }>
  syncedAt: string
}

export type BikeWeekPayload = {
  available: true
  from: string
  to: string
  rows: Array<{ code: string; label: string | null; qty: number; to: number; share: number; wow: number | null; buyback: boolean }>
  total: { qty: number; to: number }
  syncedAt: string
}

export type VehicleInfo = { modelCode: string; label: string | null; familyId: number | null; isBike: boolean; isBuyback: boolean }

export class PerfecoUpstreamError extends Error {
  constructor(readonly code: string, readonly status?: number, readonly retryable = false) {
    super(code)
    this.name = 'PerfecoUpstreamError'
  }
}

export function isPerfecoConfigured(env: WorkerEnv): boolean {
  return isMasterDataConfigured(loadConfig(env).MASTERDATA) && Boolean(loadConfig(env).MASTERDATA.perfecoApiKey)
}

function weekRange(now: Date): { from: string; to: string } {
  const to = new Date(now)
  const from = new Date(now.getTime() - 6 * 86400 * 1000)
  return { from: isoDay(from), to: isoDay(to) }
}

function isoDay(value: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: BI_BIKES_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(value)
}

// 渠道分桶（physical/cc/loyalty/digital…）求和：qty 取整、金额保留两位。
function channelsSum(record: Record<string, unknown> | null | undefined, round: boolean): number {
  if (!record || typeof record !== 'object') return 0
  let total = 0
  for (const value of Object.values(record)) {
    if (typeof value === 'number' && Number.isFinite(value)) total += value
  }
  return round ? Math.round(total) : Math.round(total * 100) / 100
}

type PerfecoEntry = { id?: unknown; turnover?: Record<string, unknown>; quantity?: Record<string, unknown> }

async function fetchPerfecoEntries(env: WorkerEnv, params: Record<string, string | Array<string>>, jwt: string): Promise<PerfecoEntry[]> {
  const config = loadConfig(env).MASTERDATA
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) for (const item of value) search.append(key, String(item))
    else search.append(key, String(value))
  }
  const url = `${config.baseUrl}/perfeco/v2/period/economic_performances?${search.toString()}`
  let payload: unknown = null
  try {
    const response = await fetch(url, {
      headers: {
        authorization: `Bearer ${jwt}`,
        'x-api-key': config.perfecoApiKey!,
        'target-country': 'CN',
        accept: 'application/json'
      }
    })
    if (!response.ok) throw new PerfecoUpstreamError(`PERFECO_HTTP_${response.status}`, response.status, response.status >= 500)
    const text = await response.text()
    // 实测：查询日尚无任何销售时上游返回 200 + 空 body（凌晨/营业前常态），
    // 这不是故障——按「当日无数据」处理（entries 空 → 快照 0 台），
    // 只有非空但结构异常的 body 才算上游故障。
    payload = text.trim() ? JSON.parse(text) : null
  } catch (error) {
    if (error instanceof PerfecoUpstreamError) throw error
    throw new PerfecoUpstreamError('PERFECO_NETWORK', 502, true)
  }
  if (payload === null) return []
  const dateList = (payload as { date_list?: Array<{ agg_level_list?: PerfecoEntry[] }> } | null)?.date_list
  if (!Array.isArray(dateList) || !Array.isArray(dateList[0]?.agg_level_list)) {
    throw new PerfecoUpstreamError('PERFECO_INVALID_RESPONSE', 502, true)
  }
  return dateList[0].agg_level_list
}

async function loginJwt(env: WorkerEnv): Promise<string> {
  const config = loadConfig(env).MASTERDATA
  const { accessToken } = await performMasterDataLogin({
    authorizeUrl: config.authorizeUrl,
    tokenUrl: config.tokenUrl,
    clientId: config.clientId!,
    clientSecret: config.clientSecret!,
    redirectUri: config.redirectUri,
    scope: config.scope,
    loginKey: config.loginKey!,
    loginUsernameEnc: config.loginUsernameEnc!,
    loginPasswordEnc: config.loginPasswordEnc!
  })
  return accessToken
}

// ── article 码（Shiphub item sku / perfeco ARTICLES id，7 位）→ model r3code 反查 ──
// bi_article_map 缓存优先，未知码才打 masterdata articleinfos（逗号批量，20/批）。
async function resolveArticleModels(env: WorkerEnv, articleCodes: readonly string[], jwt: string): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!articleCodes.length) return out
  const unique = [...new Set(articleCodes)].slice(0, 200)
  const cached = await all<{ article_code: string; model_code: string }>(
    env.DB.prepare(`SELECT article_code, model_code FROM bi_article_map WHERE article_code IN (${unique.map(() => '?').join(',')})`).bind(...unique)
  )
  for (const row of cached) out.set(row.article_code, row.model_code)
  const missing = unique.filter((code) => !out.has(code) && /^\d{4,10}$/u.test(code))
  if (!missing.length) return out
  const config = loadConfig(env).MASTERDATA
  const stamp = new Date().toISOString()
  const upserts: Array<{ article: string; model: string }> = []
  for (let index = 0; index < missing.length; index += CHUNK_SIZE) {
    const part = missing.slice(index, index + CHUNK_SIZE)
    const url = `${config.baseUrl}/masterdata/v2/arbo/articleinfos/${part.join(',')}`
    let payload: unknown = null
    try {
      const response = await fetch(url, {
        headers: { authorization: `Bearer ${jwt}`, 'x-api-key': config.apiKey!, 'target-country': 'CN', accept: 'application/json' }
      })
      if (!response.ok) throw new PerfecoUpstreamError(`ARTICLEINFO_HTTP_${response.status}`, response.status, response.status >= 500)
      payload = await response.json().catch(() => null)
    } catch (error) {
      if (error instanceof PerfecoUpstreamError && !error.retryable) continue
      throw error
    }
    if (!Array.isArray(payload)) continue
    for (const item of payload as Array<{ item_id?: unknown; model_id?: unknown }>) {
      const article = typeof item.item_id === 'string' ? item.item_id : String(item.item_id ?? '')
      const model = typeof item.model_id === 'string' ? item.model_id : String(item.model_id ?? '')
      if (/^\d{4,10}$/u.test(article) && /^\d{4,10}$/u.test(model)) {
        out.set(article, model)
        upserts.push({ article, model })
      }
    }
  }
  if (upserts.length) {
    await env.DB.batch(upserts.map((row) => env.DB.prepare(`
      INSERT INTO bi_article_map (article_code, model_code, synced_at) VALUES (?, ?, ?)
      ON CONFLICT(article_code) DO UPDATE SET model_code = excluded.model_code, synced_at = excluded.synced_at
    `).bind(row.article, row.model, stamp)))
  }
  return out
}

// ── model r3code → 整车分类（bi_sku_names 扩展列缓存，未知 model 现场 modelslist 拉取）──
async function resolveModelInfo(env: WorkerEnv, modelCodes: readonly string[], jwt: string): Promise<Map<string, VehicleInfo>> {
  const out = new Map<string, VehicleInfo>()
  if (!modelCodes.length) return out
  const unique = [...new Set(modelCodes)].slice(0, 200)
  // 缓存命中判据 = family_id 非空（已分类）。迁移 0023 给旧行加的 is_bike 默认 0
  // 并不代表「已分类为非整车」——BI_SEED_CODES 等登录同步写入的旧行必须重新过
  // families 白名单，否则整车会被默认值永久误判（真实事故：20" EXPL 120 被剔除）。
  const cached = await all<{ code: string; label: string; family_id: number | null; is_bike: number; is_buyback: number }>(
    env.DB.prepare(`SELECT code, label, family_id, is_bike, is_buyback FROM bi_sku_names WHERE code IN (${unique.map(() => '?').join(',')}) AND family_id IS NOT NULL`).bind(...unique)
  )
  const known = new Set<string>()
  for (const row of cached) {
    known.add(row.code)
    out.set(row.code, {
      modelCode: row.code,
      label: row.label,
      familyId: row.family_id,
      isBike: row.is_bike === 1,
      isBuyback: row.is_buyback === 1
    })
  }
  const missing = unique.filter((code) => !known.has(code) && /^\d{4,10}$/u.test(code))
  if (!missing.length) return out
  const config = loadConfig(env).MASTERDATA
  const stamp = new Date().toISOString()
  const upserts: Array<{ code: string; label: string; universe: number | null; family: number | null; bike: number; buyback: number }> = []
  for (let index = 0; index < missing.length; index += CHUNK_SIZE) {
    const part = missing.slice(index, index + CHUNK_SIZE)
    const url = `${config.baseUrl}/masterdata/v2/modelslist/${part.join(',')}/infos`
    let payload: unknown = null
    try {
      const response = await fetch(url, {
        headers: { authorization: `Bearer ${jwt}`, 'x-api-key': config.apiKey!, 'target-country': 'CN', accept: 'application/json' }
      })
      if (!response.ok) throw new PerfecoUpstreamError(`MODELINFO_HTTP_${response.status}`, response.status, response.status >= 500)
      payload = await response.json().catch(() => null)
    } catch (error) {
      if (error instanceof PerfecoUpstreamError && !error.retryable) continue
      throw error
    }
    if (!Array.isArray(payload)) continue
    for (const item of payload as Array<{ r3code?: unknown; label?: unknown; store_treeview?: { universe_id?: unknown; family_id?: unknown } }>) {
      const code = typeof item.r3code === 'string' ? item.r3code : ''
      const label = typeof item.label === 'string' ? item.label.trim() : ''
      if (!/^\d{4,10}$/u.test(code) || !label) continue
      const tree = item.store_treeview ?? {}
      const universe = typeof tree.universe_id === 'number' ? tree.universe_id : null
      const family = typeof tree.family_id === 'number' ? tree.family_id : null
      const buyback = family === BUYBACK_FAMILY_ID || /BUYBACK|二手/u.test(label.toUpperCase())
      const bike = BIKE_FAMILY_IDS.includes(family ?? -1)
      out.set(code, { modelCode: code, label, familyId: family, isBike: bike, isBuyback: buyback })
      upserts.push({ code, label, universe, family, bike: bike ? 1 : 0, buyback: buyback ? 1 : 0 })
    }
  }
  if (upserts.length) {
    await env.DB.batch(upserts.map((row) => env.DB.prepare(`
      INSERT INTO bi_sku_names (code, label, production_label, conception_code, product_type, universe_id, family_id, is_bike, is_buyback, synced_at)
      VALUES (?, ?, NULL, NULL, NULL, ?, ?, ?, ?, ?)
      ON CONFLICT(code) DO UPDATE SET
        label = excluded.label,
        universe_id = excluded.universe_id,
        family_id = excluded.family_id,
        is_bike = excluded.is_bike,
        is_buyback = excluded.is_buyback,
        synced_at = excluded.synced_at
    `).bind(row.code, row.label, row.universe, row.family, row.bike, row.buyback, stamp)))
  }
  return out
}

// ── 公开分类查询（Shiphub 日报按 article sku 反查车型名 + 整车过滤）──
export async function resolveArticleVehicleInfo(env: WorkerEnv, articleCodes: readonly string[]): Promise<Map<string, VehicleInfo>> {
  const out = new Map<string, VehicleInfo>()
  if (!isPerfecoConfigured(env) || !articleCodes.length) return out
  const jwt = await loginJwt(env)
  const articleToModel = await resolveArticleModels(env, articleCodes, jwt)
  const models = [...new Set([...articleToModel.values()])]
  const modelInfo = await resolveModelInfo(env, models, jwt)
  for (const [article, model] of articleToModel) {
    const info = modelInfo.get(model)
    if (info) out.set(article, info)
  }
  return out
}

// ── 公开分类查询（model 码直查：BI 旧 M218 allChannel 行过滤用）──
export async function resolveModelVehicleInfo(env: WorkerEnv, modelCodes: readonly string[]): Promise<Map<string, VehicleInfo>> {
  if (!isPerfecoConfigured(env) || !modelCodes.length) return new Map()
  const jwt = await loginJwt(env)
  return resolveModelInfo(env, modelCodes, jwt)
}

// ── 当日 KPI 快照（闭店弹窗「填写数据」自动同步新车/二手车台数）──
export async function syncBikeDay(
  env: WorkerEnv,
  options: { storeId: string; storeCode: string; businessDate: string; force?: boolean; now?: Date }
): Promise<BikeDaySnapshot | null> {
  if (!isPerfecoConfigured(env)) return null
  const now = options.now ?? new Date()
  if (!options.force) {
    const cached = await readBikeDay(env, options.storeId, options.businessDate)
    if (cached && now.getTime() - Date.parse(cached.syncedAt) < SNAPSHOT_MAX_AGE_MS) return cached
  }
  const jwt = await loginJwt(env)
  const entries = await fetchPerfecoEntries(env, {
    from: options.businessDate,
    to: options.businessDate,
    aggLevel: 'ARTICLES',
    stores: [options.storeCode],
    families: BIKE_FAMILY_IDS.map(String)
  }, jwt)
  const rows = entries.map((entry) => {
    const id = typeof entry.id === 'string' ? entry.id : String(entry.id ?? '')
    return { article: id, qty: channelsSum(entry.quantity as Record<string, unknown>, true), to: channelsSum(entry.turnover as Record<string, unknown>, false) }
  }).filter((row) => row.qty > 0 && /^\d{4,10}$/u.test(row.article))
  const articleToModel = await resolveArticleModels(env, rows.map((row) => row.article), jwt)
  const models = [...new Set([...articleToModel.values()])]
  const modelInfo = await resolveModelInfo(env, models, jwt)

  const detail = new Map<string, { model: string; label: string | null; qty: number; to: number; buyback: boolean }>()
  for (const row of rows) {
    const model = articleToModel.get(row.article)
    if (!model) continue
    const info = modelInfo.get(model)
    if (!info || !info.isBike) continue
    const existing = detail.get(model)
    if (existing) {
      existing.qty += row.qty
      existing.to = Math.round((existing.to + row.to) * 100) / 100
    } else {
      detail.set(model, { model, label: info.label, qty: row.qty, to: row.to, buyback: info.isBuyback })
    }
  }
  const items = [...detail.values()].sort((a, b) => b.qty - a.qty)
  const newBikes = items.filter((item) => !item.buyback).reduce((sum, item) => sum + item.qty, 0)
  const usedBikes = items.filter((item) => item.buyback).reduce((sum, item) => sum + item.qty, 0)
  const newTo = Math.round(items.filter((item) => !item.buyback).reduce((sum, item) => sum + item.to, 0) * 100) / 100
  const usedTo = Math.round(items.filter((item) => item.buyback).reduce((sum, item) => sum + item.to, 0) * 100) / 100
  const syncedAt = now.toISOString()
  await env.DB.prepare(`
    INSERT INTO bi_bikes_snapshot (store_id, business_date, new_bikes, used_bikes, new_bikes_to, used_bikes_to, detail, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(store_id, business_date) DO UPDATE SET
      new_bikes = excluded.new_bikes,
      used_bikes = excluded.used_bikes,
      new_bikes_to = excluded.new_bikes_to,
      used_bikes_to = excluded.used_bikes_to,
      detail = excluded.detail,
      synced_at = excluded.synced_at
  `).bind(options.storeId, options.businessDate, newBikes, usedBikes, newTo, usedTo, JSON.stringify(items), syncedAt).run()
  return { available: true, businessDate: options.businessDate, newBikes, usedBikes, newTo, usedTo, detail: items, syncedAt }
}

export async function readBikeDay(env: WorkerEnv, storeId: string, businessDate: string): Promise<BikeDaySnapshot | null> {
  const row = await first<{ business_date: string; new_bikes: number; used_bikes: number; new_bikes_to: number; used_bikes_to: number; detail: string; synced_at: string }>(
    env.DB.prepare(`SELECT business_date, new_bikes, used_bikes, new_bikes_to, used_bikes_to, detail, synced_at FROM bi_bikes_snapshot WHERE store_id = ? AND business_date = ?`).bind(storeId, businessDate)
  )
  if (!row) return null
  let detail: BikeDaySnapshot['detail'] = []
  try { detail = JSON.parse(row.detail) } catch { detail = [] }
  return { available: true, businessDate: row.business_date, newBikes: row.new_bikes, usedBikes: row.used_bikes, newTo: row.new_bikes_to, usedTo: row.used_bikes_to, detail, syncedAt: row.synced_at }
}

// ── 周榜（BI 车型榜换源：本周 vs 上周 perfeco MODELS，含 wow 环比）──
export async function getBikeWeek(
  env: WorkerEnv,
  options: { storeId: string; storeCode: string; now?: Date }
): Promise<BikeWeekPayload | null> {
  if (!isPerfecoConfigured(env)) return null
  const now = options.now ?? new Date()
  const cachedRow = await first<{ detail: string; synced_at: string }>(
    env.DB.prepare(`SELECT detail, synced_at FROM bi_bikes_snapshot WHERE store_id = ? AND business_date = 'week'`).bind(options.storeId)
  )
  if (cachedRow && now.getTime() - Date.parse(cachedRow.synced_at) < SNAPSHOT_MAX_AGE_MS) {
    try {
      const parsed = JSON.parse(cachedRow.detail) as BikeWeekPayload
      if (parsed && Array.isArray(parsed.rows)) return parsed
    } catch { /* 缓存损坏 → 重拉 */ }
  }
  const { from, to } = weekRange(now)
  const prev = weekRange(new Date(now.getTime() - 7 * 86400 * 1000))
  const prevFrom = prev.from
  const prevTo = prev.to
  const jwt = await loginJwt(env)
  const [currentEntries, prevEntries] = await Promise.all([
    fetchPerfecoEntries(env, { from, to, aggLevel: 'MODELS', stores: [options.storeCode], families: BIKE_FAMILY_IDS.map(String) }, jwt),
    fetchPerfecoEntries(env, { from: prevFrom, to: prevTo, aggLevel: 'MODELS', stores: [options.storeCode], families: BIKE_FAMILY_IDS.map(String) }, jwt)
  ])
  const models = [...new Set([...currentEntries, ...prevEntries].map((entry) => String(entry.id ?? '')).filter((id) => /^\d{4,10}$/u.test(id)))]
  const modelInfo = await resolveModelInfo(env, models, jwt)
  const currentMap = new Map<string, { qty: number; to: number }>()
  for (const entry of currentEntries) {
    const qty = channelsSum(entry.quantity as Record<string, unknown>, true)
    if (qty <= 0) continue
    currentMap.set(String(entry.id), { qty, to: channelsSum(entry.turnover as Record<string, unknown>, false) })
  }
  const prevMap = new Map<string, { qty: number; to: number }>()
  for (const entry of prevEntries) {
    const qty = channelsSum(entry.quantity as Record<string, unknown>, true)
    if (qty <= 0) continue
    prevMap.set(String(entry.id), { qty, to: channelsSum(entry.turnover as Record<string, unknown>, false) })
  }
  const totalTo = [...currentMap.values()].reduce((sum, row) => sum + row.to, 0)
  const rows: BikeWeekPayload['rows'] = []
  for (const [code, current] of currentMap) {
    const info = modelInfo.get(code)
    if (!info || !info.isBike || info.isBuyback) continue // 新车榜：二手车不进榜
    const prev = prevMap.get(code)
    rows.push({
      code,
      label: info.label,
      qty: current.qty,
      to: Math.round(current.to * 100) / 100,
      share: totalTo > 0 ? Math.round((current.to / totalTo) * 1000) / 10 : 0,
      wow: prev && prev.qty > 0 ? Math.round(((current.qty - prev.qty) / prev.qty) * 1000) / 10 : null,
      buyback: false
    })
  }
  rows.sort((a, b) => b.to - a.to)
  const payload: BikeWeekPayload = {
    available: true,
    from,
    to,
    rows: rows.slice(0, 20),
    total: { qty: rows.reduce((sum, row) => sum + row.qty, 0), to: Math.round(totalTo * 100) / 100 },
    syncedAt: now.toISOString()
  }
  await env.DB.prepare(`
    INSERT INTO bi_bikes_snapshot (store_id, business_date, new_bikes, used_bikes, new_bikes_to, used_bikes_to, detail, synced_at)
    VALUES (?, 'week', 0, 0, 0, 0, ?, ?)
    ON CONFLICT(store_id, business_date) DO UPDATE SET
      detail = excluded.detail,
      synced_at = excluded.synced_at
  `).bind(options.storeId, JSON.stringify(payload), now.toISOString()).run()
  return payload
}
