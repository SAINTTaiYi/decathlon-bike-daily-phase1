import type { AppConfig } from '../env.js'
import { all, camelRow, first } from '../db.js'
import { decryptContact } from '../lib/contact-crypto.js'

export interface WorkItemRecord {
  id: string
  ticketNo: number
  scene: 'pickup' | 'poster' | 'repair' | 'resale'
  kind: string
  title: string
  detail: string
  meta: string
  status: string
  lifecycle: string
  revision: number
  createdAt: string
  updatedAt: string
  contactType?: string
  contactValue?: string
  repairType?: string
  repairProject?: string
  pickupDate?: string
  repairCompletedAt?: string | null
  completedOn?: string
  completedAt?: string | null
  pickupSource?: string
  selfPickupPlatform?: string
  notificationStatus?: string
  pickedUpOn?: string
  pickedUpAt?: string | null
  resaleStage?: string
  listedAt?: string | null
  soldAt?: string | null
  pickedUpToday?: boolean
  completedToday?: boolean
  assignedTo?: string | null
  assignedAt?: string | null
  assigneeName?: string
}

const joinedSelect = `
  SELECT w.id, w.ticket_no, w.kind, w.title, w.detail, w.meta, w.status, w.lifecycle, w.revision, w.created_at, w.updated_at,
         w.assigned_to, w.assigned_at, u.display_name AS assignee_name,
         r.contact_type, r.contact_ciphertext, r.repair_type, r.repair_project, r.pickup_date,
         r.repair_completed_at, r.completed_on AS repair_completed_on, r.completed_at AS repair_completed_at_final,
         p.pickup_source, p.self_pickup_platform, p.notification_status, p.picked_up_on, p.picked_up_at,
         rs.resale_stage, rs.listed_at, rs.sold_at,
         h.completed_on AS handover_completed_on, h.completed_at AS handover_completed_at,
         h.contact_ciphertext AS handover_contact_ciphertext
  FROM work_items w
  LEFT JOIN repair_details r ON r.work_item_id = w.id
  LEFT JOIN pickup_details p ON p.work_item_id = w.id
  LEFT JOIN resale_details rs ON rs.work_item_id = w.id
  LEFT JOIN handover_details h ON h.work_item_id = w.id
  LEFT JOIN users u ON u.id = w.assigned_to
`

function sceneFor(kind: string): WorkItemRecord['scene'] {
  return kind === 'handover' ? 'poster' : kind as WorkItemRecord['scene']
}

async function optionalContactValue(payload: string | null, key: string | undefined): Promise<string | undefined> {
  if (!payload || !key) return undefined
  try {
    return await decryptContact(payload, key)
  } catch {
    return undefined
  }
}

export async function mapWorkItem(row: any, businessDate: string, config: AppConfig): Promise<WorkItemRecord> {
  const completedOn = row.handover_completed_on ?? row.repair_completed_on ?? undefined
  const completedAt = row.handover_completed_at ?? row.repair_completed_at_final ?? undefined
  const contactValue = await optionalContactValue(
    row.contact_ciphertext ?? row.handover_contact_ciphertext,
    config.CONTACT_ENCRYPTION_KEY
  )
  return {
    id: row.id,
    ticketNo: Number(row.ticket_no),
    scene: sceneFor(row.kind),
    kind: row.kind,
    title: row.title,
    detail: row.detail,
    meta: row.meta,
    status: row.status,
    lifecycle: row.lifecycle,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.contact_type ? { contactType: row.contact_type } : {}),
    ...(contactValue !== undefined ? { contactValue } : {}),
    ...(row.repair_type ? { repairType: row.repair_type } : {}),
    ...(row.repair_project ? { repairProject: row.repair_project } : {}),
    ...(row.pickup_date ? { pickupDate: row.pickup_date } : {}),
    ...(row.repair_completed_at ? { repairCompletedAt: row.repair_completed_at } : {}),
    ...(completedOn ? { completedOn, completedToday: completedOn === businessDate } : {}),
    ...(completedAt ? { completedAt } : {}),
    ...(row.pickup_source ? { pickupSource: row.pickup_source } : {}),
    ...(row.self_pickup_platform ? { selfPickupPlatform: row.self_pickup_platform } : {}),
    ...(row.notification_status ? { notificationStatus: row.notification_status } : {}),
    ...(row.picked_up_on ? { pickedUpOn: row.picked_up_on, pickedUpToday: row.picked_up_on === businessDate } : {}),
    ...(row.picked_up_at ? { pickedUpAt: row.picked_up_at } : {}),
    ...(row.resale_stage ? { resaleStage: row.resale_stage } : {}),
    ...(row.listed_at ? { listedAt: row.listed_at } : {}),
    ...(row.sold_at ? { soldAt: row.sold_at } : {}),
    ...(row.assigned_to ? { assignedTo: row.assigned_to, assignedAt: row.assigned_at ?? undefined, assigneeName: row.assignee_name ?? undefined } : {})
  }
}

export async function listWorkItems(db: D1Database, storeId: string, businessDate: string, config: AppConfig): Promise<WorkItemRecord[]> {
  const rows = await all(db.prepare(`${joinedSelect} WHERE w.store_id = ? AND w.deleted_at IS NULL AND w.lifecycle <> 'sold' ORDER BY w.created_at ASC`).bind(storeId))
  return Promise.all(rows.map((row) => mapWorkItem(row, businessDate, config)))
}

export async function listStoreMembers(db: D1Database, storeId: string): Promise<Array<{ id: string; displayName: string; role: string }>> {
  const rows = await all<{ id: string; display_name: string; role: string }>(db.prepare(`
    SELECT u.id, u.display_name, sm.role
    FROM store_members sm
    JOIN users u ON u.id = sm.user_id
    WHERE sm.store_id = ? AND sm.status = 'active' AND u.status = 'active'
    ORDER BY CASE sm.role WHEN 'admin' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END, u.display_name ASC
  `).bind(storeId))
  return rows.map((row) => ({ id: row.id, displayName: row.display_name, role: row.role }))
}

export async function listAssignedToMe(db: D1Database, storeId: string, userId: string, businessDate: string, config: AppConfig): Promise<WorkItemRecord[]> {
  const rows = await all(db.prepare(`${joinedSelect} WHERE w.store_id = ? AND w.assigned_to = ? AND w.deleted_at IS NULL AND w.lifecycle = 'active' ORDER BY w.updated_at DESC`).bind(storeId, userId))
  return Promise.all(rows.map((row) => mapWorkItem(row, businessDate, config)))
}

export async function getWorkItem(db: D1Database, storeId: string, id: string, businessDate: string, config: AppConfig): Promise<WorkItemRecord | null> {
  const row = await first(db.prepare(`${joinedSelect} WHERE w.store_id = ? AND w.id = ? AND w.deleted_at IS NULL LIMIT 1`).bind(storeId, id))
  return row ? mapWorkItem(row, businessDate, config) : null
}

export async function internalSnapshot(db: D1Database, storeId: string, id: string): Promise<Record<string, unknown> | null> {
  // D1 is a network service: every awaited statement costs a full round trip. These five
  // reads are mutually independent, so they are issued concurrently and cost one round-trip
  // window instead of five. Row shapes and the returned object are unchanged.
  const [workItem, repair, pickup, resale, handover] = await Promise.all([
    first(db.prepare('SELECT * FROM work_items WHERE store_id = ? AND id = ?').bind(storeId, id)),
    first(db.prepare('SELECT * FROM repair_details WHERE work_item_id = ?').bind(id)),
    first(db.prepare('SELECT * FROM pickup_details WHERE work_item_id = ?').bind(id)),
    first(db.prepare('SELECT * FROM resale_details WHERE work_item_id = ?').bind(id)),
    first(db.prepare('SELECT * FROM handover_details WHERE work_item_id = ?').bind(id))
  ])
  if (!workItem) return null
  return {
    workItem: camelRow(workItem),
    repair: camelRow(repair),
    pickup: camelRow(pickup),
    resale: camelRow(resale),
    handover: camelRow(handover)
  }
}
