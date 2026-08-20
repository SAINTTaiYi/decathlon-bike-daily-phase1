import { api } from './client.js'

export const getShipHubSettings = (signal) => api('/api/v1/settings/shiphub', { signal })
export const getShipHubSummary = (signal) => api('/api/v1/shiphub/summary', { signal })
export const getShipHubOrders = (category, { cursor = '', limit = 50, signal } = {}) => {
  const params = new URLSearchParams({ category, limit: String(limit) })
  if (cursor) params.set('cursor', cursor)
  return api(`/api/v1/shiphub/orders?${params}`, { signal })
}
export const getShipHubOrder = (category, id, signal) => api(`/api/v1/shiphub/orders/${encodeURIComponent(category)}/${encodeURIComponent(id)}`, { signal })
export const setShipHubOrderAction = (category, id, state) => api(`/api/v1/shiphub/orders/${encodeURIComponent(category)}/${encodeURIComponent(id)}/actions`, { method: 'POST', body: { state } })
export const requestShipHubSync = () => api('/api/v1/shiphub/sync', { method: 'POST', body: {} })
export const startShipHubConnection = (returnTo = '/', login = null) => api('/api/v1/settings/shiphub/connect/start', { method: 'POST', body: login ? { returnTo, login } : { returnTo } })
export const disconnectShipHub = () => api('/api/v1/settings/shiphub/disconnect', { method: 'POST', body: {} })
