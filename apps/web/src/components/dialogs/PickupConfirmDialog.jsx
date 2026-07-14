import { useEffect, useState } from 'react'
import AppDialog from './AppDialog.jsx'

export default function PickupConfirmDialog({ record, onClose, onConfirm }) {
  const [pickupCode, setPickupCode] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const open = Boolean(record)

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

  return (
    <AppDialog open={open} onClose={onClose} title="核对自提取货码" eyebrow="PICKUP CHECK · 自提订单" description={`请输入“${record?.title || '当前车辆'}”的顾客取货码。取货码只用于本次确认，不会保存到台账或操作记录。`} className="data-dialog">
      <form className="data-form" onSubmit={submit}>
        <label className="field-row">
          <span>顾客提供的取货码</span>
          <input data-autofocus required maxLength="40" autoComplete="off" inputMode="numeric" value={pickupCode} onChange={(event) => { setPickupCode(event.target.value); setError('') }} />
        </label>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="dialog-footer"><button type="button" className="secondary-action" onClick={onClose}>取消</button><button type="submit" className="primary-action" disabled={submitting}>{submitting ? '正在确认…' : '确认取车'}</button></div>
      </form>
    </AppDialog>
  )
}
