import { Hono } from 'hono'
import type { AppConfig, WorkerEnv } from '../env.js'
import type { AuthContext } from '../auth/types.js'
import { createAuthMiddleware } from '../auth/middleware.js'
import { all, first, nowIso } from '../db.js'
import { batchWhileDayOpen, businessDateFor, ensureDayOpen, prepareAudit } from '../services/business.js'
import { idempotent } from '../services/idempotency.js'
import { ApiProblem } from '../services/problems.js'
import { buildRestoreSnapshotStatements } from '../services/restore.js'

type Vars = { config: AppConfig; auth: AuthContext | null }
type AuditScene = 'pickup' | 'poster' | 'repair' | 'resale'
type AuditModule = 'sales' | 'closing' | 'pickup' | 'repair' | 'resale' | 'handover' | 'account' | 'system'
const auditModules = new Set<AuditModule>(['sales', 'closing', 'pickup', 'repair', 'resale', 'handover', 'account', 'system'])

export function auditSceneForKind(kind: string | null | undefined): AuditScene | null {
  if (kind === 'handover') return 'poster'
  if (kind === 'pickup' || kind === 'repair' || kind === 'resale') return kind
  return null
}

function parseJson(value: unknown): any {
  if (value == null) return null
  if (typeof value === 'object') return value
  try { return JSON.parse(String(value)) } catch { return null }
}

function kindFromState(state: any): string | null {
  if (!state) return null
  return state?.workItem?.kind ?? state?.work_item?.kind ?? null
}

function auditModuleFromRow(row: any, beforeState: any, afterState: any): AuditModule {
  if (auditModules.has(row.audit_module as AuditModule)) return row.audit_module as AuditModule
  if (row.action === 'save-kpi' || row.action === 'clear-kpi') return 'sales'
  if (row.action === 'close-day' || row.action === 'reopen-day') return 'closing'
  if (['create-user', 'change-password', 'login', 'logout', 'initial-setup'].includes(row.action) || row.entity_type === 'account') return 'account'
  if (['complete-pickup', 'update-pickup-notification'].includes(row.action)) return 'pickup'
  if (row.action === 'complete-repair') return 'repair'
  if (['complete-resale-listing', 'sell-resale'].includes(row.action)) return 'resale'
  if (row.action === 'complete-handover') return 'handover'
  if (row.action === 'auto-cleanup') return 'system'
  const kind = kindFromState(afterState) ?? kindFromState(beforeState)
  if (kind === 'pickup' || kind === 'repair' || kind === 'resale') return kind
  if (kind === 'handover') return 'handover'
  return 'system'
}

export function mapAuditEvent(row: any, undoBusinessDate?: string) {
  const beforeState = parseJson(row.before_state)
  const afterState = parseJson(row.after_state)
  const previousScene = auditSceneForKind(kindFromState(beforeState) ?? row.before_kind)
  const nextScene = auditSceneForKind(kindFromState(afterState) ?? row.after_kind)
  const scene = nextScene ?? previousScene ?? auditSceneForKind(row.current_kind)
  return {
    id: row.id,
    type: row.action,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    actorName: row.actor_name_snapshot,
    dateKey: row.business_date,
    label: row.summary,
    message: row.reverted_by ? '该操作已撤回' : row.summary,
    at: row.created_at,
    undoneAt: row.reverted_at,
    scene,
    previousScene,
    nextScene,
    module: auditModuleFromRow(row, beforeState, afterState),
    canUndo: Boolean(row.reversible) && !row.reverted_by && !row.has_later_event && row.business_date === undoBusinessDate
  }
}

export async function listAudit(db: D1Database, storeId: string, businessDate?: string, undoBusinessDate = businessDate) {
  const rows = businessDate
    ? await all(db.prepare(`
        SELECT e.id, e.action, e.entity_type, e.entity_id, e.actor_name_snapshot, e.business_date, e.summary,
               e.reversible, e.before_state, e.after_state, e.audit_module, e.created_at,
               rev.id AS reverted_by, rev.created_at AS reverted_at,
               CASE WHEN EXISTS (
                 SELECT 1 FROM audit_events later
                 WHERE later.store_id = e.store_id
                   AND later.entity_type = e.entity_type
                   AND ((later.entity_id IS NULL AND e.entity_id IS NULL) OR later.entity_id = e.entity_id)
                   AND later.created_at > e.created_at
               ) THEN 1 ELSE 0 END AS has_later_event,
               current_item.kind AS current_kind
        FROM audit_events e
        LEFT JOIN audit_events rev ON rev.reverted_event_id = e.id
        LEFT JOIN work_items current_item ON current_item.id = e.entity_id AND current_item.store_id = e.store_id
        WHERE e.store_id = ? AND e.business_date = ?
        ORDER BY e.created_at DESC
        LIMIT 500
      `).bind(storeId, businessDate))
    : await all(db.prepare(`
        SELECT e.id, e.action, e.entity_type, e.entity_id, e.actor_name_snapshot, e.business_date, e.summary,
               e.reversible, e.before_state, e.after_state, e.audit_module, e.created_at,
               rev.id AS reverted_by, rev.created_at AS reverted_at,
               CASE WHEN EXISTS (
                 SELECT 1 FROM audit_events later
                 WHERE later.store_id = e.store_id
                   AND later.entity_type = e.entity_type
                   AND ((later.entity_id IS NULL AND e.entity_id IS NULL) OR later.entity_id = e.entity_id)
                   AND later.created_at > e.created_at
               ) THEN 1 ELSE 0 END AS has_later_event,
               current_item.kind AS current_kind
        FROM audit_events e
        LEFT JOIN audit_events rev ON rev.reverted_event_id = e.id
        LEFT JOIN work_items current_item ON current_item.id = e.entity_id AND current_item.store_id = e.store_id
        WHERE e.store_id = ?
        ORDER BY e.created_at DESC
        LIMIT 500
      `).bind(storeId))
  return rows.map((row) => mapAuditEvent(row, undoBusinessDate))
}

type HistoryFilters = { date?: string; module?: string; cursor?: string; limit?: number }

function parseHistoryFilters(query: (key: string) => string | undefined): Required<HistoryFilters> {
  const date = query('date') ?? ''
  if (date && !/^\d{4}-\d{2}-\d{2}$/u.test(date)) throw new ApiProblem(400, 'INVALID_HISTORY_FILTER', '日期筛选格式无效。')
  const module = query('module') ?? 'all'
  if (module !== 'all' && !auditModules.has(module as AuditModule)) throw new ApiProblem(400, 'INVALID_HISTORY_FILTER', '模块筛选无效。')
  const cursor = query('cursor') ?? ''
  const limitRaw = Number(query('limit') ?? 80)
  const limit = Number.isInteger(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 80
  return { date, module, cursor, limit }
}

export async function listPermanentAudit(db: D1Database, storeId: string, filters: HistoryFilters, undoBusinessDate: string) {
  const { date, module, cursor, limit } = { date: '', module: 'all', cursor: '', limit: 80, ...filters }
  const clauses = ['e.store_id = ?']
  const values: Array<string | number> = [storeId]
  if (date) { clauses.push('e.business_date = ?'); values.push(date) }
  if (module !== 'all') { clauses.push('e.audit_module = ?'); values.push(module) }
  if (cursor) {
    const [createdAt, id] = cursor.split('|')
    if (!createdAt || !id) throw new ApiProblem(400, 'INVALID_HISTORY_CURSOR', '历史记录翻页标识无效。')
    clauses.push('(e.created_at < ? OR (e.created_at = ? AND e.id < ?))')
    values.push(createdAt, createdAt, id)
  }
  values.push(limit)
  const rows = await all(db.prepare(`
    SELECT e.id, e.action, e.entity_type, e.entity_id, e.actor_name_snapshot, e.business_date, e.summary,
           e.reversible, e.before_state, e.after_state, e.audit_module, e.created_at,
           rev.id AS reverted_by, rev.created_at AS reverted_at,
           CASE WHEN EXISTS (
             SELECT 1 FROM audit_events later
             WHERE later.store_id = e.store_id AND later.entity_type = e.entity_type
               AND ((later.entity_id IS NULL AND e.entity_id IS NULL) OR later.entity_id = e.entity_id)
               AND later.created_at > e.created_at
           ) THEN 1 ELSE 0 END AS has_later_event,
           current_item.kind AS current_kind
    FROM audit_events e
    LEFT JOIN audit_events rev ON rev.reverted_event_id = e.id
    LEFT JOIN work_items current_item ON current_item.id = e.entity_id AND current_item.store_id = e.store_id
    WHERE ${clauses.join(' AND ')}
    ORDER BY e.created_at DESC, e.id DESC
    LIMIT ?
  `).bind(...values))
  const events = rows.map((row) => mapAuditEvent(row, undoBusinessDate))
  const last = rows[rows.length - 1]
  return { events, nextCursor: rows.length === limit && last ? `${last.created_at}|${last.id}` : null }
}

export function auditRoutes() {
  const app = new Hono<{ Bindings: WorkerEnv; Variables: Vars }>()
  const auth = createAuthMiddleware()

  app.get('/api/v1/audit-events', auth.loadSession, auth.requirePasswordChanged, async (c) => {
    const context = c.get('auth')!
    const date = c.req.query('date')
    const currentBusinessDate = await businessDateFor(context)
    return c.json({ events: await listAudit(c.env.DB, context.storeId, date, currentBusinessDate) })
  })

  app.get('/api/v1/audit-events/history', auth.loadSession, auth.requirePasswordChanged, async (c) => {
    const context = c.get('auth')!
    const filters = parseHistoryFilters((key) => c.req.query(key))
    const currentBusinessDate = await businessDateFor(context)
    return c.json(await listPermanentAudit(c.env.DB, context.storeId, filters, currentBusinessDate))
  })

  app.post('/api/v1/audit-events/:id/undo', auth.loadSession, auth.requirePasswordChanged, auth.requireCsrf, async (c) => {
    const context = c.get('auth')!
    const targetId = c.req.param('id')
    let body: unknown = {}
    try { body = await c.req.json() } catch { body = {} }
    const result = await idempotent(c, body, async (db) => {
      const businessDate = await businessDateFor(context)
      await ensureDayOpen(db, context, businessDate)
      const target = await first<any>(db.prepare(`
        SELECT id, action, entity_type, entity_id, summary, business_date, before_state, after_state, audit_module, reversible, created_at
        FROM audit_events WHERE id = ? AND store_id = ?
      `).bind(targetId, context.storeId))
      if (!target || !target.reversible) throw new ApiProblem(409, 'UNDO_NOT_AVAILABLE', '该操作不能撤回。')
      if (target.business_date !== businessDate) throw new ApiProblem(409, 'UNDO_EXPIRED', '跨日操作只能查看，不能在当前业务日撤回。')
      const later = await first<{ n: number }>(db.prepare(`
        SELECT COUNT(*) AS n FROM audit_events e
        WHERE e.store_id = ? AND e.entity_type = ?
          AND ((e.entity_id IS NULL AND ? IS NULL) OR e.entity_id = ?)
          AND e.created_at > ?
      `).bind(context.storeId, target.entity_type, target.entity_id, target.entity_id, target.created_at))
      if ((later?.n ?? 0) > 0) throw new ApiProblem(409, 'UNDO_NOT_LATEST', '该对象已有后续操作，不能撤回旧操作。')
      const already = await first(db.prepare('SELECT id FROM audit_events WHERE reverted_event_id = ?').bind(target.id))
      if (already) throw new ApiProblem(409, 'ALREADY_UNDONE', '该操作已经撤回。')

      const beforeState = parseJson(target.before_state)
      const afterState = parseJson(target.after_state)

      let restoreStatements: D1PreparedStatement[]
      if (target.entity_type === 'work-item') {
        if (!target.entity_id) throw new ApiProblem(422, 'INVALID_AUDIT_EVENT', '审计事件缺少业务对象。')
        if (beforeState) {
          restoreStatements = buildRestoreSnapshotStatements(db, beforeState)
        } else {
          const stamp = nowIso()
          restoreStatements = [db.prepare(`
            UPDATE work_items SET lifecycle = 'deleted', deleted_at = ?, deleted_by = ?,
              updated_by = ?, revision = revision + 1, updated_at = ?
            WHERE id = ? AND store_id = ?
          `).bind(stamp, context.userId, context.userId, stamp, target.entity_id, context.storeId)]
        }
      } else if (target.entity_type === 'daily-closing') {
        const before = beforeState as { kpi?: Record<string, unknown>; kpiSavedAt?: string | null } | null
        if (!before?.kpi || !target.entity_id) throw new ApiProblem(422, 'INVALID_AUDIT_EVENT', '审计快照不完整。')
        restoreStatements = [db.prepare(`
          UPDATE daily_closings SET
            sales_vehicles = ?, safety_checks = ?, safety_model = ?, valid_reviews = ?,
            used_sold = ?, used_received = ?, sales_saved_at = ?, revision = revision + 1, updated_at = ?
          WHERE id = ? AND store_id = ?
        `).bind(
          Number(before.kpi.salesVehicles ?? 0),
          Number(before.kpi.safetyChecks ?? 0),
          String(before.kpi.safetyModel ?? ''),
          Number(before.kpi.validReviews ?? 0),
          Number(before.kpi.usedSold ?? 0),
          Number(before.kpi.usedReceived ?? 0),
          before.kpiSavedAt ?? null,
          nowIso(),
          target.entity_id,
          context.storeId
        )]
      } else {
        throw new ApiProblem(409, 'UNDO_NOT_AVAILABLE', '该类型操作不能撤回。')
      }

      // The restored state and its undo audit event must either both commit or both roll back.
      const audit = prepareAudit(db, {
        context,
        action: 'undo-operation',
        entityType: target.entity_type,
        entityId: target.entity_id,
        businessDate,
        summary: `撤回：${target.summary}`,
        before: afterState,
        after: beforeState,
        reversible: false,
        revertedEventId: target.id,
        module: auditModules.has(target.audit_module as AuditModule) ? target.audit_module as AuditModule : undefined
      })
      await batchWhileDayOpen(db, context, businessDate, [...restoreStatements, audit.statement])
      return { status: 200, body: { ok: true, eventId: audit.id, targetEventId: target.id } }
    })
    return c.json(result.body, result.status as any)
  })

  return app
}
