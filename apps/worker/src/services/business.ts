import { localBusinessDate } from '@bike-ops/domain'
import type { AuthContext } from '../auth/types.js'
import { all, first, nowIso, uuid } from '../db.js'
import { ApiProblem } from './problems.js'

export async function businessDateFor(context: AuthContext): Promise<string> {
  return localBusinessDate(context.storeTimezone)
}

export async function ensureDayOpen(db: D1Database, context: AuthContext, businessDate: string): Promise<void> {
  const day = await first<{ closing_status: string }>(
    db.prepare('SELECT closing_status FROM daily_closings WHERE store_id = ? AND business_date = ?').bind(context.storeId, businessDate)
  )
  if (day?.closing_status === 'closed') throw new ApiProblem(423, 'DAY_CLOSED', '今日闭店已锁定，请先重新打开。')
}

export type AuditInput = {
  context: AuthContext
  action: string
  entityType: string
  entityId?: string | null
  entityRevision?: number | null
  businessDate: string
  summary: string
  before?: unknown
  after?: unknown
  reversible?: boolean
  revertedEventId?: string | null
  requestId?: string
}

export function prepareAudit(db: D1Database, input: AuditInput): { id: string; statement: D1PreparedStatement } {
  const id = uuid()
  const requestId = input.requestId && /^[0-9a-f-]{36}$/iu.test(input.requestId) ? input.requestId : uuid()
  const statement = db.prepare(`
    INSERT INTO audit_events (
      id, store_id, actor_user_id, actor_name_snapshot, action, entity_type, entity_id, entity_revision,
      business_date, summary, before_state, after_state, reversible, reverted_event_id, request_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    input.context.storeId,
    input.context.userId,
    input.context.displayName,
    input.action,
    input.entityType,
    input.entityId ?? null,
    input.entityRevision ?? null,
    input.businessDate,
    input.summary,
    input.before === undefined ? null : JSON.stringify(input.before),
    input.after === undefined ? null : JSON.stringify(input.after),
    input.reversible ? 1 : 0,
    input.revertedEventId ?? null,
    requestId,
    nowIso()
  )
  return { id, statement }
}

export async function writeAudit(db: D1Database, input: AuditInput): Promise<string> {
  const audit = prepareAudit(db, input)
  await audit.statement.run()
  return audit.id
}

export async function cleanupPreviousCompleted(db: D1Database, context: AuthContext, businessDate: string): Promise<number> {
  const rows = await all<{ id: string; title: string; revision: number }>(db.prepare(`
    SELECT w.id, w.title, w.revision
    FROM work_items w
    WHERE w.store_id = ? AND w.deleted_at IS NULL AND (
      EXISTS (SELECT 1 FROM pickup_details p WHERE p.work_item_id = w.id AND p.picked_up_on < ?)
      OR EXISTS (SELECT 1 FROM handover_details h WHERE h.work_item_id = w.id AND h.completed_on < ?)
      OR EXISTS (SELECT 1 FROM repair_details r WHERE r.work_item_id = w.id AND r.repair_type = '门店产品维修' AND r.completed_on < ?)
    )
  `).bind(context.storeId, businessDate, businessDate, businessDate))

  const stamp = nowIso()
  for (const row of rows) {
    await db.batch([
      db.prepare(`
        UPDATE work_items
        SET lifecycle = 'deleted', deleted_at = ?, updated_at = ?, updated_by = ?, revision = revision + 1
        WHERE id = ?
      `).bind(stamp, stamp, context.userId, row.id),
      db.prepare(`
        INSERT INTO audit_events (
          id, store_id, actor_user_id, actor_name_snapshot, action, entity_type, entity_id, entity_revision,
          business_date, summary, reversible, request_id, created_at
        ) VALUES (?, ?, NULL, '系统', 'auto-cleanup', 'work-item', ?, ?, ?, ?, 0, ?, ?)
      `).bind(uuid(), context.storeId, row.id, row.revision + 1, businessDate, `自动清理：${row.title}`, uuid(), stamp)
    ])
  }
  return rows.length
}
