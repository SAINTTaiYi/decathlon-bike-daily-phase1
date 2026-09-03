// D1 当日读行监控 —— Cloudflare GraphQL Analytics 透传 + 模块级缓存。
// 口径：UTC 自然日 = 免费套餐配额窗口（北京 08:00 归零重置），账号级 5M 行/日。
// 本服务绝不触碰数据库绑定：监控端点自身零行读，不会自己烧配额。
// GraphQL 形态已于 2026-09-03 用只读 MCP 实测验证（别名复用 + datetimeHour 桶 + orderBy）。
export const D1_DAILY_ROW_LIMIT = 5_000_000
export const D1_METRICS_CACHE_TTL_MS = 60_000

const ACCOUNT_TAG = '02cb272ad6a5fd7e157a84061c8c5d42'
const DATABASE_LABELS: Readonly<Record<string, string>> = {
  '91e78387-9b24-4126-a5a1-27f9c1792975': 'staging',
  'e40af8eb-6340-4b9e-8484-20247323fd84': 'preview'
}
const GRAPHQL_ENDPOINT = 'https://api.cloudflare.com/client/v4/graphql'
const TOP_QUERY_LIMIT = 5
const TOP_QUERY_TEXT_LIMIT = 240
const REQUEST_TIMEOUT_MS = 8000

export interface D1MetricsTopQuery { query: string; count: number; rowsRead: number }
export interface D1MetricsDatabaseUsage { database: string; rowsRead: number }
export interface D1MetricsSnapshot {
  available: true
  windowStart: string
  fetchedAt: string
  limit: number
  totals: { rowsRead: number; rowsWritten: number; readQueries: number; writeQueries: number }
  databases: D1MetricsDatabaseUsage[]
  series: { hour: number; rowsRead: number }[]
  top: D1MetricsTopQuery[]
  projectedFullDay: number
}

export class D1MetricsUpstreamError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'D1MetricsUpstreamError'
  }
}

type CacheEntry = { day: string; at: number; snapshot: D1MetricsSnapshot }
let cache: CacheEntry | null = null

export function isD1MetricsConfigured(env: { D1_METRICS_TOKEN?: string }): boolean {
  return typeof env.D1_METRICS_TOKEN === 'string' && env.D1_METRICS_TOKEN.length > 0
}

function utcDayKey(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`
}

function buildGraphQLQuery(day: string): string {
  // 注意 orderBy 枚举格式是 sum_rowsRead_DESC（带下划线）；camelCase 会被 GraphQL 拒绝。
  // 日期过滤用 Date 类型（date_geq），小时桶用 datetimeHour 维度 + datetimeHour_geq 时间过滤。
  return `{
    viewer {
      accounts(filter: {accountTag: "${ACCOUNT_TAG}"}) {
        totals: d1AnalyticsAdaptiveGroups(limit: 1, filter: {date_geq: "${day}"}) {
          count
          sum { rowsRead rowsWritten readQueries writeQueries }
        }
        perDb: d1AnalyticsAdaptiveGroups(limit: 20, filter: {date_geq: "${day}"}) {
          sum { rowsRead }
          dimensions { databaseId }
        }
        hourly: d1AnalyticsAdaptiveGroups(limit: 100, filter: {date_geq: "${day}", datetimeHour_geq: "${day}T00:00:00Z"}, orderBy: [datetimeHour_ASC]) {
          sum { rowsRead }
          dimensions { datetimeHour }
        }
        top: d1QueriesAdaptiveGroups(limit: ${TOP_QUERY_LIMIT}, filter: {date_geq: "${day}"}, orderBy: [sum_rowsRead_DESC]) {
          count
          sum { rowsRead }
          dimensions { query }
        }
      }
    }
  }`
}

interface GraphGroup {
  count?: number
  sum?: Record<string, number | undefined>
  dimensions?: Record<string, string | undefined>
}

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export async function fetchD1MetricsSnapshot(env: { D1_METRICS_TOKEN?: string }, now: Date = new Date()): Promise<D1MetricsSnapshot> {
  const token = env.D1_METRICS_TOKEN
  if (typeof token !== 'string' || token.length === 0) throw new Error('D1_METRICS_TOKEN not configured')
  const day = utcDayKey(now)
  if (cache && cache.day === day && now.getTime() - cache.at < D1_METRICS_CACHE_TTL_MS) return cache.snapshot

  let response: Response
  try {
    response = await fetch(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ query: buildGraphQLQuery(day) }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
  } catch {
    throw new D1MetricsUpstreamError('D1 analytics request failed')
  }
  if (!response.ok) throw new D1MetricsUpstreamError(`D1 analytics responded ${response.status}`)
  const payload = await response.json().catch(() => null) as
    | { data?: { viewer?: { accounts?: Array<Record<string, GraphGroup[] | undefined>> } }; errors?: Array<{ message?: string }> }
    | null
  if (!payload) throw new D1MetricsUpstreamError('D1 analytics returned malformed payload')
  if (Array.isArray(payload.errors) && payload.errors.length > 0) throw new D1MetricsUpstreamError('D1 analytics returned GraphQL errors')
  const account = payload.data?.viewer?.accounts?.[0]
  if (!account) throw new D1MetricsUpstreamError('D1 analytics returned no account data')

  const totalsRow = (account.totals ?? [])[0]
  const totals = {
    rowsRead: numberOrZero(totalsRow?.sum?.rowsRead),
    rowsWritten: numberOrZero(totalsRow?.sum?.rowsWritten),
    readQueries: numberOrZero(totalsRow?.sum?.readQueries),
    writeQueries: numberOrZero(totalsRow?.sum?.writeQueries)
  }

  const perDb = new Map<string, number>()
  for (const group of account.perDb ?? []) {
    const id = group.dimensions?.databaseId
    if (typeof id !== 'string' || !id) continue
    const label = DATABASE_LABELS[id] ?? id.slice(0, 8)
    perDb.set(label, (perDb.get(label) ?? 0) + numberOrZero(group.sum?.rowsRead))
  }
  const databases = [...perDb.entries()].map(([database, rowsRead]) => ({ database, rowsRead })).sort((a, b) => b.rowsRead - a.rowsRead)

  const hourBuckets = new Map<number, number>()
  for (const group of account.hourly ?? []) {
    const stamp = group.dimensions?.datetimeHour
    if (typeof stamp !== 'string' || stamp.length < 13) continue
    const hour = Number.parseInt(stamp.slice(11, 13), 10)
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) continue
    hourBuckets.set(hour, (hourBuckets.get(hour) ?? 0) + numberOrZero(group.sum?.rowsRead))
  }
  const series = [...hourBuckets.entries()].map(([hour, rowsRead]) => ({ hour, rowsRead })).sort((a, b) => a.hour - b.hour)

  const top: D1MetricsTopQuery[] = []
  for (const group of account.top ?? []) {
    const query = (group.dimensions?.query ?? '').replace(/\s+/gu, ' ').trim().slice(0, TOP_QUERY_TEXT_LIMIT)
    if (!query) continue
    top.push({ query, count: numberOrZero(group.count), rowsRead: numberOrZero(group.sum?.rowsRead) })
  }

  const dayStartMs = Date.parse(`${day}T00:00:00Z`)
  const elapsedHours = Math.max(0.1, (now.getTime() - dayStartMs) / 3_600_000)
  const projectedFullDay = Math.round((totals.rowsRead / elapsedHours) * 24)

  const snapshot: D1MetricsSnapshot = {
    available: true,
    windowStart: `${day}T00:00:00Z`,
    fetchedAt: now.toISOString(),
    limit: D1_DAILY_ROW_LIMIT,
    totals,
    databases,
    series,
    top,
    projectedFullDay
  }
  cache = { day, at: now.getTime(), snapshot }
  return snapshot
}

// 测试钩子：清空模块级缓存。生产代码不得调用。
export function resetD1MetricsCacheForTests(): void {
  cache = null
}
