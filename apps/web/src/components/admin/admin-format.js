// 管理台共享时间格式化：近三天用口语日锚点，更早回落数字日期；完整时间始终可通过 title 读到。
const dayFormatter = new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' })
const clockFormatter = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
const fullFormatter = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
const fullDayFormatter = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })

function startOfDay(value) {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  return date
}

function dayAnchor(date) {
  const now = new Date()
  const distance = Math.round((startOfDay(now) - startOfDay(date)) / 86400000)
  if (distance === 0) return '今天'
  if (distance === 1) return '昨天'
  if (distance === 2) return '前天'
  // 跨年不能只显示 月-日，否则去年的记录会被读成今年。
  if (date.getFullYear() !== now.getFullYear()) return fullDayFormatter.format(date)
  return dayFormatter.format(date)
}

// 带时分：用于变化流与平台事件这类需要精确到分钟的流水。
export function formatStamp(value) {
  if (!value) return { day: '—', clock: '', full: '' }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return { day: '—', clock: '', full: '' }
  return { day: dayAnchor(date), clock: clockFormatter.format(date), full: fullFormatter.format(date) }
}

// 只到日：用于最近登录这类不需要时分的列，仍保留日锚点便于扫读。
export function formatDayStamp(value) {
  if (!value) return { day: '—', full: '' }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return { day: '—', full: '' }
  return { day: dayAnchor(date), full: fullDayFormatter.format(date) }
}
