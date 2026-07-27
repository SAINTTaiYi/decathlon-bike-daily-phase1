export const REPAIR_CONTACT_TYPES = [
  { value: 'phone', label: '手机号' },
  { value: 'member', label: '会员号' }
]

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
export const REPAIR_PICKUP_READY_STATUSES = [
  '维修完成-已开付款单',
  '维修完成-已开质保付款单-请过机',
  '维修完成-快速服务免费'
]
export const REPAIR_POS_REMINDER_STATUS = '维修完成-已开质保付款单-请过机'
export const FREE_REPAIR = '免费'
export const STORE_PRODUCT_REPAIR = '门店产品维修'

export const emptyRepairDraft = {
  title: '',
  contactType: 'phone',
  contactValue: '',
  repairType: '',
  repairProject: '',
  pickupDate: '',
  status: '维修中'
}

function text(value, max) {
  return String(value ?? '').trim().slice(0, max)
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
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

export function normalizeRepairRecord(record) {
  if (!record) return record
  const completed = record.scene === 'pickup' && (record.pickupSource === 'repair' || record.repairCompletedAt || record.repairType)
  return {
    ...record,
    status: normalizeRepairStatus(record.status, { repairType: record.repairType, completed })
  }
}

export function repairRecordToDraft(record) {
  if (!record) return { ...emptyRepairDraft }
  const normalized = normalizeRepairRecord(record)
  return {
    title: normalized.title || '',
    contactType: REPAIR_CONTACT_TYPES.some(({ value }) => value === normalized.contactType) ? normalized.contactType : 'phone',
    contactValue: normalized.contactValue ?? '',
    repairType: REPAIR_TYPES.includes(normalized.repairType) ? normalized.repairType : '',
    repairProject: normalized.repairProject || normalized.detail || '',
    pickupDate: normalized.pickupDate || '',
    status: REPAIR_RECORD_STATUSES.includes(normalized.status) ? normalized.status : '维修中'
  }
}

export function buildRepairCompletion(record, dateKey, at) {
  if (!REPAIR_TYPES.includes(record.repairType)) {
    return { ok: false, error: '请先编辑并补齐维修类型，再执行维修完毕。' }
  }

  if (record.repairType === STORE_PRODUCT_REPAIR) {
    return {
      ok: true,
      route: 'completed',
      record: {
        ...record,
        status: '已完成',
        completedOn: dateKey,
        completedAt: at,
        repairCompletedAt: at,
        updatedAt: at
      }
    }
  }

  const previousStatus = normalizeRepairStatus(record.status, { repairType: record.repairType })
  const completedStatus = REPAIR_COMPLETION_STATUS_MAP[previousStatus]
  if (!completedStatus) {
    return {
      ok: false,
      error: '请先将当前状态选择为“已开付款单”、“已开维修单”、“已开质保维修单”、“已开质保付款单-请过机”或“快速服务免费”，再执行维修完毕。'
    }
  }

  return {
    ok: true,
    route: 'pickup',
    previousStatus,
    record: {
      ...record,
      scene: 'pickup',
      kind: 'pickup',
      pickupSource: 'repair',
      notificationStatus: record.notificationStatus || 'pending',
      status: completedStatus,
      repairCompletedAt: at,
      updatedAt: at
    }
  }
}

export function normalizeRepairValues(values, { completed = false } = {}) {
  const title = text(values.title, 80)
  const contactType = text(values.contactType, 16)
  const contactValue = text(values.contactValue, 80)
  const repairType = text(values.repairType, 24)
  const repairProject = text(values.repairProject, 240)
  const rawStatus = text(values.status, 64)
  const status = completed
    ? (rawStatus === '维修完成' || rawStatus === '已开质保单'
        ? normalizeRepairStatus(rawStatus, { repairType, completed: true })
        : rawStatus)
    : normalizeRepairStatus(rawStatus, { repairType })
  const pickupDate = repairType === STORE_PRODUCT_REPAIR ? '' : text(values.pickupDate, 10)

  if (!title) return { ok: false, error: '请填写车辆型号。' }
  if (!REPAIR_CONTACT_TYPES.some(({ value }) => value === contactType)) return { ok: false, error: '请选择手机号或会员号。' }
  if (!contactValue) return { ok: false, error: '请输入手机号或会员号；可以填写 0。' }
  if (!REPAIR_TYPES.includes(repairType)) return { ok: false, error: '请选择维修类型。' }
  if (!repairProject) return { ok: false, error: '请填写维修项目。' }
  if (repairType !== STORE_PRODUCT_REPAIR && !validDate(pickupDate)) return { ok: false, error: '请选择有效的取车日期。' }
  const allowedStatuses = completed ? COMPLETED_REPAIR_STATUSES : REPAIR_STATUSES
  if (!allowedStatuses.includes(status)) {
    return {
      ok: false,
      error: completed
        ? '维修完成车辆的状态只能在五个“维修完成-*”状态之间选择；如需恢复维修，请在操作记录中撤回“维修完毕”。'
        : '维修中的车辆不能直接选择“维修完成-*”状态，请使用“维修完毕”操作。'
    }
  }

  const contactLabel = REPAIR_CONTACT_TYPES.find(({ value }) => value === contactType).label
  const metaParts = [`${contactLabel}：${contactValue}`, repairType]
  if (pickupDate) metaParts.push(`取车：${pickupDate}`)

  return {
    ok: true,
    fields: {
      title,
      detail: repairProject,
      meta: metaParts.join(' · '),
      status,
      contactType,
      contactValue,
      repairType,
      repairProject,
      pickupDate
    }
  }
}
