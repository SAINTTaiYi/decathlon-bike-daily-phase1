// BI 门店经营可视化 —— lieflat 语法 × BI Portal 1299 快照。
// 图型血缘（结构正本见 ~/lieflat-charts/templates/）：
//   · BiStatCard    ← G18 Draw-in + Counter（一条大数 + 计数入场）
//   · BiDisField    ← lupi-gallery L14 Hundred Field（100% 构成单位分解，1 点 = 1 个百分点）
//   · BiOnlineGauge ← basics-gallery F11 Tick Gauge（1 刻度 = 1%，上墨 = 已达成）
// 动效遵循工作台规则：GSAP 驱动，滚入播放 + 点击重播，prefers-reduced-motion 直达终态。
import { useEffect, useMemo, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { BI_SNAPSHOT, BI_DIS_DOTS } from '../../data/biSnapshot.js'

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

/* ── G18 语义 · 门店 TO 指标卡 ─────────────────────────────── */
export function BiStatCard({ snapshot }) {
  const { economic, storeSummary } = snapshot
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
    const chip = node.querySelector('[data-bi-yoy]')
    if (chip) timeline.from(chip, { opacity: 0, y: 6, duration: 0.5, ease: 'power3.out' }, 0.6)
  }, [])
  useBiMotion(ref, revealed, replay, reduced, build)
  const yoyPercent = Math.abs(economic.toYoy * 100).toFixed(1)
  return (
    <section ref={ref} className="ops-lieflat-card ops-bi-card ops-bi-stat-card" data-replay={replay} onClick={replayChart} aria-label={`门店 TO ${money(economic.to)}，同比 ${economic.toYoy >= 0 ? '增长' : '下降'} ${yoyPercent}%，点击重播入场动画`}>
      <h3>门店 TO 同比回落 {yoyPercent}%（全店口径）</h3>
      <div className="ops-lieflat-sub"><span>BI 本周期门店营业额 · 单位元 · 经济表现 M216 · ⚠ 全店口径：BI 经济表暂未开放自行车维度</span></div>
      <div className="ops-bi-stat-main">
        <b data-bi-counter={economic.to}>{money(economic.to)}</b>
        <span className="ops-bi-yoy" data-bi-yoy="" data-negative={economic.toYoy < 0 ? 'true' : 'false'}>{economic.toYoy < 0 ? '▾' : '▴'} {yoyPercent}% 同比</span>
      </div>
      <div className="ops-bi-stat-extra">
        <div><small>MONTHLY · 月累计</small><b data-bi-counter={economic.monthlyTo}>{money(economic.monthlyTo)}</b></div>
        <div><small>WEEKLY · 周 TO</small><b data-bi-counter={storeSummary.weeklyTo}>{money(storeSummary.weeklyTo)}</b></div>
      </div>
      <div className="ops-lieflat-src">DRAW-IN COUNTER · BI M216 ECONOMIC · STORE 1299</div>
    </section>
  )
}

/* ── L14 Hundred Field · DIS 构成（1 点 = DIS 的 1 个百分点）── */
const DIS_SEGMENTS = [
  { key: 'omni', name: 'OMNI', cn: '全渠道', fill: MONO.ink, cx: 120, cy: 62, phase: 0 },
  { key: 'offline', name: 'OFFLINE', cn: '线下', fill: MONO.muted, cx: 280, cy: 62, phase: 55 }
]

export function BiDisField({ snapshot }) {
  const { ref, revealed, replay, replayChart } = useBiReveal()
  const reduced = usePrefersReducedMotion()
  const dots = useMemo(() => DIS_SEGMENTS.map((segment, segmentIndex) => {
    const count = BI_DIS_DOTS[segment.key]
    const amount = snapshot.economic.dis[segment.key]
    let edge = 0
    const points = Array.from({ length: count }, (_, k) => {
      const angle = k * 137.508 + segment.phase
      const radius = 3 + Math.sqrt(k) * 3.9 + rnd(k + 1, segmentIndex + 2) * 2
      edge = Math.max(edge, radius)
      const [x, y] = pol(segment.cx, segment.cy, radius, angle)
      return { x, y, r: 1.3 + rnd(k + 2, segmentIndex + 3) * 1.3, spoke: k % 5 === 0, cx: segment.cx, cy: segment.cy, amount, name: segment.cn, count }
    })
    return { segment, points, edge }
  }), [snapshot])
  const build = useMemo(() => (timeline, node) => {
    timeline.from(node.querySelectorAll('[data-bi-hairline]'), { opacity: 0, duration: 0.7, ease: 'power2.out' }, 0)
    timeline.from(node.querySelectorAll('[data-bi-spoke]'), { opacity: 0, duration: 0.4, stagger: 0.008, ease: 'power2.out' }, 0.05)
    timeline.from(node.querySelectorAll('[data-bi-dot]'), { scale: 0, duration: 0.45, ease: 'back.out(1.6)', stagger: 0.01 }, 0.12)
    timeline.from(node.querySelectorAll('[data-bi-core]'), { scale: 0, duration: 0.4, ease: 'back.out(2)', stagger: 0.1 }, 0.1)
    timeline.from(node.querySelectorAll('[data-bi-label]'), { opacity: 0, duration: 0.5, ease: 'power2.out', stagger: 0.12 }, 0.7)
  }, [])
  useBiMotion(ref, revealed, replay, reduced, build)
  const { dis } = snapshot.economic
  return (
    <section ref={ref} className="ops-lieflat-card ops-bi-card" data-replay={replay}>
      <h3>DIS 销售：全渠道与线下几乎对半（全店口径）</h3>
      <div className="ops-lieflat-sub"><span>1 点 = DIS 的 1 个百分点 · 全渠道 {money(dis.omni)} · 线下 {money(dis.offline)}</span></div>
      <ChartSvg label={`DIS 构成单位分解：全渠道 ${BI_DIS_DOTS.omni} 点，线下 ${BI_DIS_DOTS.offline} 点，共 100 点`} replayChart={replayChart} viewBox="0 0 400 158">
        <line data-bi-hairline="" x1={DIS_SEGMENTS[0].cx} y1={DIS_SEGMENTS[0].cy} x2={DIS_SEGMENTS[1].cx} y2={DIS_SEGMENTS[1].cy} stroke={MONO.grid} strokeWidth="0.7" strokeDasharray="2 5" />
        {dots.map(({ segment, points, edge }) => (
          <g key={segment.key}>
            {points.map((point, index) => (
              <g key={index}>
                {point.spoke ? <line data-bi-spoke="" x1={point.cx} y1={point.cy} x2={point.x} y2={point.y} stroke={MONO.hairline} strokeWidth="0.6" /> : null}
                <circle data-bi-dot="" cx={point.x} cy={point.y} r={point.r} fill={segment.fill} opacity="0.92">
                  <title>{`${point.name} — ${point.count} 中之 1 · ${money(point.amount)}`}</title>
                </circle>
              </g>
            ))}
            <circle data-bi-core="" cx={segment.cx} cy={segment.cy} r="2.4" fill={MONO.ink} />
            <text data-bi-label="" x={segment.cx} y={segment.cy + edge + 13} fontSize="8" fontWeight="800" fill={MONO.ink} textAnchor="middle" letterSpacing=".1em" style={{ paintOrder: 'stroke', stroke: '#F6F4EE', strokeWidth: 3 }}>{`${segment.name} · ${BI_DIS_DOTS[segment.key]}`}</text>
          </g>
        ))}
        <text data-bi-label="" x="200" y="148" fontSize="7" fontWeight="600" fill={MONO.faint} textAnchor="middle" letterSpacing=".12em">{`ONE DOT = 1% OF DIS · ${BI_DIS_DOTS.omni} + ${BI_DIS_DOTS.offline} = 100 · 另 0.7% 未捕捉`}</text>
      </ChartSvg>
      <div className="ops-lieflat-src">HUNDRED FIELD · BI M216 BY DIS TYPE · STORE 1299</div>
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
const MODEL_TABS = [
  { key: 'allChannel', label: '全渠道车型' },
  { key: 'top', label: 'TOP 10 热销' },
  { key: 'flop', label: 'FLOP 10 下滑' }
]
// M218 全渠道表不带产品名，仅商品码；能确认的码补名字，其余保留码（诚实）。
// 仅收录经外部确认的码→名；其余码 M218 不带名称，保留码（不编造）。
const ALLCHANNEL_NAMES = {
  '8640568': 'Fit3 Jr 儿童轮滑鞋',
  '8984795': 'EXPLORE 900 24" 青少年山地车',
  '8949264': 'RCR 骑行服',
}
const deltaText = (value, label) => value === null || value === undefined ? null : `${label} ${value > 0 ? '▴' : value < 0 ? '▾' : ''}${Math.abs(value).toFixed(1)}%`
const modelDelta = (row) => deltaText(row.wow, '环比') ?? deltaText(row.yoy, '同比') ?? '—'
const yuan = (value) => `¥${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function BiModelRanking({ snapshot }) {
  const { models } = snapshot
  const [tab, setTab] = useState('allChannel')
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
  const rows = tab === 'allChannel' ? models.allChannel.rows.slice(0, 10) : models[tab]
  const metric = (row) => tab === 'top' ? row.share : tab === 'allChannel' ? row.qty : Math.abs(row.wow ?? row.yoy ?? 0)
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
    <section ref={ref} className="ops-lieflat-card ops-bi-card ops-bi-models-card" data-replay={replay} aria-label="商品销售榜，可在热销、下滑与全渠道车型之间切换">
      <h3>销售榜已按 自行车+工作室 源端过滤</h3>
      <div className="ops-lieflat-sub"><span>{`BI ${models.report} · 周 ${models.week} · STORE 1299 · Universe=${'Cycling + Workshop'}`}</span></div>
      <div className="ops-bi-model-tabs" role="tablist" ref={trackRef}>
        <i className="ops-bi-model-pill" ref={pillRef} aria-hidden="true" />
        {MODEL_TABS.map((entry) => (
          <button key={entry.key} type="button" role="tab" aria-selected={tab === entry.key} className="ops-bi-model-tab" ref={(node) => { buttonRefs.current[entry.key] = node }} onClick={() => setTab(entry.key)}>
            {entry.label}
          </button>
        ))}
      </div>
      <p className="ops-bi-model-basis" data-bi-basis="">{tab === 'allChannel' ? `${models.basis.allChannel} · 合计 ${models.allChannel.total.qty} 台 ${yuan(models.allChannel.total.to)}` : models.basis[tab]}</p>
      <ol className="ops-bi-model-rows" data-bi-tab={tab}>
        {rows.map((row) => (
          <li key={`${tab}-${row.code}`} className="ops-bi-model-row">
            <span className="rank">{String(row.rank).padStart(2, '0')}</span>
            <span className="name">{(tab === 'allChannel' && ALLCHANNEL_NAMES[row.code]) || row.model}<span className="code">{row.code}</span></span>
            <span className="val">
              {tab === 'allChannel' ? (
                <>
                  <b>{`${row.qty} 台`}</b>
                  <small>{`${yuan(row.to)} · ${row.channels}`}</small>
                </>
              ) : (
                <>
                  <b>{yuan(row.to)}</b>
                  <small>{`${row.qty} 台 · ${tab === 'top' ? `${row.share.toFixed(1)}% 占比` : modelDelta(row)}`}</small>
                </>
              )}
            </span>
            <i className="ops-bi-model-bar"><i style={{ width: `${Math.max((metric(row) / maxMetric) * 100, row.rank <= 3 ? 4 : 1.5)}%` }} /></i>
          </li>
        ))}
      </ol>
      <div className="ops-lieflat-src">{tab === 'allChannel' ? 'ALL CHANNEL TOP SALES · BI M218 · STORE 1299' : 'MODEL RANKING · BI M332 OMNI WEEKLY · STORE 1299'}</div>
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
        <BiStatCard snapshot={snapshot} />
        <BiDisField snapshot={snapshot} />
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
