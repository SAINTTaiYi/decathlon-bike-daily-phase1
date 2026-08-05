const kindLabels = { pickup: '待取', handover: '交接', repair: '维修', resale: '二手' }
const moduleLabels = { sales: '销售', closing: '闭店', pickup: '待取', repair: '维修', resale: '二手', handover: '交接', account: '账号', system: '系统' }

function formatTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date)
}

export default function AdminOverviewSection({ overview, governance, onJump, roleLabels }) {
  if (!overview) return <section className="admin-panel"><h2>平台总览</h2><p className="admin-empty">暂无数据。</p></section>
  const { counts, pending, todayItems, recentAudit } = overview
  const stats = [
    { label: '生效门店', en: 'STORES', value: counts.stores, hint: `停用 ${counts.storesDisabled}` },
    { label: '生效用户', en: 'USERS', value: counts.users, hint: counts.membersByRole ? Object.entries(counts.membersByRole).map(([role, n]) => `${roleLabels?.[role] || role} ${n}`).join(' · ') : '' },
    { label: '区域 / 城市', en: 'DIRECTORY', value: `${counts.regions} / ${counts.cities}`, hint: '区域 / 城市' },
    { label: '待审批', en: 'PENDING', value: pending.roleRequests + pending.transferRequests, hint: `提权 ${pending.roleRequests} · 调店 ${pending.transferRequests}`, accent: true }
  ]
  return (
    <section className="admin-panel">
      <header className="admin-panel-head"><h2>平台总览</h2><small>PLATFORM OVERVIEW</small></header>
      <div className="admin-stat-lanes">
        {stats.map((stat) => (
          <div key={stat.en} className="admin-stat" data-accent={stat.accent ? 'true' : 'false'}>
            <span className="admin-stat-label">{stat.label}<small>{stat.en}</small></span>
            <strong className="admin-stat-value">{stat.value}</strong>
            <span className="admin-stat-hint">{stat.hint}</span>
          </div>
        ))}
      </div>
      <div className="admin-overview-grid">
        <section className="admin-card">
          <header><h3>今日工单</h3><small>TODAY</small></header>
          <div className="admin-kind-rows">
            {Object.entries(kindLabels).map(([kind, label]) => (
              <div key={kind} className="admin-kind-row"><span>{label}</span><strong>{todayItems?.[kind] || 0}</strong></div>
            ))}
          </div>
        </section>
        <section className="admin-card">
          <header><h3>待办队列</h3><small>QUEUE</small></header>
          <ol className="admin-queue-list">
            <li><button type="button" onClick={() => onJump('approvals')}><span>角色提权</span><strong>{pending.roleRequests}</strong></button></li>
            <li><button type="button" onClick={() => onJump('approvals')}><span>调店申请</span><strong>{pending.transferRequests}</strong></button></li>
            <li><button type="button" onClick={() => onJump('users')}><span>用户与成员</span><strong>{counts.users}</strong></button></li>
          </ol>
          {governance?.actor?.isPlatformAdmin === false ? <p className="admin-empty">当前账号不是平台管理员，仅可查看门店治理数据。</p> : null}
        </section>
        <section className="admin-card admin-card-wide">
          <header><h3>最近平台事件</h3><small>RECENT AUDIT</small></header>
          {recentAudit?.length ? <ul className="admin-audit-strip">
            {recentAudit.map((event) => (
              <li key={event.id}><time dateTime={event.createdAt}>{formatTime(event.createdAt)}</time><span className="admin-module-tag">{moduleLabels[event.auditModule] || event.auditModule}</span><strong>{event.storeCode}</strong><span>{event.summary}</span></li>
            ))}
          </ul> : <p className="admin-empty">暂无事件。</p>}
        </section>
      </div>
    </section>
  )
}
