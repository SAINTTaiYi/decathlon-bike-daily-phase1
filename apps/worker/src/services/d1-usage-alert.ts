// D1 免费套餐用量预警（2026-09-13 用户定案）：
// 每日额度（读 5,000,000 行 / 写 100,000 行，账号级、staging 与 preview 共享）
// 达到 80% 时发邮件预警；到 100% 时再补一封严重档。
//
// 事故背景（2026-09-12）：写额度被 preview 的 fixture 定时任务烧穿（单日 94k 行），
// staging 所有写入被平台拒绝（7500）后，门店与管理员都没收到过任何提前信号。
// 本服务就是这个提前信号 —— 「达到 80% 就发邮件」。
//
// 运行方式：挂在每分钟的 cron 上（与 Shiphub/BI 同步并行），内部 15 分钟节流；
// 只在跨档位时发信（每 UTC 日、每指标、每档位最多一封，状态落 d1_usage_alerts）。
// 自身只写 1 行告警状态，绝不碰业务表；任何失败都静默（绝不影响同步主流程）。
import type { WorkerEnv } from '../env.js'
import { UPSTREAM_TIMEOUT_MS } from '../lib/fetch-timeout.js'
import { D1_FREE_DAILY_READ_LIMIT, D1_FREE_DAILY_WRITE_LIMIT } from '../lib/d1-limits.js'

export const D1_USAGE_ALERT_THRESHOLD = 0.8
export const D1_USAGE_CHECK_INTERVAL_MS = 15 * 60_000

const ACCOUNT_TAG = '02cb272ad6a5fd7e157a84061c8c5d42'
const GRAPHQL_ENDPOINT = 'https://api.cloudflare.com/client/v4/graphql'

export type D1UsageMetric = 'read' | 'write'
export type D1UsageAlertLevel = 'warning' | 'critical'

export interface D1DailyUsage {
  rowsRead: number
  rowsWritten: number
}

// 模块级节流：cron 每分钟触发，但检查本身 15 分钟一次即可（额度是全天累计值）。
let lastAttemptAt = 0
// 降级去重：D1 写不进去（额度已爆）时用内存表兜底，同一档位 60 分钟内不重复发信。
const fallbackSentAt = new Map<string, number>()
const FALLBACK_COOLDOWN_MS = 60 * 60_000

export function resetD1UsageAlertThrottleForTests(): void {
  lastAttemptAt = 0
  fallbackSentAt.clear()
}

/** 额度比例 → 告警档位；低于阈值返回 null。 */
export function usageAlertLevel(ratio: number): D1UsageAlertLevel | null {
  if (!Number.isFinite(ratio)) return null
  if (ratio >= 1) return 'critical'
  if (ratio >= D1_USAGE_ALERT_THRESHOLD) return 'warning'
  return null
}

export function isD1UsageAlertConfigured(env: {
  D1_METRICS_TOKEN?: string
  D1_ALERT_EMAIL?: string
  RESEND_API_KEY?: string
  RESEND_FROM?: string
}): boolean {
  return Boolean(env.D1_METRICS_TOKEN && env.D1_ALERT_EMAIL && env.RESEND_API_KEY && env.RESEND_FROM)
}

function utcDayKey(now: Date): string {
  return now.toISOString().slice(0, 10)
}

/** 只取当日合计（totals），比监控卡查询轻得多：单别名字段、limit 1。 */
function buildTotalsQuery(day: string): string {
  return `{
    viewer {
      accounts(filter: {accountTag: "${ACCOUNT_TAG}"}) {
        totals: d1AnalyticsAdaptiveGroups(limit: 1, filter: {date_geq: "${day}", date_leq: "${day}"}) {
          sum { rowsRead rowsWritten }
        }
      }
    }
  }`
}

/** 拉取账号当日读写合计；失败返回 null（静默降级，绝不抛错给 cron）。 */
export async function fetchD1DailyUsage(
  env: { D1_METRICS_TOKEN?: string },
  now: Date = new Date()
): Promise<D1DailyUsage | null> {
  const token = env.D1_METRICS_TOKEN
  if (!token) return null
  try {
    const response = await fetch(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ query: buildTotalsQuery(utcDayKey(now)) }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
    })
    if (!response.ok) return null
    const payload: any = await response.json().catch(() => null)
    const totals = payload?.data?.viewer?.accounts?.[0]?.totals?.[0]?.sum
    if (!totals) return null
    return {
      rowsRead: Number(totals.rowsRead ?? 0),
      rowsWritten: Number(totals.rowsWritten ?? 0)
    }
  } catch {
    return null
  }
}

export interface D1UsageAlertEmail {
  subject: string
  text: string
}

export function buildD1UsageAlertEmail(input: {
  metric: D1UsageMetric
  level: D1UsageAlertLevel
  value: number
  limit: number
  day: string
}): D1UsageAlertEmail {
  const ratio = input.limit > 0 ? input.value / input.limit : 0
  const percent = Math.round(ratio * 100)
  const metricLabel = input.metric === 'write' ? '写入行数' : '读取行数'
  const levelLabel = input.level === 'critical' ? '严重（额度已耗尽）' : '预警（已达 80%）'
  const formattedValue = input.value.toLocaleString('en-US')
  const formattedLimit = input.limit.toLocaleString('en-US')
  return {
    subject: `[Workshop] D1 用量${input.level === 'critical' ? '告急' : '预警'}：${input.metric === 'write' ? '写入' : '读取'} ${percent}%（${formattedValue}/${formattedLimit} 行/日）`,
    text: `Workshop D1 免费套餐用量告警。

指标：${metricLabel}
已用：${formattedValue} / ${formattedLimit}（${percent}%）
级别：${levelLabel}
窗口：${input.day}（UTC 自然日，北京时间每日 08:00 重置）

说明：
- D1 每日额度为账号级，staging 与 preview 两个库共享。
- 达到 100% 后，该账号上的所有写入会被平台拒绝（错误码 7500），门店将无法记录业务。
- 处理建议：打开 Admin 的 D1 监控卡确认烧行来源；检查 preview 是否出现自动化写入；
  必要时降载（preview 定时任务已于 2026-09-12 全部停用）。

本邮件由系统自动发送（bike-ops-staging 定时任务）。`
  }
}

type SendClaim = 'claimed' | 'duplicate' | 'failed'

/** 原子抢占「本档位今天还没发过」：INSERT 成功=首次；冲突=已发过；其它错误=降级。 */
async function claimAlertSend(
  db: D1Database,
  input: { day: string; metric: D1UsageMetric; level: D1UsageAlertLevel; value: number; limit: number; ratio: number }
): Promise<SendClaim> {
  const key = `${input.day}:${input.metric}:${input.level}`
  try {
    await db.prepare(`
      INSERT INTO d1_usage_alerts (dedupe_key, metric, level, value, limit_value, ratio, sent_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(key, input.metric, input.level, input.value, input.limit, input.ratio, new Date().toISOString()).run()
    return 'claimed'
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/UNIQUE|constraint/iu.test(message)) return 'duplicate'
    // 例如写额度已爆（7500）：D1 写不进去 → 走内存兜底去重。
    return 'failed'
  }
}

async function sendAlertEmail(
  env: { RESEND_API_KEY?: string; RESEND_FROM?: string; D1_ALERT_EMAIL?: string },
  email: D1UsageAlertEmail
): Promise<void> {
  if (!env.RESEND_API_KEY || !env.RESEND_FROM || !env.D1_ALERT_EMAIL) return
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: env.RESEND_FROM, to: [env.D1_ALERT_EMAIL], subject: email.subject, text: email.text }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
    })
  } catch {
    // 邮件失败不影响任何主流程
  }
}

/**
 * cron 入口：检查当日 D1 读写用量，跨过 80% / 100% 档位时发预警邮件。
 * 15 分钟节流；未配置（token/邮箱/发信凭据）时完全静默。
 */
export async function runD1UsageAlert(env: WorkerEnv, now: Date = new Date()): Promise<void> {
  if (!isD1UsageAlertConfigured(env)) return
  const stamp = now.getTime()
  if (stamp - lastAttemptAt < D1_USAGE_CHECK_INTERVAL_MS) return
  lastAttemptAt = stamp

  const usage = await fetchD1DailyUsage(env, now)
  if (!usage) return
  const day = utcDayKey(now)
  const metrics: Array<{ metric: D1UsageMetric; value: number; limit: number }> = [
    { metric: 'write', value: usage.rowsWritten, limit: D1_FREE_DAILY_WRITE_LIMIT },
    { metric: 'read', value: usage.rowsRead, limit: D1_FREE_DAILY_READ_LIMIT }
  ]

  for (const item of metrics) {
    const ratio = item.limit > 0 ? item.value / item.limit : 0
    const level = usageAlertLevel(ratio)
    if (!level) continue
    const key = `${day}:${item.metric}:${level}`
    const claim = await claimAlertSend(env.DB, { day, metric: item.metric, level, value: item.value, limit: item.limit, ratio })
    if (claim === 'duplicate') continue
    if (claim === 'failed') {
      const last = fallbackSentAt.get(key) ?? 0
      if (stamp - last < FALLBACK_COOLDOWN_MS) continue
      fallbackSentAt.set(key, stamp)
    }
    await sendAlertEmail(env, buildD1UsageAlertEmail({ metric: item.metric, level, value: item.value, limit: item.limit, day }))
  }
}
