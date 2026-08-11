import { useEffect, useState } from 'react'
import IconCheck from '@iconoir/Check.mjs'
import AppDialog from './AppDialog.jsx'
import { inferPickupSource } from '../../data/pickupRecord.js'
import { REPAIR_POS_REMINDER_STATUS } from '../../data/repairRecord.js'

export default function PickupConfirmDialog({ record, onClose, onConfirm }) {
  const [pickupCode, setPickupCode] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const open = Boolean(record)
  const selfPickup = inferPickupSource(record) === 'self-pickup'
  const posReminder = record?.status === REPAIR_POS_REMINDER_STATUS

  useEffect(() => {
    if (!open) return
    setPickupCode('')
    setError('')
  }, [open, record])

  const submit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    const result = await onConfirm(record, pickupCode)
    setSubmitting(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    onClose()
  }

  const title = selfPickup ? '核对自提取货码' : '确认质保过机核验'
  const eyebrow = selfPickup ? 'PICKUP CHECK · 自提订单' : 'POS CHECK · 质保付款单'
  const description = selfPickup
    ? `请输入“${record?.title || '当前车辆'}”的顾客取货码。取货码只用于本次确认，不会保存到台账或操作记录。`
    : `“${record?.title || '当前车辆'}”当前为“${REPAIR_POS_REMINDER_STATUS}”。请确保顾客已过机核验；本提醒不会阻止取车。`

  return (
    <AppDialog open={open} onClose={onClose} title={title} eyebrow={eyebrow} description={description} className="data-dialog">
      <form className="data-form" onSubmit={submit}>
        {selfPickup ? (
          <label className="field-row">
            <span>顾客提供的取货码</span>
            <input data-autofocus required maxLength="40" autoComplete="off" inputMode="numeric" value={pickupCode} onChange={(event) => { setPickupCode(event.target.value); setError('') }} />
          </label>
        ) : posReminder ? (
          <p className="conditional-field-note" role="status"><strong>请确保顾客已过机核验</strong><span>确认后将继续执行取车，不会修改维修单或付款单内容。</span></p>
        ) : null}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="dialog-footer"><button type="button" className="secondary-action" onClick={onClose}>取消</button><button type="submit" className="primary-action" disabled={submitting} data-processing={submitting ? 'true' : undefined} aria-busy={submitting || undefined}>{submitting ? <><IconCheck width={15} height={15} aria-hidden="true" />确认中…</> : selfPickup ? '确认取车' : '已核验，继续取车'}</button></div>
      </form>
    </AppDialog>
  )
}
