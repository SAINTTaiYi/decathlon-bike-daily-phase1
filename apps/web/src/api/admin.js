import { api } from './client.js'

export const getAdminOverview = (signal) => api('/api/v1/admin/overview', { signal })

export const getAdminUsers = (q = '', signal) => api(`/api/v1/admin/users${q ? `?q=${encodeURIComponent(q)}` : ''}`, { signal })

export const getAdminAuditHistory = (filters = {}, signal) => {
  const params = new URLSearchParams()
  if (filters.date) params.set('date', filters.date)
  if (filters.module && filters.module !== 'all') params.set('module', filters.module)
  if (filters.cursor) params.set('cursor', filters.cursor)
  if (filters.limit) params.set('limit', String(filters.limit))
  const qs = params.toString()
  return api(`/api/v1/admin/audit-events${qs ? `?${qs}` : ''}`, { signal })
}
