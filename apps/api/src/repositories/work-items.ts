import type { Database } from '@bike-ops/database'
import type { AppConfig } from '../config.js'
import { decryptContact } from '../lib/contact-crypto.js'

export interface WorkItemRecord {
  id: string
  scene: 'pickup' | 'poster' | 'repair' | 'resale'
  kind: string
  title: string
  detail: string
  meta: string
  status: string
  lifecycle: string
  revision: number
  createdAt: string | Date
  updatedAt: string | Date
  contactType?: string
  contactValue?: string
  repairType?: string
  repairProject?: string
  pickupDate?: string
  repairCompletedAt?: string | Date | null
  completedOn?: string
  completedAt?: string | Date | null
  pickupSource?: string
  selfPickupPlatform?: string
  notificationStatus?: string
  pickedUpOn?: string
  pickedUpAt?: string | Date | null
  resaleStage?: string
  listedAt?: string | Date | null
  soldAt?: string | Date | null
  pickedUpToday?: boolean
  completedToday?: boolean
}

interface JoinedItemRow {
  id: string
  kind: 'pickup' | 'handover' | 'repair' | 'resale'
  title: string
  detail: string
  meta: string
  status: string
  lifecycle: string
  revision: number
  createdAt: Date
  updatedAt: Date
  contactType: string | null
  contactCiphertext: string | null
  repairType: string | null
  repairProject: string | null
  pickupDate: string | null
  repairCompletedAt: Date | null
  repairCompletedOn: string | null
  repairCompletedAtFinal: Date | null
  pickupSource: string | null
  selfPickupPlatform: string | null
  notificationStatus: string | null
  pickedUpOn: string | null
  pickedUpAt: Date | null
  resaleStage: string | null
  listedAt: Date | null
  soldAt: Date | null
  handoverCompletedOn: string | null
  handoverCompletedAt: Date | null
}

const joinedSelect = `
  select w.id, w.kind, w.title, w.detail, w.meta, w.status, w.lifecycle, w.revision, w.created_at, w.updated_at,
         r.contact_type, r.contact_ciphertext, r.repair_type, r.repair_project, r.pickup_date,
         r.repair_completed_at, r.completed_on as repair_completed_on, r.completed_at as repair_completed_at_final,
         p.pickup_source, p.self_pickup_platform, p.notification_status, p.picked_up_on, p.picked_up_at,
         rs.resale_stage, rs.listed_at, rs.sold_at,
         h.completed_on as handover_completed_on, h.completed_at as handover_completed_at
  from bike_ops.work_items w
  left join bike_ops.repair_details r on r.work_item_id = w.id
  left join bike_ops.pickup_details p on p.work_item_id = w.id
  left join bike_ops.resale_details rs on rs.work_item_id = w.id
  left join bike_ops.handover_details h on h.work_item_id = w.id
`

function sceneFor(kind: JoinedItemRow['kind']): WorkItemRecord['scene'] {
  return kind === 'handover' ? 'poster' : kind
}

export function mapWorkItem(row: JoinedItemRow, businessDate: string, config: AppConfig): WorkItemRecord {
  const completedOn = row.handoverCompletedOn ?? row.repairCompletedOn ?? undefined
  const completedAt = row.handoverCompletedAt ?? row.repairCompletedAtFinal ?? undefined
  return {
    id: row.id,
    scene: sceneFor(row.kind),
    kind: row.kind,
    title: row.title,
    detail: row.detail,
    meta: row.meta,
    status: row.status,
    lifecycle: row.lifecycle,
    revision: row.revision,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.contactType ? { contactType: row.contactType } : {}),
    ...(row.contactCiphertext && config.CONTACT_ENCRYPTION_KEY ? { contactValue: decryptContact(row.contactCiphertext, config.CONTACT_ENCRYPTION_KEY) } : {}),
    ...(row.repairType ? { repairType: row.repairType } : {}),
    ...(row.repairProject ? { repairProject: row.repairProject } : {}),
    ...(row.pickupDate ? { pickupDate: row.pickupDate } : {}),
    ...(row.repairCompletedAt ? { repairCompletedAt: row.repairCompletedAt } : {}),
    ...(completedOn ? { completedOn, completedToday: completedOn === businessDate } : {}),
    ...(completedAt ? { completedAt } : {}),
    ...(row.pickupSource ? { pickupSource: row.pickupSource } : {}),
    ...(row.selfPickupPlatform ? { selfPickupPlatform: row.selfPickupPlatform } : {}),
    ...(row.notificationStatus ? { notificationStatus: row.notificationStatus } : {}),
    ...(row.pickedUpOn ? { pickedUpOn: row.pickedUpOn, pickedUpToday: row.pickedUpOn === businessDate } : {}),
    ...(row.pickedUpAt ? { pickedUpAt: row.pickedUpAt } : {}),
    ...(row.resaleStage ? { resaleStage: row.resaleStage } : {}),
    ...(row.listedAt ? { listedAt: row.listedAt } : {}),
    ...(row.soldAt ? { soldAt: row.soldAt } : {})
  }
}

export async function listWorkItems(sql: Database, storeId: string, businessDate: string, config: AppConfig): Promise<WorkItemRecord[]> {
  const rows = await sql.unsafe<JoinedItemRow[]>(`${joinedSelect} where w.store_id = $1 and w.deleted_at is null and w.lifecycle <> 'sold' order by w.created_at asc`, [storeId])
  return rows.map((row) => mapWorkItem(row, businessDate, config))
}

export async function getWorkItem(sql: Database, storeId: string, id: string, businessDate: string, config: AppConfig): Promise<WorkItemRecord | null> {
  const rows = await sql.unsafe<JoinedItemRow[]>(`${joinedSelect} where w.store_id = $1 and w.id = $2 and w.deleted_at is null limit 1`, [storeId, id])
  return rows[0] ? mapWorkItem(rows[0], businessDate, config) : null
}

export async function internalSnapshot(sql: Database, storeId: string, id: string): Promise<Record<string, unknown> | null> {
  const [workItem] = await sql<Record<string, unknown>[]>`select * from bike_ops.work_items where store_id = ${storeId} and id = ${id}`
  if (!workItem) return null
  const [repair] = await sql<Record<string, unknown>[]>`select * from bike_ops.repair_details where work_item_id = ${id}`
  const [pickup] = await sql<Record<string, unknown>[]>`select * from bike_ops.pickup_details where work_item_id = ${id}`
  const [resale] = await sql<Record<string, unknown>[]>`select * from bike_ops.resale_details where work_item_id = ${id}`
  const [handover] = await sql<Record<string, unknown>[]>`select * from bike_ops.handover_details where work_item_id = ${id}`
  return { workItem, repair: repair ?? null, pickup: pickup ?? null, resale: resale ?? null, handover: handover ?? null }
}
