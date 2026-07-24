import { normalizeRepair, validatePickup } from '@bike-ops/domain'

export interface LegacyRecordPlan {
  index: number
  sourceId: string
  kind: 'pickup' | 'handover' | 'repair' | 'resale'
  title: string
  detail: string
  meta: string
  status: string
  lifecycle: 'active' | 'completed' | 'picked-up'
  repair: null | {
    contactType: string
    contactValue: string
    repairType: string
    repairProject: string
    pickupDate: string
    repairStatus: string
    repairCompletedAt: string | null
    completedOn: string | null
    completedAt: string | null
  }
  pickup: null | {
    pickupSource: 'self-pickup' | 'repair' | 'customer-storage' | 'used-car'
    selfPickupPlatform: 'tmall' | 'jd' | 'mini-program' | null
    notificationStatus: 'pending' | 'notified'
    pickedUpOn: string | null
    pickedUpAt: string | null
  }
  resale: null | { resaleStage: 'pending' | 'listed'; listedAt: string | null }
  handover: null | { completedOn: string | null; completedAt: string | null }
}

export interface LegacyRejectedRecord {
  index: number
  sourceId: string
  reason: string
}

function text(value: unknown, max: number): string {
  return String(value ?? '').trim().slice(0, max)
}

function pickupSource(record: Record<string, unknown>): 'self-pickup' | 'repair' | 'customer-storage' | 'used-car' {
  if (record.pickupSource === 'self-pickup' || record.pickupSource === 'repair' || record.pickupSource === 'customer-storage' || record.pickupSource === 'used-car') return record.pickupSource
  const legacyText = `${text(record.meta, 240)} ${text(record.detail, 500)}`
  if (record.repairType || record.repairCompletedAt || /维修单|维修完成|付款单|质保单/u.test(legacyText)) return 'repair'
  if (record.kind === 'online' || /线上自提|自提订单/u.test(legacyText)) return 'self-pickup'
  return 'customer-storage'
}

function pickupPlatform(record: Record<string, unknown>): 'tmall' | 'jd' | 'mini-program' | '' {
  if (record.selfPickupPlatform === 'tmall' || record.selfPickupPlatform === 'jd' || record.selfPickupPlatform === 'mini-program') return record.selfPickupPlatform
  const legacyText = `${text(record.meta, 240)} ${text(record.detail, 500)}`
  if (/天猫|淘宝/u.test(legacyText)) return 'tmall'
  if (/京东/u.test(legacyText)) return 'jd'
  if (/小程序/u.test(legacyText)) return 'mini-program'
  return ''
}

function validIsoDate(value: unknown): string | null {
  const normalized = text(value, 10)
  return /^\d{4}-\d{2}-\d{2}$/u.test(normalized) ? normalized : null
}

export function planLegacyRecords(records: unknown[]): { accepted: LegacyRecordPlan[]; rejected: LegacyRejectedRecord[] } {
  const accepted: LegacyRecordPlan[] = []
  const rejected: LegacyRejectedRecord[] = []

  records.forEach((raw, index) => {
    const record = raw && typeof raw === 'object' ? raw as Record<string, unknown> : null
    const sourceId = record ? text(record.id, 160) || `legacy-${index + 1}` : `legacy-${index + 1}`
    if (!record) return rejected.push({ index, sourceId, reason: '记录不是对象' })
    const scene = text(record.scene, 24)
    const title = text(record.title, 120)
    const detail = text(record.detail, 500)
    const meta = text(record.meta, 240)
    const status = text(record.status, 80)
    if (!['pickup', 'poster', 'repair', 'resale'].includes(scene)) return rejected.push({ index, sourceId, reason: '未知业务模块' })
    if (!title || !status) return rejected.push({ index, sourceId, reason: '缺少标题或当前状态' })

    if (scene === 'repair') {
      const completedOn = validIsoDate(record.completedOn)
      const normalized = normalizeRepair({ ...record, status: status === '已完成' ? '维修中' : status })
      if (!normalized.ok) return rejected.push({ index, sourceId, reason: normalized.error })
      accepted.push({
        index, sourceId, kind: 'repair', title: normalized.fields.title, detail: normalized.fields.repairProject,
        meta: normalized.fields.repairType, status: completedOn ? '已完成' : normalized.fields.status,
        lifecycle: completedOn ? 'completed' : 'active',
        repair: {
          contactType: normalized.fields.contactType, contactValue: normalized.fields.contactValue,
          repairType: normalized.fields.repairType, repairProject: normalized.fields.repairProject,
          pickupDate: normalized.fields.pickupDate, repairStatus: completedOn ? '已完成' : normalized.fields.status,
          repairCompletedAt: text(record.repairCompletedAt, 40) || null, completedOn,
          completedAt: text(record.completedAt, 40) || null
        },
        pickup: null, resale: null, handover: null
      })
      return
    }

    if (scene === 'pickup') {
      const source = pickupSource(record)
      const pickedUpOn = validIsoDate(record.pickedUpOn)
      const notificationStatus = record.notificationStatus === 'notified' || /已通知/u.test(status) ? 'notified' : 'pending'
      if (source === 'repair') {
        const normalized = normalizeRepair(record)
        if (!normalized.ok) return rejected.push({ index, sourceId, reason: `维修来源待取：${normalized.error}` })
        accepted.push({
          index, sourceId, kind: 'pickup', title: normalized.fields.title, detail: normalized.fields.repairProject,
          meta: normalized.fields.repairType, status: pickedUpOn ? '已取车' : normalized.fields.status,
          lifecycle: pickedUpOn ? 'picked-up' : 'active',
          repair: {
            contactType: normalized.fields.contactType, contactValue: normalized.fields.contactValue,
            repairType: normalized.fields.repairType, repairProject: normalized.fields.repairProject,
            pickupDate: normalized.fields.pickupDate, repairStatus: normalized.fields.status,
            repairCompletedAt: text(record.repairCompletedAt, 40) || null, completedOn: null, completedAt: null
          },
          pickup: { pickupSource: 'repair', selfPickupPlatform: null, notificationStatus, pickedUpOn, pickedUpAt: text(record.pickedUpAt, 40) || null },
          resale: null, handover: null
        })
        return
      }
      const normalized = validatePickup({
        pickupSource: source,
        selfPickupPlatform: source === 'self-pickup' ? pickupPlatform(record) : '',
        title, detail, meta, status: pickedUpOn ? '等待取车' : status
      })
      if (!normalized.ok) return rejected.push({ index, sourceId, reason: normalized.error })
      accepted.push({
        index, sourceId, kind: 'pickup', title: normalized.fields.title, detail: normalized.fields.detail,
        meta: normalized.fields.meta, status: pickedUpOn ? '已取车' : normalized.fields.status,
        lifecycle: pickedUpOn ? 'picked-up' : 'active', repair: null,
        pickup: {
          pickupSource: source, selfPickupPlatform: normalized.fields.selfPickupPlatform as 'tmall' | 'jd' | 'mini-program' | null || null,
          notificationStatus, pickedUpOn, pickedUpAt: text(record.pickedUpAt, 40) || null
        },
        resale: null, handover: null
      })
      return
    }

    if (!detail) return rejected.push({ index, sourceId, reason: '缺少事项说明' })
    if (scene === 'resale') {
      const resaleStage = record.resaleStage === 'pending' ? 'pending' : 'listed'
      accepted.push({ index, sourceId, kind: 'resale', title, detail, meta, status, lifecycle: 'active', repair: null, pickup: null, resale: { resaleStage, listedAt: text(record.listedAt, 40) || null }, handover: null })
      return
    }
    const completedOn = validIsoDate(record.completedOn)
    accepted.push({ index, sourceId, kind: 'handover', title, detail, meta, status: completedOn ? '已完成' : status, lifecycle: completedOn ? 'completed' : 'active', repair: null, pickup: null, resale: null, handover: { completedOn, completedAt: text(record.completedAt, 40) || null } })
  })

  return { accepted, rejected }
}
