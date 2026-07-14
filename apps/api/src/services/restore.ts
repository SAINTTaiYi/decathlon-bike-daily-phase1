import type { Database } from '@bike-ops/database'

function rowValue(row: Record<string, unknown>, key: string): string | number | boolean | Date | null {
  const value = row[key]
  if (value === null || value === undefined) return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value instanceof Date) return value
  throw new Error(`INVALID_AUDIT_SNAPSHOT_FIELD_${key}`)
}

export async function restoreSnapshot(sql: Database, snapshot: Record<string, unknown>): Promise<string> {
  const workItem = snapshot.workItem as Record<string, unknown> | undefined
  if (!workItem || typeof workItem.id !== 'string') throw new Error('INVALID_AUDIT_SNAPSHOT')
  const id = workItem.id
  await sql`
    update bike_ops.work_items set
      kind = ${rowValue(workItem, 'kind')}, title = ${rowValue(workItem, 'title')}, detail = ${rowValue(workItem, 'detail')}, meta = ${rowValue(workItem, 'meta')},
      status = ${rowValue(workItem, 'status')}, lifecycle = ${rowValue(workItem, 'lifecycle')}, revision = revision + 1,
      updated_by = ${rowValue(workItem, 'updatedBy')}, deleted_by = ${rowValue(workItem, 'deletedBy')},
      updated_at = now(), deleted_at = ${rowValue(workItem, 'deletedAt')}
    where id = ${id}
  `

  await sql`delete from bike_ops.repair_details where work_item_id = ${id}`
  const repair = snapshot.repair as Record<string, unknown> | null | undefined
  if (repair) await sql`
    insert into bike_ops.repair_details (work_item_id, contact_type, contact_ciphertext, contact_fingerprint, repair_type, repair_project, pickup_date, repair_status, repair_completed_at, completed_on, completed_at)
    values (${id}, ${rowValue(repair, 'contactType')}, ${rowValue(repair, 'contactCiphertext')}, ${rowValue(repair, 'contactFingerprint')},
      ${rowValue(repair, 'repairType')}, ${rowValue(repair, 'repairProject')}, ${rowValue(repair, 'pickupDate')}, ${rowValue(repair, 'repairStatus')},
      ${rowValue(repair, 'repairCompletedAt')}, ${rowValue(repair, 'completedOn')}, ${rowValue(repair, 'completedAt')})
  `

  await sql`delete from bike_ops.pickup_details where work_item_id = ${id}`
  const pickup = snapshot.pickup as Record<string, unknown> | null | undefined
  if (pickup) await sql`
    insert into bike_ops.pickup_details (work_item_id, pickup_source, self_pickup_platform, notification_status, repair_work_item_id, picked_up_on, picked_up_at, picked_up_by)
    values (${id}, ${rowValue(pickup, 'pickupSource')}, ${rowValue(pickup, 'selfPickupPlatform')}, ${rowValue(pickup, 'notificationStatus')},
      ${rowValue(pickup, 'repairWorkItemId')}, ${rowValue(pickup, 'pickedUpOn')}, ${rowValue(pickup, 'pickedUpAt')}, ${rowValue(pickup, 'pickedUpBy')})
  `

  await sql`delete from bike_ops.resale_details where work_item_id = ${id}`
  const resale = snapshot.resale as Record<string, unknown> | null | undefined
  if (resale) await sql`
    insert into bike_ops.resale_details (work_item_id, resale_stage, listed_at, sold_at)
    values (${id}, ${rowValue(resale, 'resaleStage')}, ${rowValue(resale, 'listedAt')}, ${rowValue(resale, 'soldAt')})
  `

  await sql`delete from bike_ops.handover_details where work_item_id = ${id}`
  const handover = snapshot.handover as Record<string, unknown> | null | undefined
  if (handover) await sql`
    insert into bike_ops.handover_details (work_item_id, completed_on, completed_at, completed_by)
    values (${id}, ${rowValue(handover, 'completedOn')}, ${rowValue(handover, 'completedAt')}, ${rowValue(handover, 'completedBy')})
  `
  return id
}
