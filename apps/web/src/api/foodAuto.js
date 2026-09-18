import { api } from './client.js'

// 食品自动登记 · 影子系统 API（2026-09-18）。与 apps/worker/src/routes/food-auto.ts 一一对应。
// 调度在前端：/status → /receptions →（空则 /discover）→ /reception-items → /plan
// → 逐段 /scan → /judge → /save。

export const getFoodAutoStatus = (signal) => api('/api/v1/food-auto/status', { signal })

export const fetchFoodAutoReceptions = (signal) => api('/api/v1/food-auto/receptions', { method: 'POST', body: {}, signal })

export const discoverFoodAutoReceptions = (signal) => api('/api/v1/food-auto/discover', { method: 'POST', body: {}, signal })

export const fetchFoodAutoReceptionItems = (body, signal) =>
  api('/api/v1/food-auto/reception-items', { method: 'POST', body, signal })

export const buildFoodAutoPlan = (body, signal) => api('/api/v1/food-auto/plan', { method: 'POST', body, signal })

export const scanFoodAutoSegment = (body, signal) => api('/api/v1/food-auto/scan', { method: 'POST', body, signal })

export const judgeFoodAutoRecords = (body, signal) => api('/api/v1/food-auto/judge', { method: 'POST', body, signal })

export const saveFoodAutoRun = (body) => api('/api/v1/food-auto/save', { method: 'POST', body })
