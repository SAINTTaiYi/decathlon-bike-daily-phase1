import { nowIso } from '../db.js'

function pick(obj: Record<string, unknown> | null | undefined, ...keys: string[]): unknown {
  if (!obj) return null
  for (const key of keys) {
    if (obj[key] !== undefined) return obj[key]
  }
  return null
}

// Detail tables key off work_item_id and carry no store_id of their own, so tenant scope has to
// be asserted through the parent row. Every statement below is therefore conditioned on the work
// item belonging to the caller's store. Callers already validate ownership before building these
// statements; this is defence in depth, so a future caller that forgets cannot write across
// tenants. The guard is fixed internal SQL — caller values stay bound.
const OWNED = 'EXISTS (SELECT 1 FROM work_items WHERE id = ? AND store_id = ?)'

export function buildRestoreSnapshotStatements(
  db: D1Database,
  snapshot: Record<string, unknown>,
  storeId: string
): D1PreparedStatement[] {
  const workItem = (snapshot.workItem ?? snapshot.work_item) as Record<string, unknown> | undefined
  if (!workItem?.id) throw new Error('INVALID_SNAPSHOT')
  if (!storeId) throw new Error('MISSING_RESTORE_STORE_SCOPE')
  const id = String(workItem.id)
  const stamp = nowIso()
  const repair = (snapshot.repair ?? null) as Record<string, unknown> | null
  const pickup = (snapshot.pickup ?? null) as Record<string, unknown> | null
  const resale = (snapshot.resale ?? null) as Record<string, unknown> | null
  const handover = (snapshot.handover ?? null) as Record<string, unknown> | null

  // A snapshot is the complete relational state, not only the rows it happens to contain.
  // In particular, undoing repair → pickup must remove the pickup detail created by the transition.
  const statements: D1PreparedStatement[] = [
    db.prepare(`
      UPDATE work_items SET
        kind = ?, title = ?, detail = ?, meta = ?, status = ?, lifecycle = ?,
        revision = ?, updated_by = ?, deleted_by = ?, deleted_at = ?, updated_at = ?
      WHERE id = ? AND store_id = ?
    `).bind(
      String(workItem.kind),
      String(workItem.title),
      String(workItem.detail ?? ''),
      String(workItem.meta ?? ''),
      String(workItem.status),
      String(workItem.lifecycle),
      Number(workItem.revision),
      String(workItem.updatedBy ?? workItem.updated_by),
      workItem.deletedBy ?? workItem.deleted_by ?? null,
      workItem.deletedAt ?? workItem.deleted_at ?? null,
      stamp,
      id,
      storeId
    ),
    repair
      ? db.prepare(`
          INSERT INTO repair_details (
            work_item_id, contact_type, contact_ciphertext, contact_fingerprint, repair_type, repair_project,
            pickup_date, repair_status, repair_completed_at, completed_on, completed_at
          )
          SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${OWNED}
          ON CONFLICT(work_item_id) DO UPDATE SET
            contact_type = excluded.contact_type,
            contact_ciphertext = excluded.contact_ciphertext,
            contact_fingerprint = excluded.contact_fingerprint,
            repair_type = excluded.repair_type,
            repair_project = excluded.repair_project,
            pickup_date = excluded.pickup_date,
            repair_status = excluded.repair_status,
            repair_completed_at = excluded.repair_completed_at,
            completed_on = excluded.completed_on,
            completed_at = excluded.completed_at
        `).bind(
          id,
          String(repair.contactType ?? repair.contact_type),
          String(repair.contactCiphertext ?? repair.contact_ciphertext),
          repair.contactFingerprint ?? repair.contact_fingerprint ?? null,
          String(repair.repairType ?? repair.repair_type),
          String(repair.repairProject ?? repair.repair_project),
          repair.pickupDate ?? repair.pickup_date ?? null,
          String(repair.repairStatus ?? repair.repair_status),
          repair.repairCompletedAt ?? repair.repair_completed_at ?? null,
          repair.completedOn ?? repair.completed_on ?? null,
          repair.completedAt ?? repair.completed_at ?? null,
          id,
          storeId
        )
      : db.prepare(`DELETE FROM repair_details WHERE work_item_id = ? AND ${OWNED}`).bind(id, id, storeId),
    pickup
      ? db.prepare(`
          INSERT INTO pickup_details (
            work_item_id, pickup_source, self_pickup_platform, notification_status, repair_work_item_id,
            picked_up_on, picked_up_at, picked_up_by
          )
          SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE ${OWNED}
          ON CONFLICT(work_item_id) DO UPDATE SET
            pickup_source = excluded.pickup_source,
            self_pickup_platform = excluded.self_pickup_platform,
            notification_status = excluded.notification_status,
            repair_work_item_id = excluded.repair_work_item_id,
            picked_up_on = excluded.picked_up_on,
            picked_up_at = excluded.picked_up_at,
            picked_up_by = excluded.picked_up_by
        `).bind(
          id,
          String(pickup.pickupSource ?? pickup.pickup_source),
          pickup.selfPickupPlatform ?? pickup.self_pickup_platform ?? null,
          String(pickup.notificationStatus ?? pickup.notification_status ?? 'pending'),
          pickup.repairWorkItemId ?? pickup.repair_work_item_id ?? null,
          pickup.pickedUpOn ?? pickup.picked_up_on ?? null,
          pickup.pickedUpAt ?? pickup.picked_up_at ?? null,
          pickup.pickedUpBy ?? pickup.picked_up_by ?? null,
          id,
          storeId
        )
      : db.prepare(`DELETE FROM pickup_details WHERE work_item_id = ? AND ${OWNED}`).bind(id, id, storeId),
    resale
      ? db.prepare(`
          INSERT INTO resale_details (work_item_id, resale_stage, listed_at, sold_at)
          SELECT ?, ?, ?, ? WHERE ${OWNED}
          ON CONFLICT(work_item_id) DO UPDATE SET
            resale_stage = excluded.resale_stage,
            listed_at = excluded.listed_at,
            sold_at = excluded.sold_at
        `).bind(
          id,
          String(resale.resaleStage ?? resale.resale_stage ?? 'pending'),
          resale.listedAt ?? resale.listed_at ?? null,
          resale.soldAt ?? resale.sold_at ?? null,
          id,
          storeId
        )
      : db.prepare(`DELETE FROM resale_details WHERE work_item_id = ? AND ${OWNED}`).bind(id, id, storeId),
    handover
      ? db.prepare(`
          INSERT INTO handover_details (work_item_id, completed_on, completed_at, completed_by, contact_ciphertext, contact_fingerprint)
          SELECT ?, ?, ?, ?, ?, ? WHERE ${OWNED}
          ON CONFLICT(work_item_id) DO UPDATE SET
            completed_on = excluded.completed_on,
            completed_at = excluded.completed_at,
            completed_by = excluded.completed_by,
            contact_ciphertext = excluded.contact_ciphertext,
            contact_fingerprint = excluded.contact_fingerprint
        `).bind(
          id,
          handover.completedOn ?? handover.completed_on ?? null,
          handover.completedAt ?? handover.completed_at ?? null,
          handover.completedBy ?? handover.completed_by ?? null,
          handover.contactCiphertext ?? handover.contact_ciphertext ?? null,
          handover.contactFingerprint ?? handover.contact_fingerprint ?? null,
          id,
          storeId
        )
      : db.prepare(`DELETE FROM handover_details WHERE work_item_id = ? AND ${OWNED}`).bind(id, id, storeId)
  ]

  return statements
}

export async function restoreSnapshot(db: D1Database, snapshot: Record<string, unknown>, storeId: string): Promise<void> {
  await db.batch(buildRestoreSnapshotStatements(db, snapshot, storeId))
}
