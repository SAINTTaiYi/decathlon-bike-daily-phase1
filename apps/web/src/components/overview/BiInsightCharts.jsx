// BI 门店经营可视化 —— lieflat 语法 × BI Portal 1299 快照。
// 图型血缘（结构正本见 ~/lieflat-charts/templates/）：
//   · BiSourceCompare ← 门店 TO / DIS 的 BI × CIS 双源周期对比（2026-09-04 替换原 G18/L14 单源卡）
//   · BiOnlineGauge ← basics-gallery F11 Tick Gauge（1 刻度 = 1%，上墨 = 已达成）
// 动效遵循工作台规则：GSAP 驱动，滚入播放 + 点击重播，prefers-reduced-motion 直达终态。
import { useEffect, useMemo, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { BI_SNAPSHOT } from '../../data/biSnapshot.js'
import { ALLCHANNEL_NAMES } from '../../data/biSkuNames.js'
import useBiBikesWeek from '../../hooks/useBiBikesWeek.js'
import useBiStoreCompare from '../../hooks/useBiStoreCompare.js'
import useBiSkuNames from '../../hooks/useBiSkuNames.js'

const MONO = {
  ink: '#1C1C1A', mid: '#55554F', muted: '#8F8E88', faint: '#B0AFA9', hairline: '#CDCCC5', grid: '#DEDDD6'
}
const D2R = Math.PI / 180
// 确定性伪随机（mono-tokens 原样），刷新两次长得一样
const rnd = (i, k) => Math.abs(((i * 73856093) ^ (k * 19349663)) % 1000) / 1000
const pol = (cx, cy, r, deg) => [cx + r * Math.cos(deg * D2R), cy + r * Math.sin(deg * D2R)]
const money = (value) => `¥${Math.round(value).toLocaleString('en-US')}`

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!query) return undefined
    const onChange = (event) => setReduced(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return reduced
}

// lieflat reveal 机制：滚入视野才播 + 点击重播
function useBiReveal() {
  const ref = useRef(null)
  const [revealed, setRevealed] = useState(false)
  const [replay, setReplay] = useState(0)
  useEffect(() => {
    const node = ref.current
    if (!node) return undefined
    if (!('IntersectionObserver' in window)) { setRevealed(true); return undefined }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setRevealed(true); observer.disconnect() }
    }, { threshold: 0.25 })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  const replayChart = () => { setRevealed(true); setReplay((value) => value + 1) }
  return { ref, revealed, replay, replayChart }
}

// GSAP 时间线：revealed/replay 变化时重建并播放；.from() 语义保证重播从初始偏移开始
function useBiMotion(ref, revealed, replay, reduced, build) {
  const firstTabRender = useRef(true)
  useEffect(() => {
    if (firstTabRender.current) { firstTabRender.current = false; return undefined }
    const node = ref.current
    if (!node || reduced || !revealed) return undefined
    const timeline = gsap.timeline()
    build(timeline, node)
    timeline.play(0)
    return () => { timeline.kill() }
  }, [revealed, replay, reduced, build])
}

function ChartSvg({ label, replayChart, children, viewBox, preserveAspectRatio = 'xMidYMid meet' }) {
  return (
    <svg className="ops-lieflat-chart ops-bi-chart" viewBox={viewBox} preserveAspectRatio={preserveAspectRatio} role="img" tabIndex="0" aria-label={label} onClick={replayChart} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') replayChart() }}>
      <title>点击或按 Enter 重播入场动画</title>
      {children}
    </svg>
  )
}

/* ── 双源对比 · 门店 TO / DIS：BI × CIS 周期对比（2026-09-04 用户定案）── */
export function BiSourceCompare({ snapshot }) {
  const storeWeek = useBiStoreCompare()
  const eco = snapshot.economic
  const reduced = usePrefersReducedMotion()
  const { ref, revealed, replay, replayChart } = useBiReveal()
  const cisTo = typeof storeWeek?.turnover?.total === 'number' ? storeWeek.turnover.total : null
  const cisDis = storeWeek?.dis && typeof storeWeek.dis.amount === 'number' ? storeWeek.dis.amount : null
  const rows = [
    { key: 'to', label: '门店 TO', bi: eco.to, cis: cisTo, cisNote: 'perfeco STORES 聚合' },
    { key: 'dis', label: 'DIS 销售', bi: eco.dis.total, cis: cisDis, cisNote: 'SPD 折扣流水' }
  ]
  const build = useMemo(() => (timeline, node) => {
    timeline.from(node.querySelectorAll('.ops-bi-compare-row'), { opacity: 0, y: 10, duration: 0.5, ease: 'power3.out', stagger: 0.12 }, 0.1)
    timeline.from(node.querySelectorAll('.ops-bi-compare-note'), { opacity: 0, duration: 0.5, ease: 'power2.out' }, 0.5)
  }, [])
  useBiMotion(ref, revealed, replay, reduced, build)
  return (
    <section ref={ref} className="ops-lieflat-card ops-bi-card ops-bi-compare-card" data-replay={replay} onClick={replayChart} aria-label="门店 TO 与 DIS 的 BI 与 CIS 双源对比">
      <h3>门店 TO / DIS：BI × CIS 双源对比</h3>
      <div className="ops-lieflat-sub"><span>{`${eco.weekLabel} · ${eco.from} → ${eco.to.slice(5)} · BI 快照固定周 · CIS 按同期查询`}</span></div>
      <div className="ops-bi-compare-table" role="table" aria-label="双源数值对比表">
        <div className="ops-bi-compare-head" role="row">
          <span>指标</span><span>BI · M216 快照</span><span>CIS · perfeco + SPD</span>
        </div>
        {rows.map((row) => {
          const diff = row.cis !== null && row.bi ? row.cis - row.bi : null
          const pct = diff !== null && row.bi ? (diff / row.bi) * 100 : null
          return (
            <div className="ops-bi-compare-row" role="row" key={row.key}>
              <span className="ops-bi-compare-label">{row.label}</span>
              <span className="ops-bi-compare-bi"><b>{money(row.bi)}</b><small>BI 快照</small></span>
              <span className="ops-bi-compare-cis" data-cis-state={row.cis === null ? 'unavailable' : 'ok'}>
                {row.cis === null ? <em>{storeWeek ? `${row.cisNote} 未配置` : 'CIS 暂不可用'}</em> : (
                  <>
                    <b>{money(row.cis)}</b>
                    {diff !== null ? <small data-compare-delta={diff >= 0 ? 'up' : 'down'}>{`${diff >= 0 ? 'Δ +' : 'Δ '}${Math.round(diff).toLocaleString('en-US')}（${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%）`}</small> : null}
                  </>
                )}
              </span>
            </div>
          )
        })}
      </div>
      <p className="ops-bi-compare-note">口径：BI DIS = M216 全渠道减让；CIS DIS = SPD 折扣减让流水合计（绝对值）· 两源统计口径不同，数值差异属正常 · TO 同期同店</p>
      <div className="ops-lieflat-src">SOURCE COMPARE · BI M216 SNAPSHOT × CIS PERFECO + SPD · STORE 1299</div>
    </section>
  )
}

/* ── F11 Tick Gauge · 线上占门店 TO 的 1% 刻度 ──────────────── */
const GAUGE = { cx: 200, cy: 108, R0: 76, A0: -195, sweep: 210 }

export function BiOnlineGauge({ snapshot }) {
  const share = snapshot.storeSummary.onlineShare
  const inked = Math.round(share * 100)
  const { ref, revealed, replay, replayChart } = useBiReveal()
  const reduced = usePrefersReducedMotion()
  const ticks = useMemo(() => Array.from({ length: 100 }, (_, k) => {
    const angle = GAUGE.A0 + (k / 100) * GAUGE.sweep
    const isInked = k < inked
    const len = isInked ? 10 + rnd(k + 1, 3) * 5 : 4 + rnd(k + 1, 7) * 2
    const [x1, y1] = pol(GAUGE.cx, GAUGE.cy, GAUGE.R0, angle)
    const [x2, y2] = pol(GAUGE.cx, GAUGE.cy, GAUGE.R0 + len, angle)
    return { x1, y1, x2, y2, isInked }
  }), [inked])
  const milestones = useMemo(() => [25, 50, 75, 100].map((mark) => {
    const angle = GAUGE.A0 + (mark / 100) * GAUGE.sweep
    const [dx, dy] = pol(GAUGE.cx, GAUGE.cy, GAUGE.R0 - 7, angle)
    const [tx, ty] = pol(GAUGE.cx, GAUGE.cy, GAUGE.R0 - 18, angle)
    return { mark, dx, dy, tx, ty: ty + 3 }
  }), [])
  const tip = useMemo(() => {
    const angle = GAUGE.A0 + (inked / 100) * GAUGE.sweep
    const [x, y] = pol(GAUGE.cx, GAUGE.cy, GAUGE.R0 + 19, angle)
    return { x, y }
  }, [inked])
  const build = useMemo(() => (timeline, node) => {
    timeline.from(node.querySelectorAll('[data-bi-tick]'), { opacity: 0, duration: 0.3, stagger: 0.006, ease: 'power2.out' }, 0)
    timeline.from(node.querySelectorAll('[data-bi-milestone]'), { opacity: 0, duration: 0.4, ease: 'power2.out' }, 0.5)
    const state = { value: 0 }
    const number = node.querySelector('[data-bi-number]')
    if (number) timeline.to(state, {
      value: share * 100, duration: 1.0, ease: 'expo.out',
      onUpdate: () => { number.textContent = `${state.value.toFixed(1)}%` }
    }, 0.35)
    timeline.from(node.querySelectorAll('[data-bi-bead]'), { scale: 0, duration: 0.45, ease: 'back.out(2.2)' }, 1.0)
    timeline.from(node.querySelectorAll('[data-bi-caption]'), { opacity: 0, duration: 0.5, ease: 'power2.out', stagger: 0.1 }, 0.9)
  }, [share])
  useBiMotion(ref, revealed, replay, reduced, build)
  return (
    <section ref={ref} className="ops-lieflat-card ops-bi-card" data-replay={replay}>
      <h3>线上占去门店 TO 三成出头</h3>
      <div className="ops-lieflat-sub"><span>1 刻度 = 门店 TO 的 1% · 上墨 = 线上份额 {(share * 100).toFixed(1)}% · 门店汇总 M214 · 全店口径</span></div>
      <ChartSvg label={`线上占门店 TO 的 ${(share * 100).toFixed(1)}%，100 刻度中上墨 ${inked} 格`} replayChart={replayChart} viewBox="0 0 400 158">
        {ticks.map((tick, index) => (
          <line key={index} data-bi-tick="" x1={tick.x1} y1={tick.y1} x2={tick.x2} y2={tick.y2} stroke={tick.isInked ? MONO.ink : MONO.grid} strokeWidth={tick.isInked ? 1 : 0.6} />
        ))}
        {milestones.map((milestone) => (
          <g key={milestone.mark} data-bi-milestone="">
            <circle cx={milestone.dx} cy={milestone.dy} r="1" fill={MONO.faint} />
            <text x={milestone.tx} y={milestone.ty} fontSize="7" fontWeight="600" fill={MONO.faint} textAnchor="middle">{milestone.mark}</text>
          </g>
        ))}
        <circle data-bi-bead="" cx={tip.x} cy={tip.y} r="2.4" fill={MONO.ink}><title>{`线上份额 ${(share * 100).toFixed(1)}%（上墨 ${inked} 格）`}</title></circle>
        <text data-bi-number="" x={GAUGE.cx} y={GAUGE.cy - 6} fontSize="30" fontWeight="800" fill={MONO.ink} textAnchor="middle">{`${(share * 100).toFixed(1)}%`}</text>
        <text data-bi-caption="" x={GAUGE.cx} y={GAUGE.cy + 13} fontSize="8" fontWeight="600" fill={MONO.muted} textAnchor="middle" letterSpacing=".1em">SHARE OF STORE TO · ONLINE</text>
        <text data-bi-caption="" x="200" y="150" fontSize="7" fontWeight="600" fill={MONO.faint} textAnchor="middle" letterSpacing=".12em">ONE TICK = 1% OF STORE TO · INKED = ONLINE</text>
      </ChartSvg>
      <div className="ops-lieflat-src">TICK GAUGE · BI M214 STORE SUMMARY · STORE 1299</div>
    </section>
  )
}

/* ── F3 Hairline Area · 维修 TO 35 周趋势（1 根发丝 = 1 周）── */
export function BiRepairTrend({ snapshot }) {
  const weeks = snapshot.repair.weeks
  const { ref, revealed, replay, replayChart } = useBiReveal()
  const reduced = usePrefersReducedMotion()
  const geom = useMemo(() => {
    const base = 122
    const max = Math.max(...weeks.map((week) => week.value))
    const x = (index) => 24 + index * (832 / (weeks.length - 1))
    const y = (value) => base - (value / max) * (base - 20)
    const points = weeks.map((week, index) => ({ ...week, x: x(index), y: y(week.value) }))
    const peak = points.reduce((a, b) => (b.value > a.value ? b : a))
    const trough = points.reduce((a, b) => (b.value < a.value ? b : a))
    return { base, points, peak, trough }
  }, [weeks])
  const build = useMemo(() => (timeline, node) => {
    timeline.from(node.querySelectorAll('[data-bi-hair]'), { opacity: 0, duration: 0.4, stagger: 0.012, ease: 'power2.out' }, 0)
    const contour = node.querySelector('[data-bi-contour]')
    if (contour) timeline.from(contour, { strokeDashoffset: 1, duration: 1.1, ease: 'expo.inOut' }, 0.35)
    timeline.from(node.querySelectorAll('[data-bi-marker]'), { scale: 0, duration: 0.45, ease: 'back.out(2)', stagger: 0.15 }, 1.1)
  }, [])
  useBiMotion(ref, revealed, replay, reduced, build)
  const contour = `M ${geom.points.map((p) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' L ')}`
  const axis = [0, 8, 17, 26, 34]
  return (
    <section ref={ref} className="ops-lieflat-card ops-bi-card" data-replay={replay}>
      <h3>{`自行车+工作室 维修 TO · 周均 ${money(snapshot.repair.avg)}`}</h3>
      <div className="ops-lieflat-sub"><span>1 根发丝 = 1 周维修营业额 · Universe=自行车+工作室 源端过滤 · 维修报表 M348</span></div>
      <ChartSvg label={`2026 年 W01 至 W35 共 35 周维修 TO 趋势：累计 ¥${snapshot.repair.total.toLocaleString('en-US')}，峰值 ${geom.peak.week} ¥${geom.peak.value.toLocaleString('en-US')}，春节谷值 ${geom.trough.week} ¥${geom.trough.value}，最新 W35 ¥${geom.points[geom.points.length - 1].value.toLocaleString('en-US')}`} replayChart={replayChart} viewBox="0 0 880 158" preserveAspectRatio="none">
        <line data-bi-hair="" x1="20" y1={geom.base} x2="860" y2={geom.base} stroke={MONO.grid} strokeWidth="0.8" />
        {geom.points.map((p, index) => (
          <line key={p.week} data-bi-hair="" x1={p.x} y1={geom.base} x2={p.x} y2={p.y} stroke={p.week === geom.peak.week ? MONO.ink : MONO.muted} strokeWidth={p.week === geom.peak.week ? 1.1 : 0.55} opacity={p.week === geom.peak.week ? 1 : 0.5 + rnd(index + 1, 7) * 0.45} />
        ))}
        <path data-bi-contour="" d={contour} fill="none" stroke={MONO.ink} strokeWidth="1.2" pathLength="1" strokeDasharray="1" />
        <g data-bi-marker="">
          <circle cx={geom.peak.x} cy={geom.peak.y} r="3.4" fill={MONO.ink}><title>{`峰值 ${geom.peak.week} · ¥${geom.peak.value.toLocaleString('en-US')}（春节前保养高峰）`}</title></circle>
          <text x={geom.peak.x + 7} y={geom.peak.y + 3} fontSize="8.5" fontWeight="800" fill={MONO.ink} style={{ paintOrder: 'stroke', stroke: '#F6F4EE', strokeWidth: 3 }}>{`¥${geom.peak.value.toLocaleString('en-US')}`}</text>
        </g>
        <g data-bi-marker="">
          <circle cx={geom.trough.x} cy={geom.trough.y} r="2.8" fill="#F6F4EE" stroke={MONO.ink} strokeWidth="1"><title>{`春节周 ${geom.trough.week} · ¥${geom.trough.value}`}</title></circle>
          <text x={geom.trough.x} y={geom.trough.y - 8} fontSize="7" fontWeight="650" fill={MONO.muted} textAnchor="middle" style={{ paintOrder: 'stroke', stroke: '#F6F4EE', strokeWidth: 3 }}>春节</text>
        </g>
        {axis.map((index) => <text key={index} data-bi-hair="" x={geom.points[index].x} y={geom.base + 16} fontSize="7" fontWeight="600" fill={MONO.faint} textAnchor="middle" letterSpacing=".08em">{geom.points[index].week}</text>)}
        <text data-bi-hair="" x="440" y="152" fontSize="7" fontWeight="600" fill={MONO.faint} textAnchor="middle" letterSpacing=".12em">ONE HAIRLINE = ONE WEEK · 2026 W01–W35 · STORE 1299</text>
      </ChartSvg>
      <div className="ops-lieflat-src">HAIRLINE AREA · BI M348 REPAIR TO · STORE 1299</div>
    </section>
  )
}

/* ── G18 语义 · 维修累计指标卡 ─────────────────────────────── */
export function BiRepairStat({ snapshot }) {
  const { total, avg, recentAvg, peak, weeks } = snapshot.repair
  const latest = weeks[weeks.length - 1]
  const { ref, revealed, replay, replayChart } = useBiReveal()
  const reduced = usePrefersReducedMotion()
  const build = useMemo(() => (timeline, node) => {
    node.querySelectorAll('[data-bi-counter]').forEach((element, index) => {
      const target = Number(element.dataset.biCounter)
      const state = { value: 0 }
      timeline.to(state, {
        value: target, duration: 1.05, ease: 'expo.out',
        onUpdate: () => { element.textContent = money(state.value) }
      }, index * 0.14)
    })
    const chip = node.querySelector('[data-bi-chip]')
    if (chip) timeline.from(chip, { opacity: 0, y: 6, duration: 0.5, ease: 'power3.out' }, 0.6)
  }, [])
  useBiMotion(ref, revealed, replay, reduced, build)
  return (
    <section ref={ref} className="ops-lieflat-card ops-bi-card ops-bi-stat-card" data-replay={replay} onClick={replayChart} aria-label={`维修 TO 35 周累计 ${money(total)}，周均 ${money(avg)}，点击重播入场动画`}>
      <h3>近 8 周周均 {money(recentAvg)} · 最新周 {money(latest.value)}</h3>
      <div className="ops-lieflat-sub"><span>2026 W01–W35 · BI 维修报表 M348 · Universe=自行车+工作室</span></div>
      <div className="ops-bi-stat-main">
        <b data-bi-counter={total}>{money(total)}</b>
        <span className="ops-bi-yoy" data-bi-chip="" data-positive="true">▴ 近 8 周周均 {money(recentAvg)}</span>
      </div>
      <div className="ops-bi-stat-extra">
        <div><small>{`PEAK · ${peak.week} 春节前`}</small><b data-bi-counter={peak.value}>{money(peak.value)}</b></div>
        <div><small>{`LATEST · ${latest.week}`}</small><b data-bi-counter={latest.value}>{money(latest.value)}</b></div>
      </div>
      <div className="ops-lieflat-src">DRAW-IN COUNTER · BI M348 REPAIR · STORE 1299</div>
    </section>
  )
}


/* ── 商品销售榜 · M332 Omni 周报（TOP 占比 / FLOP 同比）────── */
// 2026-09-04 第二轮：销售榜三个 tab = 全渠道 / 线上 / 线下（CIS perfeco 渠道桶拆分，
// 线上=电商发货+到店自提，线下=实体店+会员卡+其他）。回退态（BI 快照）无渠道拆分。
const MODEL_TABS = [
  { key: 'all', label: '全渠道' },
  { key: 'online', label: '线上' },
  { key: 'offline', label: '线下' }
]
const TAB_SCOPE = {
  all: { qty: 'qty', to: 'to', total: 'all' },
  online: { qty: 'onlineQty', to: 'onlineTo', total: 'online' },
  offline: { qty: 'offlineQty', to: 'offlineTo', total: 'offline' }
}
// M218 全渠道表不带产品名，仅商品码；能确认的码补名字，其余保留码（诚实）。
// 仅收录经外部确认的码→名；其余码 M218 不带名称，保留码（不编造）。
const deltaText = (value, label) => value === null || value === undefined ? null : `${label} ${value > 0 ? '▴' : value < 0 ? '▾' : ''}${Math.abs(value).toFixed(1)}%`
const modelDelta = (row) => deltaText(row.wow, '环比') ?? deltaText(row.yoy, '同比') ?? '—'
const yuan = (value) => `¥${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function BiModelRanking({ snapshot }) {
  const bikeWeek = useBiBikesWeek()
  const models = bikeWeek.models
  const [tab, setTab] = useState('all')
  const skuNames = useBiSkuNames()
  const { ref, revealed, replay, replayChart } = useBiReveal()
  const reduced = usePrefersReducedMotion()
  const trackRef = useRef(null)
  const pillRef = useRef(null)
  const buttonRefs = useRef({})
  const placePill = (animate) => {
    const button = buttonRefs.current[tab]
    const pill = pillRef.current
    if (!button || !pill) return
    if (animate && !reduced) {
      gsap.killTweensOf(pill)
      gsap.to(pill, { x: button.offsetLeft, width: button.offsetWidth, duration: 0.42, ease: 'expo.out' })
    } else {
      gsap.set(pill, { x: button.offsetLeft, width: button.offsetWidth })
    }
  }
  useEffect(() => {
    placePill(false)
    if (!('ResizeObserver' in window)) return undefined
    const observer = new ResizeObserver(() => placePill(false))
    if (trackRef.current) observer.observe(trackRef.current)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { placePill(true) /* 切换时滑块位移 */ }, [tab, reduced]) // eslint-disable-line react-hooks/exhaustive-deps
  // tab 作用域行：按该渠道口径的销量过滤排序（全渠道=总销量，线上/线下=对应渠道桶）。
  const isFallback = models.source !== 'CIS'
  const scope = TAB_SCOPE[tab]
  const scoped = isFallback && tab !== 'all'
    ? []
    : models.rows
      .map((row) => ({ row, qty: row[scope.qty] ?? 0, to: row[scope.to] ?? 0 }))
      .filter((item) => item.qty > 0)
      .sort((a, b) => b.to - a.to)
      .slice(0, 10)
  const rows = scoped
  const scopeTotal = models.totals?.[scope.total] ?? null
  const metric = (item) => item.to
  const maxMetric = Math.max(...rows.map(metric), 0.001)
  const build = useMemo(() => (timeline, node) => {
    timeline.from(node.querySelectorAll('.ops-bi-model-row'), { opacity: 0, y: 8, duration: 0.5, ease: 'power3.out', stagger: 0.045 }, 0)
    timeline.from(node.querySelectorAll('.ops-bi-model-bar > i'), { scaleX: 0, duration: 0.6, ease: 'expo.out', stagger: 0.05, transformOrigin: 'left center' }, 0.1)
  }, [])
  useBiMotion(ref, revealed, replay, reduced, build)
  useEffect(() => {
    const node = ref.current
    if (!node || reduced || !revealed) return undefined
    const timeline = gsap.timeline()
    timeline.fromTo(node.querySelectorAll('.ops-bi-model-row'), { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power3.out', stagger: 0.03 })
    timeline.fromTo(node.querySelectorAll('.ops-bi-model-bar > i'), { scaleX: 0 }, { scaleX: 1, duration: 0.5, ease: 'expo.out', stagger: 0.035, transformOrigin: 'left center' }, 0.05)
    return () => { timeline.kill() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, reduced, revealed, replay])
  const active = MODEL_TABS.find((entry) => entry.key === tab)
  return (
    <section ref={ref} className="ops-lieflat-card ops-bi-card ops-bi-models-card" data-replay={replay} aria-label="整车销售榜，可在全渠道、线上、线下之间切换">
      <h3>销售榜：全渠道 / 线上 / 线下（整车）</h3>
      <div className="ops-lieflat-sub"><span>{`数据源 ${models.source === 'CIS' ? 'CIS（perfeco 实销）' : 'BI（M218 快照回退）'} · ${models.weekLabel} · ${models.weekRange} · ${models.basis}`}</span></div>
      <div className="ops-bi-model-tabs" role="tablist" ref={trackRef}>
        <i className="ops-bi-model-pill" ref={pillRef} aria-hidden="true" />
        {MODEL_TABS.map((entry) => (
          <button key={entry.key} type="button" role="tab" aria-selected={tab === entry.key} className="ops-bi-model-tab" ref={(node) => { buttonRefs.current[entry.key] = node }} onClick={() => setTab(entry.key)}>
            {entry.label}
          </button>
        ))}
      </div>
      <ol className="ops-bi-model-rows" data-bi-tab={tab}>
        {rows.length === 0 && isFallback && tab !== 'all' ? (
          <li className="ops-bi-model-empty" data-bi-empty="">CIS 不可用，BI 快照无渠道拆分</li>
        ) : rows.map(({ row, qty, to }, index) => (
          <li key={`${tab}-${row.code}`} className="ops-bi-model-row">
            <span className="rank">{String(index + 1).padStart(2, '0')}</span>
            <span className="name">
              {row.label || ALLCHANNEL_NAMES[row.code] || skuNames[row.code] || row.model || row.code}
              <span className="code">{row.code}</span>
              {row.buyback ? <em className="ops-bi-model-used" data-bi-used="">二手</em> : null}
            </span>
            <span className="val">
              <b>{`${qty} 台`}</b>
              <small>{yuan(to)}</small>
            </span>
            <i className="ops-bi-model-bar"><i style={{ width: `${Math.max((metric({ row, qty, to }) / maxMetric) * 100, index < 3 ? 4 : 1.5)}%` }} /></i>
          </li>
        ))}
      </ol>
      <p className="ops-bi-model-basis" data-bi-basis="">
        {rows.length === 0 && isFallback && tab !== 'all'
          ? 'CIS perfeco 不可用 · 回退 BI 快照仅全渠道口径'
          : `${tab === 'online' ? '线上' : tab === 'offline' ? '线下' : '全渠道'}合计 ${scopeTotal ? `${scopeTotal.qty} 台 · ${yuan(scopeTotal.to)}` : '—'}${models.source === 'CIS' ? ` · 数据源 CIS（perfeco）· ${models.weekLabel} · ${models.weekRange}` : ''}`}
      </p>
      <div className="ops-lieflat-src">{models.source === 'CIS' ? 'MODEL RANKING · CIS PERFECO 整车周实销 · STORE 1299' : 'MODEL RANKING · BI M218 SNAPSHOT FALLBACK · STORE 1299'}</div>
    </section>
  )
}

/* ── F12 Dumbbell Queue · 顾客评价 360（本店 vs 南区 vs 全国）────── */
export function BiReviewCard({ snapshot }) {
  const { review } = snapshot
  const { ref, revealed, replay, replayChart } = useBiReveal()
  const reduced = usePrefersReducedMotion()
  const beads = [
    { key: 'store', label: '本店', value: review.score360, fill: MONO.ink },
    { key: 'zone', label: `${review.zoneName} 区`, value: review.benchmark.zone, fill: MONO.muted },
    { key: 'china', label: '全国', value: review.benchmark.china, fill: MONO.faint }
  ]
  const X = (v) => 24 + (v / 100) * 352
  const build = useMemo(() => (timeline, node) => {
    timeline.from(node.querySelectorAll('[data-bi-axis]'), { opacity: 0, duration: 0.6, ease: 'power2.out' }, 0)
    timeline.from(node.querySelectorAll('[data-bi-bead]'), { scale: 0, duration: 0.5, ease: 'back.out(2.2)', stagger: 0.12 }, 0.3)
    timeline.from(node.querySelectorAll('[data-bi-beadlabel]'), { opacity: 0, y: 6, duration: 0.4, ease: 'power3.out', stagger: 0.1 }, 0.55)
    node.querySelectorAll('[data-bi-chip]').forEach((element, index) => {
      timeline.from(element, { opacity: 0, y: 6, duration: 0.5, ease: 'power3.out' }, 0.8 + index * 0.12)
    })
  }, [])
  useBiMotion(ref, revealed, replay, reduced, build)
  const gap = (review.benchmark.china - review.score360).toFixed(1)
  return (
    <section ref={ref} className="ops-lieflat-card ops-bi-card ops-bi-review-card" data-replay={replay} onClick={replayChart} aria-label={`顾客评价 360 综合分 本店 ${review.score360.toFixed(2)}，全国 ${review.benchmark.china.toFixed(2)}，点击重播入场动画`}>
      <h3>{`满意度 360 分 · 本店落后全国 ${gap} 分`}</h3>
      <div className="ops-lieflat-sub"><span>{`BI I Listen M243 · 数据周 ${review.week} · 1 珠 = 1 实体 · STORE 1299`}</span></div>
      <ChartSvg label={`360 分哑铃：本店 ${review.score360}，南区 ${review.benchmark.zone}，全国 ${review.benchmark.china}`} replayChart={replayChart} viewBox="0 0 400 118">
        <line data-bi-axis="" x1={X(0)} y1={62} x2={X(100)} y2={62} stroke={MONO.grid} strokeWidth="0.7" />
        {[0, 25, 50, 75, 100].map((mark) => (
          <g key={mark} data-bi-axis="">
            <line x1={X(mark)} y1={58} x2={X(mark)} y2={66} stroke={MONO.hairline} strokeWidth="0.6" />
            <text x={X(mark)} y={78} fontSize="7" fontWeight="600" fill={MONO.faint} textAnchor="middle">{mark}</text>
          </g>
        ))}
        {beads.map((bead, index) => (
          <g key={bead.key}>
            <circle data-bi-bead="" cx={X(bead.value)} cy={62 - index * 0} r={bead.key === 'store' ? 5 : 3.6} fill={bead.fill} opacity={bead.key === 'store' ? 1 : 0.75}>
              <title>{`${bead.label} ${bead.value.toFixed(2)}`}</title>
            </circle>
            <text data-bi-beadlabel="" x={X(bead.value)} y={30 + index * 11} fontSize="8" fontWeight="800" fill={bead.key === 'store' ? MONO.ink : MONO.muted} textAnchor="middle" letterSpacing=".06em">{`${bead.label} ${bead.value.toFixed(1)}`}</text>
          </g>
        ))}
        <text data-bi-axis="" x="200" y={106} fontSize="7" fontWeight="600" fill={MONO.faint} textAnchor="middle" letterSpacing=".12em">ONE BEAD = ONE ENTITY · 360 SCORE 0–100</text>
      </ChartSvg>
      <div className="ops-bi-stat-extra">
        <div><small>TILL · 收银满意</small><b>{`${review.till.satisfaction.toFixed(2)}%`}</b></div>
        <div><small>COVERAGE · 覆盖</small><b>{`${review.till.coverage}% · ${review.till.orders.toLocaleString('en-US')} 单`}</b></div>
        <div><small>NEW · 本周新增</small><b>{`${review.newReviews.store + review.newReviews.workshop + review.newReviews.dianping} 条`}</b></div>
      </div>
      <p className="ops-bi-review-note" data-bi-chip="">{`${review.newReviews.note} · ${review.detail.note}`}</p>
      <div className="ops-lieflat-src">DUMBBELL QUEUE · BI M243 I LISTEN · STORE 1299</div>
    </section>
  )
}

/* ── 面板：挂载进 OverviewAnalytics（桌面总览）──────────────── */
export function BiInsightPanel({ snapshot = BI_SNAPSHOT }) {
  return (
    <article className="ops-analytics-panel ops-bi-panel" aria-label="BI 门店经营数据">
      <header><strong>BI 门店经营</strong><span>{`SNAPSHOT · ${snapshot.capturedAt} · ${snapshot.store.name} ${snapshot.store.code}`}</span></header>
      <div className="ops-bi-grid">
        <BiSourceCompare snapshot={snapshot} />
        <BiOnlineGauge snapshot={snapshot} />
      </div>
      <div className="ops-bi-mid-grid">
        <BiRepairTrend snapshot={snapshot} />
        <BiReviewCard snapshot={snapshot} />
      </div>
      <div className="ops-bi-bottom-grid">
        <BiModelRanking snapshot={snapshot} />
        <BiRepairStat snapshot={snapshot} />
      </div>
    </article>
  )
}

export default BiInsightPanel