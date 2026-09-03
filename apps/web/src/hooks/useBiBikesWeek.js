import { useEffect, useMemo, useState } from 'react'
import { getBikeWeek, getBiVehicleModels } from '../api/bi.js'
import { BI_SNAPSHOT } from '../data/biSnapshot.js'

// BI 车型榜数据源（2026-09-04 perfeco 换源）：
// top/flop = perfeco 滚动 7 天整车榜（share=本周占比、wow=环比）；
// allChannel = 旧 M218 快照行经 /api/v1/bi/vehicle-models 整车过滤（轮滑鞋/脖套剔除）。
// 任一上游不可用 → 整体回退 BI_SNAPSHOT.models 旧行为，面板永远有数据。
//
// 会话级缓存（2026-09-04 读行/登录预算优化）：BI 面板随场景切换反复挂载，
// 若每次挂载都打 /bikes/week + /vehicle-models，会放大 D1 读行、auth 会话
// 读行与 Worker→IdP 登录次数（旧实现每次切换销售场景 = 1 次 IdP 登录）。
// 同会话内数据只拉一次，TTL 过期后下一次挂载刷新；周榜失败不缓存
// （下次挂载自动重试，失败态不会污染会话缓存）。
const SESSION_TTL_MS = 30 * 60 * 1000
let sessionCache = null // { at, week, filtered }

function fallbackModels() {
  return { ...BI_SNAPSHOT.models, source: 'snapshot' }
}

async function loadOnce() {
  const codes = BI_SNAPSHOT.models.allChannel.rows
    .map((row) => String(row.code))
    .filter((code) => /^\d{4,10}$/u.test(code))
  const [weekPayload, vehiclePayload] = await Promise.all([
    getBikeWeek().catch(() => null),
    getBiVehicleModels(codes).catch(() => null)
  ])
  return {
    at: Date.now(),
    week: weekPayload && weekPayload.available === true ? weekPayload : null,
    filtered: vehiclePayload && vehiclePayload.available === true ? (vehiclePayload.vehicles ?? null) : null
  }
}

function freshCache() {
  return sessionCache && Date.now() - sessionCache.at < SESSION_TTL_MS ? sessionCache : null
}

export default function useBiBikesWeek() {
  const [data, setData] = useState(() => freshCache())
  useEffect(() => {
    if (freshCache()) return undefined
    let cancelled = false
    loadOnce().then((next) => {
      if (next.week) sessionCache = next
      if (!cancelled) setData(next)
    })
    return () => { cancelled = true }
  }, [])
  return useMemo(() => {
    const week = data?.week ?? null
    const filtered = data?.filtered ?? null
    if (!week) return { models: fallbackModels(), ready: false }
    const top = week.rows
      .filter((row) => !row.buyback)
      .map((row, index) => ({ rank: index + 1, model: row.label || row.code, code: row.code, share: row.share, qty: row.qty, to: row.to, yoy: null, wow: row.wow }))
    const flop = week.rows
      .filter((row) => row.wow !== null && row.wow < 0)
      .sort((a, b) => a.wow - b.wow)
      .map((row, index) => ({ rank: index + 1, model: row.label || row.code, code: row.code, share: row.share, qty: row.qty, to: row.to, yoy: null, wow: row.wow }))
    const oldRows = BI_SNAPSHOT.models.allChannel.rows
    const keep = filtered
      ? oldRows.filter((row) => {
        const info = filtered[String(row.code)]
        return info ? info.isBike : true // 分类接口失败时保留旧行为，不误删
      })
      : oldRows
    const kept = keep.map((row, index) => ({ ...row, rank: index + 1 }))
    const keptQty = kept.reduce((sum, row) => sum + row.qty, 0)
    const keptTo = Math.round(kept.reduce((sum, row) => sum + row.to, 0) * 100) / 100
    return {
      models: {
        source: 'perfeco',
        caliber: '整车（perfeco families 白名单）',
        report: 'perfeco 周实销',
        week: `${week.from} → ${week.to.slice(5)}`,
        basis: {
          top: `条长 = 本周整车 TO 占比 · 右侧 = 周销量与金额（滚动 7 天实销）`,
          flop: `条长 = 周环比下滑幅度 · 右侧 = 周销量与金额（滚动 7 天实销）`,
          allChannel: `条长 = 周销量（台）· M218 快照经整车分类过滤 · 每渠道仅前 5`
        },
        top,
        flop,
        allChannel: { total: { qty: keptQty, to: keptTo }, rows: kept }
      },
      ready: true
    }
  }, [data])
}
