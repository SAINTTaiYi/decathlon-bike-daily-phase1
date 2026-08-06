import { useState } from 'react'

const kindLabels = { pickup: '待取', handover: '交接', repair: '维修', resale: '二手' }
const moduleLabels = { sales: '销售', closing: '闭店', pickup: '待取', repair: '维修', resale: '二手', handover: '交接', account: '账号', system: '系统' }
const changeTypeLabels = { 'new-store': '新增门店', 'new-user': '新增用户', 'role-approved': '角色批准', 'transfer-approved': '调店批准' }

function formatTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date)
}

export default function AdminOverviewSection({ overview, onJump, roleLabels }) {
  const [period, setPeriod] = useState('d7')
  if (!overview) return <section className="admin-panel"><h2>平台总览</h2><p className="admin-empty">暂无数据。</p></section>
  const { counts, pending, today, periods, recentChanges, recentAudit } = overview
  const roleStats = periods?.roleChanges?.[period]?.byStore || []
  const statLanes = [
    { label: '生效门店', en: 'STORES', value: counts.stores, hint: `待审核 ${counts.storesPending} · 停用 ${counts.storesDisabled}`, jump: 'directory' },
    { label: '待审批', en: 'PENDING', value: pending.roleRequests + pending.transferRequests + pending.stores, hint: `提权 ${pending.roleRequests} · 调店 ${pending.transferRequests} · 门店 ${pending.stores}`, accent: true, jump: 'approvals' },
    { label: '生效用户', en: 'USERS', value: counts.users, hint: counts.membersByRole ? Object.entries(counts.membersByRole).map(([role, n]) => `${roleLabels?.[role] || role} ${n}`).join(' · ') : '', jump: 'users' },
    { label: '区域 / 城市', en: 'DIRECTORY', value: `${counts.regions} / ${counts.cities}`, hint: '区域 / 城市', jump: 'directory' }
  ]
  const todayStats = [
    { label: '今日新增门店', value: today.newStores, jump: 'directory' },
    { label: '今日新增用户', value: today.newUsers, jump: 'users' },
    { label: '今日角色批准', value: today.roleApproved, jump: 'approvals' },
    { label: '今日调店批准', value: today.transferApproved, jump: 'approvals' }
  ]
  return (
    <section className="admin-panel">
      <header className="admin-panel-head"><h2>平台总览</h2><small>PLATFORM OVERVIEW</small></header>
      <div className="admin-stat-lanes">
        {statLanes.map((stat) => (
          <button key={stat.en} type="button" className="admin-stat admin-stat-link" data-accent={stat.accent ? 'true' : 'false'} onClick={() => onJump(stat.jump)}>
            <span className="admin-stat-label">{stat.label}<small>{stat.en}</small></span>
            <strong className="admin-stat-value">{stat.value}</strong>
            <span className="admin-stat-hint">{stat.hint}</span>
          </button>
        ))}
      </div>
      <section className="admin-card admin-card-today">
        <header><h3>今日变化</h3><small>TODAY</small></header>
        <div className="admin-today-lanes">
          {todayStats.map((stat) => (
            <button key={stat.label} type="button" className="admin-today-item" onClick={() => onJump(stat.jump)}>
              <span>{stat.label}</span><strong>{stat.value}</strong>
            </button>
          ))}
          <div className="admin-today-item" data-static="true">
            <span>今日工单</span><strong>{Object.values(today.items || {}).reduce((sum, n) => sum + n, 0)}</strong>
            <small>{Object.entries(kindLabels).map(([kind, label]) => `${label} ${today.items?.[kind] || 0}`).join(' · ')}</small>
          </div>
        </div>
      </section>
      <div className="admin-overview-grid">
        <section className="admin-card">
          <header><h3>新增与权限变更</h3><small>{period === 'd7' ? '近 7 天' : '近 30 天'}</small>
            <span className="admin-segmented" role="group" aria-label="统计周期">
              <button type="button" data-active={period === 'd7' ? 'true' : 'false'} onClick={() => setPeriod('d7')}>7 天</button>
              <button type="button" data-active={period === 'd30' ? 'true' : 'false'} onClick={() => setPeriod('d30')}>30 天</button>
            </span>
          </header>
          <div className="admin-period-summary">
            <div className="admin-kind-row"><span>新增门店</span><strong>{periods?.newStores?.[period] || 0}</strong></div>
            <div className="admin-kind-row"><span>新增用户</span><strong>{periods?.newUsers?.[period] || 0}</strong></div>
            <div className="admin-kind-row"><span>权限变更</span><strong>{periods?.roleChanges?.[period]?.total || 0}</strong></div>
          </div>
          {roleStats.length ? <div className="admin-role-stats">
            <div className="admin-role-stats-head"><span>门店</span><span>发起</span><span>批准</span><span>拒绝</span></div>
            {roleStats.map((row) => (
              <button key={row.storeCode} type="button" className="admin-role-stat-row" onClick={() => onJump('directory')}>
                <span>{row.storeCode} {row.storeName}</span><span>{row.initiated}</span><span data-semantic="success">{row.approved}</span><span data-semantic="danger">{row.rejected}</span>
              </button>
            ))}
          </div> : <p className="admin-empty">周期内暂无权限变更。</p>}
        </section>
        <section className="admin-card">
          <header><h3>变化流</h3><small>RECENT CHANGES</small></header>
          {recentChanges?.length ? <ol className="admin-change-list">
            {recentChanges.map((change, index) => (
              <li key={`${change.type}-${change.id}-${index}`}>
                <button type="button" onClick={() => onJump(change.type === 'new-user' ? 'users' : change.type === 'new-store' ? 'stores' : 'approvals')}>
                  <time dateTime={change.at}>{formatTime(change.at)}</time>
                  <span className="admin-module-tag">{changeTypeLabels[change.type] || change.type}</span>
                  <span>{change.title}</span>
                </button>
              </li>
            ))}
          </ol> : <p className="admin-empty">暂无变化。</p>}
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
