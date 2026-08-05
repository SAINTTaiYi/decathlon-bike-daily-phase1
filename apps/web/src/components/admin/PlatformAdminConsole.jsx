import { useCallback, useEffect, useMemo, useState } from 'react'
import IconOverview from '@iconoir/Home.mjs'
import IconStores from '@iconoir/Building.mjs'
import IconApprovals from '@iconoir/HandCard.mjs'
import IconDirectory from '@iconoir/MapPin.mjs'
import IconUsers from '@iconoir/User.mjs'
import IconAudit from '@iconoir/Journal.mjs'
import IconExit from '@iconoir/LogOut.mjs'
import { getAdminOverview, getAdminUsers, getAdminAuditHistory, getAdminStore, getAdminApprovals, adminCreateUser, adminToggleUserStatus, adminResetPassword, adminReviewStore } from '../../api/admin.js'
import { createDirectoryEntry, decideRoleChangeRequest, decideTransferRequest, getGovernanceOverview, updateDirectoryEntry } from '../../api/auth.js'
import AdminOverviewSection from './AdminOverviewSection.jsx'
import AdminStoresSection from './AdminStoresSection.jsx'
import AdminApprovalsSection from './AdminApprovalsSection.jsx'
import AdminDirectorySection from './AdminDirectorySection.jsx'
import AdminUsersSection from './AdminUsersSection.jsx'
import AdminAuditSection from './AdminAuditSection.jsx'

const roleLabels = { operator: '操作员', manager: '经理', admin: '管理员' }
const sections = [
  { id: 'overview', label: '总览', en: 'OVERVIEW', icon: IconOverview },
  { id: 'stores', label: '门店', en: 'STORES', icon: IconStores },
  { id: 'approvals', label: '审批', en: 'APPROVALS', icon: IconApprovals },
  { id: 'directory', label: '目录', en: 'DIRECTORY', icon: IconDirectory },
  { id: 'users', label: '用户', en: 'USERS', icon: IconUsers },
  { id: 'audit', label: '审计', en: 'AUDIT', icon: IconAudit }
]
function sectionFromHash() { const id = window.location.hash.match(/^#admin(?:\/([a-z]+))?/u)?.[1]; return sections.some((item) => item.id === id) ? id : 'overview' }
function storeIdFromHash() { return window.location.hash.match(/^#admin\/stores\/([A-Za-z0-9-]+)/u)?.[1] || '' }

export default function PlatformAdminConsole({ user, storeName, onExit, onNotify }) {
  const [section, setSectionState] = useState(sectionFromHash)
  const [selectedStoreId, setSelectedStoreId] = useState(storeIdFromHash)
  const [overview, setOverview] = useState(null)
  const [governance, setGovernance] = useState(null)
  const [initialBusy, setInitialBusy] = useState(true)
  const [error, setError] = useState('')

  const setSection = useCallback((next, storeId = '') => {
    setSectionState(next); setSelectedStoreId(storeId || '')
    const hash = next === 'overview' ? '#admin' : storeId ? `#admin/${next}/${storeId}` : `#admin/${next}`
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`)
    window.requestAnimationFrame(() => document.getElementById('admin-main')?.focus())
  }, [])

  useEffect(() => {
    const onHashChange = () => { const next = sectionFromHash(); setSectionState(next); setSelectedStoreId(next === 'stores' ? storeIdFromHash() : '') }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const refresh = useCallback(async ({ silent = false } = {}) => {
    const [overviewResult, governanceResult] = await Promise.allSettled([getAdminOverview(), getGovernanceOverview()])
    if (overviewResult.status === 'fulfilled') setOverview(overviewResult.value)
    if (governanceResult.status === 'fulfilled') setGovernance(governanceResult.value)
    const failures = [overviewResult, governanceResult].filter((result) => result.status === 'rejected')
    if (!silent && failures.length) {
      const detail = failures.map((result) => result.reason?.message).filter(Boolean).join('；')
      setError(detail || '部分平台数据读取失败；已保留成功加载的分区。')
    } else if (!failures.length) setError('')
    setInitialBusy(false)
    return failures.length === 0
  }, [])
  useEffect(() => { void refresh() }, [refresh])

  const mutateDirectory = useCallback(async (work) => {
    setError('')
    try {
      const result = await work()
      const refreshed = await refresh({ silent: true })
      onNotify?.(result?.message || '操作完成')
      if (!refreshed) setError('操作已完成，但平台数据刷新失败，请手动重新进入后台确认。')
      return result
    } catch (requestError) {
      setError(requestError.message || '操作失败。')
      throw requestError
    }
  }, [onNotify, refresh])

  const pendingTotal = (overview?.pending?.roleRequests || 0) + (overview?.pending?.transferRequests || 0) + (overview?.pending?.stores || 0)
  const activeStoreOptions = useMemo(() => (governance?.directory || []).flatMap((region) => region.cities.flatMap((city) => city.stores.filter((store) => store.status === 'active').map((store) => ({ value: store.id, label: `${region.name} / ${city.name} / ${store.code} ${store.name}` })))), [governance])
  const auditStoreOptions = useMemo(() => (governance?.directory || []).flatMap((region) => region.cities.flatMap((city) => city.stores.map((store) => ({ value: store.id, label: `${region.name} / ${city.name} / ${store.code} ${store.name}${store.status === 'pending' ? '（待审核）' : ''}` })))), [governance])
  const shared = useMemo(() => ({
    roleLabels,
    decideRole: (item, approve, reason) => decideRoleChangeRequest(item.id, { approve, reason: reason || (approve ? 'CHU13 已批准' : 'CHU13 已拒绝'), expectedRevision: item.revision }),
    decideTransfer: (item, approve, reason) => decideTransferRequest(item.id, { approve, reason: reason || (approve ? 'CHU13 已批准' : 'CHU13 已拒绝'), expectedRevision: item.revision }),
    createDirectory: (kind, body) => mutateDirectory(() => createDirectoryEntry(kind, body)),
    updateDirectory: (kind, id, body) => mutateDirectory(() => updateDirectoryEntry(kind, id, body)),
    getUsers: getAdminUsers, getAudit: getAdminAuditHistory, getApprovals: getAdminApprovals, getStore: getAdminStore,
    createUser: adminCreateUser, toggleUserStatus: adminToggleUserStatus, resetPassword: adminResetPassword, reviewStore: adminReviewStore,
    refreshSummary: () => refresh({ silent: true }), notify: onNotify
  }), [mutateDirectory, onNotify, refresh])

  return (
    <div className="admin-console" data-admin-section={section}>
      <header className="admin-header">
        <div className="admin-header-brand"><span>PLATFORM ADMIN</span><strong>CHU13 平台管理</strong></div>
        <div className="admin-header-context"><span>{storeName}</span><strong>{user}</strong></div>
        <button type="button" className="admin-header-exit" onClick={onExit}><IconExit width={20} height={20} aria-hidden="true" /><span>返回工作台</span></button>
      </header>
      <div className="admin-body">
        <nav className="admin-rail" aria-label="平台管理分区">
          {sections.map(({ id, label, en, icon: Icon }) => <button key={id} type="button" className="admin-rail-item" data-active={section === id ? 'true' : 'false'} onClick={() => setSection(id)} aria-current={section === id ? 'page' : undefined} aria-controls="admin-main"><Icon width={22} height={22} aria-hidden="true" /><span className="admin-rail-label"><strong>{label}</strong><small>{en}</small></span>{id === 'approvals' && pendingTotal > 0 ? <span className="admin-rail-badge">{pendingTotal}</span> : null}{id === 'stores' && overview?.counts?.storesPending > 0 ? <span className="admin-rail-badge">{overview.counts.storesPending}</span> : null}</button>)}
        </nav>
        <main className="admin-region" id="admin-main" tabIndex="-1">
          {initialBusy ? <p className="admin-status" role="status">正在读取平台数据…</p> : null}
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          {section === 'overview' ? <AdminOverviewSection overview={overview} onJump={setSection} roleLabels={roleLabels} /> : null}
          {section === 'stores' ? <AdminStoresSection directory={governance?.directory || []} shared={shared} selectedStoreId={selectedStoreId} onSelect={(storeId) => setSection('stores', storeId)} /> : null}
          {section === 'approvals' ? <AdminApprovalsSection shared={shared} directory={governance?.directory || []} /> : null}
          {section === 'directory' ? <AdminDirectorySection governance={governance} shared={shared} onViewStore={(storeId) => setSection('stores', storeId)} /> : null}
          {section === 'users' ? <AdminUsersSection shared={shared} stores={activeStoreOptions} /> : null}
          {section === 'audit' ? <AdminAuditSection shared={shared} stores={auditStoreOptions} /> : null}
        </main>
      </div>
      <nav className="admin-dock" aria-label="平台管理移动端导航">{sections.map(({ id, label, icon: Icon }) => <button key={id} type="button" className="admin-dock-item" data-active={section === id ? 'true' : 'false'} onClick={() => setSection(id)} aria-current={section === id ? 'page' : undefined} aria-controls="admin-main"><Icon width={22} height={22} aria-hidden="true" /><span>{label}</span>{id === 'approvals' && pendingTotal > 0 ? <b className="admin-dock-badge">{pendingTotal > 99 ? '99+' : pendingTotal}</b> : null}{id === 'stores' && overview?.counts?.storesPending > 0 ? <b className="admin-dock-badge">{overview.counts.storesPending}</b> : null}</button>)}</nav>
    </div>
  )
}
