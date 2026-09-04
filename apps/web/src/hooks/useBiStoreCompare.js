import { useEffect, useState } from 'react'
import { getBiStoreWeek } from '../api/bi.js'
import { BI_SNAPSHOT } from '../data/biSnapshot.js'

// 门店 TO / DIS 的 BI × CIS 周期对比（CIS 侧数据）。
// 查询窗口固定为 BI 快照周（economic.from/to）——两源同期才是真对比；
// 该周是已完结的历史周，数据恒定，会话级缓存不设 TTL。
// CIS 不可用时返回 null，对比卡退回只显示 BI 列并标注 CIS 暂不可用。
let sessionCache = null
export default function useBiStoreCompare() {
  const [data, setData] = useState(() => sessionCache)
  useEffect(() => {
    if (sessionCache) return undefined
    let cancelled = false
    getBiStoreWeek(BI_SNAPSHOT.economic.weekFrom, BI_SNAPSHOT.economic.weekTo)
      .then((payload) => {
        if (payload && payload.available === true) {
          sessionCache = payload
          if (!cancelled) setData(payload)
        }
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [])
  return data
}
