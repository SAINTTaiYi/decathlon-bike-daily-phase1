import { aggregateRecords, judgeAggregates } from './food-auto-aggregate.js'
import { FOOD_SCAN_ZONES } from '../data/food-scan-zones.js'
import { FOOD_SHELF_LIFE_BY_ITEM } from '../data/food-shelf-life.js'
import type { AppConfig } from '../env.js'
import { performMasterDataLogin, type MasterDataLoginConfig } from '../lib/masterdata-login.js'
import { isTimeoutError } from '../lib/fetch-timeout.js'
import { getSnbToken, snbUpstreamError } from './snb-identity.js'

// ── 食品自动登记影子系统 · 核心服务（2026-09-18）────────────────────────────
//
// 用户定案：影子系统只做自动登记，算法在 CF 侧执行（不依赖 Termux），结果写
// 影子表待人工核验。链路：
//   ① 收货单（stock-reception，CubeInStore JWT）→ 待收货单 + 食品明细
//   ② 扫描计划（food-scan-zones 区段表）→ 10k EPC 分片列表
//   ③ RDS 分段扫描（api.decathlon.net，SNB JWT）→ 只保留窗口内更新的记录
//      （响应体积 1.1-1.4MB/万 EPC，必须在 Worker 侧过滤后才回传）
//   ④ 批次判定：整箱爆点 = 跨商品同毫秒共现 + 条数密度
//   ⑤ 影子表落库（food_auto_runs + food_auto_shadow）
//
// 调度在前端：前端逐段调用 scan 驱动实时进度；本模块保持无状态（token 缓存除外），
// 每步独立可测。门店边界：调用方（路由层）先校验绑定门店，这里只处理数据。

/** 分片大小：10000 EPC —— 单响应 1.1-1.4MB / 4.5-6.5s，是实测的最佳折中。 */
export const SEGMENT_SIZE = 10_000

/** 数据窗口：最近 36 小时（覆盖「昨天下午到货 → 次日补跑」的场景）。 */
export const SCAN_WINDOW_HOURS = 36

const RDS_URL = 'https://api.decathlon.net/rds/v1/epc/expiryList'
const RECEPTION_BASE = 'https://api-cn.decathlon.com.cn/stock-reception/api/v1/stores'
const MASTERDATA_BASE = 'https://api.decathlon.net/stockcontrol-bff'

/** 探测哨兵 EPC（水的一个已知标签）：保证 RDS 响应非空 200，兼作响应锚点。 */
const OPENER_EPC = buildEpc('358378', '838546', 15_524_039)

const UA = 'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'

// ── 类型 ───────────────────────────────────────────────────────────────────

export type PlanItem = { item: string; name: string; qty: number }

export type ScanSegment = { item: string; comp: string; ir: string; from: number; count: number }

export type ScanPlan = { segments: ScanSegment[]; items: PlanItem[]; skipped: string[] }

export type RawRecord = { epc: string; exp: string | null; obs: string | null; upd: string }

export type ScanResult = {
  item: string
  from: number
  count: number
  present: number
  records: RawRecord[]
  elapsedMs: number
}

export type ReceptionSummary = {
  receptionId: string
  state: string
  expectedAt: string | null
  shipmentAt: string | null
  packageCount: number
  itemCount: number
  totalQuantities: number
}

export type ReceptionItem = { item: string; name: string; qty: number; universe: number; family: number }

export type ReceptionItemsResult = {
  receptionId: string
  items: ReceptionItem[]
  packages: number
  offset: number
  done: boolean
}

export type Candidate = {
  obs: string | null
  exp: string | null
  count: number
  coOccur: number
  serialMin: number
  serialMax: number
  samples: string[]
  score: number
}

export type ItemJudgement = {
  item: string
  name: string
  qty: number
  confidence: 'high' | 'medium' | 'low' | 'none'
  candidates: Candidate[]
  productionDate: string | null
  expiryDate: string | null
  warnOn: string | null
  shelfLifeMonths: number | null
  note: string
}

export type ShadowSaveInput = {
  receptions: ReceptionSummary[]
  judgements: ItemJudgement[]
  stats: Record<string, unknown>
}

// ── EPC 构造 ───────────────────────────────────────────────────────────────

/**
 * 构造迪卡侬 24-hex EPC：
 *   0x30(8bit) | filter=1(3bit) | partition=6(3bit) | company(20bit) | itemRef(24bit) | serial(38bit)
 * company/itemRef 来自 EAN 第 7-12 位展开（见 food-scan-zones 的 pair 字段）。
 */
export function buildEpc(company: string, itemRef: string, serial: number): string {
  const value =
    (0x30n << 88n) |
    (1n << 85n) |
    (6n << 82n) |
    (BigInt(company) << 62n) |
    (BigInt(itemRef) << 38n) |
    BigInt(serial)
  return value.toString(16).toUpperCase().padStart(24, '0')
}

/** 扫描窗口起点（ISO，UTC）：now − SCAN_WINDOW_HOURS，取整到小时。 */
export function scanWindowSince(now = new Date()): string {
  const since = new Date(now.getTime() - SCAN_WINDOW_HOURS * 3600_000)
  since.setUTCMinutes(0, 0, 0)
  return since.toISOString().slice(0, 19)
}

// ── 扫描计划 ───────────────────────────────────────────────────────────────

/** 按到货商品生成分片计划；未收录区段的商品进 skipped（不阻塞其它商品）。 */
export function buildScanPlan(items: PlanItem[]): ScanPlan {
  const segments: ScanSegment[] = []
  const skipped: string[] = []
  for (const entry of items) {
    const zone = FOOD_SCAN_ZONES[entry.item]
    if (!zone || !zone.zones.length) {
      skipped.push(entry.item)
      continue
    }
    const pairParts = zone.pair.split('|')
    const comp = pairParts[0] ?? ''
    const ir = pairParts[1] ?? ''
    if (!comp || !ir) {
      skipped.push(entry.item)
      continue
    }
    for (const zoneRange of zone.zones) {
      const start = zoneRange[0] ?? 0
      const end = zoneRange[1] ?? 0
      let from = start
      while (from < end) {
        const count = Math.min(SEGMENT_SIZE, end - from)
        segments.push({ item: entry.item, comp, ir, from, count })
        from += count
      }
    }
  }
  return { segments, items, skipped }
}

// ── RDS 扫描 ───────────────────────────────────────────────────────────────

const UPDATE_NEEDLE = '"update_date":"'

/**
 * 从 RDS 原始响应文本中提取「窗口内更新」的记录。
 *
 * 响应格式固定为 [{"epc":"..","expiryDate":".."|null,"obs_time":".."|null,"update_date":".."},...]，
 * 体积 1.1-1.4MB/万 EPC。为把免费层 CPU 压到最低，这里不做整体 JSON.parse：
 * 线性扫描 update_date 值，仅对命中的对象做小片段 slice + parse。
 * 字符串比较与 2026-09-17 实战口径一致（窗口起点格式同为 19 字符 ISO）。
 */
export function filterRecentRecords(text: string, sinceIso: string): RawRecord[] {
  const out: RawRecord[] = []
  let pos = 0
  while (true) {
    const keyAt = text.indexOf(UPDATE_NEEDLE, pos)
    if (keyAt < 0) break
    const valueStart = keyAt + UPDATE_NEEDLE.length
    const valueEnd = text.indexOf('"', valueStart)
    if (valueEnd < 0) break
    const updateDate = text.slice(valueStart, valueEnd)
    pos = valueEnd + 1
    if (updateDate < sinceIso) continue
    const objStart = text.lastIndexOf('{"epc":"', valueStart)
    if (objStart < 0) continue
    const objEnd = text.indexOf('}', valueEnd)
    if (objEnd < 0) continue
    try {
      const parsed = JSON.parse(text.slice(objStart, objEnd + 1)) as {
        epc?: unknown
        expiryDate?: unknown
        obs_time?: unknown
      }
      if (typeof parsed.epc === 'string') {
        out.push({
          epc: parsed.epc,
          exp: typeof parsed.expiryDate === 'string' ? parsed.expiryDate : null,
          obs: typeof parsed.obs_time === 'string' ? parsed.obs_time : null,
          upd: updateDate
        })
      }
    } catch {
      // 残段/格式异常：跳过该条，不影响整批
    }
  }
  return out
}

/** 扫描一个分片：Worker 侧完成过滤，只把窗口内记录回传前端。 */
export async function scanSegment(config: AppConfig, segment: ScanSegment, options: { now?: Date } = {}): Promise<ScanResult> {
  const since = scanWindowSince(options.now)
  const epcs: string[] = [OPENER_EPC]
  for (let i = 0; i < segment.count; i += 1) {
    epcs.push(buildEpc(segment.comp, segment.ir, segment.from + i))
  }
  const started = Date.now()
  const token = await getSnbToken(config)

  const request = (bearer: string) =>
    fetch(RDS_URL, {
      method: 'POST',
      headers: {
        'user-agent': UA,
        authorization: `Bearer ${bearer}`,
        'x-api-key': config.SNB.rdsApiKey!,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ epcs }),
      signal: AbortSignal.timeout(45_000)
    })

  let response: Response
  try {
    response = await request(token)
    // token 被上游提前失效时（多实例各自登录互不感知），强制重登一次再试。
    if (response.status === 401 || response.status === 403) {
      const refreshed = await getSnbToken(config, { force: true })
      response = await request(refreshed)
    }
  } catch (error) {
    if (isTimeoutError(error)) throw snbUpstreamError('RDS_TIMEOUT', 504, true)
    throw error
  }
  if (response.status === 404) {
    // 全部不存在（哨兵也丢）——按空结果处理，不视为错误。
    return { item: segment.item, from: segment.from, count: segment.count, present: 0, records: [], elapsedMs: Date.now() - started }
  }
  if (!response.ok) {
    throw snbUpstreamError(`RDS_HTTP_${response.status}`, response.status, response.status >= 500)
  }
  const text = await response.text()
  // present：上游为该批 EPC 实际返回的记录条数（含哨兵，仅作诊断计数）。
  const trimmed = text.trim()
  const allCount = trimmed === '' || trimmed === '[]' ? 0 : trimmed.split('},{').length
  const records = filterRecentRecords(text, since)
  return {
    item: segment.item,
    from: segment.from,
    count: segment.count,
    present: allCount,
    records,
    elapsedMs: Date.now() - started
  }
}

// ── 收货单（CubeInStore JWT）───────────────────────────────────────────────

let cubeTokenCache: { token: string; expiresAt: number } | null = null
const CUBE_TOKEN_TTL_MS = 90 * 60 * 1000

/** 部署级 CubeInStore token（与 BI SKU 同步同源凭据）；内存缓存 90 分钟。 */
export async function getAutoCubeToken(config: AppConfig): Promise<string> {
  const now = Date.now()
  if (cubeTokenCache && now < cubeTokenCache.expiresAt - 10 * 60 * 1000) return cubeTokenCache.token
  const md = config.MASTERDATA
  if (!md.clientId || !md.clientSecret || !md.loginKey || !md.loginUsernameEnc || !md.loginPasswordEnc) {
    throw snbUpstreamError('CUBE_IDENTITY_NOT_CONFIGURED', 503)
  }
  const loginConfig: MasterDataLoginConfig = {
    authorizeUrl: md.authorizeUrl,
    tokenUrl: md.tokenUrl,
    clientId: md.clientId,
    clientSecret: md.clientSecret,
    redirectUri: md.redirectUri,
    scope: md.scope,
    loginKey: md.loginKey,
    loginUsernameEnc: md.loginUsernameEnc,
    loginPasswordEnc: md.loginPasswordEnc
  }
  const { accessToken, expiresIn } = await performMasterDataLogin(loginConfig)
  cubeTokenCache = { token: accessToken, expiresAt: now + Math.min(expiresIn * 1000, CUBE_TOKEN_TTL_MS) }
  return accessToken
}

export function resetAutoCubeTokenCache(): void {
  cubeTokenCache = null
}

async function cubeFetch(config: AppConfig, path: string): Promise<unknown> {
  const token = await getAutoCubeToken(config)
  const storeCode = config.SNB.boundStoreCode ?? '1299'
  let response: Response
  try {
    response = await fetch(`${RECEPTION_BASE}/${storeCode}${path}`, {
      headers: {
        'user-agent': UA,
        authorization: `Bearer ${token}`,
        'x-api-key': config.SNB.receptionApiKey!,
        'X-Target-Country': 'zh-CN'
      },
      signal: AbortSignal.timeout(30_000)
    })
  } catch (error) {
    if (isTimeoutError(error)) throw snbUpstreamError('RECEPTION_TIMEOUT', 504, true)
    throw error
  }
  if (!response.ok) throw snbUpstreamError(`RECEPTION_HTTP_${response.status}`, response.status, response.status >= 500)
  return response.json()
}

/** 待收货单列表（当前门店）。 */
export async function fetchPendingReceptions(config: AppConfig): Promise<ReceptionSummary[]> {
  const payload = (await cubeFetch(config, '/receptions?size=100')) as { content?: unknown } | unknown[]
  const rows = Array.isArray(payload) ? payload : Array.isArray((payload as { content?: unknown }).content) ? (payload as { content: unknown[] }).content : []
  return rows
    .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object'))
    .map((row) => ({
      receptionId: String(row.reception ?? ''),
      state: String(row.reception_state ?? ''),
      expectedAt: typeof row.expected_reception_date === 'string' ? row.expected_reception_date : null,
      shipmentAt: typeof row.shipment_date === 'string' ? row.shipment_date : null,
      packageCount: Number(row.package_count ?? 0),
      itemCount: Number(row.item_count ?? 0),
      totalQuantities: Number(row.total_quantities ?? 0)
    }))
    .filter((row) => row.receptionId)
}

/**
 * 拉取一个收货单的食品明细（分页）：每次拉一批包裹的 details 后聚合。
 * 上游没有按 item 汇总的端点，且 packages/details 是逐包接口，
 * 因此按 offset/limit 分页（默认 40 包/次，控制在子请求上限内）。
 */
export async function fetchReceptionItems(
  config: AppConfig,
  receptionId: string,
  offset = 0,
  limit = 40
): Promise<ReceptionItemsResult> {
  const packages = (await cubeFetch(config, `/receptions/${encodeURIComponent(receptionId)}/packages`)) as unknown[]
  const packageIds = (Array.isArray(packages) ? packages : [])
    .map((row) => (row && typeof row === 'object' ? String((row as Record<string, unknown>).package_id ?? '') : ''))
    .filter(Boolean)
  const slice = packageIds.slice(offset, offset + limit)

  const rows: Record<string, unknown>[] = []
  const CONCURRENCY = 8
  for (let start = 0; start < slice.length; start += CONCURRENCY) {
    const batch = slice.slice(start, start + CONCURRENCY)
    const results = await Promise.all(
      batch.map((packageId) =>
        cubeFetch(config, `/receptions/${encodeURIComponent(receptionId)}/packages/${encodeURIComponent(packageId)}/details`).catch(() => [])
      )
    )
    for (const result of results) {
      if (Array.isArray(result)) rows.push(...(result as Record<string, unknown>[]))
    }
  }

  const agg = new Map<string, ReceptionItem>()
  for (const row of rows) {
    const item = String(row.item ?? '')
    if (!item) continue
    const universe = Number(row.universe ?? 0)
    const family = Number(row.family ?? 0)
    if (universe !== 9 || ![500, 600, 650].includes(family)) continue
    const qty = Number(row.quantity ?? 0)
    const existing = agg.get(item)
    if (existing) existing.qty += qty
    else agg.set(item, { item, name: FOOD_SHELF_LIFE_BY_ITEM[item]?.name ?? '', qty, universe, family })
  }

  const items = [...agg.values()]
  // 名称缺失时用商品码占位（影子系统不阻塞在名称上）。
  for (const entry of items) if (!entry.name) entry.name = `商品 ${entry.item}`

  return {
    receptionId,
    items,
    packages: packageIds.length,
    offset: offset + slice.length,
    done: offset + slice.length >= packageIds.length
  }
}

// ── 批次判定 ───────────────────────────────────────────────────────────────
//
// 判定输入是「每商品批次摘要」（food-auto-aggregate.ts）：原始记录在驱动侧
// 压成每批一行（含跨商品同毫秒共现计数），Worker 只做评分 / 置信度 / 日期换算。
// 原因：1.8 万条原始记录 ≈2.2MB JSON，直接解析会把免费层的 10ms CPU 超 5 倍。
// 日期函数与聚合逻辑的唯一实现在 aggregate 模块，这里再导出给测试与调用方。

export { edate, deriveProductionDate, aggregateRecords, judgeAggregates, sanitizeAggregates } from './food-auto-aggregate.js'

export type JudgeInput = {
  items: PlanItem[]
  records: Record<string, RawRecord[]>
}

export type JudgeAggregateInput = {
  items: PlanItem[]
  aggregates: Record<string, import('./food-auto-aggregate.js').ItemAggregate[]>
}

/** 记录路径（测试 / 调试）：先聚合再判定，与生产链路同一算法。 */
export function judgeBatches(input: JudgeInput): ItemJudgement[] {
  return judgeAggregates(input.items, aggregateRecords(input.records))
}

// ── 影子表落库 ─────────────────────────────────────────────────────────────

type D1Statement = {
  run: () => Promise<unknown>
  all: () => Promise<{ results?: unknown[] }>
}
type D1Like = {
  prepare: (sql: string) => { bind: (...values: unknown[]) => D1Statement }
  batch?: (statements: unknown[]) => Promise<unknown>
}

/** 写入影子运行记录 + 批次行（单次批量提交；失败时整批不落）。 */
export async function saveShadowRun(
  db: D1Like,
  params: { storeId: string; createdBy: string | null; input: ShadowSaveInput; startedAt: string }
): Promise<{ runId: string; saved: number }> {
  const runId = crypto.randomUUID()
  const finishedAt = new Date().toISOString()
  const statements = [
    db
      .prepare(
        'INSERT INTO food_auto_runs (id, store_id, status, source, reception_ids, items_json, stats_json, created_by, started_at, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(
        runId,
        params.storeId,
        'done',
        'manual',
        params.input.receptions.map((reception) => reception.receptionId).join(','),
        JSON.stringify(params.input.judgements.map((entry) => ({ item: entry.item, name: entry.name, qty: entry.qty }))),
        JSON.stringify(params.input.stats ?? {}),
        params.createdBy,
        params.startedAt,
        finishedAt
      )
  ]
  for (const judgement of params.input.judgements) {
    statements.push(
      db
        .prepare(
          'INSERT INTO food_auto_shadow (id, run_id, store_id, item_code, item_name, quantity, production_date, expiry_date, warn_on, confidence, candidates_json, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .bind(
          crypto.randomUUID(),
          runId,
          params.storeId,
          judgement.item,
          judgement.name,
          judgement.qty,
          judgement.productionDate,
          judgement.expiryDate,
          judgement.warnOn,
          judgement.confidence,
          JSON.stringify(judgement.candidates),
          judgement.note,
          finishedAt
        )
    )
  }
  if (db.batch) {
    await db.batch(statements)
  } else {
    for (const statement of statements) await statement.run()
  }
  return { runId, saved: params.input.judgements.length }
}

/** 最近运行记录（影子表联查概要）。 */
export async function listShadowRuns(db: D1Like, storeId: string, limit = 10) {
  const result = await db
    .prepare('SELECT id, status, reception_ids, items_json, stats_json, created_by, started_at, finished_at FROM food_auto_runs WHERE store_id = ? ORDER BY finished_at DESC LIMIT ?')
    .bind(storeId, limit)
    .all()
  return result.results ?? []
}

/** 某次运行的影子批次行。 */
export async function listShadowRows(db: D1Like, runId: string) {
  const result = await db
    .prepare('SELECT item_code, item_name, quantity, production_date, expiry_date, warn_on, confidence, note FROM food_auto_shadow WHERE run_id = ? ORDER BY item_code')
    .bind(runId)
    .all()
  return result.results ?? []
}

/** stockcontrol-bff 商品名（可选补名；失败静默）。 */
export async function lookupItemNames(config: AppConfig, items: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  if (!items.length || !config.SNB.rdsApiKey) return out
  let token: string
  try {
    token = await getSnbToken(config)
  } catch {
    return out
  }
  for (const item of items.slice(0, 20)) {
    try {
      const response = await fetch(`${MASTERDATA_BASE}/v1/${config.SNB.boundStoreCode ?? '1299'}/items/${encodeURIComponent(item)}/information`, {
        headers: { 'user-agent': UA, authorization: `Bearer ${token}`, 'x-api-key': config.SNB.rdsApiKey, 'X-Target-Country': 'zh-CN' },
        signal: AbortSignal.timeout(15_000)
      })
      if (!response.ok) continue
      const payload = (await response.json()) as { model_label?: unknown; label?: unknown }
      const label = typeof payload.model_label === 'string' ? payload.model_label : typeof payload.label === 'string' ? payload.label : ''
      if (label) out[item] = label
    } catch {
      // 名称是锦上添花，不阻塞主链路
    }
  }
  return out
}

import { isTodayReceipt, movementsWindow, parseReceptionId, todayBjStartUtcIso, type DiscoverResult, type ReceiptFinding } from './food-auto-discovery.js'

// ── 收货单发现（fallback，2026-09-18）──────────────────────────────────────
//
// 门店确认收货后，单据即从待收货列表消失（实测过滤参数全部无效），
// 但已确认单据仍可按 ID 查询明细。因此用「收货流水回查」补全：
//   逐商品查 retail-stock-movements（窗口 [D-1, D+1)，单日窗口上游恒空）
//   → 取今日 receipt 流水 → reference 里提取 reception_id → 收货单号。
//
// 代价：168 个商品 × 1 请求，并发 6 → 每次调用约 28 个子请求（免费层上限 50）。
// 只在「待收货列表为空」时触发，正常收货日不花这份钱。

const MOVEMENTS_BASE = 'https://api-cn.decathlon.com.cn/retail-stock-movements/api/v1/stores'

async function fetchItemMovements(config: AppConfig, item: string, window: { start: string; end: string }): Promise<unknown[]> {
  const token = await getAutoCubeToken(config)
  const storeCode = config.SNB.boundStoreCode ?? '1299'
  const url = `${MOVEMENTS_BASE}/${storeCode}/items/${encodeURIComponent(item)}/stocks/transactions?start_date=${window.start}&end_date=${window.end}`
  const response = await fetch(url, {
    headers: {
      'user-agent': UA,
      authorization: `Bearer ${token}`,
      'x-api-key': config.SNB.movementsApiKey!,
      'X-Target-Country': 'zh-CN',
      'X-Zone-Id': 'Asia/Shanghai'
    },
    signal: AbortSignal.timeout(20_000)
  })
  if (!response.ok) throw snbUpstreamError(`MOVEMENTS_HTTP_${response.status}`, response.status, response.status >= 500)
  const payload: unknown = await response.json()
  if (Array.isArray(payload)) return payload
  if (payload && typeof payload === 'object' && Array.isArray((payload as { content?: unknown }).content)) {
    return (payload as { content: unknown[] }).content
  }
  return []
}

/**
 * 回查今日已确认收货单（逐商品扫收货流水）。
 *
 * 分页是硬要求（2026-09-18 复核发现的隐患）：免费版 Worker 单次请求最多 50 个
 * 子请求，而食品清单有 168 个商品——一次全扫会在第 47 个左右被平台拒绝，
 * 后续商品全部记失败（表现为「悄悄只查了一半」）。因此调用方必须翻页，
 * 每页 ≤40 个商品（含可能的登录 3 次，共 43 个子请求，留足余量）。
 */
export async function discoverTodayReceptions(
  config: AppConfig,
  options: { items: string[]; offset?: number; limit?: number; now?: Date; onProgress?: (done: number, total: number, found: number) => void }
): Promise<DiscoverResult> {
  const window = movementsWindow(options.now)
  const since = todayBjStartUtcIso(options.now)
  const offset = Math.max(0, options.offset ?? 0)
  const limit = Math.min(50, Math.max(1, options.limit ?? 40))
  const slice = options.items.slice(offset, offset + limit)
  const findings: ReceiptFinding[] = []
  let scanned = 0
  let failed = 0

  const queue = [...slice]
  const worker = async () => {
    for (;;) {
      const item = queue.shift()
      if (!item) return
      try {
        const rows = await fetchItemMovements(config, item, window)
        for (const row of rows) {
          if (!isTodayReceipt(row, since)) continue
          const record = row as Record<string, unknown>
          const receptionId = parseReceptionId(record.reference)
          findings.push({
            item,
            delta: Number(record.delta ?? 0),
            receptionId,
            at: typeof record.transaction_date === 'string' ? record.transaction_date : ''
          })
        }
        scanned += 1
      } catch {
        failed += 1
      }
      options.onProgress?.(scanned + failed, slice.length, findings.length)
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker))

  const receptionIds = [...new Set(findings.map((row) => row.receptionId).filter(Boolean))]
  return {
    receptionIds,
    findings,
    scanned,
    failed,
    total: options.items.length,
    offset: offset + slice.length,
    done: offset + slice.length >= options.items.length
  }
}
