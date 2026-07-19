import { FREE_REPAIR, REPAIR_PICKUP_READY_STATUSES } from './repairRecord.js'

export const PICKUP_SOURCES = [
  { value: 'self-pickup', label: '自提订单车辆' },
  { value: 'repair', label: '维修车辆' },
  { value: 'customer-storage', label: '顾客暂存' }
]

export const MANUAL_PICKUP_SOURCES = PICKUP_SOURCES.filter(({ value }) => value !== 'repair')

export const SELF_PICKUP_PLATFORMS = [
  { value: 'tmall', label: '天猫' },
  { value: 'jd', label: '京东' },
  { value: 'mini-program', label: '小程序' }
]

export const PICKUP_NOTIFICATION_STATUSES = [
  { value: 'pending', label: '等待确认通知' },
  { value: 'notified', label: '已通知' }
]

/** Same options as repair contact fieldset: phone + member. */
export const PICKUP_CONTACT_TYPES = [
  { value: 'phone', label: '手机号' },
  { value: 'member', label: '会员号' }
]

export const emptyPickupDraft = {
  title: '',
  detail: '',
  meta: '',
  status: '等待取车',
  pickupSource: 'customer-storage',
  selfPickupPlatform: '',
  contactType: 'phone',
  contactValue: ''
}

function text(value, max) {
  return String(value ?? '').trim().slice(0, max)
}

/**
 * Encode contact into work_items.meta for manual pickup rows.
 * - empty → ''
 * - phone → plain value (backward compatible with V5.5.8 phone-only meta)
 * - member → "会员号：{value}"
 */
export function encodePickupContactMeta(contactType, contactValue) {
  const type = PICKUP_CONTACT_TYPES.some(({ value }) => value === contactType) ? contactType : 'phone'
  const value = text(contactValue, 80)
  if (!value) return ''
  if (type === 'member') return `会员号：${value}`
  return value
}

/**
 * Decode contact from record.meta / contact* fields for manual pickup rows.
 */
export function decodePickupContact(record = {}) {
  const rawType = text(record.contactType, 16)
  const rawValue = text(record.contactValue, 80)
  if (rawValue || (rawType && rawType !== 'phone' && record.contactValue !== undefined && record.contactValue !== null && String(record.contactValue).length > 0)) {
    const contactType = PICKUP_CONTACT_TYPES.some(({ value }) => value === rawType) ? rawType : 'phone'
    return { contactType, contactValue: rawValue }
  }

  const meta = text(record.meta, 120)
  if (!meta) return { contactType: 'phone', contactValue: '' }

  const memberMatch = meta.match(/^会员号\s*[：:]\s*(.*)$/u)
  if (memberMatch) return { contactType: 'member', contactValue: text(memberMatch[1], 80) }

  const phoneMatch = meta.match(/^手机号\s*[：:]\s*(.*)$/u)
  if (phoneMatch) return { contactType: 'phone', contactValue: text(phoneMatch[1], 80) }

  return { contactType: 'phone', contactValue: text(meta, 80) }
}

export function pickupContactLabel(contactType) {
  return PICKUP_CONTACT_TYPES.find(({ value }) => value === contactType)?.label
    || (contactType === 'member' ? '会员号' : '手机号')
}

export function inferPickupSource(record) {
  if (PICKUP_SOURCES.some(({ value }) => value === record?.pickupSource)) return record.pickupSource
  if (record?.repairType || record?.repairCompletedAt || REPAIR_PICKUP_READY_STATUSES.includes(record?.status) || /维修单|维修完成|保养完成|调试完成/.test(`${record?.meta || ''} ${record?.detail || ''}`)) return 'repair'
  if (record?.kind === 'online' || /线上自提|自提订单/.test(`${record?.meta || ''} ${record?.detail || ''}`)) return 'self-pickup'
  return 'customer-storage'
}

export function pickupSourceLabel(record) {
  const source = inferPickupSource(record)
  return PICKUP_SOURCES.find(({ value }) => value === source)?.label || '顾客暂存'
}

export function inferSelfPickupPlatform(record) {
  if (SELF_PICKUP_PLATFORMS.some(({ value }) => value === record?.selfPickupPlatform)) return record.selfPickupPlatform
  const legacyText = `${record?.meta || ''} ${record?.detail || ''}`
  if (/天猫|淘宝/u.test(legacyText)) return 'tmall'
  if (/京东/u.test(legacyText)) return 'jd'
  if (/小程序/u.test(legacyText)) return 'mini-program'
  return ''
}

export function selfPickupPlatformLabel(record) {
  const platform = inferSelfPickupPlatform(record)
  return SELF_PICKUP_PLATFORMS.find(({ value }) => value === platform)?.label || ''
}

export function inferPickupNotificationStatus(record) {
  if (PICKUP_NOTIFICATION_STATUSES.some(({ value }) => value === record?.notificationStatus)) return record.notificationStatus
  if (/已通知/u.test(`${record?.status || ''} ${record?.detail || ''}`)) return 'notified'
  return 'pending'
}

export function pickupNotificationLabel(record) {
  const status = inferPickupNotificationStatus(record)
  return PICKUP_NOTIFICATION_STATUSES.find(({ value }) => value === status)?.label || '等待确认通知'
}

export function normalizePickupNotificationRecord(record) {
  if (!record || record.scene !== 'pickup') return record
  const notificationStatus = inferPickupNotificationStatus(record)
  const legacyNotificationState = /^(?:待确认|待确认通知|等待确认通知|已通知)$/u.test(String(record.status || '').trim())
  const repairSource = inferPickupSource(record) === 'repair'
  const repairText = `${record.meta || ''} ${record.detail || ''}`
  const status = legacyNotificationState
    ? repairSource
      ? /质保单/u.test(repairText)
        ? '已开质保单'
        : /付款单/u.test(repairText)
          ? '已开付款单'
          : '维修中'
      : inferPickupSource(record) === 'self-pickup'
        ? '等待顾客取车'
        : '等待取车'
    : record.status
  const normalizedDetail = String(record.detail || '').replace(/^通知状态[：:]\s*(?:待确认|待确认通知|等待确认通知|已通知)\s*[·・]\s*/u, '')
  const pickupSource = inferPickupSource(record)
  const selfPickupPlatform = pickupSource === 'self-pickup' ? inferSelfPickupPlatform(record) : ''
  const detail = pickupSource === 'self-pickup' ? '' : normalizedDetail
  return { ...record, notificationStatus, status, detail, selfPickupPlatform }
}

export function pickupRecordToDraft(record) {
  if (!record) return { ...emptyPickupDraft }
  const pickupSource = inferPickupSource(record)
  const contact = decodePickupContact(record)
  return {
    title: record?.title || '',
    detail: record?.detail || '',
    meta: record?.meta || '',
    status: record?.status || '',
    pickupSource,
    selfPickupPlatform: pickupSource === 'self-pickup' ? inferSelfPickupPlatform(record) : '',
    contactType: contact.contactType,
    contactValue: contact.contactValue
  }
}

export function normalizePickupValues(values) {
  const title = text(values.title, 80)
  const detail = text(values.detail, 240)
  const status = text(values.status, 80)
  const pickupSource = text(values.pickupSource, 32)
  const selfPickupPlatform = text(values.selfPickupPlatform, 32)
  const contactType = text(values.contactType, 16) || 'phone'
  // Prefer structured contactValue; fall back to meta for older callers / V5.5.8 payloads.
  const contactValue = text(values.contactValue ?? values.meta, 80)

  if (!MANUAL_PICKUP_SOURCES.some(({ value }) => value === pickupSource)) return { ok: false, error: '手动增加待取车辆时，请选择自提订单车辆或顾客暂存。' }
  if (!title || !status) return { ok: false, error: '请填写车辆标识和当前状态。' }
  if (!PICKUP_CONTACT_TYPES.some(({ value }) => value === contactType)) return { ok: false, error: '请选择手机号或会员号。' }
  // contactValue is optional; empty is allowed and surfaces as「无」on cards.
  if (pickupSource === 'customer-storage' && !detail) return { ok: false, error: '请填写顾客暂存说明。' }
  if (pickupSource === 'self-pickup' && !SELF_PICKUP_PLATFORMS.some(({ value }) => value === selfPickupPlatform)) {
    return { ok: false, error: '请选择天猫、京东或小程序。' }
  }

  const meta = encodePickupContactMeta(contactType, contactValue)

  return {
    ok: true,
    fields: {
      title,
      detail: pickupSource === 'self-pickup' ? '' : detail,
      meta,
      status,
      pickupSource,
      selfPickupPlatform: pickupSource === 'self-pickup' ? selfPickupPlatform : '',
      contactType,
      contactValue
    }
  }
}

export function buildPickupNotificationUpdate(record, notificationStatus, at) {
  if (!record || record.scene !== 'pickup' || record.pickedUpOn) {
    return { ok: false, error: '没有找到可更新通知状态的待取车辆。' }
  }
  if (!PICKUP_NOTIFICATION_STATUSES.some(({ value }) => value === notificationStatus)) {
    return { ok: false, error: '请选择有效的通知状态。' }
  }
  return {
    ok: true,
    record: {
      ...record,
      notificationStatus,
      notifiedAt: notificationStatus === 'notified' ? at : null,
      updatedAt: at
    }
  }
}

export function validatePickup(record, suppliedCode = '') {
  const pickupSource = inferPickupSource(record)
  if (pickupSource === 'repair' && record.repairType !== FREE_REPAIR && !REPAIR_PICKUP_READY_STATUSES.includes(record.status)) {
    return { ok: false, error: '维修车辆取车失败：非免费维修的当前状态必须为“已开付款单”或“已开质保单”。' }
  }
  if (pickupSource === 'self-pickup' && !text(suppliedCode, 40)) {
    return { ok: false, error: '请输入顾客提供的取货码后再确认取车。' }
  }
  return { ok: true, pickupSource }
}
