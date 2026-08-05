import { useEffect, useMemo, useRef, useState } from 'react'

const MONO = {
  ink: '#1C1C1A', muted: '#8F8E88', faint: '#C6C5BF', grid: '#DEDDD6', paper: '#F0EFEB'
}

function shortDate(value) {
  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return '—'
  return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`
}

function fullDate(value) {
  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }).format(date)
}

function useChartReveal() {
  const ref = useRef(null)
  const [revealed, setRevealed] = useState(false)
  const [replay, setReplay] = useState(0)
  useEffect(() => {
    const node = ref.current
    if (!node) return undefined
    if (!('IntersectionObserver' in window)) { setRevealed(true); return undefined }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setRevealed(true); observer.disconnect() }
    }, { threshold: 0.3 })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  const replayChart = () => { setRevealed(true); setReplay((value) => value + 1) }
  return { ref, revealed, replay, replayChart }
}

function MissingLegend({ missingDays }) {
  return missingDays ? <span className="ops-trend-missing">空心 = 未填写 · {missingDays} 天缺失</span> : <span>实心 = 已保存 · 7 天完整</span>
}

export function SalesHairlineChart({ trends }) {
  const days = trends?.days ?? []
  const { ref, revealed, replay, replayChart } = useChartReveal()
  const geometry = useMemo(() => {
    const width = 420, left = 24, right = 396, base = 94, top = 13
    const values = days.map((day) => day.salesVehicles)
    const max = Math.max(1, ...values.filter((value) => value !== null).map(Number))
    const x = (index) => left + (right - left) * (days.length <= 1 ? 0 : index / (days.length - 1))
    const y = (value) => base - (Number(value) / max) * (base - top)
    const points = days.map((day, index) => ({ ...day, x: x(index), y: day.salesVehicles === null ? base : y(day.salesVehicles) }))
    const segments = []
    let current = []
    for (const point of points) {
      if (point.salesVehicles === null) { if (current.length) segments.push(current); current = []; continue }
      current.push(point)
    }
    if (current.length) segments.push(current)
    return { points, segments, base }
  }, [days])
  const total = trends?.sales?.total ?? 0
  const missing = trends?.sales?.missingDays ?? 7
  return <section className="ops-trend-card ops-lieflat-card">
    <h3>七天累计销售 {total} 辆</h3>
    <div className="ops-lieflat-sub"><MissingLegend missingDays={missing} /></div>
    <div className="ops-trend-value"><b>{String(total).padStart(2, '0')}</b><em>UNIT / 7D</em></div>
    <svg ref={ref} className="ops-lieflat-chart" viewBox="0 0 420 122" role="img" tabIndex="0" aria-label={`最近七个自然日销售车辆趋势，累计 ${total} 辆，${missing} 天未填写`} data-revealed={revealed ? 'true' : 'false'} onClick={replayChart} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') replayChart() }}>
      <title>点击或按 Enter 重播趋势入场动画</title>
      <g key={replay}>
        {[0, 1, 2].map((index) => <line key={index} x1="20" y1={20 + index * 32} x2="400" y2={20 + index * 32} stroke={MONO.grid} strokeWidth="0.7" className="ops-lieflat-fade" />)}
        <line x1="20" y1={geometry.base} x2="400" y2={geometry.base} stroke={MONO.grid} strokeWidth="0.9" className="ops-lieflat-fade" />
        {geometry.points.map((point, index) => <line key={`tick-${point.date}`} x1={point.x} y1={geometry.base} x2={point.x} y2={geometry.base + 6} stroke={MONO.faint} strokeWidth="0.7" className="ops-lieflat-fade" style={{ animationDelay: `${index * 12}ms` }} />)}
        {geometry.segments.map((segment, index) => segment.length > 1 ? <path key={index} d={`M ${segment.map((point) => `${point.x} ${point.y}`).join(' L ')}`} fill="none" stroke={MONO.ink} strokeWidth="1.4" pathLength="1" className="ops-lieflat-draw" /> : null)}
        {geometry.points.map((point, index) => <g key={point.date} className="ops-lieflat-pop" style={{ animationDelay: `${180 + index * 55}ms` }}>
          <title>{point.salesVehicles === null ? `${fullDate(point.date)}：销售数据未填写` : `${fullDate(point.date)}：销售 ${point.salesVehicles} 辆`}</title>
          <circle cx={point.x} cy={point.y} r={point.salesVehicles === null ? 3.4 : 2.8} fill={point.salesVehicles === null ? MONO.paper : MONO.ink} stroke={MONO.ink} strokeWidth={point.salesVehicles === null ? 1.1 : 0} />
          {point.salesVehicles !== null ? <text x={point.x} y={point.y - 8} textAnchor="middle" fontSize="8" fontWeight="800" fill={MONO.ink}>{point.salesVehicles}</text> : <path d={`M ${point.x - 2} ${point.y - 2} L ${point.x + 2} ${point.y + 2}`} stroke={MONO.muted} strokeWidth="0.8" />}
          <text x={point.x} y="113" textAnchor="middle" fontSize="7" fontWeight="600" fill={MONO.muted}>{shortDate(point.date)}</text>
        </g>)}
      </g>
    </svg>
    <div className="ops-lieflat-src">HAIRLINE LINE · DAILY CLOSINGS · WORKSHOP D1</div>
  </section>
}

export function RepairRungChart({ trends }) {
  const days = trends?.days ?? []
  const { ref, revealed, replay, replayChart } = useChartReveal()
  const total = trends?.repairs?.intakeTotal ?? 0
  const max = Math.max(1, ...days.map((day) => day.repairIntake))
  const step = Math.min(8, 68 / max)
  return <section className="ops-trend-card ops-lieflat-card ops-repair-trend">
    <h3>七天新增维修 {total} 单</h3>
    <div className="ops-lieflat-sub"><span>一横档 = 一张新增维修单 · 看进场压力</span></div>
    <div className="ops-trend-value"><b>{String(total).padStart(2, '0')}</b><em>ORDER / 7D</em></div>
    <svg ref={ref} className="ops-lieflat-chart" viewBox="0 0 420 122" role="img" tabIndex="0" aria-label={`最近七个自然日新增维修单趋势，共 ${total} 张`} data-revealed={revealed ? 'true' : 'false'} onClick={replayChart} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') replayChart() }}>
      <title>点击或按 Enter 重播趋势入场动画</title>
      <g key={replay}>
        <line x1="20" y1="94" x2="400" y2="94" stroke={MONO.grid} strokeWidth="0.9" className="ops-lieflat-fade" />
        {days.map((day, index) => {
          const x = 36 + index * 58
          const topY = 94 - Math.max(0, day.repairIntake - 1) * step
          return <g key={day.date}>
            <title>{fullDate(day.date)}：新增维修单 {day.repairIntake} 张</title>
            {Array.from({ length: day.repairIntake }, (_, rung) => <line key={rung} x1={x - 14} y1={94 - rung * step} x2={x + 14} y2={94 - rung * step} stroke={MONO.ink} strokeWidth="1.2" className="ops-lieflat-fade" style={{ animationDelay: `${index * 90 + rung * 14}ms` }} />)}
            {day.repairIntake > 0 ? <text x={x} y={topY - 9} textAnchor="middle" fontSize="8" fontWeight="800" fill={MONO.ink} className="ops-lieflat-fade">{day.repairIntake}</text> : <circle cx={x} cy="94" r="1.4" fill={MONO.faint} className="ops-lieflat-fade" />}
            <text x={x} y="113" textAnchor="middle" fontSize="7" fontWeight="600" fill={MONO.muted} className="ops-lieflat-fade">{shortDate(day.date)}</text>
          </g>
        })}
      </g>
    </svg>
    <div className="ops-lieflat-src">RUNG BARS · REVERSAL-AWARE AUDIT EVENTS · WORKSHOP D1</div>
  </section>
}
