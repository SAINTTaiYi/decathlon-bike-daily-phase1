import { api } from './client.js'

// D1 当日读行监控（admin）。返回 { available: false } 或完整快照。
export const getD1Metrics = (signal) => api('/api/v1/d1/metrics', { signal })
