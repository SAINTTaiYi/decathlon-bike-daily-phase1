import type { FastifyInstance } from 'fastify'
import type { Database } from '@bike-ops/database'
import { createAuthMiddleware } from '../auth/middleware.js'
import type { AppConfig } from '../config.js'
import { businessDateFor, ensureDayOpen, writeAudit } from '../services/business.js'
import { ApiProblem, idempotent } from '../services/idempotency.js'
import { restoreSnapshot } from '../services/restore.js'

type AuditScene = 'pickup' | 'poster' | 'repair' | 'resale'

export interface AuditRow {
  id: string
  action: string
  entityType: string
  entityId: string | null
  actorNameSnapshot: string
  businessDate: string
  summary: string
  reversible: boolean
  revertedBy: string | null
  revertedAt: Date | null
  hasLaterEvent: boolean
  beforeKind: string | null
  afterKind: string | null
  currentKind: string | null
  createdAt: Date
}

export function auditSceneForKind(kind: string | null | undefined): AuditScene | null {
  if (kind === 'handover') return 'poster'
  if (kind === 'pickup' || kind === 'repair' || kind === 'resale') return kind
  return null
}

export function mapAuditEvent(row: AuditRow, undoBusinessDate?: string) {
  const previousScene = auditSceneForKind(row.beforeKind)
  const nextScene = auditSceneForKind(row.afterKind)
  const scene = nextScene ?? previousScene ?? auditSceneForKind(row.currentKind)
  return {
    id: row.id,
    type: row.action,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    actorName: row.actorNameSnapshot,
    dateKey: row.businessDate,
    label: row.summary,
    message: row.revertedBy ? '该操作已撤回' : row.summary,
    at: row.createdAt,
    undoneAt: row.revertedAt,
    scene,
    previousScene,
    nextScene,
    canUndo: row.reversible && !row.revertedBy && !row.hasLaterEvent && row.businessDate === undoBusinessDate
  }
}

export async function listAudit(sql: Database, storeId: string, businessDate?: string, undoBusinessDate = businessDate) {
  const rows = await sql<AuditRow[]>`
    select e.id, e.action, e.entity_type, e.entity_id, e.actor_name_snapshot, e.business_date, e.summary,
      e.reversible, reverse.id as reverted_by, reverse.created_at as reverted_at,
      exists(select 1 from bike_ops.audit_events later where later.store_id = e.store_id
        and later.entity_type = e.entity_type and later.entity_id is not distinct from e.entity_id
        and later.created_at > e.created_at) as has_later_event,
      coalesce(e.before_state #>> '{workItem,kind}', e.before_state #>> '{work_item,kind}') as before_kind,
      coalesce(e.after_state #>> '{workItem,kind}', e.after_state #>> '{work_item,kind}') as after_kind,
      current_item.kind as current_kind,
      e.created_at
    from bike_ops.audit_events e
    left join bike_ops.audit_events reverse on reverse.reverted_event_id = e.id
    left join bike_ops.work_items current_item on current_item.id = e.entity_id and current_item.store_id = e.store_id
    where e.store_id = ${storeId} and (${businessDate ?? null}::date is null or e.business_date = ${businessDate ?? null}::date)
    order by e.created_at desc limit 500
  `
  return rows.map((row) => mapAuditEvent(row, undoBusinessDate))
}

export async function registerAuditRoutes(app: FastifyInstance, sql: Database, config: AppConfig): Promise<void> {
  const auth = createAuthMiddleware(sql, config)

  app.get('/api/v1/audit-events', { preHandler: [auth.loadSession, auth.requirePasswordChanged] }, async (request) => {
    const context = request.auth!
    const query = request.query as { date?: string }
    const currentBusinessDate = await businessDateFor(context)
    return { events: await listAudit(sql, context.storeId, query.date, currentBusinessDate) }
  })

  app.post('/api/v1/audit-events/:id/undo', { preHandler: [auth.loadSession, auth.requirePasswordChanged, auth.requireCsrf] }, async (request, reply) => {
    const context = request.auth!
    const targetId = (request.params as { id: string }).id
    const result = await idempotent(sql, request, async (tx) => {
      const businessDate = await businessDateFor(context)
      await ensureDayOpen(tx, context, businessDate)
      const [target] = await tx<{
        id: string; action: string; entityType: string; entityId: string | null; summary: string; businessDate: string;
        beforeState: Record<string, unknown> | null; afterState: Record<string, unknown> | null; reversible: boolean
      }[]>`
        select id, action, entity_type, entity_id, summary, business_date, before_state, after_state, reversible
        from bike_ops.audit_events where id = ${targetId} and store_id = ${context.storeId} for update
      `
      if (!target || !target.reversible) throw new ApiProblem(409, 'UNDO_NOT_AVAILABLE', '该操作不能撤回。')
      if (target.businessDate !== businessDate) throw new ApiProblem(409, 'UNDO_EXPIRED', '跨日操作只能查看，不能在当前业务日撤回。')
      const [blocked] = await tx<{ exists: boolean }[]>`
        select exists(
          select 1 from bike_ops.audit_events e where e.store_id = ${context.storeId}
          and e.entity_type = ${target.entityType} and e.entity_id is not distinct from ${target.entityId}
          and e.created_at > (select created_at from bike_ops.audit_events where id = ${target.id})
        ) as exists
      `
      if (blocked?.exists) throw new ApiProblem(409, 'UNDO_NOT_LATEST', '该对象已有后续操作，不能撤回旧操作。')
      const [already] = await tx<{ id: string }[]>`select id from bike_ops.audit_events where reverted_event_id = ${target.id}`
      if (already) throw new ApiProblem(409, 'ALREADY_UNDONE', '该操作已经撤回。')

      if (target.entityType === 'work-item') {
        if (!target.entityId) throw new ApiProblem(422, 'INVALID_AUDIT_EVENT', '审计事件缺少业务对象。')
        if (target.beforeState) {
          await restoreSnapshot(tx, target.beforeState)
        } else {
          await tx`
            update bike_ops.work_items set lifecycle = 'deleted', deleted_at = now(), deleted_by = ${context.userId},
              updated_by = ${context.userId}, revision = revision + 1, updated_at = now()
            where id = ${target.entityId} and store_id = ${context.storeId}
          `
        }
      } else if (target.entityType === 'daily-closing') {
        const before = target.beforeState as { kpi?: Record<string, unknown>; kpiSavedAt?: string | null; closedAt?: string | null; revision?: number } | null
        if (!before?.kpi || !target.entityId) throw new ApiProblem(422, 'INVALID_AUDIT_EVENT', '审计快照不完整。')
        await tx`
          update bike_ops.daily_closings set
            sales_vehicles = ${Number(before.kpi.salesVehicles ?? 0)}, safety_checks = ${Number(before.kpi.safetyChecks ?? 0)},
            safety_model = ${String(before.kpi.safetyModel ?? '')}, valid_reviews = ${Number(before.kpi.validReviews ?? 0)},
            used_sold = ${Number(before.kpi.usedSold ?? 0)}, used_received = ${Number(before.kpi.usedReceived ?? 0)},
            sales_saved_at = ${before.kpiSavedAt ?? null}, revision = revision + 1, updated_at = now()
          where id = ${target.entityId} and store_id = ${context.storeId}
        `
      } else {
        throw new ApiProblem(409, 'UNDO_NOT_AVAILABLE', '该类型操作不能撤回。')
      }

      const eventId = await writeAudit(tx, { context, action: 'undo-operation', entityType: target.entityType, entityId: target.entityId, businessDate, summary: `撤回：${target.summary}`, before: target.afterState, after: target.beforeState, reversible: false, revertedEventId: target.id, requestId: request.id })
      return { status: 200, body: { ok: true, eventId, targetEventId: target.id } }
    })
    return reply.code(result.status).send(result.body)
  })
}
