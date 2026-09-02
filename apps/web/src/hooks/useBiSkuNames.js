import { useEffect, useState } from 'react'
import { getBiSkuNames } from '../api/bi.js'

// BI 车型官方名（masterdata 定时同步落 D1）拉取一次并做模块级缓存；
// 失败静默降级——显示层退回静态 ALLCHANNEL_NAMES（精选）与 BI 原始 model 字段。
// 只作名称兜底，不承载任何业务逻辑，接口挂了面板照常渲染。
let cached = null
let inflight = null

export default function useBiSkuNames() {
  const [names, setNames] = useState(() => cached ?? {})
  useEffect(() => {
    if (cached) return undefined
    let cancelled = false
    if (!inflight) {
      inflight = getBiSkuNames()
        .then((payload) => {
          const map = {}
          for (const [code, info] of Object.entries(payload?.names ?? {})) {
            if (info && typeof info.label === 'string' && info.label) map[code] = info.label
          }
          cached = map
          return map
        })
        .catch(() => null)
        .finally(() => { inflight = null })
    }
    inflight.then((map) => {
      if (!cancelled && map) setNames(map)
    })
    return () => { cancelled = true }
  }, [])
  return names
}
