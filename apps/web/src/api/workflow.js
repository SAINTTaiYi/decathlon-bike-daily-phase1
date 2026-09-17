import { api } from './client.js'

export const getBootstrap = (signal) => api('/api/v1/bootstrap', { signal })

// 冷启动并行预取（2026-09-18）：/auth/me 与 /bootstrap 都只依赖会话 cookie，此前却
// 严格串行（会话恢复完才允许拉台账），首屏白等一个完整往返。应用挂载时（会话校验
// 仍在进行）就可以先把 bootstrap 发出去；如果最终未登录，响应是 401，由这里静默
// 丢弃——未登录时中间件直接拒绝，不产生任何 D1 读。取用方是 useRemoteClosingWorkflow。
const BOOTSTRAP_PREFETCH_TTL_MS = 60 * 1000
let bootstrapPrefetch = null

export function prefetchBootstrap() {
  if (bootstrapPrefetch) return bootstrapPrefetch.task
  bootstrapPrefetch = { at: Date.now(), task: getBootstrap().catch(() => null) }
  return bootstrapPrefetch.task
}

export function takePrefetchedBootstrap() {
  const entry = bootstrapPrefetch
  bootstrapPrefetch = null
  if (!entry) return null
  // 久未被取用的预取（例如用户对着应用选择屏犹豫）可能已经陈旧：宁可不省这一点，
  // 也不让工作台以过期的数据开机。
  if (Date.now() - entry.at > BOOTSTRAP_PREFETCH_TTL_MS) return null
  return entry.task
}
export const saveSales = (body) => api('/api/v1/daily-closing/current/sales', { method: 'PUT', body })
export const clearSales = (expectedRevision) => api('/api/v1/daily-closing/current/sales', { method: 'DELETE', body: { expectedRevision } })
export const closeDay = () => api('/api/v1/daily-closing/current/close', { method: 'POST', body: {} })
export const reopenDay = () => api('/api/v1/daily-closing/current/reopen', { method: 'POST', body: {} })
export const createWorkItem = (scene, values) => api('/api/v1/work-items', { method: 'POST', body: { scene, values } })
export const updateWorkItem = (record, values) => api(`/api/v1/work-items/${record.id}`, { method: 'PATCH', body: { expectedRevision: record.revision, values } })
export const removeWorkItem = (record) => api(`/api/v1/work-items/${record.id}`, { method: 'DELETE', body: { expectedRevision: record.revision } })
export const workItemAction = (record, action, extra = {}) => api(`/api/v1/work-items/${record.id}/${action}`, { method: 'POST', body: { expectedRevision: record.revision, ...extra } })
export const assignWorkItem = (record, assignedTo) => api(`/api/v1/work-items/${record.id}/assign`, { method: 'POST', body: { expectedRevision: record.revision, assignedTo } })
export const undoAuditEvent = (event) => api(`/api/v1/audit-events/${event.id}/undo`, { method: 'POST', body: {} })
export const getPermanentAuditHistory = ({ date = '', module = 'all', cursor = '' } = {}) => {
  const params = new URLSearchParams({ module, limit: '80' })
  if (date) params.set('date', date)
  if (cursor) params.set('cursor', cursor)
  return api(`/api/v1/audit-events/history?${params}`)
}
export const previewLocalV5 = (body) => api('/api/v1/migrations/local-v5/preview', { method: 'POST', body })
export const planLocalV5Import = (body) => api('/api/v1/migrations/local-v5/import', { method: 'POST', body })
