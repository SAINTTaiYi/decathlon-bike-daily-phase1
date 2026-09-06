import { all } from '../db.js'
import { currentWeekWindow, getBikeWeek, getStoreWeek, isoWeekOf, isPerfecoConfigured, type StoreWeekPayload } from './bi-bikes.js'
import { activeInStoreTimezone } from './shiphub-sync.js'
import type { WorkerEnv } from '../env.js'

// ── BI 周结定时拉取（2026-09-06）────────────────────────────────────────
// BI 门户（TableauRest）VizQL 链路 2026-09-01 协议变更后无法从 Worker 稳定拉取，
// 周口径数据源统一换 CIS perfeco（与 09-04 车型榜换源同一决策）。
// 周报节奏：周日→周六，周六关店后该周完结；cron 每 5 分钟触发本服务，
// 窗口内（北京时间 09:00–23:00）对每个 active store 确保最后一个已完结周已落库。
// 首个 tick（周日上午）即完成「周报出的那一天自动拉取完毕」，无需任何人打开页面。

export const BI_SYNC_TIMEZONE = 'Asia/Shanghai'
export const BI_SYNC_START_HOUR = 9
export const BI_SYNC_END_HOUR = 23
// CIS 周序列起点：BI 快照最后一周（W35 = 08-23→08-29）之后的第一个完整周（W36）。
const BI_WEEKLY_BASELINE_FROM = '2026-08-30'

export type BiStoreWeekRecord = StoreWeekPayload & { weekLabel: string }

// 最后一个已完结周：currentWeekWindow 给出本周（Sun 起），完结周 = 上一 Sun→Sat。
// 周六当天本周尚未完结（toComplete=true），完结周仍是上一周——与车型周榜口径一致。
export function lastCompletedWeek(now: Date): { from: string; to: string } {
  const current = currentWeekWindow(now)
  const fromMs = Date.parse(`${current.from}T00:00:00Z`) - 7 * 86400_000
  const toMs = Date.parse(`${current.from}T00:00:00Z`) - 1 * 86400_000
  return { from: new Date(fromMs).toISOString().slice(0, 10), to: new Date(toMs).toISOString().slice(0, 10) }
}

export async function listBiStoreWeeks(db: D1Database, storeId: string): Promise<Array<BiStoreWeekRecord & { capturedAt: string }>> {
  const rows = await all<{ payload: string; captured_at: string }>(
    db.prepare(`SELECT payload, captured_at FROM bi_store_week WHERE store_id = ? AND status = 'ok' ORDER BY week_from ASC`).bind(storeId)
  )
  const out: Array<BiStoreWeekRecord & { capturedAt: string }> = []
  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.payload) as BiStoreWeekRecord | null
      if (parsed && typeof parsed.from === 'string' && typeof parsed.turnover === 'object') {
        out.push({ ...parsed, capturedAt: row.captured_at })
      }
    } catch { /* 单行损坏跳过，不拖垮整列 */ }
  }
  return out
}

// 确保最后一个已完结周落库；同时补齐基线周到已完结周之间的缺口（幂等，正常只差 1 周）。
// 上游复用 getStoreWeek（perfeco STORES + SPD，30 分钟 D1 缓存）；已完结周数据恒定，
// 30 分钟 TTL 只影响重复拉取频率，不影响正确性。
export async function ensureStoreWeeks(
  env: WorkerEnv,
  options: { storeId: string; storeCode: string; now?: Date }
): Promise<{ pulled: number }> {
  if (!isPerfecoConfigured(env)) return { pulled: 0 }
  const now = options.now ?? new Date()
  const completed = lastCompletedWeek(now)
  const existing = await all<{ week_from: string }>(
    env.DB.prepare(`SELECT week_from FROM bi_store_week WHERE store_id = ?`).bind(options.storeId)
  )
  const have = new Set(existing.map((row) => row.week_from))
  const targets: Array<{ from: string; to: string }> = []
  for (let ms = Date.parse(`${BI_WEEKLY_BASELINE_FROM}T00:00:00Z`); ms <= Date.parse(`${completed.from}T00:00:00Z`); ms += 7 * 86400_000) {
    const from = new Date(ms).toISOString().slice(0, 10)
    const to = new Date(ms + 6 * 86400_000).toISOString().slice(0, 10)
    if (!have.has(from)) targets.push({ from, to })
  }
  let pulled = 0
  for (const target of targets) {
    const payload = await getStoreWeek(env, { storeId: options.storeId, storeCode: options.storeCode, from: target.from, to: target.to, now })
    if (!payload) continue
    const weekLabel = isoWeekOf(target.to).label
    await env.DB.prepare(`
      INSERT INTO bi_store_week (store_id, week_from, week_to, week_label, status, payload, captured_at)
      VALUES (?, ?, ?, ?, 'ok', ?, ?)
      ON CONFLICT(store_id, week_from) DO UPDATE SET
        week_to = excluded.week_to,
        week_label = excluded.week_label,
        status = 'ok',
        payload = excluded.payload,
        captured_at = excluded.captured_at
    `).bind(options.storeId, target.from, target.to, weekLabel, JSON.stringify({ ...payload, weekLabel }), now.toISOString()).run()
    pulled += 1
  }
  return { pulled }
}

// cron 入口（index.ts scheduled）：与 Shiphub 同款窗口硬规则；单店失败不拖垮其他店，
// 下一 tick 幂等重试。当前周预热（车型周榜 + 门店周 TO/DIS）让面板首访零等待，
// 既有 30 分钟缓存自动节流上游，无缓存击穿风险。
export async function runScheduledBiSync(env: WorkerEnv, now = new Date()): Promise<void> {
  if (!isPerfecoConfigured(env)) return
  if (!activeInStoreTimezone(BI_SYNC_TIMEZONE, now, BI_SYNC_START_HOUR, BI_SYNC_END_HOUR)) return
  const stores = await all<{ id: string; code: string }>(
    env.DB.prepare(`SELECT id, code FROM stores WHERE status = 'active'`)
  )
  for (const store of stores) {
    // perfeco 门店码为纯数字（如 1299）；测试/非迪卡侬编码门店跳过，绝不空转上游。
    if (!/^\d{3,8}$/u.test(store.code)) continue
    try {
      await ensureStoreWeeks(env, { storeId: store.id, storeCode: store.code, now })
      const window = currentWeekWindow(now)
      await getBikeWeek(env, { storeId: store.id, storeCode: store.code, now })
      await getStoreWeek(env, { storeId: store.id, storeCode: store.code, from: window.from, to: window.to, now })
    } catch { /* 下一 tick 重试；scheduled 层绝不抛错影响 Shiphub 同步 */ }
  }
}
