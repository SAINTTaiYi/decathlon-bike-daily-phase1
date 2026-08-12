import { Hono } from 'hono'
import { kpiSchema } from '@bike-ops/contracts'
import type { AppConfig, WorkerEnv } from '../env.js'
import type { AuthContext } from '../auth/types.js'
import { createAuthMiddleware } from '../auth/middleware.js'
import { first, nowIso } from '../db.js'
import { businessDateFor, writeAudit } from '../services/business.js'
import { getOrCreateDay, mapDay, type DayRow } from '../services/closing.js'
import { idempotent } from '../services/idempotency.js'
import { ApiProblem } from '../services/problems.js'

type Vars = { config: AppConfig; auth: AuthContext | null }

const dayReturning = `
  SELECT id, business_date, sales_vehicles, safety_checks, safety_model, valid_reviews, used_sold, used_received,
         sales_saved_at, closing_status, closed_at, revision, updated_at
  FROM daily_closings
  WHERE store_id = ? AND business_date = ?
`

export function closingRoutes() {
  const app = new Hono<{ Bindings: WorkerEnv; Variables: Vars }>()
  const auth = createAuthMiddleware()
  const read = [auth.loadSession, auth.requirePasswordChanged] as const
  const write = [auth.loadSession, auth.requirePasswordChanged, auth.requireCsrf] as const

  app.get('/api/v1/daily-closing/current', ...read, async (c) => {
    const context = c.get('auth')!
    const businessDate = await businessDateFor(context)
    return c.json({ day: mapDay(await getOrCreateDay(c.env.DB, context.storeId, businessDate)) })
  })

  app.put('/api/v1/daily-closing/current/sales', ...write, async (c) => {
    const context = c.get('auth')!
    const body = await c.req.json()
    const input = kpiSchema.parse(body)
    if (input.safetyChecks > 0 && !input.safetyModel) {
      throw new ApiProblem(400, 'SAFETY_MODEL_REQUIRED', '有安全检查开单时，请填写对应型号或单号。')
    }
    const result = await idempotent(c, body, async (db) => {
      const businessDate = await businessDateFor(context)
      const before = mapDay(await getOrCreateDay(db, context.storeId, businessDate))
      if (before.closedAt) throw new ApiProblem(423, 'DAY_CLOSED', '今日闭店已锁定，请先重新打开。')
      if (input.expectedRevision !== undefined && input.expectedRevision !== before.revision) {
        throw new ApiProblem(409, 'REVISION_CONFLICT', '销售数据已被其他同事修改，请刷新后重试。')
      }
      const stamp = nowIso()
      const updated = await db.prepare(`
        UPDATE daily_closings SET
          sales_vehicles = ?, safety_checks = ?, safety_model = ?, valid_reviews = ?,
          used_sold = ?, used_received = ?, sales_saved_at = ?, sales_saved_by = ?,
          revision = revision + 1, updated_at = ?
        WHERE store_id = ? AND business_date = ? AND revision = ?
      `).bind(
        input.salesVehicles, input.safetyChecks, input.safetyModel, input.validReviews,
        input.usedSold, input.usedReceived, stamp, context.userId, stamp,
        context.storeId, businessDate, before.revision
      ).run()
      if (!updated.meta.changes) throw new ApiProblem(409, 'REVISION_CONFLICT', '销售数据已被其他同事修改，请刷新后重试。')
      const row = await first<DayRow>(db.prepare(dayReturning).bind(context.storeId, businessDate))
      if (!row) throw new ApiProblem(409, 'REVISION_CONFLICT', '销售数据已被其他同事修改，请刷新后重试。')
      const after = mapDay(row)
      const eventId = await writeAudit(db, {
        context, action: 'save-kpi', entityType: 'daily-closing', entityId: row.id, entityRevision: row.revision,
        businessDate, summary: `保存当日销售数据：销售车辆 ${input.salesVehicles}`, before, after, reversible: true,
        requestId: c.req.header('x-request-id') ?? undefined
      })
      return { status: 200, body: { ok: true, day: after, eventId } }
    })
    return c.json(result.body, result.status as any)
  })

  app.delete('/api/v1/daily-closing/current/sales', ...write, async (c) => {
    const context = c.get('auth')!
    let body: { expectedRevision?: number } = {}
    try { body = await c.req.json() } catch { body = {} }
    const result = await idempotent(c, body, async (db) => {
      const businessDate = await businessDateFor(context)
      const before = mapDay(await getOrCreateDay(db, context.storeId, businessDate))
      if (before.closedAt) throw new ApiProblem(423, 'DAY_CLOSED', '今日闭店已锁定，请先重新打开。')
      if (body.expectedRevision !== undefined && body.expectedRevision !== before.revision) {
        throw new ApiProblem(409, 'REVISION_CONFLICT', '销售数据已被其他同事修改。')
      }
      const stamp = nowIso()
      const updated = await db.prepare(`
        UPDATE daily_closings SET
          sales_vehicles = 0, safety_checks = 0, safety_model = '', valid_reviews = 0,
          used_sold = 0, used_received = 0, sales_saved_at = NULL, sales_saved_by = NULL,
          revision = revision + 1, updated_at = ?
        WHERE store_id = ? AND business_date = ? AND revision = ?
      `).bind(stamp, context.storeId, businessDate, before.revision).run()
      if (!updated.meta.changes) throw new ApiProblem(409, 'REVISION_CONFLICT', '销售数据已被其他同事修改。')
      const row = await first<DayRow>(db.prepare(dayReturning).bind(context.storeId, businessDate))
      if (!row) throw new ApiProblem(409, 'REVISION_CONFLICT', '销售数据已被其他同事修改。')
      const after = mapDay(row)
      const eventId = await writeAudit(db, {
        context, action: 'clear-kpi', entityType: 'daily-closing', entityId: row.id, entityRevision: row.revision,
        businessDate, summary: '清空当日销售数据', before, after, reversible: true
      })
      return { status: 200, body: { ok: true, day: after, eventId } }
    })
    return c.json(result.body, result.status as any)
  })

  app.post('/api/v1/daily-closing/current/close', ...write, auth.requireRole('manager', 'admin'), async (c) => {
    const context = c.get('auth')!
    let body: unknown = {}
    try { body = await c.req.json() } catch { body = {} }
    const result = await idempotent(c, body, async (db) => {
      const businessDate = await businessDateFor(context)
      const before = mapDay(await getOrCreateDay(db, context.storeId, businessDate))
      if (!before.kpiSavedAt) throw new ApiProblem(409, 'SALES_REQUIRED', '请先填写今天的销售数据。')
      if (before.closedAt) return { status: 200, body: { ok: true, day: before } }
      const stamp = nowIso()
      const updated = await db.prepare(`
        UPDATE daily_closings SET closing_status = 'closed', closed_at = ?, closed_by = ?, revision = revision + 1, updated_at = ?
        WHERE store_id = ? AND business_date = ? AND revision = ?
      `).bind(stamp, context.userId, stamp, context.storeId, businessDate, before.revision).run()
      if (!updated.meta.changes) throw new ApiProblem(409, 'REVISION_CONFLICT', '闭店状态已被其他同事修改。')
      const row = await first<DayRow>(db.prepare(dayReturning).bind(context.storeId, businessDate))
      if (!row) throw new ApiProblem(409, 'REVISION_CONFLICT', '闭店状态已被其他同事修改。')
      const after = mapDay(row)
      await writeAudit(db, {
        context, action: 'close-day', entityType: 'daily-closing', entityId: row.id, entityRevision: row.revision,
        businessDate, summary: '完成闭店', before, after, reversible: false
      })
      return { status: 200, body: { ok: true, day: after } }
    })
    return c.json(result.body, result.status as any)
  })

  app.post('/api/v1/daily-closing/current/reopen', ...write, auth.requireRole('manager', 'admin'), async (c) => {
    const context = c.get('auth')!
    let body: unknown = {}
    try { body = await c.req.json() } catch { body = {} }
    const result = await idempotent(c, body, async (db) => {
      const businessDate = await businessDateFor(context)
      const before = mapDay(await getOrCreateDay(db, context.storeId, businessDate))
      if (!before.closedAt) return { status: 200, body: { ok: true, day: before } }
      const stamp = nowIso()
      const updated = await db.prepare(`
        UPDATE daily_closings SET closing_status = 'open', closed_at = NULL, closed_by = NULL, revision = revision + 1, updated_at = ?
        WHERE store_id = ? AND business_date = ? AND revision = ?
      `).bind(stamp, context.storeId, businessDate, before.revision).run()
      if (!updated.meta.changes) throw new ApiProblem(409, 'REVISION_CONFLICT', '闭店状态已被其他同事修改。')
      const row = await first<DayRow>(db.prepare(dayReturning).bind(context.storeId, businessDate))
      if (!row) throw new ApiProblem(409, 'REVISION_CONFLICT', '闭店状态已被其他同事修改。')
      const after = mapDay(row)
      await writeAudit(db, {
        context, action: 'reopen-day', entityType: 'daily-closing', entityId: row.id, entityRevision: row.revision,
        businessDate, summary: '重新打开今日闭店', before, after, reversible: false
      })
      return { status: 200, body: { ok: true, day: after } }
    })
    return c.json(result.body, result.status as any)
  })

  return app
}
