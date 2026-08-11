export const REPAIR_TYPES = ['质保', '付费', '免费', '门店产品维修']
export const REPAIR_IN_PROGRESS_STATUSES = ['维修中', '等待配件']
export const REPAIR_COMPLETION_SOURCE_STATUSES = [
  '已开付款单',
  '已开维修单',
  '已开质保维修单',
  '已开质保付款单-请过机',
  '快速服务免费'
]
export const REPAIR_STATUSES = [...REPAIR_IN_PROGRESS_STATUSES, ...REPAIR_COMPLETION_SOURCE_STATUSES]
export const COMPLETED_REPAIR_STATUSES = [
  '维修完成-已开付款单',
  '维修完成-已开维修单',
  '维修完成-已开质保维修单',
  '维修完成-已开质保付款单-请过机',
  '维修完成-快速服务免费'
]
export const REPAIR_RECORD_STATUSES = [...REPAIR_STATUSES, ...COMPLETED_REPAIR_STATUSES]
export const REPAIR_COMPLETION_STATUS_MAP = Object.freeze({
  '已开付款单': '维修完成-已开付款单',
  '已开维修单': '维修完成-已开维修单',
  '已开质保维修单': '维修完成-已开质保维修单',
  '已开质保付款单-请过机': '维修完成-已开质保付款单-请过机',
  '快速服务免费': '维修完成-快速服务免费'
})
export const REPAIR_REOPEN_STATUS_MAP = Object.freeze(Object.fromEntries(
  Object.entries(REPAIR_COMPLETION_STATUS_MAP).map(([before, after]) => [after, before])
))
export const REPAIR_PICKUP_READY_STATUSES = [
  '维修完成-已开付款单',
  '维修完成-已开质保付款单-请过机',
  '维修完成-快速服务免费'
]
export const REPAIR_POS_REMINDER_STATUS = '维修完成-已开质保付款单-请过机'
export const FREE_REPAIR = '免费'
export const STORE_PRODUCT_REPAIR = '门店产品维修'
export const SELF_PICKUP_PLATFORMS = ['tmall', 'jd', 'mini-program']

export function normalizeUsername(value) {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/gu, ' ').slice(0, 24)
}

export function usernameKey(value) {
  return normalizeUsername(value).toLocaleLowerCase('zh-CN')
}

export function redactEmail(emailKey) {
  if (!emailKey || typeof emailKey !== 'string') return ''
  const atIndex = emailKey.indexOf('@')
  if (atIndex <= 0) return emailKey
  const localPart = emailKey.slice(0, atIndex)
  const domain = emailKey.slice(atIndex)
  if (localPart.length <= 1) return localPart[0] + '***' + domain
  return localPart[0] + '***' + domain
}

export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export function isCompletedRepairStatus(status) {
  return COMPLETED_REPAIR_STATUSES.includes(String(status ?? '').trim())
}

export function normalizeRepairStatus(status, { repairType = '', completed = false } = {}) {
  const value = String(status ?? '').trim()
  if (value === '已开质保单') return completed ? '维修完成-已开质保维修单' : '已开质保维修单'
  if (value === '维修完成') {
    if (repairType === FREE_REPAIR) return '维修完成-快速服务免费'
    if (repairType === '质保') return '维修完成-已开质保维修单'
    return '维修完成-已开维修单'
  }
  if (completed && REPAIR_COMPLETION_STATUS_MAP[value]) return REPAIR_COMPLETION_STATUS_MAP[value]
  return value
}

export function validateRepairStatusContext(status, completed = false) {
  const allowed = completed ? COMPLETED_REPAIR_STATUSES : REPAIR_STATUSES
  if (allowed.includes(status)) return { ok: true }
  return {
    ok: false,
    error: completed
      ? '维修完成车辆的状态只能在五个"维修完成-*"状态之间选择；如需恢复维修，请在操作记录中撤回"维修完毕"。'
      : '维修中的车辆不能直接选择"维修完成-*"状态，请使用"维修完毕"操作。'
  }
}

export function normalizeRepair(values) {
  const fields = {
    title: String(values.title ?? '').trim().slice(0, 120),
    contactType: String(values.contactType ?? '').trim().slice(0, 16),
    contactValue: String(values.contactValue ?? '').trim().slice(0, 80),
    repairType: String(values.repairType ?? '').trim().slice(0, 24),
    repairProject: String(values.repairProject ?? '').trim().slice(0, 500),
    pickupDate: String(values.repairType ?? '') === STORE_PRODUCT_REPAIR ? '' : String(values.pickupDate ?? '').trim().slice(0, 10),
    status: normalizeRepairStatus(String(values.status ?? '').trim().slice(0, 64), {
      repairType: String(values.repairType ?? '').trim(),
      completed: isCompletedRepairStatus(values.status)
    })
  }
  if (!fields.title) return { ok: false, error: '请填写车辆型号。' }
  if (!['phone', 'member'].includes(fields.contactType)) return { ok: false, error: '请选择手机号或会员号。' }
  if (!fields.contactValue) return { ok: false, error: '请输入手机号或会员号；可以填写 0。' }
  if (!REPAIR_TYPES.includes(fields.repairType)) return { ok: false, error: '请选择维修类型。' }
  if (!fields.repairProject) return { ok: false, error: '请填写维修项目。' }
  if (fields.repairType !== STORE_PRODUCT_REPAIR && !validDate(fields.pickupDate)) return { ok: false, error: '请选择有效的取车日期。' }
  if (!REPAIR_RECORD_STATUSES.includes(fields.status)) return { ok: false, error: '请选择当前状态。' }
  return { ok: true, fields }
}

export function repairCompletionRoute(record) {
  if (!REPAIR_TYPES.includes(record.repairType)) return { ok: false, error: '请先编辑并补齐维修类型，再执行维修完毕。' }
  if (record.repairType === STORE_PRODUCT_REPAIR) return { ok: true, route: 'completed' }
  const currentStatus = normalizeRepairStatus(record.status, { repairType: record.repairType })
  const completedStatus = REPAIR_COMPLETION_STATUS_MAP[currentStatus]
  if (!completedStatus) {
    return {
      ok: false,
      error: '请先将当前状态选择为"已开付款单"、"已开维修单"、"已开质保维修单"、"已开质保付款单-请过机"或"快速服务免费"，再执行维修完毕。'
    }
  }
  return { ok: true, route: 'pickup', completedStatus, previousStatus: currentStatus }
}

export function validatePickup(values) {
  const contactTypeRaw = String(values.contactType ?? 'phone').trim().slice(0, 16) || 'phone'
  // Prefer structured contactValue; fall back to meta for V5.5.8 / legacy clients.
  const contactValueRaw = String(values.contactValue ?? values.meta ?? '').trim().slice(0, 80)
  const contactType = ['phone', 'member'].includes(contactTypeRaw) ? contactTypeRaw : ''
  let meta = ''
  if (contactValueRaw) {
    meta = contactType === 'member' ? `会员号：${contactValueRaw}` : contactValueRaw
  }

  const fields = {
    pickupSource: String(values.pickupSource ?? ''),
    selfPickupPlatform: String(values.selfPickupPlatform ?? ''),
    title: String(values.title ?? '').trim().slice(0, 120),
    detail: String(values.detail ?? '').trim().slice(0, 500),
    meta: meta.slice(0, 240),
    status: String(values.status ?? '').trim().slice(0, 80),
    contactType: contactType || 'phone',
    contactValue: contactValueRaw
  }
  if (!['self-pickup', 'customer-storage', 'used-car'].includes(fields.pickupSource)) return { ok: false, error: '请选择自提订单车辆、顾客暂存或二手车。' }
  if (!fields.title) return { ok: false, error: '请填写车辆或顾客标识。' }
  if (!fields.status) return { ok: false, error: '请填写当前状态。' }
  if (!['phone', 'member'].includes(fields.contactType)) return { ok: false, error: '请选择手机号或会员号。' }
  // contactValue / meta are optional; empty surfaces as「无」on cards.
  if (fields.pickupSource === 'self-pickup') {
    if (!SELF_PICKUP_PLATFORMS.includes(fields.selfPickupPlatform)) return { ok: false, error: '请选择天猫、京东或小程序。' }
    fields.detail = ''
  } else if (fields.pickupSource === 'customer-storage') {
    fields.selfPickupPlatform = ''
    if (!fields.detail) return { ok: false, error: '请填写顾客暂存说明。' }
  } else {
    fields.selfPickupPlatform = ''
  }
  return { ok: true, fields }
}

export function validatePickupCompletion(record, suppliedCode = '') {
  if (record.pickupSource === 'self-pickup' && !String(suppliedCode).trim()) return { ok: false, error: '请输入顾客提供的取货码后再确认取车。' }
  if (record.pickupSource !== 'repair') return { ok: true }
  const status = normalizeRepairStatus(record.status, { repairType: record.repairType, completed: true })
  if (status === '维修完成-已开维修单') {
    return { ok: false, error: '当前状态为"维修完成-已开维修单"，请先编辑并变更为"维修完成-已开付款单"后再确认取车。' }
  }
  if (status === '维修完成-已开质保维修单') {
    return { ok: false, error: '当前状态为"维修完成-已开质保维修单"，请先编辑并变更为"维修完成-已开质保付款单-请过机"后再确认取车。' }
  }
  if (!REPAIR_PICKUP_READY_STATUSES.includes(status)) {
    return { ok: false, error: '维修车辆必须先完成维修并选择对应的"维修完成-*"状态后才能确认取车。' }
  }
  return status === REPAIR_POS_REMINDER_STATUS
    ? { ok: true, warning: '请确保顾客已过机核验。' }
    : { ok: true }
}

export function localBusinessDate(timeZone = 'Asia/Shanghai', now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

export function describeChanges(before, after, labels = {}) {
  return Object.entries(labels)
    .filter(([key]) => String(before?.[key] ?? '') !== String(after?.[key] ?? ''))
    .map(([key, label]) => label)
}
