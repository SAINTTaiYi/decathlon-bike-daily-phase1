// 食品自动登记 · 收货单发现（fallback）
//
// 背景（2026-09-18 实测）：stock-reception 的待收货列表只返回 TO_RECEIVE 单据，
// 门店确认收货后单据即从列表消失（实测 state/reception_state/states/status 等
// 过滤参数全部无效）。但已确认单据仍可按 ID 查询 packages/details（实测 200）。
//
// 因此「今天来货」的完整发现链路是：
//   ① 待收货列表（尚未确认的）
//   ② 收货流水回查（已确认的）：逐商品查 retail-stock-movements，
//      取今日 receipt 流水的 reference（reception_id:…|sap_order:…）→ 收货单号
// 本模块实现 ②，由路由层在「待收货列表为空」或需要补全时调用。

export type ReceiptFinding = {
  item: string
  delta: number
  receptionId: string
  at: string
}

export type DiscoverResult = {
  receptionIds: string[]
  findings: ReceiptFinding[]
  /** 本页实际扫描的商品数（成功 + 失败）。 */
  scanned: number
  failed: number
  /** 商品总数（分页驱动用；调用方据 offset/done 决定是否继续翻页）。 */
  total: number
  /** 下一页起点（本页已覆盖到 items 的下标）。 */
  offset: number
  done: boolean
}

/** 从流水的 reference 字段提取收货单号（格式：reception_id:9701148468|sap_order:…）。 */
export function parseReceptionId(reference: unknown): string {
  if (typeof reference !== 'string' || !reference) return ''
  for (const token of reference.split('|')) {
    const [key, value] = token.split(':')
    if (key?.trim() === 'reception_id' && value?.trim()) return value.trim()
  }
  return ''
}

/** 判断流水是否为「今日 receipt」（按北京时间日界过滤）。 */
export function isTodayReceipt(row: unknown, todayBjStartUtcIso: string): boolean {
  if (!row || typeof row !== 'object') return false
  const record = row as Record<string, unknown>
  const type = record.transaction_type
  const label = type && typeof type === 'object' ? String((type as Record<string, unknown>).label ?? '') : ''
  if (label !== 'receipt') return false
  const at = typeof record.transaction_date === 'string' ? record.transaction_date : ''
  if (!at) return false
  return at >= todayBjStartUtcIso
}

/** 今日北京时间 0 点对应的 UTC ISO（用于流水时间比较）。 */
export function todayBjStartUtcIso(now = new Date()): string {
  const bj = new Date(now.getTime() + 8 * 3600_000)
  const startBj = new Date(Date.UTC(bj.getUTCFullYear(), bj.getUTCMonth(), bj.getUTCDate()))
  return new Date(startBj.getTime() - 8 * 3600_000).toISOString().slice(0, 19)
}

/** 收货流水查询窗口（BJT 日期字符串）：[D-1, D+1) —— 单日窗口 [D,D] 上游恒空。 */
export function movementsWindow(now = new Date()): { start: string; end: string } {
  const bj = new Date(now.getTime() + 8 * 3600_000)
  const day = new Date(Date.UTC(bj.getUTCFullYear(), bj.getUTCMonth(), bj.getUTCDate()))
  const fmt = (date: Date) => date.toISOString().slice(0, 10)
  return {
    start: fmt(new Date(day.getTime() - 86400_000)),
    end: fmt(new Date(day.getTime() + 86400_000))
  }
}
