// 移动端 D1 读行监控 —— 独立实现（memory 23①：双端两套 DOM + 两套 CSS）。
// 图型血缘与桌面端一致（G18 draw-in counter / B2 hairline line / C1 tick rows），
// 几何按移动竖屏重排：用量卡大数字+刻度条、曲线压高、Top 榜转紧凑行 + 底部进度条。
import { useEffect, useMemo, useRef, useState } from 'react'
import { gsap } from 'gsap'

const MONO = { ink: '#1C1C1A', mid: '#55554F', muted: '#8F8E88', faint: '#B0AFA9', grid: '#DEDDD6' }
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
    }, { threshold: 0.2 })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  const replayChart = () => { setRevealed(true); setReplay((value) => value + 1) }
  return { ref, revealed, replay, replayChart }
}

function useD1Motion(ref, revealed, replay, reduced, build) {
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

/* ── G18 · 今日读行大数字 + 刻度进度条（移动版）────────────── */
export function D1MobileUsage({ snapshot, stale }) {
  const { totals, limit, projectedFullDay, databases } = snapshot
  const usedPct = pct(totals.rowsRead, limit)
  const projectedPct = pct(projectedFullDay, limit)
  const { ref, revealed, replay, replayChart } = useD1Reveal()
  const reduced = usePrefersReducedMotion()
  const build = useMemo(() => (timeline, node) => {
    const state = { value: 0 }
    timeline.to(state, { value: totals.rowsRead, duration: 1.0, ease: 'expo.out', onUpdate: () => {
      const el = node.querySelector('[data-d1m-counter]')
      if (el) el.textContent = fmtRows(Math.round(state.value))
    } }, 0.15)
    timeline.from(node.querySelectorAll('[data-d1m-chip]'), { opacity: 0, y: 6, duration: 0.5, ease: 'power3.out', stagger: 0.07 }, 0.5)
    timeline.from(node.querySelectorAll('[data-d1m-bar-tick]'), { opacity: 0, duration: 0.3, stagger: 0.02 }, 0.25)
    timeline.fromTo(node.querySelector('[data-d1m-bar-fill]'), { scaleX: 0 }, { scaleX: 1, duration: 0.9, ease: 'expo.out' }, 0.3)
    timeline.from(node.querySelector('[data-d1m-bar-mark]'), { opacity: 0, duration: 0.4 }, 0.95)
  }, [totals.rowsRead])
  useD1Motion(ref, revealed, replay, reduced, build)
  return (
    <section ref={ref} className="d1-mm-card d1-mm-usage" data-replay={replay} onClick={replayChart} aria-label={`当日 D1 读行 ${fmtRows(totals.rowsRead)} 行，占免费限额 ${usedPct}%`}>
      <h3>D1 读行 · 今日已用 {usedPct}%</h3>
      <div className="d1-mm-sub">免费限额 500 万行/日 · 北京 08:00 归零{stale ? ' · 同步失败，显示最近数据' : ''}</div>
      <div className="d1-mm-usage-main" data-d1m-chip="">
        <b data-d1m-counter="">{fmtRows(totals.rowsRead)}</b>
        <span className="d1-mm-usage-chip">{projectedPct}%</span>
        <small>预计全天</small>
      </div>
      <div className="d1-mm-usage-bar" role="img" aria-label={`用量进度：当前 ${usedPct}%，预计全天 ${projectedPct}%`}>
        <i className="d1-mm-bar-track" />
        <i className="d1-mm-bar-fill" data-d1m-bar-fill="" style={{ '--d1-bar-scale': usedPct / 100 }} />
        {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((mark) => <span key={mark} className="d1-mm-bar-tick" data-d1m-bar-tick="" style={{ left: `${mark}%` }} />)}
        <em className="d1-mm-bar-mark" data-d1m-bar-mark="" style={{ left: `${projectedPct}%` }} title={`预计全天 ${fmtRows(projectedFullDay)} 行`} />
      </div>
      <div className="d1-mm-db-strip" data-d1m-chip="">
        {databases.map(({ database, rowsRead }) => (
          <div key={database} className="d1-mm-db-item"><small>{database === 'staging' ? '正式库' : '预览库'}</small><b>{fmtRows(rowsRead)}</b></div>
        ))}
      </div>
    </section>
  )
}

/* ── B2 发丝线 · 逐小时（移动压高版）──────────────────────── */
export function D1MobileHourly({ snapshot }) {
  const { series, totals } = snapshot
  const { ref, revealed, replay, replayChart } = useD1Reveal()
  const reduced = usePrefersReducedMotion()
  const geometry = useMemo(() => {
    const N = 24
    const x0 = 18, x1 = 282, base = 96, top = 32
    const values = Array.from({ length: N }, (_, hour) => series.find((point) => point.hour === hour)?.rowsRead ?? 0)
    const max = Math.max(1, ...values)
    const x = (hour) => x0 + (x1 - x0) * (hour / (N - 1))
    const y = (value) => base - (value / max) * (base - top)
    const points = values.map((value, hour) => ({ hour, value, x: x(hour), y: y(value) }))
    return { points, path: points.map((point) => `${point.x} ${point.y}`).join(' L '), base, x, max }
  }, [series])
  const peak = useMemo(() => {
    let best = null
    for (const point of geometry.points) if (!best || point.value > best.value) best = point
    return best
  }, [geometry])
  const build = useMemo(() => (timeline, node) => {
    const line = node.querySelector('[data-d1m-line]')
    if (line) {
      const length = line.getTotalLength?.() ?? 300
      timeline.fromTo(line, { strokeDasharray: length, strokeDashoffset: length }, { strokeDashoffset: 0, duration: 1.0, ease: 'power2.inOut' }, 0.15)
    }
    timeline.from(node.querySelectorAll('[data-d1m-dot]'), { scale: 0, duration: 0.4, ease: 'back.out(1.6)', stagger: 0.014 }, 0.5)
    timeline.from(node.querySelectorAll('[data-d1m-ax]'), { opacity: 0, duration: 0.4, ease: 'power2.out' }, 0.8)
  }, [geometry])
  useD1Motion(ref, revealed, replay, reduced, build)
  const visible = [0, 6, 12, 18, 23]
  return (
    <section ref={ref} className="d1-mm-card d1-mm-hourly" data-replay={replay} onClick={replayChart} aria-label={`逐小时读行，累计 ${fmtRows(totals.rowsRead)} 行`}>
      <h3>逐小时读行 · 峰值 {peak ? `北京 ${String((peak.hour + 8) % 24).padStart(2, '0')}:00` : '—'}</h3>
      <div className="d1-mm-sub">1 点 = 1 个 UTC 小时 · 横轴括号为北京时间 · 点击重播</div>
      <svg className="d1-mm-chart d1-mm-chart-wide" viewBox="0 0 300 118" role="img" aria-label={`逐小时读行曲线，峰值 ${fmtRows(peak?.value ?? 0)} 行，累计 ${fmtRows(totals.rowsRead)} 行`}>
        <title>点击重播入场动画</title>
        <line x1="14" y1={geometry.base} x2="286" y2={geometry.base} stroke={MONO.grid} strokeWidth="0.7" />
        <path data-d1m-line="" d={`M ${geometry.path}`} fill="none" stroke={MONO.ink} strokeWidth="1" />
        {geometry.points.map((point) => {
          const hasData = series.some((entry) => entry.hour === point.hour)
          const isPeak = peak && point.hour === peak.hour && point.value > 0
          return <g key={point.hour}>
            <title>{`UTC ${String(point.hour).padStart(2, '0')}:00（北京 ${String((point.hour + 8) % 24).padStart(2, '0')}:00）：${fmtRows(point.value)} 行`}</title>
            <circle data-d1m-dot="" cx={point.x} cy={point.y} r={isPeak ? 3.6 : 1.8} fill={hasData ? MONO.ink : '#F0EFEB'} stroke={MONO.ink} strokeWidth={hasData ? 0 : 0.8} />
            {isPeak ? <text x={point.x} y={point.y - 9} fontSize="9" fontWeight="800" fill={MONO.ink} textAnchor="middle" style={{ paintOrder: 'stroke', stroke: '#F6F4EE', strokeWidth: 3 }}>{fmtRows(point.value)}</text> : null}
          </g>
        })}
        {visible.map((hour) => <text key={hour} data-d1m-ax="" x={geometry.x(hour)} y={geometry.base + 16} fontSize="7" fontWeight="600" fill={MONO.muted} textAnchor="middle" letterSpacing=".08em">{`${String(hour).padStart(2, '0')}(${String((hour + 8) % 24).padStart(2, '0')})`}</text>)}
      </svg>
    </section>
  )
}

/* ── C1 tick rows · Top 榜（移动紧凑行 + 进度条）────────────── */
const TOP_TICK = 1000
const TOP_LABELS = ['审计事件流', '工作单列表', '工作单版本', '审计回溯', 'Shiphub 同步']

export function D1MobileTop({ snapshot }) {
  const { top, totals } = snapshot
  const { ref, revealed, replay, replayChart } = useD1Reveal()
  const reduced = usePrefersReducedMotion()
  const rows = useMemo(() => (top ?? []).slice(0, 5).map((entry, index) => ({ ...entry, label: TOP_LABELS[index] ?? `Q${index + 1}`, index })), [top])
  const maxRows = Math.max(1, ...rows.map((row) => row.rowsRead))
  const build = useMemo(() => (timeline, node) => {
    timeline.from(node.querySelectorAll('[data-d1m-row]'), { opacity: 0, x: -8, duration: 0.35, stagger: 0.06, ease: 'power2.out' }, 0)
    node.querySelectorAll('[data-d1m-bar-i]').forEach((bar) => {
      const timeline2 = timeline
      const target = bar
      timeline2.fromTo(target, { scaleX: 0 }, { scaleX: 1, duration: 0.7, ease: 'expo.out' }, 0.2)
    })
  }, [])
  useD1Motion(ref, revealed, replay, reduced, build)
  return (
    <section ref={ref} className="d1-mm-card d1-mm-top" data-replay={replay} onClick={replayChart} aria-label={`当日烧行 Top 5 查询，首位 ${fmtRows(rows[0]?.rowsRead ?? 0)} 行`}>
      <h3>烧行 Top 5 · {rows[0] ? `${rows[0].label} ${fmtRows(rows[0].rowsRead)}` : '暂无数据'}</h3>
      <div className="d1-mm-sub">今日共 {fmtRows(totals.rowsRead)} 行 · 悬停看 SQL</div>
      <ol className="d1-mm-rows">
        {rows.map((row) => (
          <li key={row.index} data-d1m-row="" title={`${row.label} — ${fmtRows(row.rowsRead)} 行 × ${row.count} 次`}>
            <span className="d1-mm-rank">{String(row.index + 1).padStart(2, '0')}</span>
            <div className="d1-mm-rowmain">
              <div className="d1-mm-rowline"><span className="d1-mm-name">{row.label}</span><b>{fmtRows(row.rowsRead)}</b><small>× {fmtRows(row.count)}</small></div>
              <div className="d1-mm-bar"><i data-d1m-bar-i="" style={{ width: `${Math.max(3, (row.rowsRead / maxRows) * 100)}%` }} /></div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

export default function D1MetricsMobile({ snapshot, stale }) {
  if (!snapshot) return null
  return (
    <div className="d1-mm-panel" aria-label="D1 当日读行监控">
      <D1MobileUsage snapshot={snapshot} stale={stale} />
      <D1MobileHourly snapshot={snapshot} />
      <D1MobileTop snapshot={snapshot} />
    </div>
  )
}
