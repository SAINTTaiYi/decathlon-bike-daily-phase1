import { useEffect, useRef, useState } from 'react'
import ProjectSelect from '../ProjectSelect.jsx'

const moduleOptions = [
  { value: 'all', label: '全部模块' },
  { value: 'sales', label: '销售' },
  { value: 'closing', label: '闭店' },
  { value: 'pickup', label: '待取' },
  { value: 'repair', label: '维修' },
  { value: 'resale', label: '二手' },
  { value: 'handover', label: '交接' },
  { value: 'account', label: '账号' },
  { value: 'system', label: '系统' }
]

function formatTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date)
}

export default function AdminAuditSection({ shared }) {
  const [date, setDate] = useState('')
  const [module, setModule] = useState('all')
  const [events, setEvents] = useState(null)
  const [nextCursor, setNextCursor] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const activeRef = useRef(true)

  const load = async (filters, append = false) => {
    setBusy(true); setError('')
    try {
      const result = await shared.getAudit(filters)
      if (!activeRef.current) return
      setEvents((current) => append && current ? [...current, ...result.events] : result.events)
      setNextCursor(result.nextCursor)
    } catch (requestError) {
      if (activeRef.current) setError(requestError.message || '无法读取审计事件。')
    } finally {
      if (activeRef.current) setBusy(false)
    }
  }

  useEffect(() => {
    activeRef.current = true
    void load({})
    return () => { activeRef.current = false }
  }, [])

  const applyFilters = (event) => {
    event.preventDefault()
    void load({ date: date || undefined, module })
  }
  const loadMore = () => {
    if (nextCursor) void load({ date: date || undefined, module, cursor: nextCursor }, true)
  }

  return (
    <section className="admin-panel">
      <header className="admin-panel-head"><h2>平台审计</h2><small>AUDIT · 全平台事件（只读）</small></header>
      <form className="admin-toolbar" onSubmit={applyFilters}>
        <label><span className="sr-only">业务日期</span><input type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={(event) => setDate(event.target.value)} /></label>
        <label className="admin-module-select"><span className="sr-only">模块</span><ProjectSelect value={module} options={moduleOptions} onChange={setModule} ariaLabel="选择审计模块" /></label>
        <button type="submit" className="secondary-action">筛选</button>
        {busy ? <span className="admin-inline-status" role="status">读取中…</span> : null}
      </form>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {!events && !error && !busy ? <p className="admin-empty">正在读取审计事件…</p> : null}
      {events?.length ? <div className="admin-table-wrap">
        <table className="admin-table admin-table-audit">
          <thead><tr><th>时间</th><th>门店</th><th>操作人</th><th>模块</th><th>摘要</th><th>业务日期</th></tr></thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id}>
                <td><time dateTime={event.createdAt}>{formatTime(event.createdAt)}</time></td>
                <td><span className="admin-store-code">{event.storeCode || '—'}</span> {event.storeName || ''}</td>
                <td>{event.actorNameSnapshot || '—'}</td>
                <td><span className="admin-module-tag">{moduleOptions.find((option) => option.value === event.auditModule)?.label || event.auditModule || '—'}</span></td>
                <td className="admin-summary-cell">{event.summary}</td>
                <td>{event.businessDate || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {nextCursor ? <button type="button" className="secondary-action admin-load-more" onClick={loadMore} disabled={busy}>加载更多</button> : null}
      </div> : null}
      {events && !events.length ? <p className="admin-empty">没有匹配的审计事件。</p> : null}
    </section>
  )
}
