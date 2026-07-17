import { useState } from 'react'
import IconCheckCircle from '@iconoir/CheckCircle.mjs'
import IconClock from '@iconoir/Clock.mjs'
import IconWarning from '@iconoir/WarningTriangle.mjs'
import IconMedia from '@iconoir/MediaImage.mjs'

export default function ClosingSummary({
  workflow,
  onJumpToRequirement,
  onCompleteClosing,
  onReopenClosing,
  onExportReport
}) {
  const next = workflow.remainingRequirements[0]
  const dateLabel = new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', weekday: 'short' }).format(new Date())
  const closed = Boolean(workflow.closedAt)
  const [exporting, setExporting] = useState(false)

  const exportReport = async () => {
    if (!onExportReport || exporting) return
    setExporting(true)
    try {
      await onExportReport()
    } finally {
      setExporting(false)
    }
  }

  return (
    <section className="closing-summary" aria-labelledby="closing-summary-title" data-motion="summary">
      <div className="summary-topline"><span>{dateLabel} · DATABASE SYNC · 门店日报</span><strong>{closed ? 'CLOSED · 已闭店' : 'LIVE · 进行中'}</strong></div>
      <div className="summary-grid">
        <div className="summary-copy"><h2 id="closing-summary-title">{closed ? 'CLOSING COMPLETE' : 'READY TO CLOSE?'}</h2><p>{closed ? '今天的销售数据已填写，闭店记录已同步至数据库。可导出瑞士网格风格日报长图保存到相册。' : '销售数据是唯一闭店门槛；其它台账只在真实状态变化时编辑。'}</p></div>
        <div className="summary-score" aria-label={`闭店准备度 ${workflow.readiness}%`}><strong>{workflow.readiness}</strong><span>%</span></div>
      </div>
      <div className="progress-track" aria-hidden="true"><span style={{ '--progress-ratio': workflow.readiness / 100 }} /></div>
      {workflow.storageError ? <div className="status-alert" role="alert"><IconWarning width={18} height={18} aria-hidden="true" /><span>{workflow.storageError}</span><button type="button" onClick={() => void workflow.refresh()} disabled={workflow.syncing}>{workflow.syncing ? '正在同步…' : '重新同步'}</button></div> : null}
      {closed ? (
        <div className="summary-next summary-next-complete summary-next-closed">
          <IconCheckCircle width={24} height={24} aria-hidden="true" />
          <span>
            <strong>闭店完成</strong>
            <small>{new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date(workflow.closedAt))} 已同步</small>
          </span>
          <div className="summary-closed-actions">
            <button type="button" className="primary-action" onClick={() => void exportReport()} disabled={exporting}>
              <IconMedia width={18} height={18} aria-hidden="true" />
              {exporting ? '正在生成…' : '导出日报图'}
            </button>
            <button type="button" className="secondary-action" onClick={onReopenClosing}>重新打开</button>
          </div>
        </div>
      ) : next ? (
        <div className="summary-next"><IconClock width={24} height={24} aria-hidden="true" /><span><small>NEXT · 唯一要求</small><strong>{next.title}</strong><em>{next.label}</em></span><button type="button" className="primary-action" onClick={() => onJumpToRequirement(next)}>填写数据</button></div>
      ) : (
        <div className="summary-next summary-next-complete"><IconCheckCircle width={24} height={24} aria-hidden="true" /><span><small>READY · 可以闭店</small><strong>当日销售数据已保存</strong></span><button type="button" className="primary-action" onClick={onCompleteClosing}>完成闭店</button></div>
      )}
    </section>
  )
}
