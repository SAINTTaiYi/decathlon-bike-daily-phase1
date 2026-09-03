// D1 当日读行监控（桌面 · admin）—— lieflat 语法 × Cloudflare D1 GraphQL Analytics。
// 图型血缘（结构正本见 ~/lieflat-charts/templates/basics-gallery.html）：
//   · D1UsageCard     ← G18 Draw-in + Counter（大数字计数 + 横向 10% 刻度进度条，同 BiStatCard 家族）
//   · D1HourlyCard     ← B2 Hairline Line（1 点 = 1 小时读行，日历地板 + 发丝折线）
//   · D1TopQueriesCard ← C1 Tick Rows（1 tick ≈ 1 千行读行，行 = Top 查询）
// 动效遵循工作台规则：GSAP 驱动，滚入播放 + 点击重播，prefers-reduced-motion 直达终态。
import { useEffect, useMemo, useRef, useState } from 'react'
import { gsap } from 'gsap'

const MONO = { ink: '#1C1C1A', mid: '#55554F', muted: '#8F8E88', faint: '#B0AFA9', grid: '#DEDDD6', paper: '#F0EFEB' }
const D2R = Math.PI / 180
const rnd = (i, k) => Math.abs(((i * 73856093) ^ (k * 19349663)) % 1000) / 1000
const pol = (cx, cy, r, deg) => [cx + r * Math.cos(deg * D2R), cy + r * Math.sin(deg * D2R)]
const fmtRows = (value) => Number(value ?? 0).toLocaleString('en-US')
const pct = (value, limit) => Math.max(0, Math.min(100, Math.round((Number(value) / Math.max(1, limit)) * 100)))

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

// lieflat reveal：滚入视野才播 + 点击重播（BiInsightCharts 同款机制）
function useD1Reveal() {
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

function useD1Motion(ref, revealed, replay, reduced, build) {
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return undefined }
    const node = ref.current
    if (!node || reduced || !revealed) return undefined
    const timeline = gsap.timeline()
    build(timeline, node)
    timeline.play(0)
    return () => { timeline.kill() }
  }, [revealed, replay, reduced, build])
}

function D1ChartSvg({ label, replayChart, children, viewBox }) {
  return (
    <svg className="ops-lieflat-chart d1-md-chart" viewBox={viewBox} preserveAspectRatio="xMidYMid meet" role="img" tabIndex="0" aria-label={label} onClick={replayChart} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') replayChart() }}>
      <title>点击或按 Enter 重播入场动画</title>
      {children}
    </svg>
  )
}

/* ── G18 Draw-in + Counter · 今日读行大数字 + 刻度进度条 ────── */
export function D1UsageCard({ snapshot, stale }) {
  const { totals, limit, projectedFullDay, databases } = snapshot
  const usedPct = pct(totals.rowsRead, limit)
  const projectedPct = pct(projectedFullDay, limit)
  const { ref, revealed, replay, replayChart } = useD1Reveal()
  const reduced = usePrefersReducedMotion()
  const build = useMemo(() => (timeline, node) => {
    const state = { value: 0 }
    timeline.to(state, { value: totals.rowsRead, duration: 1.1, ease: 'expo.out', onUpdate: () => {
      const el = node.querySelector('[data-d1-counter]')
      if (el) el.textContent = fmtRows(Math.round(state.value))
    } }, 0.15)
    timeline.from(node.querySelectorAll('[data-d1-usage-part]'), { opacity: 0, y: 8, duration: 0.5, ease: 'power3.out', stagger: 0.08 }, 0.55)
    timeline.from(node.querySelectorAll('[data-d1-bar-tick]'), { opacity: 0, duration: 0.3, stagger: 0.02, ease: 'power2.out' }, 0.3)
    timeline.fromTo(node.querySelector('[data-d1-bar-fill]'), { scaleX: 0 }, { scaleX: 1, duration: 0.9, ease: 'expo.out' }, 0.35)
    timeline.from(node.querySelector('[data-d1-bar-mark]'), { opacity: 0, duration: 0.4, ease: 'power2.out' }, 1.0)
  }, [totals.rowsRead])
  useD1Motion(ref, revealed, replay, reduced, build)
  return (
    <section ref={ref} className="ops-lieflat-card d1-md-card d1-md-usage" data-replay={replay} onClick={replayChart} aria-label={`当日 D1 读行 ${fmtRows(totals.rowsRead)} 行，占免费限额 ${usedPct}%，预计全天 ${projectedPct}%，点击重播入场动画`}>
      <h3>D1 读行：今日已用 {usedPct}%，预计全天 {projectedPct}%</h3>
      <div className="ops-lieflat-sub d1-md-sub"><span>Cloudflare D1 免费限额 500 万行/日 · UTC 日窗口（北京 08:00 归零）{stale ? ' · 同步失败，显示最近成功数据' : ''}</span></div>
      <div className="d1-md-usage-main" data-d1-usage-part="">
        <b data-d1-counter="">{fmtRows(totals.rowsRead)}</b>
        <span className="d1-md-usage-chip" data-d1-danger={projectedPct >= 80 ? 'true' : 'false'}>已用 {usedPct}% / 5,000,000</span>
      </div>
      <div className="d1-md-usage-bar" role="img" aria-label={`用量进度：当前 ${usedPct}%，预计全天 ${projectedPct}%`}>
        <i className="d1-md-bar-track" />
        <i className="d1-md-bar-fill" data-d1-bar-fill="" style={{ '--d1-bar-scale': usedPct / 100 }} />
        {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((mark) => <span key={mark} className="d1-md-bar-tick" data-d1-bar-tick="" style={{ left: `${mark}%` }} />)}
        <em className="d1-md-bar-mark" data-d1-bar-mark="" style={{ left: `${projectedPct}%` }} title={`预计全天 ${fmtRows(projectedFullDay)} 行（${projectedPct}%）`} />
        <span className="d1-md-bar-label d1-md-bar-zero">0</span>
        <span className="d1-md-bar-label d1-md-bar-half">50%</span>
        <span className="d1-md-bar-label d1-md-bar-full">100%</span>
      </div>
      <div className="d1-md-db-strip" data-d1-usage-part="">
        {databases.map(({ database, rowsRead }) => (
          <div key={database} className="d1-md-db-item"><small>{database === 'staging' ? '正式库 STAGING' : '预览库 PREVIEW'}</small><b>{fmtRows(rowsRead)}</b></div>
        ))}
      </div>
      <div className="ops-lieflat-src d1-md-src">DRAW-IN COUNTER · CF GRAPHQL D1 ANALYTICS · ACCOUNT QUOTA</div>
    </section>
  )
}

/* ── B2 Hairline Line · 当日逐小时读行 ───────────────────────── */
export function D1HourlyCard({ snapshot }) {
  const { series, totals } = snapshot
  const { ref, revealed, replay, replayChart } = useD1Reveal()
  const reduced = usePrefersReducedMotion()
  const geometry = useMemo(() => {
    const N = 24
    const width = 400, x0 = 30, x1 = 376, base = 262, top = 48
    const values = Array.from({ length: N }, (_, hour) => series.find((point) => point.hour === hour)?.rowsRead ?? 0)
    const max = Math.max(1, ...values)
    const x = (hour) => x0 + (x1 - x0) * (hour / (N - 1))
    const y = (value) => base - (value / max) * (base - top)
    const points = values.map((value, hour) => ({ hour, value, x: x(hour), y: y(value) }))
    const path = points.map((point) => `${point.x} ${point.y}`).join(' L ')
    return { points, path, base, max, x, x0 }
  }, [series])
  const peak = useMemo(() => {
    let best = null
    for (const point of geometry.points) if (!best || point.value > best.value) best = point
    return best
  }, [geometry])
  const build = useMemo(() => (timeline, node) => {
    timeline.from(node.querySelectorAll('[data-d1-floor]'), { opacity: 0, duration: 0.35, stagger: 0.008, ease: 'power2.out' }, 0)
    const line = node.querySelector('[data-d1-line]')
    if (line) {
      const length = line.getTotalLength?.() ?? 400
      timeline.fromTo(line, { strokeDasharray: length, strokeDashoffset: length }, { strokeDashoffset: 0, duration: 1.2, ease: 'power2.inOut' }, 0.2)
    }
    timeline.from(node.querySelectorAll('[data-d1-dot]'), { scale: 0, duration: 0.45, ease: 'back.out(1.6)', stagger: 0.016 }, 0.55)
    timeline.from(node.querySelectorAll('[data-d1-label]'), { opacity: 0, duration: 0.5, ease: 'power2.out', stagger: 0.06 }, 0.9)
  }, [geometry])
  useD1Motion(ref, revealed, replay, reduced, build)
  return (
    <section ref={ref} className="ops-lieflat-card d1-md-card d1-md-hourly" data-replay={replay} onClick={replayChart} aria-label={`当日逐小时 D1 读行趋势，累计 ${fmtRows(totals.rowsRead)} 行`}>
      <h3>逐小时读行：峰值出现在 {peak ? `北京时间 ${String((peak.hour + 8) % 24).padStart(2, '0')}:00` : '—'}</h3>
      <div className="ops-lieflat-sub d1-md-sub"><span>1 点 = 1 个 UTC 小时读行 · 横轴 UTC，括号为北京时间 · 点击重播</span></div>
      <D1ChartSvg label={`当日逐小时读行曲线，峰值 UTC ${peak?.hour ?? 0} 时 ${fmtRows(peak?.value ?? 0)} 行，累计 ${fmtRows(totals.rowsRead)} 行`} replayChart={replayChart} viewBox="0 0 400 300">
        {geometry.points.map((point) => <line key={point.hour} data-d1-floor="" x1={point.x} y1={geometry.base} x2={point.x} y2={geometry.base - 7} stroke="#CFCEC7" strokeWidth="0.6" />)}
        <line x1="24" y1={geometry.base} x2="376" y2={geometry.base} stroke={MONO.grid} strokeWidth="0.8" />
        <path data-d1-line="" d={`M ${geometry.path}`} fill="none" stroke={MONO.ink} strokeWidth="1" />
        {geometry.points.map((point) => {
          const hasData = series.some((entry) => entry.hour === point.hour)
          const isPeak = peak && point.hour === peak.hour && point.value > 0
          return <g key={point.hour}>
            <title>{`UTC ${String(point.hour).padStart(2, '0')}:00（北京 ${String((point.hour + 8) % 24).padStart(2, '0')}:00）：读行 ${fmtRows(point.value)}`}</title>
            <circle data-d1-dot="" cx={point.x} cy={point.y} r={isPeak ? 4.2 : 2.1} fill={hasData ? MONO.ink : MONO.paper} stroke={MONO.ink} strokeWidth={hasData ? 0 : 1} />
            {isPeak ? <text data-d1-label="" x={point.x} y={point.y - 11} fontSize="9.5" fontWeight="800" fill={MONO.ink} textAnchor="middle" style={{ paintOrder: 'stroke', stroke: '#F6F4EE', strokeWidth: 3 }}>{fmtRows(point.value)}</text> : null}
          </g>
        })}
        {[0, 6, 12, 18, 23].map((hour) => <text key={hour} data-d1-label="" x={geometry.x(hour)} y={geometry.base + 18} fontSize="7.5" fontWeight="600" fill={MONO.muted} textAnchor="middle" letterSpacing=".1em">{`${String(hour).padStart(2, '0')}(${String((hour + 8) % 24).padStart(2, '0')})`}</text>)}
        <text x="200" y="292" fontSize="7" fontWeight="600" fill={MONO.faint} textAnchor="middle" letterSpacing=".12em" data-d1-label="">ONE DOT = ONE UTC HOUR · BRACKETS = BEIJING HOUR</text>
      </D1ChartSvg>
      <div className="ops-lieflat-src d1-md-src">HAIRLINE LINE · CF GRAPHQL d1AnalyticsAdaptiveGroups · TODAY</div>
    </section>
  )
}

/* ── C1 Tick Rows · Top 5 烧行查询（1 tick ≈ 1 千行）────────── */
const TOP_TICK = 1000
const TOP_LABELS = ['审计事件流', '工作单列表', '工作单版本', '审计回溯', 'Shiphub 同步']

export function D1TopQueriesCard({ snapshot }) {
  const { top, totals } = snapshot
  const { ref, revealed, replay, replayChart } = useD1Reveal()
  const reduced = usePrefersReducedMotion()
  const rows = useMemo(() => (top ?? []).slice(0, 5).map((entry, index) => ({ ...entry, label: TOP_LABELS[index] ?? `QUERY ${index + 1}`, k: entry.rowsRead, ticks: Math.max(0, Math.floor(entry.rowsRead / TOP_TICK)), index })), [top])
  const maxTicks = Math.max(1, ...rows.map((row) => row.ticks))
  const build = useMemo(() => (timeline, node) => {
    timeline.from(node.querySelectorAll('[data-d1-row-label]'), { opacity: 0, x: -8, duration: 0.4, stagger: 0.07, ease: 'power2.out' }, 0)
    timeline.from(node.querySelectorAll('[data-d1-tickrow-tick]'), { opacity: 0, scaleY: 0, duration: 0.25, stagger: 0.012, ease: 'power2.out' }, 0.15)
    timeline.from(node.querySelectorAll('[data-d1-row-value]'), { opacity: 0, duration: 0.4, stagger: 0.07, ease: 'power2.out' }, 0.4)
  }, [])
  useD1Motion(ref, revealed, replay, reduced, build)
  const y0 = (index) => 52 + index * 44
  const PX = Math.min(6.9, 240 / maxTicks)
  return (
    <section ref={ref} className="ops-lieflat-card d1-md-card d1-md-top" data-replay={replay} onClick={replayChart} aria-label={`当日烧行 Top 5 查询，首位 ${fmtRows(rows[0]?.rowsRead ?? 0)} 行`}>
      <h3>烧行 Top 5：{rows[0] ? `${rows[0].label} ${fmtRows(rows[0].rowsRead)} 行 × ${rows[0].count} 次` : '暂无数据'}</h3>
      <div className="ops-lieflat-sub d1-md-sub"><span>1 tick ≈ 1 千行读行 · 今日共 {fmtRows(totals.rowsRead)} 行 · 悬停看 SQL</span></div>
      <D1ChartSvg label={`当日烧行 Top 5 查询横条图，1 tick 约等于 1 千行，首位 ${rows[0]?.label ?? ''} ${fmtRows(rows[0]?.rowsRead ?? 0)} 行`} replayChart={replayChart} viewBox="0 0 400 308">
        {rows.map((row) => {
          const y = y0(row.index)
          return (
            <g key={row.index}>
              <title>{`${row.label} — ${row.rowsRead} 行 × ${row.count} 次：${row.query.slice(0, 80)}…`}</title>
              <text data-d1-row-label="" x="94" y={y + 3} fontSize="8" fontWeight="700" fill="#6A6963" textAnchor="end" letterSpacing=".08em">{row.label}</text>
              <line x1="104" y1={y + 9} x2={104 + 34 * Math.min(PX, 6.9)} y2={y + 9} stroke={MONO.grid} strokeWidth="0.6" />
              {Array.from({ length: row.ticks }, (_, k) => {
                const x = 104 + k * PX + PX / 2
                const h = 9 + rnd(k + 1, row.index + 2) * 6
                return <line key={k} data-d1-tickrow-tick="" x1={x} y1={y + 9} x2={x} y2={y + 9 - h} stroke={MONO.ink} strokeWidth="0.9" opacity={0.55 + rnd(k + 3, row.index + 5) * 0.45} />
              })}
              <text data-d1-row-value="" x={104 + row.ticks * PX + 10} y={y + 4} fontSize="11" fontWeight="800" fill={MONO.ink}>{fmtRows(row.rowsRead)}</text>
            </g>
          )
        })}
        <text x="200" y="304" fontSize="7" fontWeight="600" fill="#B0AFA9" textAnchor="middle" letterSpacing=".12em" data-d1-row-value="">ONE TICK ≈ 1K ROWS · 悬停查看 SQL</text>
      </D1ChartSvg>
      <div className="ops-lieflat-src d1-md-src">TICK ROWS · CF GRAPHQL d1QueriesAdaptiveGroups · TODAY</div>
    </section>
  )
}

export function D1MetricsPanel({ snapshot, stale }) {
  if (!snapshot) return null
  return (
    <section className="d1-md-panel" aria-label="D1 当日读行监控">
      <div className="d1-md-grid">
        <D1UsageCard snapshot={snapshot} stale={stale} />
        <D1HourlyCard snapshot={snapshot} />
        <D1TopQueriesCard snapshot={snapshot} />
      </div>
    </section>
  )
}
