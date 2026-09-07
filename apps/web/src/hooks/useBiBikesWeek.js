import { useEffect, useMemo, useState } from 'react'
import { getBikeWeek } from '../api/bi.js'
import { BI_SNAPSHOT } from '../data/biSnapshot.js'

// BI 车型榜数据源（2026-09-04 第二轮：CIS perfeco 当前 Sun→Sat 周）。
// 销售榜三个 tab：全渠道 / 线上 / 线下（渠道拆分在 worker 端按 perfeco 渠道桶完成，
// 线上=电商发货+自提，线下=实体店+会员卡+其他）。周口径对齐 BI（W 编号 = 周六 ISO 周）。
// 门店边界铁律（2026-09-08）：BI 快照 M218 回退只允许数据归属门店自己
// （allowSnapshotFallback，由面板按 storeCode === snapshot.store.code 判定）；
// 其它门店 CIS 不可用时显示未开通状态，绝不能看到 1299 的快照数据。
const SESSION_TTL_MS = 30 * 60 * 1000
let sessionCache = null // { at, week }

function fallbackModels() {
  // BI 快照回退：M218 allChannel 行只有全渠道口径（渠道构成串），线上/线下无法拆。
  const rows = BI_SNAPSHOT.models.allChannel.rows.map((row, index) => ({
    rank: index + 1,
    model: row.model,
    code: row.code,
    qty: row.qty,
    to: row.to,
    buyback: false,
    onlineQty: 0,
    onlineTo: 0,
    offlineQty: 0,
    offlineTo: 0
  }))
  return {
    source: 'BI',
    report: 'M218 全渠道快照（回退）',
    weekLabel: BI_SNAPSHOT.models.week,
    weekRange: BI_SNAPSHOT.models.week,
    toComplete: true,
    rows,
    totals: { all: { ...BI_SNAPSHOT.models.allChannel.total }, online: null, offline: null },
    basis: 'CIS perfeco 不可用 · 回退 BI M218 快照（仅全渠道口径，线上/线下不可拆分）'
  }
}

function freshCache() {
  return sessionCache && Date.now() - sessionCache.at < SESSION_TTL_MS ? sessionCache : null
}

// 非归属门店的「未开通」态：不回退任何快照数据。
function unavailableModels() {
  return {
    source: 'NONE',
    report: 'CIS 实销（未开通）',
    weekLabel: '—',
    weekRange: '—',
    toComplete: true,
    rows: [],
    totals: null,
    basis: 'BI 数据按门店隔离：在菜单 → Shiphub 连接 提交本店账号后自动开通'
  }
}

export default function useBiBikesWeek({ allowSnapshotFallback = false } = {}) {
  const [data, setData] = useState(() => freshCache())
  useEffect(() => {
    if (freshCache()) return undefined
    let cancelled = false
    getBikeWeek()
      .then((payload) => {
        if (payload && payload.available === true) {
          sessionCache = { at: Date.now(), week: payload }
          if (!cancelled) setData(sessionCache)
        } else if (!cancelled) {
          setData({ at: Date.now(), week: null })
        }
      })
      .catch(() => {
        if (!cancelled) setData({ at: Date.now(), week: null })
      })
    return () => { cancelled = true }
  }, [])
  return useMemo(() => {
    const week = data?.week ?? null
    if (!week) return { models: allowSnapshotFallback ? fallbackModels() : unavailableModels(), ready: false }
    return {
      models: {
        source: 'CIS',
        report: 'perfeco 整车周实销',
        weekLabel: week.weekLabel,
        weekRange: `${week.from} → ${week.to}${week.toComplete ? '' : '（至今日）'}`,
        toComplete: week.toComplete,
        rows: week.rows,
        totals: week.totals,
        basis: '线上=电商发货+到店自提 · 线下=实体店+会员卡+其他'
      },
      ready: true
    }
  }, [data])
}
