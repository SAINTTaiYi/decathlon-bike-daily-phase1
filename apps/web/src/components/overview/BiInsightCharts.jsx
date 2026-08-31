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
  useEffect(() => {
    const node = ref.current
    if (!node || reduced || !revealed) return undefined
    const timeline = gsap.timeline()
    build(timeline, node)
    timeline.play(0)
    return () => { timeline.kill() }
  }, [revealed, replay, reduced, build])
}

function ChartSvg({ label, replayChart, children, viewBox }) {
  return (
    <svg className="ops-lieflat-chart ops-bi-chart" viewBox={viewBox} role="img" tabIndex="0" aria-label={label} onClick={replayChart} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') replayChart() }}>
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
      <h3>门店 TO 同比回落 {yoyPercent}%</h3>
      <div className="ops-lieflat-sub"><span>BI 本周期门店营业额 · 单位元 · 经济表现 M216</span></div>
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
      <h3>DIS 销售：全渠道与线下几乎对半</h3>
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
      <div className="ops-lieflat-sub"><span>1 刻度 = 门店 TO 的 1% · 上墨 = 线上份额 {(share * 100).toFixed(1)}% · 门店汇总 M214</span></div>
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
    </article>
  )
}

export default BiInsightPanel
