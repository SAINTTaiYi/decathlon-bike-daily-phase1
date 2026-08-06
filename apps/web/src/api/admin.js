import { api } from './client.js'

export const getAdminOverview = (signal) => api('/api/v1/admin/overview', { signal })

export const getAdminUsers = (filters = {}, signal) => {
  const params = new URLSearchParams()
  if (filters.q) params.set('q', filters.q)
  if (filters.storeId) params.set('storeId', filters.storeId)
  if (filters.cursor) params.set('cursor', filters.cursor)
  if (filters.limit) params.set('limit', String(filters.limit))
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
export const adminCreateUser = (body, requestKey) => api('/api/v1/admin/users', { method: 'POST', body, idempotencyKey: requestKey })
export const adminToggleUserStatus = (user, status) => api(`/api/v1/admin/users/${encodeURIComponent(user.id)}`, {
  method: 'PATCH', body: { status, expectedStatus: user.status, expectedUpdatedAt: user.updatedAt }
})
export const adminResetPassword = (user, resetKey) => api(`/api/v1/admin/users/${encodeURIComponent(user.id)}/reset-password`, {
  method: 'POST', body: { expectedUpdatedAt: user.updatedAt }, idempotencyKey: resetKey
})
export const adminReviewStore = (store, body) => api(`/api/v1/admin/stores/${encodeURIComponent(store.id)}/decision`, {
  method: 'POST', body: { ...body, expectedUpdatedAt: store.updatedAt }
})

export const adminUpdateStoreMember = (storeId, userId, body) => api(`/api/v1/admin/stores/${encodeURIComponent(storeId)}/members/${encodeURIComponent(userId)}`, { method: 'PATCH', body })
export const adminRemoveStoreMember = (storeId, userId, body) => api(`/api/v1/admin/stores/${encodeURIComponent(storeId)}/members/${encodeURIComponent(userId)}`, { method: 'DELETE', body })
