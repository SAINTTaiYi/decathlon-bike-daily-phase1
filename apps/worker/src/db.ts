export type Row = Record<string, any>

export function nowIso(): string {
  return new Date().toISOString()
}

export function uuid(): string {
  return crypto.randomUUID()
}

export function boolToInt(value: boolean | number | null | undefined): number {
  return value ? 1 : 0
}

export function intToBool(value: unknown): boolean {
  return value === 1 || value === true || value === '1'
}

export function camelRow<T extends Row>(row: T | null | undefined): any {
  if (!row) return null
  const out: Row = {}
  for (const [key, value] of Object.entries(row)) {
    const camel = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
    out[camel] = value
  }
  return out
}

export function camelRows<T extends Row>(rows: T[]): any[] {
  return rows.map((row) => camelRow(row))
}

export async function first<T = Row>(stmt: D1PreparedStatement): Promise<T | null> {
  const result = await stmt.first<T>()
  return result ?? null
}

export async function all<T = Row>(stmt: D1PreparedStatement): Promise<T[]> {
  const result = await stmt.all<T>()
  if (!result.success) throw new Error(result.error || 'D1_QUERY_FAILED')
  return result.results ?? []
}

export async function run(stmt: D1PreparedStatement): Promise<D1Result> {
  const result = await stmt.run()
  // 保留平台返回的原始错误文本（2026-09-13）：D1 免费层限额（daily row write/read
  // limit）需要靠文本识别并转成结构化 503，此前统一抛 'D1_RUN_FAILED' 会丢掉它。
  if (!result.success) throw new Error(result.error ? `D1_RUN_FAILED: ${result.error}` : 'D1_RUN_FAILED')
  return result
}
