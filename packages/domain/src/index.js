export const REPAIR_TYPES = ['质保', '付费', '免费', '门店产品维修']
export const REPAIR_STATUSES = ['维修中', '等待配件', '已开付款单', '已开质保单']
export const REPAIR_PICKUP_READY_STATUSES = ['已开付款单', '已开质保单']
export const FREE_REPAIR = '免费'
export const STORE_PRODUCT_REPAIR = '门店产品维修'
export const SELF_PICKUP_PLATFORMS = ['tmall', 'jd', 'mini-program']

export function normalizeUsername(value) {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/gu, ' ').slice(0, 24)
}

export function usernameKey(value) {
  return normalizeUsername(value).toLocaleLowerCase('zh-CN')
}

export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export function normalizeRepair(values) {
  const fields = {
    title: String(values.title ?? '').trim().slice(0, 120),
    contactType: String(values.contactType ?? '').trim().slice(0, 16),
    contactValue: String(values.contactValue ?? '').trim().slice(0, 80),
    repairType: String(values.repairType ?? '').trim().slice(0, 24),
    repairProject: String(values.repairProject ?? '').trim().slice(0, 500),
    pickupDate: String(values.repairType ?? '') === STORE_PRODUCT_REPAIR ? '' : String(values.pickupDate ?? '').trim().slice(0, 10),
    status: String(values.status ?? '').trim().slice(0, 32)
  }
  if (!fields.title) return { ok: false, error: '请填写车辆型号。' }
  if (!['phone', 'member'].includes(fields.contactType)) return { ok: false, error: '请选择手机号或会员号。' }
  if (!fields.contactValue) return { ok: false, error: '请输入手机号或会员号；可以填写 0。' }
  if (!REPAIR_TYPES.includes(fields.repairType)) return { ok: false, error: '请选择维修类型。' }
  if (!fields.repairProject) return { ok: false, error: '请填写维修项目。' }
  if (fields.repairType !== STORE_PRODUCT_REPAIR && !validDate(fields.pickupDate)) return { ok: false, error: '请选择有效的取车日期。' }
  if (!REPAIR_STATUSES.includes(fields.status)) return { ok: false, error: '请选择当前状态。' }
  return { ok: true, fields }
}

export function repairCompletionRoute(record) {
  if (!REPAIR_TYPES.includes(record.repairType)) return { ok: false, error: '请先编辑并补齐维修类型，再执行维修完毕。' }
  return { ok: true, route: record.repairType === STORE_PRODUCT_REPAIR ? 'completed' : 'pickup' }
}

export function validatePickup(values) {
  const fields = {
    pickupSource: String(values.pickupSource ?? ''),
    selfPickupPlatform: String(values.selfPickupPlatform ?? ''),
    title: String(values.title ?? '').trim().slice(0, 120),
    detail: String(values.detail ?? '').trim().slice(0, 500),
    meta: String(values.meta ?? '').trim().slice(0, 240),
    status: String(values.status ?? '').trim().slice(0, 80)
  }
  if (!['self-pickup', 'customer-storage'].includes(fields.pickupSource)) return { ok: false, error: '请选择自提订单车辆或顾客暂存。' }
  if (!fields.title) return { ok: false, error: '请填写车辆或顾客标识。' }
  if (!fields.status) return { ok: false, error: '请填写当前状态。' }
  if (fields.pickupSource === 'self-pickup') {
    if (!SELF_PICKUP_PLATFORMS.includes(fields.selfPickupPlatform)) return { ok: false, error: '请选择天猫、京东或小程序。' }
    fields.detail = ''
  } else {
    fields.selfPickupPlatform = ''
    if (!fields.detail) return { ok: false, error: '请填写顾客暂存说明。' }
  }
  return { ok: true, fields }
}

export function validatePickupCompletion(record, suppliedCode = '') {
  if (record.pickupSource === 'self-pickup' && !String(suppliedCode).trim()) return { ok: false, error: '请输入顾客提供的取货码后再确认取车。' }
  if (record.pickupSource === 'repair' && record.repairType !== FREE_REPAIR && !REPAIR_PICKUP_READY_STATUSES.includes(record.status)) {
    return { ok: false, error: '非免费维修车辆只有已开付款单或已开质保单时才能确认取车。' }
  }
  return { ok: true }
}

export function localBusinessDate(timeZone = 'Asia/Shanghai', now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

export function describeChanges(before, after, labels = {}) {
  return Object.entries(labels)
    .filter(([key]) => String(before?.[key] ?? '') !== String(after?.[key] ?? ''))
    .map(([key, label]) => label)
}
