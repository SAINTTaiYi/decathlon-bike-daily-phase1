// 时区格式化器缓存（2026-09-12 tick CPU 优化）。
//
// 背景：cron tick 每分钟运行一次，内部要多次做「当前时刻属于哪个小时/哪天」的
// 时区判定——Shiphub 营业时间窗口（每小时 N 次）+ BI 周窗口计算（每天多次）。
// 实测：`new Intl.DateTimeFormat(...)` 构造在 V8/workerd 里是毫秒级操作
// （ICU 时区数据解析 + 规则编译），而缓存后的 `format()` 只有微秒级
// （Node 微基准：构造 235µs vs 复用 1.2µs，~195 倍差距）。
//
// 后果：免费层 Workers 的 Cron CPU 上限是每次 10ms，而已有实测 tick CPU 常态
// 12–50ms（2026-09-10/11 多次被平台以 exceededCpu 终止，造成同步停摆）。
// 重复构造 formatter 是 tick 里最大的单项 JS 成本，必须消除。
//
// 设计：formatter 本身无状态（format 是纯函数），按 (locale, timeZone, 字段集)
// 作键做模块级缓存是安全的。缓存条目数量有界（时区/locale 组合固定），
// 不随请求增长，无内存泄漏风险。

const formatterCache = new Map<string, Intl.DateTimeFormat>()

function cachedFormatter(key: string, build: () => Intl.DateTimeFormat): Intl.DateTimeFormat {
  const existing = formatterCache.get(key)
  if (existing) return existing
  const formatter = build()
  formatterCache.set(key, formatter)
  return formatter
}

/** 2 位数小时（"00"–"23"），用于营业时间窗口判定。 */
export function hourFormatter(timeZone: string): Intl.DateTimeFormat {
  return cachedFormatter(`hour|en-US|${timeZone}`, () =>
    new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', hour12: false })
  )
}

/** ISO 日期（YYYY-MM-DD，en-CA 输出格式），用于周窗口 / 营业日计算。 */
export function isoDayFormatter(timeZone: string): Intl.DateTimeFormat {
  return cachedFormatter(`day|en-CA|${timeZone}`, () =>
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
  )
}

/** 测试辅助：清空缓存（仅供测试断言缓存行为使用）。 */
export function resetTimeFormatterCacheForTest(): void {
  formatterCache.clear()
}

/** 测试辅助：当前缓存条目数。 */
export function timeFormatterCacheSizeForTest(): number {
  return formatterCache.size
}
