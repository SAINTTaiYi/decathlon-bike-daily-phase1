// D1 免费层限额识别与恢复时点（2026-09-13）。
//
// 事故背景（2026-09-12）：D1 免费层「账号级每日行写入额度」（100k/日）被 preview 的
// 定时任务烧穿后，该账号上所有写入被平台拒绝（错误码 7500），但门店端只会收到通用的
// 500「服务暂时不可用」——没有人知道发生了什么、还要等多久，也不知道此刻仍可以
// 查看数据并生成应急交接单。
//
// 本模块把这两类平台错误从错误文本里精确识别出来，供 onError 转成结构化 503，
// 前端据此进入「应急模式」：读还能用时正常查看看板 + 生成应急交接单；
// 读也被限时退回本机快照。
//
// 额度口径（免费套餐，账号级、两库共享）：
//   读：5,000,000 行/日；写：100,000 行/日；窗口 = UTC 自然日（北京时间 08:00 重置）。
export const D1_FREE_DAILY_READ_LIMIT = 5_000_000
export const D1_FREE_DAILY_WRITE_LIMIT = 100_000

export type D1LimitKind = 'read' | 'write'

// 平台原文：
//   "Your account has exceeded D1's free tier daily row write limit. Upgrade to a paid
//    plan or wait until tomorrow (midnight UTC) to continue."
// 读额度是同一模板的 read 版本。这里对两种形态都做宽松匹配（大小写不敏感），
// 并同时覆盖被包装进 D1_ERROR 前缀或附加错误码的情形。
const WRITE_LIMIT_PATTERN = /daily row write limit/iu
const READ_LIMIT_PATTERN = /daily row read limit/iu

/** 从错误文本里识别 D1 免费层限额（写优先于读）；都不是则返回 null。 */
export function detectD1LimitError(message: unknown): D1LimitKind | null {
  if (typeof message !== 'string' || message.length === 0) return null
  if (WRITE_LIMIT_PATTERN.test(message)) return 'write'
  if (READ_LIMIT_PATTERN.test(message)) return 'read'
  return null
}

/** 下一个 UTC 零点（配额窗口重置；北京时间 08:00）。 */
export function nextD1QuotaReset(now: Date = new Date()): string {
  const reset = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0)
  return new Date(reset).toISOString()
}

/** 把错误链（含 cause）拼成一段文本，供限额识别使用。 */
export function errorChainText(error: unknown, depth = 4): string {
  const parts: string[] = []
  let current: unknown = error
  for (let index = 0; index < depth && current; index += 1) {
    if (current instanceof Error) {
      parts.push(current.message)
      current = (current as { cause?: unknown }).cause
    } else {
      parts.push(typeof current === 'string' ? current : String(current))
      break
    }
  }
  return parts.join(' · ')
}

/** 限额 503 响应体（前端按 error 码进入应急模式）。 */
export function d1LimitProblemBody(kind: D1LimitKind, now: Date = new Date()): {
  error: 'D1_WRITE_LIMIT' | 'D1_READ_LIMIT'
  message: string
  recoveryAt: string
} {
  return {
    error: kind === 'write' ? 'D1_WRITE_LIMIT' : 'D1_READ_LIMIT',
    message: kind === 'write'
      ? '数据库每日写入额度已用尽（免费套餐上限），预计北京时间 08:00 自动恢复。期间可正常查看数据，并可在「应急交接」中生成交接单。'
      : '数据库每日读取额度已用尽（免费套餐上限），预计北京时间 08:00 自动恢复。当前显示本机最近一次成功加载的快照。',
    recoveryAt: nextD1QuotaReset(now)
  }
}
