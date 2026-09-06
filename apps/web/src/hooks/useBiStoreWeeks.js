import { useEffect, useState } from 'react'
import { getBiStoreWeeks } from '../api/bi.js'

// 已完结周序列（BI 周结定时拉取落库，cron 自动补齐最新完结周）。
// 完结周数据恒定：会话级缓存不设 TTL（同 useBiStoreCompare），刷新页面才重查。
let sessionCache = null
export default function useBiStoreWeeks() {
  const [data, setData] = useState(() => sessionCache)
  useEffect(() => {
    if (sessionCache) return undefined
    let cancelled = false
    getBiStoreWeeks()
      .then((payload) => {
        if (payload && payload.available === true && Array.isArray(payload.weeks)) {
          sessionCache = payload.weeks
          if (!cancelled) setData(payload.weeks)
        }
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [])
  return data
}
