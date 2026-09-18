import { FOOD_SHELF_LIFE_BY_ITEM } from '../data/food-shelf-life.js'
import type { RawRecord } from './food-auto.js'

// ── 扫描结果的「批次摘要」聚合（2026-09-18）────────────────────────────────
//
// 为什么需要它：judge 若直接接收 8 商品 1.8 万条原始记录（≈2.2MB JSON），
// 免费层 Worker 的 10ms CPU 上限会被 JSON.parse + 聚合循环打成 50ms（实测），
// 有被平台终止的风险（memory 69/70 的 exceededCpu 事故）。
//
// 因此把「原始记录 → 每批一行摘要」的机械压缩放在驱动器（浏览器）侧——
// 它本来就要为实时捕捉看板做同样的聚合，等于零额外逻辑；而判定本身
// （评分 / 置信度 / 生产日期与预警日换算）仍留在 Worker。
//
// 摘要字段：obs/exp（批次指纹）、count（条数）、coOccur（跨商品同毫秒条数，
// 整箱爆点主信号）、serialMin/serialMax/samples（序列证据）。
// 截断：每商品按 score=count+coOccur×50 取前 200 组——判定只看头部，
// 小批大共现的组合也不会被误裁（按分数而非条数排序）。

export type ItemAggregate = {
  obs: string | null
  exp: string | null
  count: number
  coOccur: number
  serialMin: number
  serialMax: number
  samples: string[]
}

/** 每商品保留的摘要组上限（判定只看头部，按 score 排序后截断）。 */
export const AGGREGATE_LIMIT = 200

export function aggregateScore(row: { count: number; coOccur: number }): number {
  return row.count + row.coOccur * 50
}

function serialOf(epc: string): number {
  try {
    return Number(BigInt(`0x${epc}`) & ((1n << 38n) - 1n))
  } catch {
    return 0
  }
}

/** 原始记录 → 每商品批次摘要（含跨商品同毫秒共现）。 */
export function aggregateRecords(records: Record<string, RawRecord[]>): Record<string, ItemAggregate[]> {
  const msToItems = new Map<string, Set<string>>()
  for (const [item, rows] of Object.entries(records)) {
    for (const row of rows) {
      let set = msToItems.get(row.upd)
      if (!set) {
        set = new Set()
        msToItems.set(row.upd, set)
      }
      set.add(item)
    }
  }
  const coMs = new Set<string>()
  for (const [ms, set] of msToItems) if (set.size >= 2) coMs.add(ms)

  const out: Record<string, ItemAggregate[]> = {}
  for (const [item, rows] of Object.entries(records)) {
    const groups = new Map<string, ItemAggregate & { min: number }>()
    for (const row of rows) {
      const key = `${row.obs ?? ''}|${row.exp ?? ''}`
      let group = groups.get(key)
      if (!group) {
        group = { obs: row.obs, exp: row.exp, count: 0, coOccur: 0, serialMin: 0, serialMax: 0, samples: [], min: Number.POSITIVE_INFINITY }
        groups.set(key, group)
      }
      group.count += 1
      if (coMs.has(row.upd)) group.coOccur += 1
      const serial = serialOf(row.epc)
      if (serial < group.min) group.min = serial
      if (serial > group.serialMax) group.serialMax = serial
      if (group.samples.length < 3 && !group.samples.includes(row.epc)) group.samples.push(row.epc)
    }
    out[item] = [...groups.values()]
      .map((group) => ({
        obs: group.obs,
        exp: group.exp,
        count: group.count,
        coOccur: group.coOccur,
        serialMin: Number.isFinite(group.min) ? group.min : 0,
        serialMax: group.serialMax,
        samples: group.samples
      }))
      .sort((a, b) => aggregateScore(b) - aggregateScore(a))
      .slice(0, AGGREGATE_LIMIT)
  }
  return out
}

/** 采纳来自客户端的摘要（形状校验 + 截断），防御脏数据。 */
export function sanitizeAggregates(input: unknown): Record<string, ItemAggregate[]> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, ItemAggregate[]> = {}
  for (const [item, rows] of Object.entries(input as Record<string, unknown>)) {
    if (!Array.isArray(rows)) continue
    const list: ItemAggregate[] = []
    for (const row of rows.slice(0, AGGREGATE_LIMIT * 2)) {
      const record = row && typeof row === 'object' ? (row as Record<string, unknown>) : {}
      const count = Number(record.count ?? 0)
      if (!Number.isFinite(count) || count <= 0) continue
      list.push({
        obs: typeof record.obs === 'string' ? record.obs : null,
        exp: typeof record.exp === 'string' ? record.exp : null,
        count,
        coOccur: Number.isFinite(Number(record.coOccur)) ? Number(record.coOccur) : 0,
        serialMin: Number.isFinite(Number(record.serialMin)) ? Number(record.serialMin) : 0,
        serialMax: Number.isFinite(Number(record.serialMax)) ? Number(record.serialMax) : 0,
        samples: Array.isArray(record.samples) ? (record.samples as unknown[]).filter((value): value is string => typeof value === 'string').slice(0, 3) : []
      })
    }
    if (list.length) out[item] = list.sort((a, b) => aggregateScore(b) - aggregateScore(a)).slice(0, AGGREGATE_LIMIT)
  }
  return out
}

/** 摘要 → 判定（评分 / 置信度 / 日期换算；算法主体，留在 Worker）。 */
export function judgeAggregates(
  items: { item: string; name: string; qty: number }[],
  aggregates: Record<string, ItemAggregate[]>
): import('./food-auto.js').ItemJudgement[] {
  return items.map((entry) => {
    const list = aggregates[entry.item] ?? []
    const shelf = FOOD_SHELF_LIFE_BY_ITEM[entry.item]
    const months = shelf?.months ?? null

    const candidates = list
      .slice(0, 6)
      .map((group) => ({ ...group, score: aggregateScore(group) }))

    const best = candidates[0]
    let confidence: 'high' | 'medium' | 'low' | 'none' = 'none'
    if (best) {
      if (best.coOccur >= 10 || (best.coOccur >= 3 && best.count >= 8)) confidence = 'high'
      else if (best.coOccur >= 1 || best.count >= 20) confidence = 'medium'
      else confidence = 'low'
    }

    let productionDate: string | null = null
    let expiryDate: string | null = null
    let warnOn: string | null = null
    let note = ''
    if (!best) {
      note = '未扫描到窗口内的记录'
    } else if (!best.exp) {
      note = '该批次无到期日数据（上游未维护效期）'
    } else if (!months) {
      expiryDate = best.exp.slice(0, 10)
      note = '保质期月数缺失，仅给出到期日'
    } else {
      expiryDate = best.exp.slice(0, 10)
      productionDate = deriveProductionDate(best.exp, months)
      warnOn = edate(productionDate, months - 1)
    }

    return {
      item: entry.item,
      name: entry.name || shelf?.name || `商品 ${entry.item}`,
      qty: entry.qty,
      confidence,
      candidates,
      productionDate,
      expiryDate,
      warnOn,
      shelfLifeMonths: months,
      note
    }
  })
}

// 两个日期函数（Excel EDATE 口径；本模块是唯一实现，food-auto.ts 再导出给测试）。
export function edate(dateIso: string, months: number): string {
  const parts = dateIso.slice(0, 10).split('-').map((value) => Number(value))
  const y = parts[0] ?? 0
  const m = parts[1] ?? 1
  const d = parts[2] ?? 1
  const total = y * 12 + (m - 1) + months
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  const lastDay = new Date(Date.UTC(ny, nm, 0)).getUTCDate()
  return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(d, lastDay)).padStart(2, '0')}`
}

export function deriveProductionDate(expiryDate: string, shelfLifeMonths: number): string {
  const parts = expiryDate.slice(0, 10).split('-').map((value) => Number(value))
  const y = parts[0] ?? 0
  const m = parts[1] ?? 1
  const d = parts[2] ?? 1
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
  return edate(next, -shelfLifeMonths)
}
