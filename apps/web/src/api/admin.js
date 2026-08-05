import { api } from './client.js'

export const getAdminOverview = (signal) => api('/api/v1/admin/overview', { signal })

export const getAdminUsers = (filters = {}, signal) => {
  const params = new URLSearchParams()
  if (filters.q) params.set('q', filters.q)
  if (filters.storeId) params.set('storeId', filters.storeId)
  const qs = params.toString()
  return api(`/api/v1/admin/users${qs ? `?${qs}` : ''}`, { signal })
}

export const getAdminAuditHistory = (filters = {}, signal) => {
  const params = new URLSearchParams()
  if (filters.date) params.set('date', filters.date)
  if (filters.module && filters.module !== 'all') params.set('module', filters.module)
  if (filters.storeId) params.set('storeId', filters.storeId)
  if (filters.actor) params.set('actor', filters.actor)
  if (filters.action) params.set('action', filters.action)
  if (filters.cursor) params.set('cursor', filters.cursor)
  if (filters.limit) params.set('limit', String(filters.limit))
  const qs = params.toString()
  return api(`/api/v1/admin/audit-events${qs ? `?${qs}` : ''}`, { signal })
}

export const getAdminStore = (storeId, signal) => api(`/api/v1/admin/stores/${encodeURIComponent(storeId)}`, { signal })

export const getAdminApprovals = (filters = {}, signal) => {
  const params = new URLSearchParams()
  params.set('type', filters.type || 'role')
  params.set('group', filters.group || 'pending')
  if (filters.cursor) params.set('cursor', filters.cursor)
  if (filters.limit) params.set('limit', String(filters.limit))
  return api(`/api/v1/admin/approvals?${params.toString()}`, { signal })
}

export const getAdminPendingCount = (signal) => api('/api/v1/admin/pending-count', { signal })

export const adminCreateUser = (body) => api('/api/v1/admin/users', { method: 'POST', body })

export const adminToggleUserStatus = (id, status) => api(`/api/v1/admin/users/${encodeURIComponent(id)}`, { method: 'PATCH', body: { status } })

export const adminResetPassword = (id) => api(`/api/v1/admin/users/${encodeURIComponent(id)}/reset-password`, { method: 'POST', body: {} })

export const adminReviewStore = (id, body) => api(`/api/v1/admin/stores/${encodeURIComponent(id)}/decision`, { method: 'POST', body })
