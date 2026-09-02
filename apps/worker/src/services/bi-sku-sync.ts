import { loadConfig, type WorkerEnv } from '../env.js'
import { isMasterDataConfigured } from '../env.js'
import { all, first, nowIso } from '../db.js'
import { performMasterDataLogin, MasterDataUpstreamError } from '../lib/masterdata-login.js'

// BI 车型码 → 官方品名同步（CubeInStore masterdata）。
// 数据源：GET {baseUrl}/masterdata/v2/modelslist/{codes}/infos（逗号批量，实测可用），
// 头 = Bearer JWT + x-api-key(masterdata key) + target-country: CN。
// JWT 每次同步全新登录获取（CHU13 全球 IdP 免 OTP），不持久化任何 token。
// 定时入口挂在既有 cron（*/5）上，靠 24h 陈旧度守卫自然收敛为每日一次。

// 快照 2026-09-02 过滤定案（自行车+工作室）车型码全集 33 码：
// models.top(10) ∪ flop(10) ∪ allChannel(17) 去重，全部已经 masterdata 官方确认。
export const BI_SEED_CODES: readonly string[] = [
  '8043622', '8381709', '8400142', '8480236', '8528147', '8583724', '8584663', '8584667', '8585071',
  '8618643', '8640163', '8640568', '8733846', '8736087', '8797823', '8871211', '8871303', '8872192',
  '8882002', '8903325', '8915980', '8927179', '8932670', '8936255', '8944122', '8946821', '8949264',
  '8967120', '8984793', '8984795', '8987064', '9002783', '9010483'
]

const STALE_MS = 24 * 60 * 60 * 1000
const CODE_PATTERN = /^\d{6,10}$/u
// 批量上限：单请求码数保守切 20（masterdata 网关实测无强限流，但绝不冒进）。
const CHUNK_SIZE = 20
const MAX_CODES = 300

export type BiSkuNameRow = {
  code: string
  label: string
  production_label: string | null
  conception_code: string | null
  product_type: string | null
  synced_at: string
}

export async function listBiSkuNames(db: D1Database): Promise<BiSkuNameRow[]> {
  return all<BiSkuNameRow>(db.prepare(
    `SELECT code, label, production_label, conception_code, product_type, synced_at FROM bi_sku_names ORDER BY code`
  ))
}

export function latestSyncedAt(rows: readonly BiSkuNameRow[]): string | null {
  let latest: string | null = null
  for (const row of rows) if (!latest || row.synced_at > latest) latest = row.synced_at
  return latest
}

export type BiSkuSyncResult = {
  status: 'skipped' | 'succeeded'
  reason?: 'MASTERDATA_NOT_CONFIGURED' | 'FRESH'
  rows?: number
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size))
  return out
}

type MasterdataItem = {
  label?: unknown
  production_label?: unknown
  conception_code?: unknown
  r3code?: unknown
  product_type?: unknown
}

function toRow(item: MasterdataItem, stamp: string): BiSkuNameRow | null {
  const code = typeof item.r3code === 'string' ? item.r3code : ''
  const label = typeof item.label === 'string' ? item.label.trim() : ''
  if (!CODE_PATTERN.test(code) || !label) return null
  return {
    code,
    label,
    production_label: typeof item.production_label === 'string' ? item.production_label : null,
    conception_code: typeof item.conception_code === 'string' ? item.conception_code : null,
    product_type: typeof item.product_type === 'string' ? item.product_type : null,
    synced_at: stamp
  }
}

export async function syncBiSkuNames(
  env: WorkerEnv,
  options: { trigger: 'scheduled' | 'manual'; force?: boolean; extraCodes?: readonly string[]; now?: Date } = { trigger: 'scheduled' }
): Promise<BiSkuSyncResult> {
  const config = loadConfig(env).MASTERDATA
  if (!isMasterDataConfigured(config)) return { status: 'skipped', reason: 'MASTERDATA_NOT_CONFIGURED' }
  if (!options.force) {
    const rows = await listBiSkuNames(env.DB)
    const latest = latestSyncedAt(rows)
    const now = options.now ?? new Date()
    if (latest && now.getTime() - Date.parse(latest) < STALE_MS) return { status: 'skipped', reason: 'FRESH' }
  }
  const existing = await all<{ code: string }>(env.DB.prepare(`SELECT code FROM bi_sku_names`))
  const extra = (options.extraCodes ?? []).map((value) => String(value)).filter((value) => CODE_PATTERN.test(value))
  const codes = [...new Set([...BI_SEED_CODES, ...existing.map((row) => row.code), ...extra])].slice(0, MAX_CODES)

  const { accessToken } = await performMasterDataLogin({
    authorizeUrl: config.authorizeUrl!,
    tokenUrl: config.tokenUrl,
    clientId: config.clientId!,
    clientSecret: config.clientSecret!,
    redirectUri: config.redirectUri,
    scope: config.scope,
    loginKey: config.loginKey!,
    loginUsernameEnc: config.loginUsernameEnc!,
    loginPasswordEnc: config.loginPasswordEnc!
  })

  const stamp = nowIso()
  const upserts: BiSkuNameRow[] = []
  const failures: string[] = []
  for (const part of chunk(codes, CHUNK_SIZE)) {
    const url = `${config.baseUrl}/masterdata/v2/modelslist/${part.join(',')}/infos`
    let payload: unknown = null
    try {
      const response = await fetch(url, {
        headers: {
          authorization: `Bearer ${accessToken}`,
          'x-api-key': config.apiKey!,
          'target-country': 'CN',
          accept: 'application/json'
        }
      })
      if (!response.ok) throw new MasterDataUpstreamError(`MASTERDATA_HTTP_${response.status}`, response.status, response.status >= 500)
      payload = await response.json().catch(() => null)
    } catch (error) {
      // 单块失败不拖垮整轮：其余块照常落库，失败块下轮定时自然重试。
      if (error instanceof MasterDataUpstreamError && !error.retryable) {
        failures.push(error.code)
        continue
      }
      throw error
    }
    if (!Array.isArray(payload)) {
      failures.push('MASTERDATA_INVALID_RESPONSE')
      continue
    }
    for (const item of payload as MasterdataItem[]) {
      const row = toRow(item, stamp)
      if (row) upserts.push(row)
    }
  }
  if (upserts.length) {
    await env.DB.batch(upserts.map((row) => env.DB.prepare(`
      INSERT INTO bi_sku_names (code, label, production_label, conception_code, product_type, synced_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(code) DO UPDATE SET
        label = excluded.label,
        production_label = excluded.production_label,
        conception_code = excluded.conception_code,
        product_type = excluded.product_type,
        synced_at = excluded.synced_at
    `).bind(row.code, row.label, row.production_label, row.conception_code, row.product_type, row.synced_at)))
  }
  // 全部块都失败 = 上游/凭据问题，抛错让定时层记录，不静默装成功。
  if (!upserts.length && failures.length === chunk(codes, CHUNK_SIZE).length) {
    throw new MasterDataUpstreamError(failures[0] ?? 'MASTERDATA_EMPTY')
  }
  return { status: 'succeeded', rows: upserts.length }
}

// scheduled() 入口：与 Shiphub 同步并行；任何异常只记日志，绝不影响 Shiphub。
export async function runScheduledBiSkuSync(env: WorkerEnv): Promise<void> {
  try {
    await syncBiSkuNames(env, { trigger: 'scheduled' })
  } catch (error) {
    console.warn('[bi-sku-sync] scheduled sync failed:', error instanceof Error ? error.message : String(error))
  }
}
