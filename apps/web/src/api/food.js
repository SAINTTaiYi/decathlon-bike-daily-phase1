import { api } from './client.js'

// 食品保质期台账（2026-09-13）。与 apps/worker/src/routes/food.ts 一一对应。

export const getFoodShelfLife = (signal) => api('/api/v1/food/shelf-life', { signal })

export const getFoodOverview = (signal) => api('/api/v1/food/overview', { signal })

export const getFoodBatches = ({ filter = 'flagged', kind = '', q = '', limit = 100, offset = 0 } = {}, signal) => {
  const params = new URLSearchParams({ filter, limit: String(limit), offset: String(offset) })
  if (kind) params.set('kind', kind)
  if (q) params.set('q', q)
  return api(`/api/v1/food/batches?${params.toString()}`, { signal })
}

export const createFoodBatch = (body) => api('/api/v1/food/batches', { method: 'POST', body })

export const updateFoodBatchStatus = (id, body) => api(`/api/v1/food/batches/${encodeURIComponent(id)}`, { method: 'PATCH', body })

export const upsertFoodShelfLife = (body) => api('/api/v1/food/shelf-life', { method: 'PUT', body })
