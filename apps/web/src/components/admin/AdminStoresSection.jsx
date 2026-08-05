import { useEffect, useRef, useState } from 'react'

const kindLabels = { pickup: '待取', handover: '交接', repair: '维修', resale: '二手' }
const roleLabels = { operator: '操作员', manager: '经理', admin: '管理员' }
const statusLabels = { active: '生效', pending: '待审核', disabled: '停用' }

function flattenStores(directory = []) {
  return directory.flatMap((region) => region.cities.flatMap((city) => city.stores.map((store) => ({
    ...store,
    cityName: city.name,
    regionName: region.name
  }))))
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

export default function AdminStoresSection({ directory, shared, selectedStoreId, onSelect, onNotify }) {
  const [query, setQuery] = useState('')
  const [store, setStore] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const activeRef = useRef(true)

  const allStores = flattenStores(directory)
  const filtered = allStores.filter((item) => {
    const q = query.trim().toLocaleLowerCase('zh-CN')
    if (!q) return true
    return item.name.toLocaleLowerCase('zh-CN').includes(q) || item.code.toLocaleLowerCase('zh-CN').includes(q) || item.regionName.toLocaleLowerCase('zh-CN').includes(q) || item.cityName.toLocaleLowerCase('zh-CN').includes(q)
  }).sort((a, b) => (a.status === b.status ? a.code.localeCompare(b.code) : (a.status === 'active' ? -1 : b.status === 'active' ? 1 : 0)))

  useEffect(() => {
    activeRef.current = true
    return () => { activeRef.current = false }
  }, [])

  useEffect(() => {
    if (!selectedStoreId) { setStore(null); return }
    let cancelled = false
    setBusy(true); setError('')
    shared.getStore(selectedStoreId).then((result) => {
      if (!cancelled && activeRef.current) setStore(result)
    }).catch((requestError) => {
      if (!cancelled && activeRef.current) setError(requestError.message || '无法读取门店详情。')
    }).finally(() => {
      if (!cancelled && activeRef.current) setBusy(false)
    })
    return () => { cancelled = true }
  }, [selectedStoreId])

  return (
    <section className="admin-panel">
      <header className="admin-panel-head"><h2>门店</h2><small>STORES · 组织架构与成员</small></header>
      <div className="admin-toolbar" role="search">
        <label><span className="sr-only">搜索门店</span><input type="search" placeholder="搜索门店代码 / 名称 / 区域 / 城市" maxLength="80" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      </div>
      <div className="admin-stores-layout">
        <div className="admin-stores-list">
          {!filtered.length ? <p className="admin-empty">没有匹配的门店。</p> : null}
          {filtered.map((item) => (
            <button key={item.id} type="button" className="admin-store-card" data-active={selectedStoreId === item.id ? 'true' : 'false'} data-status={item.status} onClick={() => onSelect(item.id)}>
              <span className="admin-store-card-head"><strong>{item.code} {item.name}</strong><span className="admin-status-tag" data-status={item.status}>{statusLabels[item.status] || item.status}</span></span>
              <span className="admin-store-card-path">{item.regionName} / {item.cityName}</span>
            </button>
          ))}
        </div>
        <div className="admin-stores-detail">
          {busy && !store ? <p className="admin-status" role="status">正在读取门店详情…</p> : null}
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          {!store && !busy && !error ? <p className="admin-empty">从左侧选择门店查看组织架构、成员与业务概览。</p> : null}
          {store ? <StoreDetail store={store} shared={shared} onNotify={onNotify} roleLabels={roleLabels} kindLabels={kindLabels} /> : null}
        </div>
      </div>
    </section>
  )
}

function StoreDetail({ store, shared, onNotify, roleLabels, kindLabels }) {
  const { store: info, path, members, overview } = store
  return (
    <div className="admin-store-detail">
      <header className="admin-store-detail-head">
        <div>
          <h3>{info.code} {info.name}</h3>
          <p>{path ? `${path.regionName} / ${path.cityName}` : '组织路径未知'} · {info.timezone}</p>
        </div>
        <span className="admin-status-tag" data-status={info.status}>{statusLabels[info.status] || info.status}</span>
      </header>
      <div className="admin-store-metrics">
        <div className="admin-store-metric"><span>成员数</span><strong>{overview.memberCount}</strong></div>
        <div className="admin-store-metric"><span>今日闭店</span><strong data-semantic={overview.closedToday ? 'success' : 'muted'}>{overview.closedToday ? '已闭店' : '未闭店'}</strong></div>
        {Object.entries(kindLabels).map(([kind, label]) => (
          <div key={kind} className="admin-store-metric"><span>今日{label}</span><strong>{overview.todayItems?.[kind] || 0}</strong></div>
        ))}
      </div>
      <h4 className="admin-store-members-title">成员 · {overview.memberCount}</h4>
      {!members?.length ? <p className="admin-empty">暂无成员。</p> : null}
      <div className="admin-store-members">
        {members.map((member) => (
          <div key={member.id} className="admin-store-member">
            <span className="admin-store-member-id"><strong>{member.displayName}</strong>{member.isPlatformAdmin ? <span className="admin-platform-badge">平台管理员</span> : null}</span>
            <span className="admin-username">{member.username}</span>
            <span className="admin-role-tag">{roleLabels[member.role] || member.role}</span>
            <span className="admin-store-member-meta">最近登录 {formatDate(member.lastLoginAt)}</span>
          </div>
        ))}
      </div>
      <p className="admin-store-note">角色调整需通过审批流：门店管理员发起申请，CHU13 批准后生效。</p>
    </div>
  )
}
