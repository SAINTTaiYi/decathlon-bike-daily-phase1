import { useCallback, useEffect, useMemo, useState } from 'react'
import IconOverview from '@iconoir/Home.mjs'
import IconApprovals from '@iconoir/HandCard.mjs'
import IconDirectory from '@iconoir/MapPin.mjs'
import IconUsers from '@iconoir/User.mjs'
import IconAudit from '@iconoir/Journal.mjs'
import IconExit from '@iconoir/LogOut.mjs'
import { getAdminOverview, getAdminUsers, getAdminAuditHistory } from '../../api/admin.js'
import {
  createDirectoryEntry,
  decideRoleChangeRequest,
  decideTransferRequest,
  getGovernanceOverview,
  updateDirectoryEntry
} from '../../api/auth.js'
import AdminOverviewSection from './AdminOverviewSection.jsx'
import AdminApprovalsSection from './AdminApprovalsSection.jsx'
import AdminDirectorySection from './AdminDirectorySection.jsx'
import AdminUsersSection from './AdminUsersSection.jsx'
import AdminAuditSection from './AdminAuditSection.jsx'

const roleLabels = { operator: '操作员', manager: '经理', admin: '管理员' }

const sections = [
  { id: 'overview', label: '总览', en: 'OVERVIEW', icon: IconOverview },
  { id: 'approvals', label: '审批', en: 'APPROVALS', icon: IconApprovals },
  { id: 'directory', label: '目录', en: 'DIRECTORY', icon: IconDirectory },
  { id: 'users', label: '用户', en: 'USERS', icon: IconUsers },
  { id: 'audit', label: '审计', en: 'AUDIT', icon: IconAudit }
]

function sectionFromHash() {
  const match = window.location.hash.match(/^#admin(?:\/([a-z]+))?/u)
  const id = match?.[1]
  return sections.some((section) => section.id === id) ? id : 'overview'
}

export default function PlatformAdminConsole({ user, storeName, onExit, onNotify }) {
  const [section, setSectionState] = useState(sectionFromHash)
  const [overview, setOverview] = useState(null)
  const [governance, setGovernance] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const setSection = useCallback((next) => {
    setSectionState(next)
    const hash = next === 'overview' ? '#admin' : `#admin/${next}`
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`)
  }, [])

  useEffect(() => {
    const onHashChange = () => {
      const next = sectionFromHash()
      setSectionState((current) => (current === next ? current : next))
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const refresh = useCallback(async () => {
    setBusy(true); setError('')
    try {
      const [nextOverview, nextGovernance] = await Promise.all([getAdminOverview(), getGovernanceOverview()])
      setOverview(nextOverview); setGovernance(nextGovernance)
    } catch (requestError) {
      setError(requestError.message || '无法读取平台数据。')
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const act = useCallback(async (work) => {
    setBusy(true); setError('')
    try {
      const result = await work()
      onNotify?.(result?.message || '操作完成')
      await refresh()
    } catch (requestError) {
      setError(requestError.message || '操作失败。')
    } finally {
      setBusy(false)
    }
  }, [onNotify, refresh])

  const pendingTotal = (overview?.pending?.roleRequests || 0) + (overview?.pending?.transferRequests || 0)

  const shared = useMemo(() => ({
    roleLabels,
    decideRole: (item, approve) => act(() => decideRoleChangeRequest(item.id, { approve, reason: approve ? 'CHU13 已批准' : 'CHU13 已拒绝', expectedRevision: item.revision })),
    decideTransfer: (item, approve) => act(() => decideTransferRequest(item.id, { approve, reason: approve ? 'CHU13 已批准' : 'CHU13 已拒绝', expectedRevision: item.revision })),
    createDirectory: (kind, body) => act(() => createDirectoryEntry(kind, body)),
    updateDirectory: (kind, id, body) => act(() => updateDirectoryEntry(kind, id, body)),
    getUsers: (q, signal) => getAdminUsers(q, signal),
    getAudit: (filters, signal) => getAdminAuditHistory(filters, signal)
  }), [act])

  return (
    <div className="admin-console" data-admin-section={section}>
      <header className="admin-header">
        <div className="admin-header-brand"><span>PLATFORM ADMIN</span><strong>CHU13 平台管理</strong></div>
        <div className="admin-header-context"><span>{storeName}</span><strong>{user}</strong></div>
        <button type="button" className="admin-header-exit" onClick={onExit}><IconExit width={20} height={20} aria-hidden="true" /><span>返回工作台</span></button>
      </header>
      <div className="admin-body">
        <nav className="admin-rail" aria-label="平台管理分区">
          {sections.map(({ id, label, en, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className="admin-rail-item"
              data-active={section === id ? 'true' : 'false'}
              onClick={() => setSection(id)}
              aria-current={section === id ? 'page' : undefined}
            >
              <Icon width={22} height={22} aria-hidden="true" />
              <span className="admin-rail-label"><strong>{label}</strong><small>{en}</small></span>
              {id === 'approvals' && pendingTotal > 0 ? <span className="admin-rail-badge">{pendingTotal}</span> : null}
            </button>
          ))}
        </nav>
        <main className="admin-region" id="admin-main" tabIndex="-1">
          {busy && !overview ? <p className="admin-status" role="status">正在读取平台数据…</p> : null}
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          {section === 'overview' ? <AdminOverviewSection overview={overview} governance={governance} onJump={setSection} roleLabels={roleLabels} /> : null}
          {section === 'approvals' ? <AdminApprovalsSection governance={governance} shared={shared} /> : null}
          {section === 'directory' ? <AdminDirectorySection governance={governance} shared={shared} /> : null}
          {section === 'users' ? <AdminUsersSection shared={shared} /> : null}
          {section === 'audit' ? <AdminAuditSection shared={shared} /> : null}
        </main>
      </div>
    </div>
  )
}
