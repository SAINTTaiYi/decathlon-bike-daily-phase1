import { useEffect, useMemo, useState } from 'react'
import { getBikeWeek, getBiVehicleModels } from '../api/bi.js'
import { BI_SNAPSHOT } from '../data/biSnapshot.js'

// BI 车型榜数据源（2026-09-04 perfeco 换源）：
// top/flop = perfeco 滚动 7 天整车榜（share=本周占比、wow=环比）；
// allChannel = 旧 M218 快照行经 /api/v1/bi/vehicle-models 整车过滤（轮滑鞋/脖套剔除）。
// 任一上游不可用 → 整体回退 BI_SNAPSHOT.models 旧行为，面板永远有数据。
function fallbackModels() {
  return { ...BI_SNAPSHOT.models, source: 'snapshot' }
}
export default function useBiBikesWeek() {
  const [week, setWeek] = useState(null)
  const [filtered, setFiltered] = useState(null)
  useEffect(() => {
    let cancelled = false
    getBikeWeek()
      .then((payload) => { if (!cancelled && payload && payload.available === true) setWeek(payload) })
      .catch(() => undefined)
    const codes = BI_SNAPSHOT.models.allChannel.rows.map((row) => String(row.code)).filter((code) => /^\d{4,10}$/u.test(code))
    getBiVehicleModels(codes)
      .then((payload) => { if (!cancelled && payload && payload.available === true) setFiltered(payload.vehicles ?? {}) })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [])
  return useMemo(() => {
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
  }, [week, filtered])
}
