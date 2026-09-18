import { useCallback, useEffect, useRef, useState } from 'react'
import {
  buildFoodAutoPlan,
  discoverFoodAutoReceptions,
  fetchFoodAutoReceptionItems,
  fetchFoodAutoReceptions,
  getFoodAutoStatus,
  judgeFoodAutoRecords,
  saveFoodAutoRun,
  scanFoodAutoSegment
} from '../api/foodAuto.js'

/**
 * 食品自动登记 · 影子系统编排（2026-09-18）。
 *
 * 用户要求：点「自动登记」后，算法每一步的进展都要实时上屏——正在遍历 /
 * 遍历进度 / 捕捉到的目标，拉到什么就更新什么（一个字也要更新）。
 *
 * 因此这里把整条链路做成**事件流**：
 *   ① 配置检查 → ② 待收货单（为空时走流水回查）→ ③ 收货明细
 *   → ④ 扫描计划 → ⑤ RDS 分段扫描（并发 8，逐段回报）
 *   → ⑥ 批次判定 → ⑦ 影子表落库
 * 每个阶段、每个分段、每个新批次都 emit 一条事件；同时维护 liveItems
 * （逐商品实时战绩：命中条数 / 候选批次），供界面实时渲染。
 *
 * 调度在前端、计算在 Worker：每次 /scan 只算一个 10k 分片（响应小、可中断），
 * 页面关掉就停——这是刻意的（算法在 CF 侧，页面只做驱动器）。
 */

const SCAN_CONCURRENCY = 8
const MAX_EVENTS = 2400
const RECEPTION_PAGE_LIMIT = 40

export function useFoodAuto() {
  const [status, setStatus] = useState(null)
  const [running, setRunning] = useState(false)
  const [phase, setPhase] = useState('idle')
  const [events, setEvents] = useState([])
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [receptions, setReceptions] = useState([])
  const [items, setItems] = useState([])
  const [liveItems, setLiveItems] = useState({})
  const [judgements, setJudgements] = useState([])
  const [savedRun, setSavedRun] = useState(null)
  const [error, setError] = useState(null)
  const [elapsedMs, setElapsedMs] = useState(0)

  const abortRef = useRef(null)
  const recordsRef = useRef({})
  const seenBatchRef = useRef({})
  const itemsRef = useRef([])
  const seqRef = useRef(0)
  const startedAtRef = useRef(0)
  const timerRef = useRef(null)

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current)
    abortRef.current?.abort?.()
  }, [])

  const emit = useCallback((text, level = 'info') => {
    seqRef.current += 1
    const entry = { id: seqRef.current, at: Date.now(), level, text }
    setEvents((prev) => (prev.length >= MAX_EVENTS ? [...prev.slice(prev.length - MAX_EVENTS + 1), entry] : [...prev, entry]))
  }, [])

  const namesRef = useRef({})
  const nameOf = useCallback((item) => namesRef.current[item] || `商品 ${item}`, [])

  /** 把一段扫描结果并入实时战绩，并回报「捕捉到的新批次」。 */
  const applySegment = useCallback(
    (result, segment, planProgress) => {
      const { item, from, records } = result
      const bucket = recordsRef.current[item] ?? (recordsRef.current[item] = [])
      bucket.push(...records)

      const seen = seenBatchRef.current[item] ?? (seenBatchRef.current[item] = new Set())
      const groups = new Map()
      for (const row of bucket) {
        const key = `${row.obs ?? ''}|${row.exp ?? ''}`
        const group = groups.get(key) ?? { obs: row.obs, exp: row.exp, count: 0 }
        group.count += 1
        groups.set(key, group)
      }
      const batches = [...groups.values()].sort((a, b) => b.count - a.count).slice(0, 5)

      for (const batch of batches) {
        const key = `${batch.obs ?? ''}|${batch.exp ?? ''}`
        if (batch.exp && !seen.has(key)) {
          seen.add(key)
          emit(`  🎯 捕捉 ${nameOf(item)} 新批次：到期 ${batch.exp.slice(0, 10)}｜生产喷码 ${(batch.obs ?? '—').slice(0, 19)}`, 'target')
        }
      }

      setLiveItems((prev) => {
        const existing = prev[item] ?? { item, name: nameOf(item), records: 0, segments: 0, segmentsTotal: 0 }
        return {
          ...prev,
          [item]: {
            ...existing,
            records: bucket.length,
            segments: existing.segments + 1,
            lastFrom: from,
            lastFound: records.length,
            batches
          }
        }
      })

      emit(
        `段 ${planProgress.done}/${planProgress.total}｜${nameOf(item)} ${segment.from / 1000}k｜命中 ${records.length} 条${batches[0]?.exp ? `｜主批次 ${batches[0].exp.slice(0, 10)}×${batches[0].count}` : ''}`,
        records.length ? 'hit' : 'info'
      )
    },
    [emit, nameOf]
  )

  const start = useCallback(async () => {
    if (running) return
    const controller = new AbortController()
    abortRef.current = controller
    const signal = controller.signal

    setRunning(true)
    setError(null)
    setEvents([])
    setJudgements([])
    setSavedRun(null)
    setLiveItems({})
    setProgress({ done: 0, total: 0 })
    seqRef.current = 0
    recordsRef.current = {}
    seenBatchRef.current = {}
    itemsRef.current = []
    namesRef.current = {}
    startedAtRef.current = Date.now()
    setElapsedMs(0)
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 500)

    const startedAt = new Date().toISOString()

    try {
      // ① 配置检查
      setPhase('检查配置…')
      emit('▶ 自动登记开始（影子运行，不写正式台账）')
      const config = await getFoodAutoStatus(signal)
      setStatus(config)
      emit(`配置：上游凭据${config.configured ? '就绪' : '缺失'}｜绑定门店 ${config.boundStoreCode ?? '—'}｜扫描窗口 ${config.windowHours} 小时｜分片 ${config.segmentSize / 1000}k EPC`)
      if (!config.configured) throw new Error('自动登记未配置上游凭据（SNB）。')
      if (!config.storeAllowed) throw new Error('当前门店不是自动登记绑定门店。')

      // ② 待收货单（为空时回查流水）
      setPhase('拉取今日收货单…')
      emit('查询待收货单（stock-reception）…')
      const pending = (await fetchFoodAutoReceptions(signal)).receptions ?? []
      let queue = pending
      if (pending.length) {
        emit(`待收货单 ${pending.length} 张`)
        for (const row of pending) {
          emit(`  · ${row.receptionId}｜预计 ${fmtDateTime(row.expectedAt)}｜${row.packageCount} 包 / ${row.itemCount} 项 / ${row.totalQuantities} 件`, 'info')
        }
      } else {
        emit('待收货列表为空 —— 从收货流水回查今日已确认的收货单…', 'warn')
        setPhase('回查今日收货流水…')
        const discovered = await discoverFoodAutoReceptions(signal)
        emit(`流水回查：扫描 ${discovered.scanned} 个商品｜今日 receipt ${discovered.findings.length} 条｜收货单 ${discovered.receptionIds.length} 张${discovered.failed ? `（${discovered.failed} 个商品查询失败）` : ''}`)
        for (const row of discovered.findings.slice(0, 40)) {
          emit(`  · 收货 ${nameOf(row.item)} ×${row.delta}｜单号 ${row.receptionId}｜${fmtDateTime(row.at)}`, 'hit')
        }
        if (discovered.findings.length > 40) emit(`  …其余 ${discovered.findings.length - 40} 条省略`)
        queue = discovered.receptionIds.map((receptionId) => ({ receptionId, state: 'RECEIVED', expectedAt: null, packageCount: 0, itemCount: 0, totalQuantities: 0 }))
        if (!queue.length) throw new Error('今天没有待收货单，也没有查到已确认的收货单。')
      }
      setReceptions(queue)

      // ③ 收货明细
      setPhase('读取收货明细…')
      const itemMap = new Map()
      for (const reception of queue) {
        emit(`读取 ${reception.receptionId} 的包裹明细（packages → details）…`)
        let offset = 0
        let pages = 0
        for (;;) {
          const page = await fetchFoodAutoReceptionItems({ receptionId: reception.receptionId, offset, limit: RECEPTION_PAGE_LIMIT }, signal)
          for (const row of page.items) {
            const existing = itemMap.get(row.item)
            if (existing) existing.qty += row.qty
            else itemMap.set(row.item, { ...row })
          }
          pages += 1
          emit(`  · ${reception.receptionId} 明细第 ${pages} 页：${page.items.length} 个食品项（累计 ${itemMap.size} 项）｜${Math.min(offset + RECEPTION_PAGE_LIMIT, page.packages)}/${page.packages} 包`)
          if (page.done || pages >= 20) break
          offset = page.offset
        }
      }
      const planItems = [...itemMap.values()]
      itemsRef.current = planItems
      for (const row of planItems) namesRef.current[row.item] = row.name
      setItems(planItems)
      const totalQty = planItems.reduce((sum, row) => sum + row.qty, 0)
      emit(`今日食品合计 ${planItems.length} 项 / ${totalQty} 件`, 'target')
      for (const row of planItems) emit(`  · ${row.name}（${row.item}）×${row.qty}`)

      // ④ 扫描计划
      setPhase('生成扫描计划…')
      const plan = await buildFoodAutoPlan({ items: planItems }, signal)
      const total = plan.segments.length
      emit(`扫描计划：${total} 个分片（10k EPC/片）${plan.skipped.length ? `｜${plan.skipped.length} 项无区段表（跳过）` : ''}`, 'target')
      setProgress({ done: 0, total })
      if (!total) throw new Error('没有可扫描的分片（区段表未覆盖今日商品）。')

      // ⑤ RDS 分段扫描
      setPhase('遍历 RDS 序列…')
      const perItemSegments = new Map()
      for (const segment of plan.segments) perItemSegments.set(segment.item, (perItemSegments.get(segment.item) ?? 0) + 1)
      setLiveItems(() => {
        const seed = {}
        for (const row of planItems) {
          seed[row.item] = { item: row.item, name: row.name, records: 0, segments: 0, segmentsTotal: perItemSegments.get(row.item) ?? 0, batches: [] }
        }
        return seed
      })

      const queueSegments = [...plan.segments]
      let done = 0
      let failed = 0
      const worker = async () => {
        for (;;) {
          if (signal.aborted) return
          const segment = queueSegments.shift()
          if (!segment) return
          try {
            const result = await scanFoodAutoSegment({ item: segment.item, from: segment.from, count: segment.count }, signal)
            done += 1
            applySegment(result, segment, { done, total })
            setProgress({ done, total })
          } catch (scanError) {
            if (signal.aborted) return
            done += 1
            failed += 1
            emit(`段失败 ${nameOf(segment.item)} @${segment.from / 1000}k：${scanError?.message ?? scanError}`, 'error')
            setProgress({ done, total })
          }
        }
      }
      await Promise.all(Array.from({ length: SCAN_CONCURRENCY }, worker))
      if (signal.aborted) throw new Error('已取消')

      const totalRecords = Object.values(recordsRef.current).reduce((sum, rows) => sum + rows.length, 0)
      emit(`扫描完成：${total - failed}/${total} 段成功｜命中窗口内记录 ${totalRecords} 条${failed ? `｜失败 ${failed} 段` : ''}`, 'target')

      // ⑥ 批次判定（先把原始记录压成每批一行摘要：紧凑载荷，判定仍在 Worker）
      setPhase('判定批次（整箱爆点）…')
      const aggregates = buildAggregates(recordsRef.current)
      const groupTotal = Object.values(aggregates).reduce((sum, rows) => sum + rows.length, 0)
      emit(`批次摘要：${totalRecords} 条记录 → ${groupTotal} 个候选批次（跨商品共现毫秒已标记）`, 'info')
      const judged = await judgeFoodAutoRecords({ items: planItems, aggregates }, signal)
      setJudgements(judged.judgements ?? [])
      for (const row of judged.judgements ?? []) {
        emit(
          `判定 ${row.name}：生产 ${row.productionDate ?? '—'}｜到期 ${row.expiryDate ?? '—'}｜预警 ${row.warnOn ?? '—'}｜置信 ${confidenceLabel(row.confidence)}${row.note ? `｜${row.note}` : ''}`,
          row.confidence === 'high' ? 'target' : row.confidence === 'none' ? 'warn' : 'info'
        )
      }

      // ⑦ 影子表落库
      setPhase('写入影子表…')
      const saved = await saveFoodAutoRun({
        receptions: queue,
        judgements: judged.judgements ?? [],
        startedAt,
        stats: {
          segments: total,
          failedSegments: failed,
          records: totalRecords,
          elapsedMs: Date.now() - startedAtRef.current,
          itemCount: planItems.length,
          totalQty
        }
      })
      setSavedRun(saved)
      emit(`✅ 影子运行已保存：runId ${saved.runId}｜${saved.saved} 行（待人工核验后再进正式台账）`, 'target')
      setPhase('完成')
    } catch (runError) {
      const aborted = signal.aborted || runError?.name === 'AbortError'
      if (aborted) {
        emit('■ 运行已取消', 'warn')
        setPhase('已取消')
      } else {
        setError(runError?.message ?? String(runError))
        setPhase('失败')
        emit(`✖ 失败：${runError?.message ?? runError}`, 'error')
      }
    } finally {
      setRunning(false)
      if (timerRef.current) clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [applySegment, emit, nameOf, running])

  const cancel = useCallback(() => {
    abortRef.current?.abort?.()
  }, [])

  const reset = useCallback(() => {
    if (running) return
    setEvents([])
    setJudgements([])
    setSavedRun(null)
    setError(null)
    setPhase('idle')
    setProgress({ done: 0, total: 0 })
    setLiveItems({})
    setItems([])
    setReceptions([])
    setElapsedMs(0)
  }, [running])

  return {
    status,
    running,
    phase,
    events,
    progress,
    receptions,
    items,
    liveItems,
    judgements,
    savedRun,
    error,
    elapsedMs,
    start,
    cancel,
    reset
  }
}

/**
 * 原始记录 → 每商品批次摘要（客户端的机械压缩，与 Worker 的 aggregateRecords 同口径）。
 *
 * 为什么压：judge 若直传 1.8 万条原始记录（≈2.2MB），免费层 Worker 的 10ms CPU
 * 会被 JSON.parse + 聚合循环打成 50ms（本地实测），有被平台终止的风险。
 * 判定本身（评分 / 置信度 / 日期换算）仍在 Worker。
 */
function serialOfEpc(epc) {
  try {
    return Number(BigInt(`0x${epc}`) & ((1n << 38n) - 1n))
  } catch {
    return 0
  }
}

const AGGREGATE_LIMIT = 200

function buildAggregates(recordsByItem) {
  // ① 跨商品同毫秒（整箱爆点主信号）：ms → 出现的商品集合
  const msToItems = new Map()
  for (const [item, rows] of Object.entries(recordsByItem)) {
    for (const row of rows) {
      let set = msToItems.get(row.upd)
      if (!set) {
        set = new Set()
        msToItems.set(row.upd, set)
      }
      set.add(item)
    }
  }
  const coMs = new Set()
  for (const [ms, set] of msToItems) if (set.size >= 2) coMs.add(ms)

  // ② 每商品按 (obs, exp) 聚合：条数 / 共现条数 / 序列范围 / 样本
  const out = {}
  for (const [item, rows] of Object.entries(recordsByItem)) {
    const groups = new Map()
    for (const row of rows) {
      const key = `${row.obs ?? ''}|${row.exp ?? ''}`
      let group = groups.get(key)
      if (!group) {
        group = { obs: row.obs, exp: row.exp, count: 0, coOccur: 0, min: Number.POSITIVE_INFINITY, serialMax: 0, samples: [] }
        groups.set(key, group)
      }
      group.count += 1
      if (coMs.has(row.upd)) group.coOccur += 1
      const serial = serialOfEpc(row.epc)
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
      .sort((a, b) => b.count + b.coOccur * 50 - (a.count + a.coOccur * 50))
      .slice(0, AGGREGATE_LIMIT)
  }
  return out
}

function fmtDateTime(value) {
  if (!value) return '—'
  try {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 16)
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(date)
  } catch {
    return String(value).slice(0, 16)
  }
}

function confidenceLabel(value) {
  return { high: '高', medium: '中', low: '低', none: '无' }[value] ?? value
}
