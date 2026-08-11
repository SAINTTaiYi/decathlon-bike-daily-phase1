import { api } from './client.js'

export const getBootstrap = (signal) => api('/api/v1/bootstrap', { signal })
export const saveSales = (body) => api('/api/v1/daily-closing/current/sales', { method: 'PUT', body })
export const clearSales = (expectedRevision) => api('/api/v1/daily-closing/current/sales', { method: 'DELETE', body: { expectedRevision } })
export const closeDay = () => api('/api/v1/daily-closing/current/close', { method: 'POST', body: {} })
export const reopenDay = () => api('/api/v1/daily-closing/current/reopen', { method: 'POST', body: {} })
export const createWorkItem = (scene, values) => api('/api/v1/work-items', { method: 'POST', body: { scene, values } })
export const updateWorkItem = (record, values) => api(`/api/v1/work-items/${record.id}`, { method: 'PATCH', body: { expectedRevision: record.revision, values } })
export const removeWorkItem = (record) => api(`/api/v1/work-items/${record.id}`, { method: 'DELETE', body: { expectedRevision: record.revision } })
export const workItemAction = (record, action, extra = {}) => api(`/api/v1/work-items/${record.id}/${action}`, { method: 'POST', body: { expectedRevision: record.revision, ...extra } })
export const undoAuditEvent = (event) => api(`/api/v1/audit-events/${event.id}/undo`, { method: 'POST', body: {} })
export const getPermanentAuditHistory = ({ date = '', module = 'all', cursor = '' } = {}) => {
  const params = new URLSearchParams({ module, limit: '80' })
  if (date) params.set('date', date)
  if (cursor) params.set('cursor', cursor)
  return api(`/api/v1/audit-events/history?${params}`)
}
export const previewLocalV5 = (body) => api('/api/v1/migrations/local-v5/preview', { method: 'POST', body })
export const planLocalV5Import = (body) => api('/api/v1/migrations/local-v5/import', { method: 'POST', body })
