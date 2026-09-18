/**
 * 影子系统展示辅助（纯函数，双端共享；不含任何 DOM / 样式）。
 * 双端 shell 的 UI 结构各自独立实现，这里只统一格式化口径。
 */

export function formatDuration(ms) {
  const total = Math.max(0, Math.round((ms || 0) / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function formatClock(ms) {
  const date = new Date(ms)
  return [date.getHours(), date.getMinutes(), date.getSeconds()].map((value) => String(value).padStart(2, '0')).join(':')
}

export function percentOf(done, total) {
  if (!total) return 0
  return Math.min(100, Math.max(0, Math.round((done / total) * 1000) / 10))
}

export const CONFIDENCE_LABEL = { high: '高', medium: '中', low: '低', none: '无' }

/** 事件级别 → 视觉色调标记（data-tone 值，样式在 food-auto.css）。 */
export function eventTone(level) {
  if (level === 'error') return 'error'
  if (level === 'warn') return 'warn'
  if (level === 'target') return 'target'
  if (level === 'hit') return 'hit'
  return 'info'
}

export function isAbortError(error) {
  return Boolean(error) && (error.name === 'AbortError' || /已取消/u.test(String(error.message || '')))
}
