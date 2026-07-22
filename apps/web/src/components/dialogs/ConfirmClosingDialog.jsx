import { useState } from 'react'
import IconCheckCircle from '@iconoir-solid/CheckCircle.mjs'
import AppDialog from './AppDialog.jsx'

export default function ConfirmClosingDialog({ open, onClose, onConfirm }) {
  const [submitting, setSubmitting] = useState(false)
  const confirm = async () => {
    setSubmitting(true)
    await onConfirm()
    setSubmitting(false)
  }
  return (
    <AppDialog open={open} onClose={onClose} title="确认完成闭店" eyebrow="FINAL CHECK · 最终确认" description="今天的销售数据已经填写，这是当前唯一的闭店要求。">
      <div className="closing-confirm-mark"><IconCheckCircle width={44} height={44} aria-hidden="true" /><strong>READY</strong><span>维修、待取、二手车和其它交接事项不要求每天编辑；没有变化时会延续到下一日期。</span></div>
      <div className="dialog-footer"><button type="button" className="secondary-action" onClick={onClose} disabled={submitting}>返回检查</button><button type="button" className="primary-action" onClick={confirm} disabled={submitting} data-processing={submitting ? 'true' : undefined} aria-busy={submitting || undefined}>{submitting ? <><IconCheckCircle width={15} height={15} aria-hidden="true" />确认中…</> : '确认闭店'}</button></div>
    </AppDialog>
  )
}
