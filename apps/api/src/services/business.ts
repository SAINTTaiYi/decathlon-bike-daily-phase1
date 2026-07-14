import { randomUUID } from 'node:crypto'
import type { Database } from '@bike-ops/database'
import { localBusinessDate } from '@bike-ops/domain'
import type { AuthContext } from '../auth/types.js'
import { ApiProblem } from './idempotency.js'

export async function businessDateFor(context: AuthContext): Promise<string> {
  return localBusinessDate(context.storeTimezone)
}

export async function ensureDayOpen(sql: Database, context: AuthContext, businessDate: string): Promise<void> {
  const [day] = await sql<{ closingStatus: string }[]>`
    select closing_status from bike_ops.daily_closings where store_id = ${context.storeId} and business_date = ${businessDate}
  `
  if (day?.closingStatus === 'closed') throw new ApiProblem(423, 'DAY_CLOSED', '今日闭店已锁定，请先重新打开。')
}

export async function writeAudit(sql: Database, input: {
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
}): Promise<string> {
  const requestId = input.requestId && /^[0-9a-f-]{36}$/iu.test(input.requestId) ? input.requestId : randomUUID()
  const [event] = await sql<{ id: string }[]>`
    insert into bike_ops.audit_events (
      store_id, actor_user_id, actor_name_snapshot, action, entity_type, entity_id, entity_revision,
      business_date, summary, before_state, after_state, reversible, reverted_event_id, request_id
    ) values (
      ${input.context.storeId}, ${input.context.userId}, ${input.context.displayName}, ${input.action}, ${input.entityType},
      ${input.entityId ?? null}, ${input.entityRevision ?? null}, ${input.businessDate}, ${input.summary},
      ${input.before === undefined ? null : sql.json(input.before as never)},
      ${input.after === undefined ? null : sql.json(input.after as never)},
      ${input.reversible ?? false}, ${input.revertedEventId ?? null}, ${requestId}
    ) returning id
  `
  if (!event) throw new Error('AUDIT_INSERT_FAILED')
  return event.id
}

export async function cleanupPreviousCompleted(sql: Database, context: AuthContext, businessDate: string): Promise<number> {
  const rows = await sql<{ id: string; title: string; revision: number }[]>`
    update bike_ops.work_items w set lifecycle = 'deleted', deleted_at = now(), updated_at = now(), updated_by = ${context.userId}, revision = revision + 1
    where w.store_id = ${context.storeId} and w.deleted_at is null and (
      exists (select 1 from bike_ops.pickup_details p where p.work_item_id = w.id and p.picked_up_on < ${businessDate})
      or exists (select 1 from bike_ops.handover_details h where h.work_item_id = w.id and h.completed_on < ${businessDate})
      or exists (select 1 from bike_ops.repair_details r where r.work_item_id = w.id and r.repair_type = '门店产品维修' and r.completed_on < ${businessDate})
    ) returning w.id, w.title, w.revision
  `
  for (const row of rows) {
    await sql`
      insert into bike_ops.audit_events (store_id, actor_user_id, actor_name_snapshot, action, entity_type, entity_id, entity_revision, business_date, summary, reversible, request_id)
      values (${context.storeId}, null, '系统', 'auto-cleanup', 'work-item', ${row.id}, ${row.revision}, ${businessDate}, ${`自动清理：${row.title}`}, false, ${randomUUID()})
    `
  }
  return rows.length
}
