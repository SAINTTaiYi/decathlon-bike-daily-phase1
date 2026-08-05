import { useState } from 'react'

const tabs = [
  { id: 'role', label: '角色提权', en: 'ROLE REQUESTS' },
  { id: 'transfer', label: '调店申请', en: 'TRANSFER REQUESTS' }
]

function formatTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date)
}

export default function AdminApprovalsSection({ governance, shared }) {
  const [tab, setTab] = useState('role')
  if (!governance) return <section className="admin-panel"><h2>审批</h2><p className="admin-empty">暂无数据。</p></section>
  const roleRequests = governance.roleRequests || []
  const transferRequests = governance.transferRequests || []
  return (
    <section className="admin-panel">
      <header className="admin-panel-head"><h2>审批</h2><small>APPROVALS · 受审计决策</small></header>
      <div className="admin-tabs" role="tablist" aria-label="审批类型">
        {tabs.map(({ id, label, en }) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id ? 'true' : 'false'} data-active={tab === id ? 'true' : 'false'} onClick={() => setTab(id)}><span>{label}</span><small>{en}</small>{id === 'role' ? <b>{roleRequests.length}</b> : <b>{transferRequests.length}</b>}</button>
        ))}
      </div>
      {tab === 'role' ? <div className="admin-approval-list">
        {!roleRequests.length ? <p className="admin-empty">没有待审批的角色提权申请。</p> : null}
        {roleRequests.map((item) => (
          <article key={item.id} className="admin-approval-row">
            <div className="admin-approval-identity">
              <strong>{item.userName || '申请人'}</strong>
              <span>{item.storeCode} {item.storeName}</span>
              <span>{shared.roleLabels[item.fromRole] || item.fromRole} → {shared.roleLabels[item.targetRole] || item.targetRole}</span>
            </div>
            <div className="admin-approval-detail">
              <p>{item.reason}</p>
              <small>{formatTime(item.createdAt)} · 修订 {item.revision} · 截止 {formatTime(item.expiresAt)}</small>
            </div>
            <div className="admin-approval-actions">
              <button type="button" className="secondary-action" onClick={() => void shared.decideRole(item, false)}>拒绝</button>
              <button type="button" className="primary-action" onClick={() => void shared.decideRole(item, true)}>批准</button>
            </div>
          </article>
        ))}
      </div> : null}
      {tab === 'transfer' ? <div className="admin-approval-list">
        {!transferRequests.length ? <p className="admin-empty">没有待审批的调店申请。</p> : null}
        {transferRequests.map((item) => (
          <article key={item.id} className="admin-approval-row">
            <div className="admin-approval-identity">
              <strong>{item.userName || '申请人'}</strong>
              <span>{item.sourceStoreCode} {item.sourceStoreName} → {item.targetStoreCode} {item.targetStoreName}</span>
            </div>
            <div className="admin-approval-detail">
              <p>{item.reason}</p>
              <small>{formatTime(item.createdAt)} · 修订 {item.revision} · 截止 {formatTime(item.expiresAt)}</small>
            </div>
            <div className="admin-approval-actions">
              <button type="button" className="secondary-action" onClick={() => void shared.decideTransfer(item, false)}>拒绝</button>
              <button type="button" className="primary-action" onClick={() => void shared.decideTransfer(item, true)}>批准</button>
            </div>
          </article>
        ))}
      </div> : null}
    </section>
  )
}
