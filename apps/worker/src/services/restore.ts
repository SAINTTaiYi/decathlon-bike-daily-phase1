import { nowIso } from '../db.js'

function pick(obj: Record<string, unknown> | null | undefined, ...keys: string[]): unknown {
  if (!obj) return null
  for (const key of keys) {
    if (obj[key] !== undefined) return obj[key]
  }
  return null
}

export async function restoreSnapshot(db: D1Database, snapshot: Record<string, unknown>): Promise<void> {
  const workItem = (snapshot.workItem ?? snapshot.work_item) as Record<string, unknown> | undefined
  if (!workItem?.id) throw new Error('INVALID_SNAPSHOT')
  const id = String(workItem.id)
  const stamp = nowIso()
  await db.prepare(`
    UPDATE work_items SET
      kind = ?, title = ?, detail = ?, meta = ?, status = ?, lifecycle = ?,
      revision = ?, updated_by = ?, deleted_by = ?, deleted_at = ?, updated_at = ?
    WHERE id = ?
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
    id
  ).run()

  const repair = (snapshot.repair ?? null) as Record<string, unknown> | null
  if (repair) {
    await db.prepare(`
      INSERT INTO repair_details (
        work_item_id, contact_type, contact_ciphertext, contact_fingerprint, repair_type, repair_project,
        pickup_date, repair_status, repair_completed_at, completed_on, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      repair.completedAt ?? repair.completed_at ?? null
    ).run()
  }

  const pickup = (snapshot.pickup ?? null) as Record<string, unknown> | null
  if (pickup) {
    await db.prepare(`
      INSERT INTO pickup_details (
        work_item_id, pickup_source, self_pickup_platform, notification_status, repair_work_item_id,
        picked_up_on, picked_up_at, picked_up_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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
      pickup.pickedUpBy ?? pickup.picked_up_by ?? null
    ).run()
  }

  const resale = (snapshot.resale ?? null) as Record<string, unknown> | null
  if (resale) {
    await db.prepare(`
      INSERT INTO resale_details (work_item_id, resale_stage, listed_at, sold_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(work_item_id) DO UPDATE SET
        resale_stage = excluded.resale_stage,
        listed_at = excluded.listed_at,
        sold_at = excluded.sold_at
    `).bind(
      id,
      String(resale.resaleStage ?? resale.resale_stage ?? 'pending'),
      resale.listedAt ?? resale.listed_at ?? null,
      resale.soldAt ?? resale.sold_at ?? null
    ).run()
  }

  const handover = (snapshot.handover ?? null) as Record<string, unknown> | null
  if (handover) {
    await db.prepare(`
      INSERT INTO handover_details (work_item_id, completed_on, completed_at, completed_by)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(work_item_id) DO UPDATE SET
        completed_on = excluded.completed_on,
        completed_at = excluded.completed_at,
        completed_by = excluded.completed_by
    `).bind(
      id,
      handover.completedOn ?? handover.completed_on ?? null,
      handover.completedAt ?? handover.completed_at ?? null,
      handover.completedBy ?? handover.completed_by ?? null
    ).run()
  }
}
