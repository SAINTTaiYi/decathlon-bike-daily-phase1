// 移动端 BI 销售数据模块 —— 独立实现（memory 23①：双端两套 DOM + 两套 CSS）。
// 图型血缘与桌面端一致（lieflat G18/L14/F11/F3/F5/F12），几何按移动竖屏重排。
import { useEffect, useMemo, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { BI_SNAPSHOT } from '../../data/biSnapshot.js'
import useBiBikesWeek from '../../hooks/useBiBikesWeek.js'
import useBiStoreCompare from '../../hooks/useBiStoreCompare.js'
import { ALLCHANNEL_NAMES } from '../../data/biSkuNames.js'
import useBiSkuNames from '../../hooks/useBiSkuNames.js'

const MONO = { ink: '#1C1C1A', mid: '#55554F', muted: '#8F8E88', faint: '#B0AFA9', hairline: '#CDCCC5', grid: '#DEDDD6' }
const D2R = Math.PI / 180
const rnd = (i, k) => Math.abs(((i * 73856093) ^ (k * 19349663)) % 1000) / 1000
const pol = (cx, cy, r, deg) => [cx + r * Math.cos(deg * D2R), cy + r * Math.sin(deg * D2R)]
const money = (value) => `¥${Math.round(value).toLocaleString('en-US')}`
const yuan = (value) => `¥${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const deltaText = (value, label) => value === null || value === undefined ? null : `${label} ${value > 0 ? '▴' : value < 0 ? '▾' : ''}${Math.abs(value).toFixed(1)}%`
const modelDelta = (row) => deltaText(row.wow, '环比') ?? deltaText(row.yoy, '同比') ?? '—'

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
    }, { threshold: 0.2 })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  const replayChart = () => { setRevealed(true); setReplay((value) => value + 1) }
  return { ref, revealed, replay, replayChart }
}

function useBiMotion(ref, revealed, replay, reduced, build) {
  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; return undefined }
    const node = ref.current
    if (!node || reduced || !revealed) return undefined
    const timeline = gsap.timeline()
    build(timeline, node)
    timeline.play(0)
    return () => { timeline.kill() }
  }, [revealed, replay, reduced, build])
}

/* ── 双源对比 · 门店 TO / DIS：BI × CIS 周期对比（2026-09-04，替换原 G18/L14 单源卡）── */
function BimCompare({ snapshot }) {
  const storeWeek = useBiStoreCompare()
  const eco = snapshot.economic
  const { ref, revealed, replay, replayChart } = useBiReveal()
  const reduced = usePrefersReducedMotion()
  const cisTo = typeof storeWeek?.turnover?.total === 'number' ? storeWeek.turnover.total : null
  const cisDis = storeWeek?.dis && typeof storeWeek.dis.amount === 'number' ? storeWeek.dis.amount : null
  const rows = [
    { key: 'to', label: '门店 TO', bi: eco.to, cis: cisTo },
    { key: 'dis', label: 'DIS 销售', bi: eco.dis.total, cis: cisDis }
  ]
  const build = useMemo(() => (timeline, node) => {
    timeline.from(node.querySelectorAll('.ops-bim-compare-row'), { opacity: 0, y: 8, duration: 0.45, ease: 'power3.out', stagger: 0.1 }, 0.1)
  }, [])
  useBiMotion(ref, revealed, replay, reduced, build)
  return (
    <section ref={ref} className="ops-bim-card ops-bim-compare" data-replay={replay} onClick={replayChart} aria-label="门店 TO 与 DIS 的 BI 与 CIS 双源对比">
      <h3>门店 TO / DIS：BI × CIS 对比</h3>
      <div className="ops-bim-sub">{`${eco.weekLabel} · ${eco.weekFrom.slice(5)} → ${eco.weekTo.slice(5)} · BI 快照周 · CIS 同期`}</div>
      <div className="ops-bim-compare-table" role="table" aria-label="双源数值对比">
        <div className="ops-bim-compare-head" role="row"><span>指标</span><span>BI</span><span>CIS</span></div>
        {rows.map((row) => {
          const diff = row.cis !== null && row.bi ? row.cis - row.bi : null
          const pct = diff !== null && row.bi ? (diff / row.bi) * 100 : null
          return (
            <div className="ops-bim-compare-row" role="row" key={row.key}>
              <span className="label">{row.label}</span>
              <span className="bi"><b>{money(row.bi)}</b></span>
              <span className="cis" data-cis-state={row.cis === null ? 'unavailable' : 'ok'}>
                {row.cis === null ? <em>CIS 暂不可用</em> : (
                  <>
                    <b>{money(row.cis)}</b>
                    {diff !== null ? <small>{`${diff >= 0 ? '+' : ''}${pct.toFixed(1)}%`}</small> : null}
                  </>
                )}
              </span>
            </div>
          )
        })}
      </div>
      <p className="ops-bim-note">BI DIS=M216 全渠道减让 · CIS DIS=SPD 折扣流水合计 · 口径不同数值差异属正常</p>
      <div className="ops-bim-src">SOURCE COMPARE · BI M216 × CIS PERFECO+SPD</div>
    </section>
  )
}

/* ── F11 · 线上占比刻度 ────────────────────────────────────── */
function BimGauge({ snapshot }) {
  const share = snapshot.storeSummary.onlineShare
  const inked = Math.round(share * 100)
  const { ref, revealed, replay, replayChart } = useBiReveal()
  const reduced = usePrefersReducedMotion()
  const GA = { cx: 200, cy: 104, R0: 70, A0: -195, sweep: 210 }
  const ticks = useMemo(() => Array.from({ length: 100 }, (_, k) => {
    const angle = GA.A0 + (k / 100) * GA.sweep
    const isInked = k < inked
    const len = isInked ? 9 + rnd(k + 1, 3) * 5 : 4 + rnd(k + 1, 7) * 2
    const [x1, y1] = pol(GA.cx, GA.cy, GA.R0, angle)
    const [x2, y2] = pol(GA.cx, GA.cy, GA.R0 + len, angle)
    return { x1, y1, x2, y2, isInked }
  }), [inked])
  const build = useMemo(() => (timeline, node) => {
    timeline.from(node.querySelectorAll('[data-bim-tick]'), { opacity: 0, duration: 0.3, stagger: 0.005, ease: 'power2.out' }, 0)
    const state = { value: 0 }
    const number = node.querySelector('[data-bim-number]')
    if (number) timeline.to(state, { value: share * 100, duration: 1.0, ease: 'expo.out', onUpdate: () => { number.textContent = `${state.value.toFixed(1)}%` } }, 0.3)
  }, [share])
  useBiMotion(ref, revealed, replay, reduced, build)
  return (
    <section ref={ref} className="ops-bim-card" data-replay={replay}>
      <h3>线上占去门店 TO 三成出头（全店口径）</h3>
      <div className="ops-bim-sub">1 刻度 = 门店 TO 的 1% · 上墨 = 线上份额 · M214</div>
      <svg className="ops-bim-chart" viewBox="0 0 400 150" role="img" aria-label={`线上占门店 TO ${(share * 100).toFixed(1)}%`} onClick={replayChart}>
        {ticks.map((tick, index) => (
          <line key={index} data-bim-tick="" x1={tick.x1} y1={tick.y1} x2={tick.x2} y2={tick.y2} stroke={tick.isInked ? MONO.ink : MONO.grid} strokeWidth={tick.isInked ? 1 : 0.6} />
        ))}
        <text data-bim-number="" x={GA.cx} y={GA.cy - 4} fontSize="26" fontWeight="800" fill={MONO.ink} textAnchor="middle">{`${(share * 100).toFixed(1)}%`}</text>
        <text x={GA.cx} y={GA.cy + 13} fontSize="8" fontWeight="600" fill={MONO.muted} textAnchor="middle" letterSpacing=".1em">SHARE OF STORE TO · ONLINE</text>
      </svg>
      <div className="ops-bim-src">TICK GAUGE · BI M214 · STORE 1299</div>
    </section>
  )
}

/* ── F3 · 维修 35 周发丝面积 ───────────────────────────────── */
function BimRepair({ snapshot }) {
  const weeks = snapshot.repair.weeks
  const { ref, revealed, replay, replayChart } = useBiReveal()
  const reduced = usePrefersReducedMotion()
  const geom = useMemo(() => {
    const base = 116
    const max = Math.max(...weeks.map((week) => week.value))
    const points = weeks.map((week, index) => ({ ...week, x: 20 + (index / (weeks.length - 1)) * 360, y: base - (week.value / max) * 88 }))
    const peak = points.reduce((a, b) => (b.value > a.value ? b : a))
    const trough = points.reduce((a, b) => (b.value < a.value ? b : a))
    return { base, points, peak, trough }
  }, [weeks])
  const build = useMemo(() => (timeline, node) => {
    timeline.from(node.querySelectorAll('[data-bim-hair]'), { opacity: 0, duration: 0.4, stagger: 0.01, ease: 'power2.out' }, 0)
    const contour = node.querySelector('[data-bim-contour]')
    if (contour) timeline.from(contour, { strokeDashoffset: 1, duration: 1.0, ease: 'expo.inOut' }, 0.3)
  }, [])
  useBiMotion(ref, revealed, replay, reduced, build)
  const contour = `M ${geom.points.map((p) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' L ')}`
  const { repair } = snapshot
  return (
    <section ref={ref} className="ops-bim-card" data-replay={replay}>
      <h3>{`自行车+工作室 维修 TO · 周均 ${money(repair.avg)}`}</h3>
      <div className="ops-bim-sub">1 发丝 = 1 周 · Universe 源端过滤 · M348 · 累计 {money(repair.total)}</div>
      <svg className="ops-bim-chart" viewBox="0 0 400 150" role="img" aria-label={`维修 TO 35 周趋势，周均 ${money(repair.avg)}`} onClick={replayChart}>
        <line x1="20" y1={geom.base} x2="380" y2={geom.base} stroke={MONO.grid} strokeWidth="0.8" />
        {geom.points.map((p, index) => (
          <line key={p.week} data-bim-hair="" x1={p.x} y1={geom.base} x2={p.x} y2={p.y} stroke={p.week === geom.peak.week ? MONO.ink : MONO.muted} strokeWidth={p.week === geom.peak.week ? 1.1 : 0.55} opacity={p.week === geom.peak.week ? 1 : 0.5 + rnd(index + 1, 7) * 0.45} />
        ))}
        <path data-bim-contour="" d={contour} fill="none" stroke={MONO.ink} strokeWidth="1.1" pathLength="1" strokeDasharray="1" />
        <circle cx={geom.peak.x} cy={geom.peak.y} r="3" fill={MONO.ink}><title>{`峰值 ${geom.peak.week} · ${money(geom.peak.value)}`}</title></circle>
        <text x={geom.peak.x + 6} y={geom.peak.y + 3} fontSize="8" fontWeight="800" fill={MONO.ink} style={{ paintOrder: 'stroke', stroke: '#F6F4EE', strokeWidth: 3 }}>{money(geom.peak.value)}</text>
        <text x="200" y="142" fontSize="7" fontWeight="600" fill={MONO.faint} textAnchor="middle" letterSpacing=".12em">ONE HAIRLINE = ONE WEEK · W01–W35</text>
      </svg>
      <div className="ops-bim-src">HAIRLINE AREA · BI M348 · STORE 1299</div>
    </section>
  )
}

/* ── F5 · 车型销售榜（TOP/FLOP/全渠道）─────────────────────── */
// 2026-09-04 第二轮：全渠道 / 线上 / 线下（CIS perfeco 渠道桶，与桌面端同口径）。
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
function BimRanking({ snapshot }) {
  const bikeWeek = useBiBikesWeek()
  const models = bikeWeek.models
  const [tab, setTab] = useState('all')
  const skuNames = useBiSkuNames()
  const { ref, revealed, replay } = useBiReveal()
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
  useEffect(() => { placePill(true) }, [tab, reduced]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const node = ref.current
    if (!node || reduced || !revealed) return undefined
    const timeline = gsap.timeline()
    timeline.fromTo(node.querySelectorAll('.ops-bim-row'), { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power3.out', stagger: 0.03 })
    timeline.fromTo(node.querySelectorAll('.ops-bim-bar > i'), { scaleX: 0 }, { scaleX: 1, duration: 0.5, ease: 'expo.out', stagger: 0.03, transformOrigin: 'left center' }, 0.05)
    return () => { timeline.kill() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, reduced, revealed, replay])
  const isFallback = models.source !== 'CIS'
  const scope = TAB_SCOPE[tab]
  const rows = isFallback && tab !== 'all'
    ? []
    : models.rows
      .map((row) => ({ row, qty: row[scope.qty] ?? 0, to: row[scope.to] ?? 0 }))
      .filter((item) => item.qty > 0)
      .sort((a, b) => b.to - a.to)
      .slice(0, 8)
  const scopeTotal = models.totals?.[scope.total] ?? null
  const metric = (item) => item.to
  const maxMetric = Math.max(...rows.map(metric), 0.001)
  return (
    <section ref={ref} className="ops-bim-card ops-bim-ranking" aria-label="整车销售榜，全渠道线上线下">
      <h3>销售榜：全渠道 / 线上 / 线下</h3>
      <div className="ops-bim-sub">{`数据源 ${models.source === 'CIS' ? 'CIS（perfeco）' : 'BI（回退）'} · ${models.weekLabel} · ${models.weekRange}`}</div>
      <div className="ops-bim-tabs" role="tablist" ref={trackRef}>
        <i className="ops-bim-pill" ref={pillRef} aria-hidden="true" />
        {MODEL_TABS.map((entry) => (
          <button key={entry.key} type="button" role="tab" aria-selected={tab === entry.key} className="ops-bim-tab" ref={(node) => { buttonRefs.current[entry.key] = node }} onClick={() => setTab(entry.key)}>{entry.label}</button>
        ))}
      </div>
      <ol className="ops-bim-rows">
        {rows.length === 0 && isFallback && tab !== 'all' ? (
          <li className="ops-bim-row" data-bim-empty=""><span className="name">CIS 不可用，BI 快照无渠道拆分</span></li>
        ) : rows.map(({ row, qty, to }, index) => (
          <li key={`${tab}-${row.code}`} className="ops-bim-row">
            <span className="rank">{String(index + 1).padStart(2, '0')}</span>
            <span className="name">
              {row.label || ALLCHANNEL_NAMES[row.code] || skuNames[row.code] || row.model || row.code}
              <span className="code">{row.code}</span>
              {row.buyback ? <em className="ops-bim-used">二手</em> : null}
            </span>
            <span className="val">
              <b>{`${qty} 台`}</b>
              <small>{yuan(to)}</small>
            </span>
            <i className="ops-bim-bar"><i style={{ width: `${Math.max((metric({ row, qty, to }) / maxMetric) * 100, 3)}%` }} /></i>
          </li>
        ))}
      </ol>
      <p className="ops-bim-note">{rows.length === 0 && isFallback && tab !== 'all' ? 'CIS 不可用 · 回退 BI 快照仅全渠道口径' : `${tab === 'online' ? '线上' : tab === 'offline' ? '线下' : '全渠道'}合计 ${scopeTotal ? `${scopeTotal.qty} 台 · ${yuan(scopeTotal.to)}` : '—'} · ${models.basis}`}</p>
      <div className="ops-bim-src">{models.source === 'CIS' ? 'MODEL RANKING · CIS PERFECO 整车周实销 · STORE 1299' : 'MODEL RANKING · BI M218 FALLBACK · STORE 1299'}</div>
    </section>
  )
}

/* ── F12 · 满意度 360 哑铃 ─────────────────────────────────── */
function BimReview({ snapshot }) {
  const { review } = snapshot
  const { ref, revealed, replay, replayChart } = useBiReveal()
  const reduced = usePrefersReducedMotion()
  const beads = [
    { key: 'store', label: '本店', value: review.score360, fill: MONO.ink },
    { key: 'zone', label: '南区', value: review.benchmark.zone, fill: MONO.muted },
    { key: 'china', label: '全国', value: review.benchmark.china, fill: MONO.faint }
  ]
  const X = (v) => 24 + (v / 100) * 352
  const build = useMemo(() => (timeline, node) => {
    timeline.from(node.querySelectorAll('[data-bim-bead]'), { scale: 0, duration: 0.5, ease: 'back.out(2.2)', stagger: 0.12 }, 0.2)
    timeline.from(node.querySelectorAll('[data-bim-beadlabel]'), { opacity: 0, y: 6, duration: 0.4, ease: 'power3.out', stagger: 0.1 }, 0.5)
  }, [])
  useBiMotion(ref, revealed, replay, reduced, build)
  const gap = (review.benchmark.china - review.score360).toFixed(1)
  return (
    <section ref={ref} className="ops-bim-card" data-replay={replay}>
      <h3>{`满意度 360 分 · 本店落后全国 ${gap} 分`}</h3>
      <div className="ops-bim-sub">{`BI M243 · 周 ${review.week} · 收银满意 ${review.till.satisfaction.toFixed(2)}%`}</div>
      <svg className="ops-bim-chart" viewBox="0 0 400 108" role="img" aria-label={`360 分：本店 ${review.score360}，南区 ${review.benchmark.zone}，全国 ${review.benchmark.china}`} onClick={replayChart}>
        <line x1={X(0)} y1={62} x2={X(100)} y2={62} stroke={MONO.grid} strokeWidth="0.7" />
        {[0, 25, 50, 75, 100].map((mark) => (
          <g key={mark}>
            <line x1={X(mark)} y1={58} x2={X(mark)} y2={66} stroke={MONO.hairline} strokeWidth="0.6" />
            <text x={X(mark)} y={78} fontSize="7" fontWeight="600" fill={MONO.faint} textAnchor="middle">{mark}</text>
          </g>
        ))}
        {beads.map((bead, index) => (
          <g key={bead.key}>
            <circle data-bim-bead="" cx={X(bead.value)} cy={62} r={bead.key === 'store' ? 5 : 3.4} fill={bead.fill} opacity={bead.key === 'store' ? 1 : 0.75}><title>{`${bead.label} ${bead.value.toFixed(2)}`}</title></circle>
            <text data-bim-beadlabel="" x={X(bead.value)} y={26 + index * 11} fontSize="8" fontWeight="800" fill={bead.key === 'store' ? MONO.ink : MONO.muted} textAnchor="middle">{`${bead.label} ${bead.value.toFixed(1)}`}</text>
          </g>
        ))}
        <text x="200" y="98" fontSize="7" fontWeight="600" fill={MONO.faint} textAnchor="middle" letterSpacing=".12em">ONE BEAD = ONE ENTITY · 360 SCORE</text>
      </svg>
      <p className="ops-bim-note">{`${review.newReviews.note} · ${review.detail.note}`}</p>
      <div className="ops-bim-src">DUMBBELL QUEUE · BI M243 · STORE 1299</div>
    </section>
  )
}

export default function BiSalesMobile({ snapshot = BI_SNAPSHOT }) {
  return (
    <div className="ops-bim-panel" aria-label="BI 销售数据（移动端）">
      <BimCompare snapshot={snapshot} />
      <BimGauge snapshot={snapshot} />
      <BimRepair snapshot={snapshot} />
      <BimRanking snapshot={snapshot} />
      <BimReview snapshot={snapshot} />
    </div>
  )
}
