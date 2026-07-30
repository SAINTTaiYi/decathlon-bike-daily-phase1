import { useState } from 'react'
import IconCash from '@iconoir/Cash.mjs'
import IconDelivery from '@iconoir/DeliveryTruck.mjs'
import IconLabel from '@iconoir/Label.mjs'
import IconShop from '@iconoir/ShopWindow.mjs'
import IconWrench from '@iconoir/Wrench.mjs'
import { APP_VERSION, currentRelease } from '../../data/releaseNotes.js'

const operations = [
  { id: 'pickup', no: '02', en: 'PICKUP', cn: '待取车辆', Icon: IconDelivery },
  { id: 'poster', no: '03', en: 'OTHER', cn: '其它交接', Icon: IconShop },
  { id: 'repair', no: '04', en: 'REPAIR', cn: '维修交接', Icon: IconWrench },
  { id: 'resale', no: '05', en: 'USED', cn: '二手车台账', Icon: IconLabel },
  { id: 'sales', no: '06', en: 'SALES', cn: '销售数据', Icon: IconCash }
]

const kpiItems = [
  { key: 'safetyChecks', no: '01', cn: '安全检查开单', en: 'MODEL' },
  { key: 'validReviews', no: '02', cn: '顾客有效评价', en: 'VALID REVIEWS' },
  { key: 'usedSold', no: '03', cn: '销售二手车', en: 'USED SOLD' },
  { key: 'usedReceived', no: '04', cn: '收二手车', en: 'USED RECEIVED' }
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

function displayMetric(value, available = true) {
  if (!available || value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return String(Math.max(0, Number(value))).padStart(2, '0')
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

function closingState(workflow, online) {
  const available = workflow.hydrated && workflow.hasSnapshot
  const closed = Boolean(workflow.closedAt)
  const error = Boolean(workflow.storageError)
  if (!available || error) return {
    label: 'ERROR / 需要处理', title: '检查数据库同步', copy: online ? '请重新同步后再操作' : '恢复网络后重试', action: '处理异常', tone: 'error'
  }
  if (closed) {
    const time = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date(workflow.closedAt))
    return { label: 'DONE / 已闭店', title: '当日闭店已完成', copy: `${time} 已同步`, action: '查看记录', tone: 'done' }
  }
  if (workflow.kpiReady) return { label: 'READY / 可以闭店', title: '当日销售数据已保存', copy: '完成前请再次核对', action: '检查闭店', tone: 'ready' }
  return { label: 'NEXT / 唯一要求', title: '填写当日销售数据', copy: '这是唯一的闭店要求', action: '填写数据', tone: 'due' }
}

function ClosingStatusCard({ workflow, online, onEditKpi, onCompleteClosing, onHistory, onRefresh, onReopenClosing, onExportReport }) {
  const [exporting, setExporting] = useState(false)
  const available = workflow.hydrated && workflow.hasSnapshot
  const closed = Boolean(workflow.closedAt)
  const error = Boolean(workflow.storageError)
  const state = closingState(workflow, online)
  const progress = workflow.kpiReady ? 100 : 0
  const actions = { error: onRefresh, done: onHistory, ready: onCompleteClosing, due: onEditKpi }
  const exportReport = async () => {
    if (!onExportReport || exporting) return
    setExporting(true)
    try { await onExportReport() } finally { setExporting(false) }
  }
  return (
    <section className="ops-closing-card" data-tone={state.tone} aria-labelledby="ops-closing-title">
      <div className="ops-closing-main">
        <div className="ops-closing-title"><span>DAILY CLOSING · 01</span><h2 id="ops-closing-title">今日闭店进度</h2><small>销售数据是唯一闭店要求</small></div>
        <StatusValue value={progress} available={available && !error} />
      </div>
      <div className="ops-closing-next">
        <span className="ops-clock-glyph" aria-hidden="true">◷</span>
        <span><small>{state.label}</small><strong>{state.title}</strong><em>{state.copy}</em></span>
        <button type="button" onClick={actions[state.tone]} disabled={!online && !closed}>{state.action}<ArrowGlyph /></button>
      </div>
      {closed ? <div className="ops-closing-actions"><button type="button" onClick={() => void exportReport()} disabled={exporting}>{exporting ? '正在生成…' : '导出日报图'}</button><button type="button" onClick={onReopenClosing}>重新打开闭店</button></div> : null}
    </section>
  )
}

function SalesVehiclesPanel({ dateKey, kpi, available, onEditKpi }) {
  const date = dateParts(dateKey)
  const salesValue = displayMetric(kpi?.salesVehicles, available)
  return (
    <section className="ops-sales-panel" aria-labelledby="ops-sales-title">
      <button type="button" className="ops-sales-primary" onClick={onEditKpi} aria-label="填写或修改当日销售数据">
        <span className="ops-sales-label"><i /><strong id="ops-sales-title">SALES VEHICLES</strong></span>
        <time dateTime={dateKey || undefined}>{date.full.replace(/ 周.$/u, '')}</time>
        <small>销售车辆 · {available ? '实时业务数据' : '数据暂不可用'}</small>
        <b data-digits={salesValue === '—' ? 'unavailable' : String(salesValue.length)}>{salesValue}</b>
        <span className="ops-blueprint" aria-hidden="true"><img src="/images/ops/bicycle-workshop-blueprint.svg" alt="" /><em>UNIT</em></span>
      </button>
      <div className="ops-kpi-grid">
        {kpiItems.map((item) => {
          const value = displayMetric(kpi?.[item.key], available)
          return <button type="button" key={item.key} onClick={onEditKpi}><small>{item.no}</small><span><strong>{item.cn}</strong></span><em>{item.key === 'safetyChecks' && kpi?.safetyModel ? `MODEL · ${kpi.safetyModel}` : item.en}</em><b data-digits={value === '—' ? 'unavailable' : String(value.length)}>{value}</b></button>
        })}
      </div>
    </section>
  )
}

function operationSummary(workflow) {
  if (workflow.storageError) return '同步异常'
  if (!workflow.hydrated || !workflow.hasSnapshot) return '业务数据加载中'
  if (workflow.closedAt) return '今日已闭店'
  if (!workflow.kpiReady) return '销售数据待填写'
  return '销售数据已保存 · 可闭店'
}

function OperationsIndex({ workflow, onJump }) {
  const available = workflow.hydrated && workflow.hasSnapshot && !workflow.storageError
  return (
    <nav className="ops-index" aria-label="业务台账模块">
      <div className="ops-index-head"><span className="ops-index-label"><span>OPERATIONS INDEX ·</span><span className="ops-index-label-cn">业务台账</span></span><strong>{operationSummary(workflow)}</strong></div>
      <ol>{operations.map(({ id, no, en, cn, Icon }) => {
        const count = workflow.recordsByScene[id]?.length ?? 0
        let value = displayMetric(count, available)
        if (id === 'sales') value = !available ? '—' : workflow.closedAt ? 'DONE' : workflow.kpiReady ? 'READY' : 'DUE'
        return <li key={id}><button type="button" onClick={() => onJump(id)}><small>{no}</small><span><Icon width={20} height={20} strokeWidth={1.7} aria-hidden="true" /><strong>{en}</strong></span><em>{cn}</em><b data-value={String(value).toLowerCase()}>{value}</b><ArrowGlyph /></button></li>
      })}</ol>
    </nav>
  )
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
    const delta = rect.height <= availableHeight ? rect.bottom - dockTop + 12 : rect.top - headerHeight - 12
    if (delta <= 0) return
    window.scrollBy({ top: delta, behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
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

function WorkbenchPicture({ className }) {
  return (
    <picture className={className} aria-hidden="true">
      <source media="(min-width: 600px)" srcSet="/images/ops/reference-home/mechanic-workbench-1600.webp" />
      <img src="/images/ops/reference-home/mechanic-workbench-960.webp" alt="" width="960" height="641" loading="eager" decoding="async" />
    </picture>
  )
}

export default function WorkshopOverviewPage({ workflow, online, onEditKpi, onCompleteClosing, onHistory, onRefresh, onReopenClosing, onExportReport, onJump }) {
  const available = workflow.hydrated && workflow.hasSnapshot
  const date = dateParts(workflow.dateKey)
  return (
    <div className="ops-mobile-overview" data-workspace-module="true" aria-label="Workshop 业务总览">
      {!online ? <p className="ops-inline-alert" role="status">OFFLINE · 当前仅可查看最近成功加载的数据</p> : null}
      <section className="ops-reference-hero" aria-labelledby="ops-reference-title">
        <div className="ops-reference-intro"><span>WORKSHOP DAILY · {date.short}</span><h1 id="ops-reference-title"><span>Every Shift</span><span>Starts Clear</span></h1><p>每一次交接，都从清楚的当日状态开始。</p></div>
        <img className="ops-reference-object" src="/images/ops/reference-home/obsidian-oregon-760.webp" alt="" width="760" height="760" decoding="async" />
        <span className="ops-reference-note ops-reference-note-a" aria-hidden="true">STATUS / LIVE</span>
        <span className="ops-reference-note ops-reference-note-b" aria-hidden="true">DATA / VERIFIED</span>
        <ClosingStatusCard workflow={workflow} online={online} onEditKpi={onEditKpi} onCompleteClosing={onCompleteClosing} onHistory={onHistory} onRefresh={onRefresh} onReopenClosing={onReopenClosing} onExportReport={onExportReport} />
      </section>

      <section className="ops-reference-floor" aria-labelledby="ops-floor-title">
        <WorkbenchPicture className="ops-floor-media" />
        <header><span>THE WORK IN FRONT OF US</span><h2 id="ops-floor-title">Explore<br />Today</h2><p>进入当日业务现场</p></header>
        <OperationsIndex workflow={workflow} onJump={onJump} />
      </section>

      <section className="ops-reference-proof" aria-labelledby="ops-proof-title">
        <header><span>NUMBERS WITH A SOURCE</span><h2 id="ops-proof-title">Today,<br />Measured</h2><p>所有数值都来自当前门店的真实日报。</p></header>
        <SalesVehiclesPanel dateKey={workflow.dateKey} kpi={workflow.kpi} available={available} onEditKpi={onEditKpi} />
      </section>

      <section className="ops-reference-connection" aria-labelledby="ops-connection-title">
        <WorkbenchPicture className="ops-connection-media" />
        <div><span>ONE WORKBENCH · ONE RECORD</span><h2 id="ops-connection-title">The<br />Connection</h2><p>销售、维修、待取和交接，在同一个日报中连接。</p><button type="button" onClick={() => onJump('pickup')}>查看待取车辆<ArrowGlyph /></button></div>
      </section>

      <section className="ops-reference-updates" aria-labelledby="ops-updates-title"><header><span>KNOWN WORK, VISIBLE CHANGE</span><h2 id="ops-updates-title">Updates</h2></header><ReleaseStrip /></section>
      <div className="ops-first-screen-spacer" aria-hidden="true" />
    </div>
  )
}
