import { useRef, useState } from 'react'
import { APP_VERSION, currentRelease } from '../../data/releaseNotes.js'
import AssemblyText from '../motion/AssemblyText.jsx'

const recordScenes = ['pickup', 'poster', 'repair', 'resale']
const completedStates = new Set(['complete', 'completed', 'resolved', 'done', 'closed', 'sold', 'picked_up', 'picked-up'])

function dateParts(dateKey) {
  const source = dateKey ? new Date(dateKey + 'T12:00:00') : new Date()
  if (Number.isNaN(source.getTime())) return { monthDay: '—', weekday: '—', full: '—' }
  const month = String(source.getMonth() + 1).padStart(2, '0')
  const day = String(source.getDate()).padStart(2, '0')
  return { monthDay: month + '.' + day, weekday: new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(source).toUpperCase(), full: source.getFullYear() + '.' + month + '.' + day }
}
function metric(value, available, suffix = '') {
  if (!available || value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return String(Math.max(0, Number(value))) + suffix
}
function recordsForOverview(recordsByScene) { return recordScenes.flatMap((scene) => Array.isArray(recordsByScene?.[scene]) ? recordsByScene[scene] : []) }
function isCompletedRecord(record) {
  const state = String(record?.status ?? record?.state ?? record?.lifecycleState ?? '').toLowerCase()
  return Boolean(record?.completedAt || record?.resolvedAt || record?.handedOverAt || record?.soldAt || completedStates.has(state))
}
function closingState(workflow, online) {
  const available = workflow.hydrated && workflow.hasSnapshot && !workflow.storageError
  if (!available) return { label: 'SYNC REQUIRED', action: 'REFRESH', handler: 'refresh', disabled: !online }
  if (workflow.closedAt) return { label: 'DAY CLOSED', action: 'HISTORY', handler: 'history', disabled: false }
  if (workflow.kpiReady) return { label: 'READY TO CLOSE', action: 'COMPLETE', handler: 'complete', disabled: !online }
  return { label: 'KPI REQUIRED', action: 'ENTER KPI', handler: 'edit', disabled: false }
}
function PosterClosingControl({ workflow, online, onEditKpi, onCompleteClosing, onHistory, onRefresh, onReopenClosing, onExportReport }) {
  const [exporting, setExporting] = useState(false)
  const state = closingState(workflow, online)
  const actions = { refresh: onRefresh, history: onHistory, complete: onCompleteClosing, edit: onEditKpi }
  const exportReport = async () => { if (!onExportReport || exporting) return; setExporting(true); try { await onExportReport() } finally { setExporting(false) } }
  return <aside className="poster-closing-control" aria-label="今日闭店控制"><span><i aria-hidden="true" />DAILY CLOSING</span><strong>{state.label}</strong><button type="button" onClick={actions[state.handler]} disabled={state.disabled}>{state.action}<b aria-hidden="true">→</b></button>{workflow.closedAt ? <div><button type="button" onClick={() => void exportReport()} disabled={exporting}>{exporting ? 'EXPORTING' : 'EXPORT'}</button><button type="button" onClick={onReopenClosing}>REOPEN</button></div> : null}</aside>
}
function WorkbenchPicture({ className, position }) {
  return <picture className={className} aria-hidden="true"><source media="(min-width: 600px)" srcSet="/images/ops/reference-home/mechanic-workbench-1600.webp" /><img src="/images/ops/reference-home/mechanic-workbench-960.webp" alt="" width="960" height="641" loading="eager" decoding="async" style={{ objectPosition: position }} /></picture>
}
function SwipeSceneCard({ children, className, direction, label, onActivate }) {
  const originRef = useRef(null)
  const movedRef = useRef(false)
  const onPointerDown = (event) => { if (event.pointerType !== 'mouse') { originRef.current = { x: event.clientX, y: event.clientY }; movedRef.current = false } }
  const onPointerUp = (event) => {
    const origin = originRef.current
    originRef.current = null
    if (!origin) return
    const deltaX = event.clientX - origin.x
    const deltaY = event.clientY - origin.y
    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.25) return
    const accepted = direction === 'left' ? deltaX < 0 : deltaX > 0
    if (accepted) { movedRef.current = true; onActivate() }
  }
  return <button type="button" className={className} onClick={() => { if (movedRef.current) { movedRef.current = false; return } onActivate() }} onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => { originRef.current = null }} aria-label={label} data-swipe-direction={direction}>{children}<b className="poster-swipe-cue" aria-hidden="true">{direction === 'left' ? '← SWIPE' : 'SWIPE →'}</b></button>
}
function revealReleaseAboveDock(event) {
  const details = event.currentTarget
  if (!details.open) return
  const dockTop = document.querySelector('.look-dock')?.getBoundingClientRect().top ?? window.innerHeight
  const delta = details.getBoundingClientRect().bottom - dockTop + 12
  if (delta > 0) window.scrollBy({ top: delta, behavior: 'auto' })
}
function ReleaseFooter() {
  return <details className="poster-release" onToggle={revealReleaseAboveDock}><summary aria-label="查看更新说明"><strong>V{APP_VERSION}</strong><span>{currentRelease.title}</span><time>{currentRelease.date}</time><b aria-hidden="true">＋</b></summary><div><p>{currentRelease.summary}</p><ul>{currentRelease.changes.map((change) => <li key={change}>{change}</li>)}</ul></div></details>
}
function PosterGuides() {
  return <svg className="poster-guides" viewBox="0 0 852 1876" preserveAspectRatio="none" aria-hidden="true"><g className="poster-guide-cross poster-guide-cross-title"><path d="M462 367h24M474 355v24" /><circle cx="474" cy="367" r="4" /></g><g className="poster-guide-cross poster-guide-cross-right"><path d="M746 491h26M759 468v47" /><circle cx="759" cy="491" r="5" /></g><g className="poster-guide-cross poster-guide-cross-kpi"><path d="M416 1234h20M426 1224v20" /><circle cx="426" cy="1234" r="3" /></g></svg>
}
export default function WorkshopOverviewPage({ workflow, online, onEditKpi, onCompleteClosing, onHistory, onRefresh, onReopenClosing, onExportReport, onJump }) {
  const available = workflow.hydrated && workflow.hasSnapshot && !workflow.storageError
  const date = dateParts(workflow.dateKey)
  const overviewRecords = recordsForOverview(workflow.recordsByScene)
  const dashboardRows = [
    { label: '工单完成', en: 'WORK ORDERS DONE', value: metric(overviewRecords.filter(isCompletedRecord).length, available) },
    { label: '待处理工单', en: 'OPEN WORK ORDERS', value: metric(overviewRecords.length, available) },
    { label: '销售车辆', en: 'SALES VEHICLES', value: metric(workflow.kpi?.salesVehicles, available) },
    { label: '闭店准备度', en: 'CLOSING READY', value: metric(workflow.kpiReady ? 100 : 0, available, '%'), accent: true }
  ]
  return <div className="ops-mobile-overview" data-workspace-module="true" aria-label="Workshop 业务总览">
    {!online ? <p className="poster-offline" role="status">SYSTEM OFFLINE · 显示最近成功加载的数据</p> : null}
    <main className="workshop-poster" aria-labelledby="workshop-poster-title">
      <PosterGuides />
      <section className="poster-opening" aria-label="Workshop Operations 主视觉">
        <header className="poster-title-block"><h1 id="workshop-poster-title"><AssemblyText text="WORKSHOP" seed={1} /><AssemblyText text="OPS" seed={2} /></h1><div className="poster-date"><i aria-hidden="true" /><small>DAY</small><strong>{date.monthDay}</strong><span>{date.weekday}</span><time dateTime={workflow.dateKey || undefined}>{date.full}</time></div></header>
        <div className="poster-system-line"><i aria-hidden="true" /><strong>SYSTEM {online ? 'ONLINE' : 'OFFLINE'}</strong><span>FOCUS / EXECUTE / IMPROVE</span></div>
        <p className="poster-purpose"><AssemblyText as="strong" text="精益运营 · 高效协同" seed={3} /><AssemblyText text="让每一项工作都有价值" seed={4} /></p>
        <img className="poster-ore" data-assembly-ore="true" src="/images/ops/reference-home/obsidian-orange-cut-900.webp" alt="" width="900" height="720" decoding="async" />
        <div className="poster-plinth" aria-hidden="true" /><p className="poster-object-note poster-object-note-left">WORK<br />SMARTER<br />TOGETHER</p><p className="poster-object-note poster-object-note-right">DATA<br />DRIVEN<br />RESULTS</p>
      </section>
      <section className="poster-kpi" aria-labelledby="poster-kpi-title"><div><AssemblyText as="h2" id="poster-kpi-title" text="Today KPI" seed={5} /><AssemblyText as="p" text="今日数据" seed={6} /></div><button type="button" onClick={onEditKpi}><span>VIEW DASHBOARD</span><b aria-hidden="true">→</b></button></section>
      <section className="poster-workzone" aria-labelledby="poster-overview-title">
        <SwipeSceneCard className="poster-photo poster-photo-left" direction="right" label="向右滑动或点击进入维修交接" onActivate={() => onJump('repair')}><WorkbenchPicture className="poster-photo-media" position="18% center" /><span><strong>MAINTENANCE<br />AREA</strong><small>01.</small></span></SwipeSceneCard>
        <SwipeSceneCard className="poster-photo poster-photo-right" direction="left" label="向左滑动或点击进入待取车辆" onActivate={() => onJump('pickup')}><WorkbenchPicture className="poster-photo-media" position="82% center" /><span><strong>WORK<br />STATION</strong><small>02.</small></span></SwipeSceneCard>
        <article className="poster-overview-card"><header><h2 id="poster-overview-title">TODAY'S<br />OVERVIEW</h2><i aria-hidden="true" /></header><dl>{dashboardRows.map((row) => <div key={row.en} data-accent={row.accent ? 'true' : 'false'}><dt><strong>{row.label}</strong><small>{row.en}</small></dt><dd>{row.value}</dd></div>)}</dl><PosterClosingControl workflow={workflow} online={online} onEditKpi={onEditKpi} onCompleteClosing={onCompleteClosing} onHistory={onHistory} onRefresh={onRefresh} onReopenClosing={onReopenClosing} onExportReport={onExportReport} /></article>
      </section>
      <footer className="poster-footer"><span>KEEP IMPROVING<br /><strong>MAKE IT COUNT ——</strong></span><i className="poster-globe" aria-hidden="true"><b /><b /></i><span><i aria-hidden="true" />WORKSHOP<br /><strong>OPERATIONS</strong></span><ReleaseFooter /></footer>
    </main>
  </div>
}
