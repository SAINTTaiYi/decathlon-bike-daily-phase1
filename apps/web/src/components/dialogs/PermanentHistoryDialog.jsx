import { useEffect, useState } from 'react'
import IconJournal from '@iconoir/Journal.mjs'
import EventAuditMeta from '../EventAuditMeta.jsx'
import ProjectSelect from '../ProjectSelect.jsx'
import AppDialog from './AppDialog.jsx'
import DatePickerField from '../fields/DatePickerField.jsx'

const moduleOptions = [
  { value: 'all', label: '全部模块' },
  { value: 'sales', label: '销售' },
  { value: 'closing', label: '闭店' },
  { value: 'pickup', label: '待取' },
  { value: 'repair', label: '维修' },
  { value: 'resale', label: '二手车' },
  { value: 'handover', label: '交接' },
  { value: 'account', label: '账号管理' },
  { value: 'system', label: '系统' }
]

function formatTime(value) {
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

export default function PermanentHistoryDialog({ open, onClose, onLoad, onUndo, canUndo, onNotify }) {
  const [date, setDate] = useState('')
  const [module, setModule] = useState('all')
  const [events, setEvents] = useState([])
  const [nextCursor, setNextCursor] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = async ({ append = false, cursor = '' } = {}) => {
    setBusy(true)
    setError('')
    const result = await onLoad({ date, module, cursor })
    if (!result?.ok) {
      setError(result?.error || '无法读取永久操作记录。')
    } else {
      setEvents((current) => append ? [...current, ...result.events] : result.events)
      setNextCursor(result.nextCursor)
    }
    setBusy(false)
  }

  useEffect(() => {
    if (open) void load()
    else {
      setEvents([])
      setNextCursor(null)
      setError('')
    }
  // Deliberately only react to opening. Filters apply on explicit query submission.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const submit = (event) => { event.preventDefault(); void load() }
  const undo = async (event) => {
    const result = await onUndo(event)
    if (!result?.ok) return onNotify?.({ message: result?.error || '撤回失败。', tone: 'error' })
    onNotify?.(`已撤回：${event.label}`)
    void load()
  }

  return (
    <AppDialog open={open} onClose={onClose} title="永久操作历史" eyebrow="ARCHIVE · 永久审计" description="所有模块的正式操作永久保存在数据库中。跨日后主界面会清理已完成业务，但这里的审计记录不会被删除。" className="history-archive-dialog">
      <form className="history-filters" onSubmit={submit}>
        <div className="field-row"><span>日期</span><DatePickerField value={date} onChange={setDate} placeholder="全部日期" clearable ariaLabel="按日期筛选操作记录" /></div>
        <label><span>模块</span><ProjectSelect value={module} options={moduleOptions} onChange={setModule} ariaLabel="选择审计模块" compact /></label>
        <button type="submit" className="primary-action" disabled={busy}>{busy ? '查询中…' : '筛选记录'}</button>
      </form>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {events.length ? <ol className="event-log operation-history permanent-history">
        {events.map((event) => <li key={event.id} data-undone={event.undoneAt ? 'true' : undefined}>
          <time dateTime={event.at}>{formatTime(event.at)}</time>
          <span><EventAuditMeta event={event} /><strong>{event.label}</strong><small>{event.undoneAt ? '该操作已撤回' : event.message}</small></span>
          {canUndo(event) ? <button type="button" className="history-undo" onClick={() => void undo(event)}>撤回</button> : null}
        </li>)}
      </ol> : !busy && !error ? <div className="dialog-empty"><IconJournal width={28} aria-hidden="true" /><strong>没有匹配的操作记录</strong><p>调整日期或模块后重新查询。新产生的销售、闭店、台账和账号操作都会永久归档。</p></div> : null}
      {nextCursor ? <button type="button" className="secondary-action history-load-more" disabled={busy} onClick={() => void load({ append: true, cursor: nextCursor })}>{busy ? '正在加载…' : '加载更早记录'}</button> : null}
    </AppDialog>
  )
}
