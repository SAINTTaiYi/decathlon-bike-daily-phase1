import { useState } from 'react'
import IconCash from '@iconoir/Cash.mjs'
import IconDelivery from '@iconoir/DeliveryTruck.mjs'
import IconShop from '@iconoir/ShopWindow.mjs'
import IconWrench from '@iconoir/Wrench.mjs'
import IconLabel from '@iconoir/Label.mjs'
import IconCheck from '@iconoir/Check.mjs'
import { APP_VERSION, currentRelease } from '../../data/releaseNotes.js'
import { RepairRungChart, SalesHairlineChart } from './BusinessTrendCharts.jsx'
import { BiInsightPanel } from './BiInsightCharts.jsx'
import BiSalesMobile from './BiSalesMobile.jsx'
import { useViewportKind } from '../../hooks/useViewportKind.js'

const operations = [
  { id: 'pickup', no: '02', en: 'PICKUP', cn: '待取车辆', Icon: IconDelivery },
  { id: 'poster', no: '03', en: 'OTHER', cn: '其它交接', Icon: IconShop },
  { id: 'repair', no: '04', en: 'REPAIR', cn: '维修交接', Icon: IconWrench },
  { id: 'resale', no: '05', en: 'USED', cn: '二手台账', Icon: IconLabel },
  { id: 'sales', no: '06', en: 'SALES', cn: '销售数据', Icon: IconCash }
]


function dateParts(dateKey) {
  const source = dateKey ? new Date(`${dateKey}T12:00:00`) : new Date()
  if (Number.isNaN(source.getTime())) return { full: '—', short: '—' }
  const weekday = ['日', '一', '二', '三', '四', '五', '六'][source.getDay()]
  const year = source.getFullYear()
  const month = String(source.getMonth() + 1).padStart(2, '0')
  const day = String(source.getDate()).padStart(2, '0')
  return { full: `${year} / ${month} / ${day} 周${weekday}`, short: `${month} / ${day} 周${weekday}` }
}


function ArrowGlyph() { return <span className="ops-arrow" aria-hidden="true">›</span> }

function StatusValue({ value, available }) {
  const progress = available ? Math.max(0, Math.min(100, value)) : null
  return (
    <div className="ops-status-value" aria-label={progress === null ? '闭店准备度暂不可用' : `闭店准备度 ${progress}%`}>
      <strong>{progress === null ? '—' : progress}</strong>{progress === null ? null : <span>%</span>}
    </div>
  )
}

function ClosingStatusCard({ workflow, online, onEditKpi, onCompleteClosing, onHistory, onRefresh, onReopenClosing, onExportReport }) {
  const [exporting, setExporting] = useState(false)
  const available = workflow.hydrated && workflow.hasSnapshot
  const closed = Boolean(workflow.closedAt)
  const error = Boolean(workflow.storageError)
  const ready = workflow.kpiReady
  const progress = ready ? 100 : 0
  let nextLabel = 'NEXT / 唯一要求'
  let nextTitle = '填写当日销售数据'
  let nextCopy = '这是唯一的闭店要求'
  let action = '填写数据'
  let onAction = onEditKpi
  if (!available || error) {
    nextLabel = 'ERROR / 需要处理'
    nextTitle = '检查数据库同步'
    nextCopy = online ? '请重新同步后再操作' : '恢复网络后重试'
    action = '处理异常'
    onAction = onRefresh
  } else if (closed) {
    const time = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date(workflow.closedAt))
    nextLabel = 'DONE / 已闭店'
    nextTitle = '当日闭店已完成'
    nextCopy = `${time} 已同步`
    action = '查看记录'
    onAction = onHistory
  } else if (ready) {
    nextLabel = 'READY / 可以闭店'
    nextTitle = '当日销售数据已保存'
    nextCopy = '完成前请再次核对'
    action = '检查闭店'
    onAction = onCompleteClosing
  }
  const exportReport = async () => {
    if (!onExportReport || exporting) return
    setExporting(true)
    try { await onExportReport() } finally { setExporting(false) }
  }
  return (
    <section className="ops-closing-card" data-closed={closed ? 'true' : 'false'} aria-labelledby="ops-closing-title">
      <div className="ops-closing-main">
        <div className="ops-closing-title"><span>Daily closing</span><h2 id="ops-closing-title">今日闭店进度</h2><small>销售数据是唯一闭店要求</small></div>
        <StatusValue value={progress} available={available && !error} />
      </div>
      <div className="ops-closing-next">
        <span className="ops-clock-glyph" aria-hidden="true">◷</span>
        <span><small>{nextLabel}</small><strong>{nextTitle}</strong><em>{nextCopy}</em></span>
        <button type="button" onClick={onAction} disabled={!online && !closed}>{action}<ArrowGlyph /></button>
      </div>
      {closed ? <div className="ops-closing-actions"><button type="button" onClick={() => void exportReport()} disabled={exporting}>{exporting ? '正在生成…' : '导出日报图'}</button><button type="button" onClick={onReopenClosing}>重新打开闭店</button></div> : null}
    </section>
  )
}

function OperationsIndex({ workflow, shiphubSummary, onJump, showUsed = false }) {
  const available = workflow.hydrated && workflow.hasSnapshot && !workflow.storageError
  return (
    <nav className="ops-index" aria-label="业务台账模块">
      <div className="ops-index-head"><span className="ops-index-label"><span>OPERATIONS INDEX ·</span><span className="ops-index-label-cn">业务台账</span></span><strong>{operationSummary(workflow)}</strong></div>
      <ol>{operations.filter(({ id }) => showUsed || id !== 'resale').map(({ id, no, en, cn, Icon }) => {
        const manualCount = workflow.recordsByScene[id]?.length ?? 0
        const shiphubCount = (category) => shiphubSummary?.categories?.find((item) => item.category === category)?.count ?? 0
        const count = id === 'pickup'
          ? manualCount + shiphubCount('hand') + shiphubCount('pick') + shiphubCount('receive')
          : id === 'poster'
            ? manualCount + shiphubCount('receive') + shiphubCount('ship')
            : manualCount
        let value = displayMetric(count, available)
        if (id === 'sales') {
          value = !available ? '—' : workflow.closedAt ? 'DONE' : workflow.kpiReady ? 'READY' : 'DUE'
        }
        return <li key={id}><button type="button" onClick={() => onJump(id)}><small>{no}</small><span><Icon width={18} height={18} strokeWidth={1.7} aria-hidden="true" /><strong>{en}</strong></span><em>{cn}</em><b data-value={String(value).toLowerCase()}>{value}</b><ArrowGlyph /></button></li>
      })}</ol>
    </nav>
  )
}

function OverviewAnalytics({ workflow, shiphubSummary }) {
  const available = workflow.hydrated && workflow.hasSnapshot && !workflow.storageError
  const repairCount = workflow.recordsByScene.repair?.length ?? 0
  const shiphubCount = (category) => shiphubSummary?.categories?.find((item) => item.category === category)?.count ?? 0
  const pickupCount = (workflow.recordsByScene.pickup?.length ?? 0) + shiphubCount('hand') + shiphubCount('pick') + shiphubCount('receive')
  const otherCount = (workflow.recordsByScene.poster?.length ?? 0) + (shiphubSummary?.categories?.find((item) => item.category === 'receive')?.count ?? 0) + (shiphubSummary?.categories?.find((item) => item.category === 'ship')?.count ?? 0)
  const healthRows = [
    ['销售数据', workflow.kpiReady ? '完整' : '待填写'],
    ['维修交接', available ? `${repairCount} 条在册` : '待同步'],
    ['待取车辆', available ? `${pickupCount} 条在册` : '待同步'],
    ['其它交接', available ? `${otherCount} 条在册` : '待同步']
  ]
  const completeness = available ? (workflow.kpiReady ? 100 : 75) : 0
  const trendsAvailable = available && Boolean(workflow.trends?.days?.length)
  return <section className="ops-analytics-grid" aria-label="业务趋势与数据健康度">
    <article className="ops-analytics-panel ops-trends-panel">
      <header><strong>业务趋势概览</strong><span>{trendsAvailable ? 'LIVE · 7D' : 'SYNC'}</span></header>
      {trendsAvailable ? <div className="ops-trend-grid"><SalesHairlineChart trends={workflow.trends} /><RepairRungChart trends={workflow.trends} /></div> : <div className="ops-trend-unavailable" role="status">七日趋势正在从门店数据库同步…</div>}
    </article>
    <article className="ops-analytics-panel ops-health-panel">
      <header><strong>数据健康度</strong><span>{available ? 'LIVE' : 'SYNC'}</span></header>
      <div className="ops-health-score" style={{ '--ops-health-percent': `${completeness}%` }}><b>{available ? completeness : '—'}</b><span>{available ? '%' : ''}</span><small>数据完整度</small></div>
      <ul>{healthRows.map(([label, value]) => <li key={label}><IconCheck width={14} height={14} aria-hidden="true" /><span>{label}</span><strong>{value}</strong></li>)}</ul>
    </article>
  </section>
}

function revealReleaseAboveDock(event) {
  const details = event.currentTarget
  if (!details.open) return
  window.requestAnimationFrame(() => {
    const dock = document.querySelector('.look-dock')
    const dockTop = dock?.getBoundingClientRect().top ?? window.innerHeight
    const rect = details.getBoundingClientRect()
    const headerHeight = Number.parseFloat(window.getComputedStyle(document.documentElement).getPropertyValue('--ops-header-height')) || 72
    const availableHeight = dockTop - headerHeight - 24
    const delta = rect.height <= availableHeight
      ? rect.bottom - dockTop + 12
      : rect.top - headerHeight - 12
    if (delta <= 0) return
    window.scrollBy({
      top: delta,
      behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    })
  })
}

function ReleaseStrip() {
  return (
    <details className="ops-release-strip" onToggle={revealReleaseAboveDock}>
      <summary aria-label="查看更新说明"><strong>V{APP_VERSION}</strong><span>{currentRelease.title}</span><time>{currentRelease.date}</time><b aria-hidden="true">＋</b></summary>
      <div><p>{currentRelease.summary}</p><ul>{currentRelease.changes.map((change) => <li key={change}>{change}</li>)}</ul></div>
    </details>
  )
}

export default function WorkshopOverviewPage({ workflow, shiphubSummary, online, onEditKpi, onCompleteClosing, onHistory, onRefresh, onReopenClosing, onExportReport, onJump, showUsed = false, showAnalytics = false }) {
  const viewport = useViewportKind()
  return (
    <div className="ops-mobile-overview" data-workspace-module="true" aria-label="Workshop 业务总览">
      {!online ? <p className="ops-inline-alert" role="status">OFFLINE · 当前仅可查看最近成功加载的数据</p> : null}
      <div className="ops-overview-left">
        <ClosingStatusCard workflow={workflow} online={online} onEditKpi={onEditKpi} onCompleteClosing={onCompleteClosing} onHistory={onHistory} onRefresh={onRefresh} onReopenClosing={onReopenClosing} onExportReport={onExportReport} />
        {showAnalytics ? <OverviewAnalytics workflow={workflow} shiphubSummary={shiphubSummary} /> : null}
      </div>
      <section className="ops-sales-slot" aria-label="销售数据 · BI">
        {viewport === 'desktop' ? <BiInsightPanel /> : <BiSalesMobile />}
      </section>
      <OperationsIndex workflow={workflow} shiphubSummary={shiphubSummary} onJump={onJump} showUsed={showUsed} />
      <ReleaseStrip />
      <div className="ops-first-screen-spacer" aria-hidden="true" />
    </div>
  )
}
