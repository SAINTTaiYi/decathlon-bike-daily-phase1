import { daysUntil, foodBatchStage } from '@bike-ops/domain'

// 食品台账展示口径（2026-09-13）。
//
// 分级与剩余天数全部复用 @bike-ops/domain 的纯函数：Excel 公式口径只有一份实现，
// worker 落库与前端展示不会各算一遍。today 一律用服务端返回的日期。

export const FOOD_STAGE_LABEL = {
  expired: '已过期',
  flagged: '红标',
  soon: '临期',
  fresh: '正常',
  closed: '已处理'
}

export const FOOD_STATUS_LABEL = {
  open: '在库',
  sold_out: '已售罄',
  isolated: '隔离'
}

export function batchStage(batch, today) {
  return foodBatchStage(batch, today)
}

export function batchStageLabel(batch, today) {
  return FOOD_STAGE_LABEL[batchStage(batch, today)] || '正常'
}

// 相对 + 绝对并显（Grocy / kitchen_assistant 模式）：剩余天数用「今天 / 明天 / 剩 N 天」，
// 绝对日期另外展示，避免用户心算。
export function remainingLabel(expiresOn, today) {
  const days = daysUntil(expiresOn, today)
  if (days === null) return ''
  if (days < 0) return `已过期 ${Math.abs(days)} 天`
  if (days === 0) return '今天到期'
  if (days === 1) return '明天到期'
  return `剩 ${days} 天`
}

// 临期加急（SOP：<7 天下架 / <30 天临期牌），用于剩余天数的强调色。
export function urgencyLevel(expiresOn, today) {
  const days = daysUntil(expiresOn, today)
  if (days === null) return 'normal'
  if (days < 0) return 'expired'
  if (days < 7) return 'pull'
  if (days < 30) return 'due'
  if (days < 45) return 'near'
  return 'normal'
}

// 「08-14」紧凑展示；跨年时补年份。
export function shortDate(iso, today) {
  if (!iso) return ''
  const [year, month, day] = iso.split('-')
  if (!today || today.slice(0, 4) === year) return `${month}-${day}`
  return `${year}-${month}-${day}`
}

// 日期输入的宽松解析（扫码枪 / 小键盘友好）：
//   20260814 → 2026-08-14      0814 / 8-14 / 08-14 → 当年
//   2026-8-4 → 2026-08-04      空 → ''
export function parseDateInput(raw, today) {
  const value = String(raw ?? '').trim().replace(/[/.]/gu, '-')
  if (!value) return ''
  const compact = value.replace(/-/gu, '')
  const year = today ? Number(today.slice(0, 4)) : new Date().getFullYear()
  let match = /^(\d{4})(\d{2})(\d{2})$/u.exec(compact)
  if (match) return `${match[1]}-${match[2]}-${match[3]}`
  match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/u.exec(value)
  if (match) return `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`
  match = /^(\d{1,2})-(\d{1,2})$/u.exec(value)
  if (match) return `${year}-${String(match[1]).padStart(2, '0')}-${String(match[2]).padStart(2, '0')}`
  return ''
}

export function isCompleteIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value ?? '')) return false
  const [year, month, day] = value.split('-').map(Number)
  if (month < 1 || month > 12 || day < 1) return false
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate()
}
