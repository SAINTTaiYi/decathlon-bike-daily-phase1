export const REPAIR_CONTACT_TYPES = [
  { value: 'phone', label: '手机号' },
  { value: 'member', label: '会员号' }
]

export const REPAIR_TYPES = ['质保', '付费', '免费', '门店产品维修']
export const REPAIR_STATUSES = ['维修中', '等待配件', '已开付款单', '已开质保单']
export const REPAIR_PICKUP_READY_STATUSES = ['已开付款单', '已开质保单']
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

export function repairRecordToDraft(record) {
  if (!record) return { ...emptyRepairDraft }
  return {
    title: record.title || '',
    contactType: REPAIR_CONTACT_TYPES.some(({ value }) => value === record.contactType) ? record.contactType : 'phone',
    contactValue: record.contactValue ?? '',
    repairType: REPAIR_TYPES.includes(record.repairType) ? record.repairType : '',
    repairProject: record.repairProject || record.detail || '',
    pickupDate: record.pickupDate || '',
    status: REPAIR_STATUSES.includes(record.status) ? record.status : '维修中'
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

  return {
    ok: true,
    route: 'pickup',
    record: {
      ...record,
      scene: 'pickup',
      kind: 'pickup',
      pickupSource: 'repair',
      notificationStatus: record.notificationStatus || 'pending',
      repairCompletedAt: at,
      updatedAt: at
    }
  }
}

export function normalizeRepairValues(values) {
  const title = text(values.title, 80)
  const contactType = text(values.contactType, 16)
  const contactValue = text(values.contactValue, 80)
  const repairType = text(values.repairType, 24)
  const repairProject = text(values.repairProject, 240)
  const status = text(values.status, 24)
  const pickupDate = repairType === STORE_PRODUCT_REPAIR ? '' : text(values.pickupDate, 10)

  if (!title) return { ok: false, error: '请填写车辆型号。' }
  if (!REPAIR_CONTACT_TYPES.some(({ value }) => value === contactType)) return { ok: false, error: '请选择手机号或会员号。' }
  if (!contactValue) return { ok: false, error: '请输入手机号或会员号；可以填写 0。' }
  if (!REPAIR_TYPES.includes(repairType)) return { ok: false, error: '请选择维修类型。' }
  if (!repairProject) return { ok: false, error: '请填写维修项目。' }
  if (repairType !== STORE_PRODUCT_REPAIR && !validDate(pickupDate)) return { ok: false, error: '请选择有效的取车日期。' }
  if (!REPAIR_STATUSES.includes(status)) return { ok: false, error: '请选择当前状态。' }

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
