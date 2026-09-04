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
  11036, // TILT / F120 折叠
  11038, // TUC 城市车
  34290, // ST RR / MTB EXPL
  35132, // RC 公路
  34906 // BUYBACK 二手车
]
// 滑板车/轮滑第三方品牌词硬排除（2026-09-04 事故：GLOBBER ELITE GLOW 落在 10338
// 被误判为整车——10338 实为滑板车族已从白名单移除；此处为防御层，防未来某滑板车
// model 被 masterdata 归入真实自行车族时再次混入。OXELO=迪卡侬轮滑/滑板/滑板车线，
// 该品牌词不会出现在 B'TWIN 自行车 label 上）。
const SCOOTER_BRAND_RE = /GLOBBER|OXELO/u
const BUYBACK_FAMILY_ID = 34906

export const BI_BIKES_TZ = 'Asia/Shanghai'
// 读行/上游预算（2026-09-04 优化）：日快照 10 分钟（KPI 弹窗要当日实销，取新鲜）；
// 周榜 30 分钟（周聚合变化慢，拉长缓存减少 IdP 登录与 perfeco 调用次数）。
const DAY_SNAPSHOT_MAX_AGE_MS = 10 * 60 * 1000
const WEEK_SNAPSHOT_MAX_AGE_MS = 30 * 60 * 1000

// ── 渠道拆分（2026-09-04 第二轮：销售榜 全渠道/线上/线下 三分）──
// perfeco 渠道桶求和恰好等于 total（实测 08-28→09-03：385,189+15,808+1,552+28,960=431,509）。
// 线上 = 电商发货 + 到店自提（线上下单）；线下 = 实体店 + 会员卡 + 其他/decapro。
// 拆分定义随卡片 basis 明示，绝不静默归类。
const ONLINE_CHANNEL_KEYS: readonly string[] = ['amount_digital_store', 'amount_click_and_collect', 'amount_ecommerce', 'amount_zip_code']

function channelSplit(record: Record<string, unknown> | null | undefined, round: boolean): { online: number; offline: number } {
  let online = 0
  let total = 0
  if (record && typeof record === 'object') {
    for (const [key, value] of Object.entries(record)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) continue
      total += value
      if (ONLINE_CHANNEL_KEYS.includes(key)) online += value
    }
  }
  const offline = total - online
  return round ? { online: Math.round(online), offline: Math.round(offline) } : { online: Math.round(online * 100) / 100, offline: Math.round(offline * 100) / 100 }
}

// ── 周口径（2026-09-04）：对齐 BI 快照的 Sun→Sat 周（M332 W35=08-23→08-29 实证），
// W 编号取周六所在 ISO 周。当前周窗口 = 本周日 → min(今天, 本周六)。
function parseDay(day: string): Date {
  const [year = 0, month = 1, date = 1] = day.split('-').map((part) => Number(part) || 0)
  return new Date(Date.UTC(year, month - 1, date))
}
function fmtDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}
function isoWeekOf(day: string): { week: number; label: string } {
  const date = parseDay(day)
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return { week, label: `W${String(week).padStart(2, '0')}` }
}
export function currentWeekWindow(now: Date): { from: string; to: string; toComplete: boolean; weekNumber: number; weekLabel: string } {
  const today = isoDay(now)
  const date = parseDay(today)
  const sunday = new Date(date)
  sunday.setUTCDate(date.getUTCDate() - date.getUTCDay())
  const saturday = new Date(sunday)
  saturday.setUTCDate(sunday.getUTCDate() + 6)
  const from = fmtDay(sunday)
  const saturdayStr = fmtDay(saturday)
  const toComplete = today === saturdayStr
  const { week, label } = isoWeekOf(saturdayStr)
  return { from, to: toComplete ? saturdayStr : today, toComplete, weekNumber: week, weekLabel: label }
}
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

export type BikeWeekRow = {
  code: string
  label: string | null
  qty: number
  to: number
  buyback: boolean
  onlineQty: number
  onlineTo: number
  offlineQty: number
  offlineTo: number
}
export type BikeWeekPayload = {
  available: true
  source: 'CIS perfeco'
  weekNumber: number
  weekLabel: string
  from: string
  to: string
  toComplete: boolean
  rows: BikeWeekRow[]
  totals: { all: { qty: number; to: number }; online: { qty: number; to: number }; offline: { qty: number; to: number } }
  syncedAt: string
}
export type StoreWeekPayload = {
  available: true
  source: 'CIS perfeco + SPD'
  from: string
  to: string
  turnover: { total: number; online: number; offline: number; quantity: number }
  dis: { amount: number; taxExcluded: number; quantity: number } | null
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

// 惰性登录（2026-09-04 读行/上游预算优化）：D1 缓存全覆盖的请求零上游调用——
// 只有确有未解析码需要 masterdata 补齐时才打 IdP。promise 级 memoize 天然防
// 并发双登录；失败自动清空，下一次调用重试。perfeco 查询每次都要即时 token
// （上游 2h 过期且不缓存），provider 复用同一 token 避免同请求内重复登录。
type JwtProvider = () => Promise<string>
function lazyLoginJwt(env: WorkerEnv): JwtProvider {
  let inflight: Promise<string> | null = null
  return () => {
    if (!inflight) {
      inflight = loginJwt(env)
      inflight.catch(() => { inflight = null })
    }
    return inflight
  }
}

// ── article 码（Shiphub item sku / perfeco ARTICLES id，7 位）→ model r3code 反查 ──
// bi_article_map 缓存优先，未知码才打 masterdata articleinfos（逗号批量，20/批）。
async function resolveArticleModels(env: WorkerEnv, articleCodes: readonly string[], getJwt: JwtProvider): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!articleCodes.length) return out
  const unique = [...new Set(articleCodes)].slice(0, 200)
  const cached = await all<{ article_code: string; model_code: string }>(
    env.DB.prepare(`SELECT article_code, model_code FROM bi_article_map WHERE article_code IN (${unique.map(() => '?').join(',')})`).bind(...unique)
  )
  for (const row of cached) out.set(row.article_code, row.model_code)
  const missing = unique.filter((code) => !out.has(code) && /^\d{4,10}$/u.test(code))
  if (!missing.length) return out
  const jwt = await getJwt()
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
async function resolveModelInfo(env: WorkerEnv, modelCodes: readonly string[], getJwt: JwtProvider): Promise<Map<string, VehicleInfo>> {
  const out = new Map<string, VehicleInfo>()
  if (!modelCodes.length) return out
  const unique = [...new Set(modelCodes)].slice(0, 200)
  // 缓存命中判据 = family_id 非空（已分类）。迁移 0023 给旧行加的 is_bike 默认 0
  // 并不代表「已分类为非整车」——BI_SEED_CODES 等登录同步写入的旧行必须重新过
  // families 白名单，否则整车会被默认值永久误判（真实事故：20" EXPL 120 被剔除）。
  // 2026-09-04 事故修正：isBike/isBuyback 不信任落库列，按 family_id + label 现算——
  // 白名单演进（如移除滑板车族 10338）即时生效，无需刷库。
  const cached = await all<{ code: string; label: string; family_id: number | null; is_buyback: number }>(
    env.DB.prepare(`SELECT code, label, family_id, is_buyback FROM bi_sku_names WHERE code IN (${unique.map(() => '?').join(',')}) AND family_id IS NOT NULL`).bind(...unique)
  )
  const known = new Set<string>()
  for (const row of cached) {
    known.add(row.code)
    const bike = BIKE_FAMILY_IDS.includes(row.family_id ?? -1) && !SCOOTER_BRAND_RE.test(row.label)
    out.set(row.code, {
      modelCode: row.code,
      label: row.label,
      familyId: row.family_id,
      isBike: bike,
      isBuyback: row.family_id === BUYBACK_FAMILY_ID || /BUYBACK|二手/u.test(row.label.toUpperCase())
    })
  }
  const missing = unique.filter((code) => !known.has(code) && /^\d{4,10}$/u.test(code))
  if (!missing.length) return out
  const jwt = await getJwt()
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
      const bike = BIKE_FAMILY_IDS.includes(family ?? -1) && !SCOOTER_BRAND_RE.test(label)
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
  // 读行/上游预算：先查 D1 缓存，全覆盖时下面两个 resolver 都不触发 IdP 登录。
  const getJwt = lazyLoginJwt(env)
  const articleToModel = await resolveArticleModels(env, articleCodes, getJwt)
  const models = [...new Set([...articleToModel.values()])]
  const modelInfo = await resolveModelInfo(env, models, getJwt)
  for (const [article, model] of articleToModel) {
    const info = modelInfo.get(model)
    if (info) out.set(article, info)
  }
  return out
}

// ── 公开分类查询（model 码直查：BI 旧 M218 allChannel 行过滤用）──
export async function resolveModelVehicleInfo(env: WorkerEnv, modelCodes: readonly string[]): Promise<Map<string, VehicleInfo>> {
  if (!isPerfecoConfigured(env) || !modelCodes.length) return new Map()
  const getJwt = lazyLoginJwt(env)
  return resolveModelInfo(env, modelCodes, getJwt)
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
    if (cached && now.getTime() - Date.parse(cached.syncedAt) < DAY_SNAPSHOT_MAX_AGE_MS) return cached
  }
  const getJwt = lazyLoginJwt(env)
  const entries = await fetchPerfecoEntries(env, {
    from: options.businessDate,
    to: options.businessDate,
    aggLevel: 'ARTICLES',
    stores: [options.storeCode],
    families: BIKE_FAMILY_IDS.map(String)
  }, await getJwt())
  const rows = entries.map((entry) => {
    const id = typeof entry.id === 'string' ? entry.id : String(entry.id ?? '')
    return { article: id, qty: channelsSum(entry.quantity as Record<string, unknown>, true), to: channelsSum(entry.turnover as Record<string, unknown>, false) }
  }).filter((row) => row.qty > 0 && /^\d{4,10}$/u.test(row.article))
  const articleToModel = await resolveArticleModels(env, rows.map((row) => row.article), getJwt)
  const models = [...new Set([...articleToModel.values()])]
  const modelInfo = await resolveModelInfo(env, models, getJwt)

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
  const window = currentWeekWindow(now)
  const cachedRow = await first<{ detail: string; synced_at: string }>(
    env.DB.prepare(`SELECT detail, synced_at FROM bi_bikes_snapshot WHERE store_id = ? AND business_date = 'week'`).bind(options.storeId)
  )
  if (cachedRow) {
    const age = now.getTime() - Date.parse(cachedRow.synced_at)
    if (age >= 0 && age < WEEK_SNAPSHOT_MAX_AGE_MS) {
      try {
        const parsed = JSON.parse(cachedRow.detail) as BikeWeekPayload
        // 跨周边界：缓存窗口不是本周 → 作废（周一早晨天然触发重拉）。
        if (parsed && parsed.from === window.from && Array.isArray(parsed.rows)) return parsed
      } catch { /* 缓存损坏 → 重拉 */ }
    }
  }
  const getJwt = lazyLoginJwt(env)
  const jwt = await getJwt()
  const entries = await fetchPerfecoEntries(env, {
    from: window.from,
    to: window.to,
    aggLevel: 'MODELS',
    stores: [options.storeCode],
    families: BIKE_FAMILY_IDS.map(String)
  }, jwt)
  const models = [...new Set(entries.map((entry) => String(entry.id ?? '')).filter((id) => /^\d{4,10}$/u.test(id)))]
  const modelInfo = await resolveModelInfo(env, models, getJwt)

  const rows: BikeWeekRow[] = []
  const totals = { all: { qty: 0, to: 0 }, online: { qty: 0, to: 0 }, offline: { qty: 0, to: 0 } }
  for (const entry of entries) {
    const code = String(entry.id ?? '')
    if (!/^\d{4,10}$/u.test(code)) continue
    const qtySplit = channelSplit(entry.quantity as Record<string, unknown>, true)
    const toSplit = channelSplit(entry.turnover as Record<string, unknown>, false)
    if (qtySplit.online + qtySplit.offline <= 0) continue
    const info = modelInfo.get(code)
    if (!info || !info.isBike) continue // families 服务端已过滤，此处双保险
    const row: BikeWeekRow = {
      code,
      label: info.label,
      qty: qtySplit.online + qtySplit.offline,
      to: Math.round((toSplit.online + toSplit.offline) * 100) / 100,
      buyback: info.isBuyback,
      onlineQty: qtySplit.online,
      onlineTo: toSplit.online,
      offlineQty: qtySplit.offline,
      offlineTo: toSplit.offline
    }
    rows.push(row)
    totals.all.qty += row.qty
    totals.all.to = Math.round((totals.all.to + row.to) * 100) / 100
    totals.online.qty += row.onlineQty
    totals.online.to = Math.round((totals.online.to + row.onlineTo) * 100) / 100
    totals.offline.qty += row.offlineQty
    totals.offline.to = Math.round((totals.offline.to + row.offlineTo) * 100) / 100
  }
  rows.sort((a, b) => b.to - a.to)
  const payload: BikeWeekPayload = {
    available: true,
    source: 'CIS perfeco',
    weekNumber: window.weekNumber,
    weekLabel: window.weekLabel,
    from: window.from,
    to: window.to,
    toComplete: window.toComplete,
    rows: rows.slice(0, 30),
    totals,
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

// ── 门店周 TO + DIS（BI × CIS 对比卡的 CIS 侧）──
// TO = perfeco STORES 聚合（全店口径、非整车）；DIS = consolidated_spd 折扣减让流水
// （POST agg_levels/STORES + stores 过滤，spd_amount 为负值，取绝对值展示）。
// SPD 与 perfeco 同一 CubeInStore JWT 受众、不同 x-api-key（BI_SPD_API_KEY），
// 未配置 SPD key 时 dis 为 null（前端只对比 TO，不装死）。
async function fetchSpdStoreTotal(
  env: WorkerEnv,
  storeCode: string,
  from: string,
  to: string,
  jwt: string
): Promise<{ amount: number; taxExcluded: number; quantity: number } | null> {
  const config = loadConfig(env).MASTERDATA
  if (!config.spdApiKey) return null
  const url = `${config.baseUrl}/consolidated_spd/api/v1/spds/from/${from}/to/${to}/agg_levels/STORES`
  let payload: unknown = null
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${jwt}`,
        'x-api-key': config.spdApiKey,
        'target-country': 'CN',
        accept: 'application/json',
        'content-type': 'application/json'
      },
      body: JSON.stringify({ stores: [storeCode], epvTypes: [], epvSubTypes: [], departments: [], models: [] })
    })
    if (!response.ok) throw new PerfecoUpstreamError(`SPD_HTTP_${response.status}`, response.status, response.status >= 500)
    const text = await response.text()
    // 与 perfeco 同款容错：周期内无折扣记录时上游返回空 body。
    payload = text.trim() ? JSON.parse(text) : null
  } catch (error) {
    if (error instanceof PerfecoUpstreamError) throw error
    throw new PerfecoUpstreamError('SPD_NETWORK', 502, true)
  }
  if (payload === null) return { amount: 0, taxExcluded: 0, quantity: 0 }
  const dateList = (payload as { date_list?: Array<{ currency_list?: Array<{ currency?: unknown; agg_level_list?: Array<{ id?: unknown; spd_amount?: unknown; spd_amount_tax_excluded?: unknown; spd_quantity?: unknown }> }> }> })?.date_list
  for (const day of dateList ?? []) {
    for (const currency of day.currency_list ?? []) {
      if (currency.currency !== 'CNY') continue
      for (const agg of currency.agg_level_list ?? []) {
        if (String(agg.id ?? '') !== storeCode) continue
        const amount = typeof agg.spd_amount === 'number' ? Math.abs(agg.spd_amount) : 0
        const taxExcluded = typeof agg.spd_amount_tax_excluded === 'number' ? Math.abs(agg.spd_amount_tax_excluded) : 0
        const quantity = typeof agg.spd_quantity === 'number' ? Math.round(agg.spd_quantity) : 0
        return { amount: Math.round(amount * 100) / 100, taxExcluded: Math.round(taxExcluded * 100) / 100, quantity }
      }
    }
  }
  return { amount: 0, taxExcluded: 0, quantity: 0 }
}

export async function getStoreWeek(
  env: WorkerEnv,
  options: { storeId: string; storeCode: string; from: string; to: string; now?: Date }
): Promise<StoreWeekPayload | null> {
  if (!isPerfecoConfigured(env)) return null
  const now = options.now ?? new Date()
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(options.from) || !/^\d{4}-\d{2}-\d{2}$/u.test(options.to)) {
    throw new PerfecoUpstreamError('STORE_WEEK_BAD_WINDOW', 400, false)
  }
  if (Date.parse(options.to) - Date.parse(options.from) > 31 * 86400 * 1000) {
    throw new PerfecoUpstreamError('STORE_WEEK_WINDOW_TOO_LONG', 400, false)
  }
  const cacheKey = `store:${options.from}:${options.to}`
  const cachedRow = await first<{ detail: string; synced_at: string }>(
    env.DB.prepare(`SELECT detail, synced_at FROM bi_bikes_snapshot WHERE store_id = ? AND business_date = ?`).bind(options.storeId, cacheKey)
  )
  if (cachedRow) {
    const age = now.getTime() - Date.parse(cachedRow.synced_at)
    if (age >= 0 && age < WEEK_SNAPSHOT_MAX_AGE_MS) {
      try {
        const parsed = JSON.parse(cachedRow.detail) as StoreWeekPayload
        if (parsed && typeof parsed.turnover === 'object') return parsed
      } catch { /* 缓存损坏 → 重拉 */ }
    }
  }
  const getJwt = lazyLoginJwt(env)
  const jwt = await getJwt()
  const entries = await fetchPerfecoEntries(env, {
    from: options.from,
    to: options.to,
    aggLevel: 'STORES',
    stores: [options.storeCode]
  }, jwt)
  const entry = entries.find((item) => String(item.id ?? '') === options.storeCode) ?? entries[0]
  const toSplit = channelSplit(entry?.turnover as Record<string, unknown> | undefined, false)
  const qtySplit = channelSplit(entry?.quantity as Record<string, unknown> | undefined, true)
  const dis = await fetchSpdStoreTotal(env, options.storeCode, options.from, options.to, jwt)
  const payload: StoreWeekPayload = {
    available: true,
    source: 'CIS perfeco + SPD',
    from: options.from,
    to: options.to,
    turnover: {
      total: Math.round((toSplit.online + toSplit.offline) * 100) / 100,
      online: toSplit.online,
      offline: toSplit.offline,
      quantity: qtySplit.online + qtySplit.offline
    },
    dis,
    syncedAt: now.toISOString()
  }
  await env.DB.prepare(`
    INSERT INTO bi_bikes_snapshot (store_id, business_date, new_bikes, used_bikes, new_bikes_to, used_bikes_to, detail, synced_at)
    VALUES (?, ?, 0, 0, 0, 0, ?, ?)
    ON CONFLICT(store_id, business_date) DO UPDATE SET
      detail = excluded.detail,
      synced_at = excluded.synced_at
  `).bind(options.storeId, cacheKey, JSON.stringify(payload), now.toISOString()).run()
  return payload
}
