import { useEffect, useState } from 'react'
import AppDialog from './AppDialog.jsx'

const fields = [
  ['salesVehicles', '销售车辆', '台'],
  ['safetyChecks', '安全检查开单', '单'],
  ['validReviews', '顾客有效评价', '条'],
  ['usedSold', '销售二手车', '台'],
  ['usedReceived', '收二手车', '台']
]

export default function KpiDialog({ open, onClose, values, savedAt, onSave, onClear, onNotify, bikeDay }) {
  const [draft, setDraft] = useState(values)
  const [error, setError] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [autoFilled, setAutoFilled] = useState(false)
  const [filledNote, setFilledNote] = useState(false)

  useEffect(() => {
    if (open) {
      setDraft(values)
      setError('')
      setConfirmClear(false)
      setAutoFilled(false)
      setFilledNote(false)
    }
  }, [open, values])

  // perfeco 当日实销同步到位后自动填入新车/二手车台数（2026-09-04 事故修复）。
  // 事故根因：未保存当天的表单初始值是 emptyKpi 的数字 0（不是 ''/null），
  // 旧条件「字段为空才填」对 0 永不命中 → 自动填入从未生效，字段一直显示 0。
  // 修正语义：
  //  · 当天尚未保存（savedAt 为空）→ 字段仍处占位 0 态时自动填入实销；
  //  · 当天已保存过（服务端快照权威）→ 绝不自动覆盖，提供「填入实销」按钮手动同步；
  //  · 用户已输入非占位值（如手填 3）→ 同样不覆盖。
  useEffect(() => {
    if (!open || !bikeDay || bikeDay.status !== 'ok' || autoFilled) return
    if (bikeDay.newBikes === null || bikeDay.usedBikes === null) return
    setAutoFilled(true)
    const placeholder = (value) => value === '' || value == null || value === 0 || value === '0'
    if (!savedAt && (placeholder(draft.salesVehicles) || placeholder(draft.usedSold))) {
      setDraft((current) => ({
        ...current,
        salesVehicles: placeholder(current.salesVehicles) ? String(bikeDay.newBikes) : current.salesVehicles,
        usedSold: placeholder(current.usedSold) ? String(bikeDay.usedBikes) : current.usedSold
      }))
      setFilledNote(true)
    }
  }, [open, bikeDay, autoFilled, savedAt, draft.salesVehicles, draft.usedSold])

  const fillFromBikeDay = () => {
    if (!bikeDay || bikeDay.status !== 'ok') return
    setDraft((current) => ({
      ...current,
      salesVehicles: String(bikeDay.newBikes ?? 0),
      usedSold: String(bikeDay.usedBikes ?? 0)
    }))
  }

  const submit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    const result = await onSave(draft)
    setSubmitting(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    onNotify?.('当日销售与 KPI 数据已同步至数据库')
    onClose()
  }

  const clear = async () => {
    setSubmitting(true)
    const result = await onClear()
    setSubmitting(false)
    if (!result.ok) return setError(result.error)
    onNotify?.('当日销售数据已清空，可从操作记录撤回')
    onClose()
  }

  return (
    <AppDialog open={open} onClose={onClose} title="填写当日销售数据" eyebrow="DAILY INPUT · 人工录入" description="请按当天实际情况填写；数字可以为 0。保存成功后同步至数据库，并满足唯一闭店要求。" className="data-dialog">
      <form className="data-form" onSubmit={submit}>
        <div className="metric-input-grid">
          {fields.map(([name, label, unit]) => (
            <label className="metric-input" key={name}>
              <span>{label}</span>
              <span><input type="number" inputMode="numeric" min="0" step="1" required value={draft[name]} onChange={(event) => setDraft((current) => ({ ...current, [name]: event.target.value }))} /><em>{unit}</em></span>
            </label>
          ))}
        </div>
        {bikeDay && bikeDay.status !== 'unavailable' ? (
          <p className="form-meta bike-day-sync" data-bike-sync={bikeDay.status}>
            {bikeDay.status === 'syncing' ? '正在同步今日自行车实销…'
              : bikeDay.status === 'error' ? '自行车实销同步暂不可用，可手动填写'
              : bikeDay.status === 'ok' ? `今日实销（perfeco）：新车 ${bikeDay.newBikes ?? 0} 台 · 二手 ${bikeDay.usedBikes ?? 0} 台`
              : '自行车实销同步暂不可用'}
            {bikeDay.status === 'ok' && filledNote ? <span className="bike-sync-note">（已自动填入）</span> : null}
            {bikeDay.status === 'ok' && !filledNote ? <button type="button" className="text-action" onClick={fillFromBikeDay}>填入实销</button> : null}
          </p>
        ) : null}
        <label className="field-row">
          <span>安全检查型号或单号</span>
          <input value={draft.safetyModel || ''} onChange={(event) => setDraft((current) => ({ ...current, safetyModel: event.target.value }))} maxLength="40" placeholder="有开单时填写，可用逗号分隔多条" />
        </label>
        {savedAt ? <p className="form-meta">上次保存：{new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date(savedAt))}</p> : <p className="form-meta">今天尚未保存销售数据</p>}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {savedAt ? confirmClear ? (
          <div className="danger-confirm" role="alert"><strong>确认清空今天的销售与 KPI 数据？</strong><div><button type="button" onClick={() => setConfirmClear(false)}>取消</button><button type="button" className="danger-action" onClick={clear} disabled={submitting}>确认清空</button></div></div>
        ) : <button type="button" className="text-danger-action" onClick={() => setConfirmClear(true)}>清空今日销售数据</button> : null}
        <div className="dialog-footer"><button type="button" className="secondary-action" onClick={onClose}>取消</button><button type="submit" className="primary-action" disabled={submitting}>{submitting ? '正在保存…' : '保存数据'}</button></div>
      </form>
    </AppDialog>
  )
}
