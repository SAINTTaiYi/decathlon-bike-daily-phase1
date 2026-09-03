import { api } from './client.js'

export const getBiSkuNames = (signal) => api('/api/v1/bi/sku-names', { signal })

// perfeco 整车数据（2026-09-04 换源）：当日 KPI 同步、周榜、日报 article/model 分类。
export const getBikeDay = (signal) => api('/api/v1/bi/bikes/day', { signal })
export const getBikeWeek = (signal) => api('/api/v1/bi/bikes/week', { signal })
export const getBiVehicles = (articles, signal) => api(`/api/v1/bi/vehicles?articles=${encodeURIComponent(articles.join(','))}`, { signal })
export const getBiVehicleModels = (codes, signal) => api(`/api/v1/bi/vehicle-models?codes=${encodeURIComponent(codes.join(','))}`, { signal })
