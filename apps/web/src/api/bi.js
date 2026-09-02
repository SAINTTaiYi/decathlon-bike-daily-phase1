import { api } from './client.js'

export const getBiSkuNames = (signal) => api('/api/v1/bi/sku-names', { signal })
