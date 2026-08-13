import { useEffect, useMemo, useRef, useState } from 'react'

// ── CUSTOM 色板 · Workshop 品牌 token（见 DESIGN.md Color System）──────────
// 按 lieflat 自定义色板规则建立角色，不从任何内置预设借色：
//   PAPER = --ops-page   #f7f5ef  暖白纸面（卡片底色）
//   INK   = --ops-black  #0c0e0c  结构 / 主数据（单序列 = 中性墨阶，明度即数据）
//   TXT   = --ops-text   #0a0b0a  标题 / 图内数值
//   MUT   = --ops-text-muted #55554f  副标题 / 轴标签
//   HERO  = --ops-yellow #ffc31a  信号黄 = 今日，全组唯一主角（黑字黄底，对比达标）
//   GRID / FAINT 为 INK 与纸面的派生明度，不引入新色相。
// SVG 一律经 style 取 CSS 变量，设计 token 变更时图表自动跟随。
const PAPER = 'var(--ops-page)'
const INK = 'var(--ops-black)'
const TXT = 'var(--ops-text)'
const MUT = 'var(--ops-text-muted)'
const HERO = 'var(--ops-yellow)'
const GRID = 'rgb(12 14 12 / .12)'
const FAINT = 'rgb(12 14 12 / .32)'

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
  return missingDays
    ? <span className="ops-trend-missing">空心 = 未填写 · {missingDays} 天缺失 · 黄 = 今日</span>
    : <span>实心 = 已保存 · 7 天完整 · 黄 = 今日</span>
}

/**
 * F2 / B2 · Hairline Line — 七天销售发丝线。
 * 空心 = 当日销售未填写；黄徽章 = 今日（当前业务日）。
 */
export function SalesHairlineChart({ trends }) {
  const days = trends?.days ?? []
  const { ref, revealed, replay, replayChart } = useChartReveal()
  const todayIndex = days.length > 0 ? days.length - 1 : -1
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
    <svg ref={ref} className="ops-lieflat-chart" viewBox="0 0 420 122" role="img" tabIndex="0" aria-label={`最近七个自然日销售车辆趋势，累计 ${total} 辆，${missing} 天未填写，黄徽章标记今日`} data-revealed={revealed ? 'true' : 'false'} onClick={replayChart} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') replayChart() }}>
      <title>点击或按 Enter 重播趋势入场动画</title>
      <g key={replay}>
        {[0, 1, 2].map((index) => <line key={index} x1="20" y1={20 + index * 32} x2="400" y2={20 + index * 32} strokeWidth="0.7" className="ops-lieflat-fade" style={{ stroke: GRID }} />)}
        <line x1="20" y1={geometry.base} x2="400" y2={geometry.base} strokeWidth="0.9" className="ops-lieflat-fade" style={{ stroke: GRID }} />
        {geometry.points.map((point, index) => <line key={`tick-${point.date}`} x1={point.x} y1={geometry.base} x2={point.x} y2={geometry.base + 6} strokeWidth="0.7" className="ops-lieflat-fade" style={{ animationDelay: `${index * 12}ms`, stroke: FAINT }} />)}
        {geometry.segments.map((segment, index) => segment.length > 1 ? <path key={index} d={`M ${segment.map((point) => `${point.x} ${point.y}`).join(' L ')}`} fill="none" strokeWidth="1.4" pathLength="1" className="ops-lieflat-draw" style={{ stroke: INK }} /> : null)}
        {geometry.points.map((point, index) => <g key={point.date} className="ops-lieflat-col ops-lieflat-pop" style={{ animationDelay: `${180 + index * 55}ms` }}>
          <title>{point.salesVehicles === null ? `${fullDate(point.date)}：销售数据未填写${index === todayIndex ? '（今日）' : ''}` : `${fullDate(point.date)}：销售 ${point.salesVehicles} 辆${index === todayIndex ? '（今日）' : ''}`}</title>
          <circle cx={point.x} cy={point.y} r={point.salesVehicles === null ? 3.4 : 2.8} style={{ fill: point.salesVehicles === null ? PAPER : INK, stroke: INK }} strokeWidth={point.salesVehicles === null ? 1.1 : 0} />
          {point.salesVehicles !== null ? <text x={point.x} y={point.y - 8} textAnchor="middle" fontSize="8" fontWeight="800" style={{ fill: TXT }}>{point.salesVehicles}</text> : <path d={`M ${point.x - 2} ${point.y - 2} L ${point.x + 2} ${point.y + 2}`} strokeWidth="0.8" style={{ stroke: MUT }} />}
          {index === todayIndex ? <g className="ops-lieflat-fade"><rect x={point.x - 14} y="105" width="28" height="11.5" rx="3" style={{ fill: HERO }} /><text x={point.x} y="113" textAnchor="middle" fontSize="7" fontWeight="700" style={{ fill: TXT }}>{shortDate(point.date)}</text></g> : <text x={point.x} y="113" textAnchor="middle" fontSize="7" fontWeight="600" style={{ fill: MUT }}>{shortDate(point.date)}</text>}
        </g>)}
      </g>
    </svg>
    <div className="ops-lieflat-src">HAIRLINE LINE · DAILY CLOSINGS · WORKSHOP D1</div>
  </section>
}

/**
 * F1 / B1 · Rung Bars — 七天新增维修横档。
 * 一横档 = 一张新增维修单；黄徽章 = 今日（当前业务日）。
 */
export function RepairRungChart({ trends }) {
  const days = trends?.days ?? []
  const { ref, revealed, replay, replayChart } = useChartReveal()
  const todayIndex = days.length > 0 ? days.length - 1 : -1
  const total = trends?.repairs?.intakeTotal ?? 0
  const max = Math.max(1, ...days.map((day) => day.repairIntake))
  const step = Math.min(8, 68 / max)
  return <section className="ops-trend-card ops-lieflat-card ops-repair-trend">
    <h3>七天新增维修 {total} 单</h3>
    <div className="ops-lieflat-sub"><span>一横档 = 一张新增维修单 · 黄 = 今日 · 看进场压力</span></div>
    <div className="ops-trend-value"><b>{String(total).padStart(2, '0')}</b><em>ORDER / 7D</em></div>
    <svg ref={ref} className="ops-lieflat-chart" viewBox="0 0 420 122" role="img" tabIndex="0" aria-label={`最近七个自然日新增维修单趋势，共 ${total} 张，黄徽章标记今日`} data-revealed={revealed ? 'true' : 'false'} onClick={replayChart} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') replayChart() }}>
      <title>点击或按 Enter 重播趋势入场动画</title>
      <g key={replay}>
        <line x1="20" y1="94" x2="400" y2="94" strokeWidth="0.9" className="ops-lieflat-fade" style={{ stroke: GRID }} />
        {days.map((day, index) => {
          const x = 36 + index * 58
          const topY = 94 - Math.max(0, day.repairIntake - 1) * step
          return <g key={day.date} className="ops-lieflat-col">
            <title>{fullDate(day.date)}：新增维修单 {day.repairIntake} 张{index === todayIndex ? '（今日）' : ''}</title>
            {Array.from({ length: day.repairIntake }, (_, rung) => <line key={rung} x1={x - 14} y1={94 - rung * step} x2={x + 14} y2={94 - rung * step} strokeWidth="1.2" className="ops-lieflat-fade" style={{ animationDelay: `${index * 90 + rung * 14}ms`, stroke: INK }} />)}
            {day.repairIntake > 0 ? <text x={x} y={topY - 9} textAnchor="middle" fontSize="8" fontWeight="800" className="ops-lieflat-fade" style={{ fill: TXT }}>{day.repairIntake}</text> : <circle cx={x} cy="94" r="1.4" className="ops-lieflat-fade" style={{ fill: FAINT }} />}
            {index === todayIndex ? <g className="ops-lieflat-fade"><rect x={x - 14} y="105" width="28" height="11.5" rx="3" style={{ fill: HERO }} /><text x={x} y="113" textAnchor="middle" fontSize="7" fontWeight="700" style={{ fill: TXT }}>{shortDate(day.date)}</text></g> : <text x={x} y="113" textAnchor="middle" fontSize="7" fontWeight="600" className="ops-lieflat-fade" style={{ fill: MUT }}>{shortDate(day.date)}</text>}
          </g>
        })}
      </g>
    </svg>
    <div className="ops-lieflat-src">RUNG BARS · REVERSAL-AWARE AUDIT EVENTS · WORKSHOP D1</div>
  </section>
}
