import { useState } from 'react'
import IconCheckCircle from '@iconoir-solid/CheckCircle.mjs'
import IconClock from '@iconoir/Clock.mjs'
import IconWarning from '@iconoir-solid/WarningTriangle.mjs'
import IconMedia from '@iconoir/MediaImage.mjs'

export default function ClosingSummary({ workflow, onJumpToRequirement, onCompleteClosing, onReopenClosing, onExportReport }) {
  const next = workflow.remainingRequirements[0]
  const dateLabel = new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', weekday: 'short' }).format(new Date())
  const closed = Boolean(workflow.closedAt)
  const [exporting, setExporting] = useState(false)

  const exportReport = async () => {
    if (!onExportReport || exporting) return
    setExporting(true)
    try { await onExportReport() } finally { setExporting(false) }
  }

  return (
    <section className="closing-summary" data-signal-module="closing" aria-labelledby="closing-summary-title" data-motion="summary">
      <div className="summary-topline"><span>{dateLabel} / DATABASE SYNC</span><strong>{closed ? 'CLOSED' : 'OPEN'}</strong></div>
      <div className="summary-grid">
        <div className="summary-copy">
          <span>Daily closing</span>
          <h2 id="closing-summary-title">{closed ? 'CLOSING COMPLETE' : workflow.kpiReady ? 'READY TO CLOSE' : 'CLOSING STATUS'}</h2>
          <p>{closed ? '当日数据已锁定并同步。' : workflow.kpiReady ? '销售数据已保存，可以完成闭店。' : '销售数据是唯一闭店要求。其它台账按实际变化更新。'}</p>
        </div>
        <div className="summary-score" aria-label={`闭店准备度 ${workflow.readiness}%`}><strong>{workflow.readiness}</strong><span>%</span></div>
      </div>
      {workflow.storageError ? <div className="status-alert" role="alert"><IconWarning width={18} height={18} aria-hidden="true" /><span>{workflow.storageError}</span><button type="button" onClick={() => void workflow.refresh()} disabled={workflow.syncing}>{workflow.syncing ? '正在同步…' : '重新同步'}</button></div> : null}
      {closed ? (
        <div className="summary-next summary-next-complete summary-next-closed">
          <IconCheckCircle width={22} height={22} aria-hidden="true" />
          <span><strong>闭店完成</strong><small>{new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date(workflow.closedAt))} 已同步</small></span>
          <div className="summary-closed-actions">
            <button type="button" className="primary-action" onClick={() => void exportReport()} disabled={exporting}><IconMedia width={17} height={17} aria-hidden="true" />{exporting ? '正在生成…' : '导出日报图'}</button>
            <button type="button" className="secondary-action" onClick={onReopenClosing}>重新打开</button>
          </div>
        </div>
      ) : next ? (
        <div className="summary-next"><IconClock width={22} height={22} aria-hidden="true" /><span><small>NEXT / 唯一要求</small><strong>{next.title}</strong><em>{next.label}</em></span><button type="button" className="primary-action" onClick={() => onJumpToRequirement(next)}>填写数据</button></div>
      ) : (
        <div className="summary-next summary-next-complete"><IconCheckCircle width={22} height={22} aria-hidden="true" /><span><small>READY / 可以闭店</small><strong>当日销售数据已保存</strong></span><button type="button" className="primary-action" onClick={onCompleteClosing}>完成闭店</button></div>
      )}
    </section>
  )
}
