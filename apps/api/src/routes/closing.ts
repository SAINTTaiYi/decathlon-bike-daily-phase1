import type { FastifyInstance } from 'fastify'
import type { Database } from '@bike-ops/database'
import { kpiSchema } from '@bike-ops/contracts'
import { createAuthMiddleware } from '../auth/middleware.js'
import type { AppConfig } from '../config.js'
import { businessDateFor, writeAudit } from '../services/business.js'
import { ApiProblem, idempotent } from '../services/idempotency.js'

interface DayRow {
  id: string
  businessDate: string
  salesVehicles: number
  safetyChecks: number
  safetyModel: string
  validReviews: number
  usedSold: number
  usedReceived: number
  salesSavedAt: Date | null
  closingStatus: 'open' | 'closed'
  closedAt: Date | null
  revision: number
  updatedAt: Date
}

export function mapDay(row: DayRow) {
  return {
    id: row.id,
    dateKey: row.businessDate,
    kpi: {
      salesVehicles: row.salesVehicles,
      safetyChecks: row.safetyChecks,
      safetyModel: row.safetyModel,
      validReviews: row.validReviews,
      usedSold: row.usedSold,
      usedReceived: row.usedReceived
    },
    kpiSavedAt: row.salesSavedAt,
    closedAt: row.closingStatus === 'closed' ? row.closedAt : null,
    revision: row.revision,
    updatedAt: row.updatedAt
  }
}

export async function getOrCreateDay(sql: Database, storeId: string, businessDate: string): Promise<DayRow> {
  const rows = await sql<DayRow[]>`
    insert into bike_ops.daily_closings (store_id, business_date) values (${storeId}, ${businessDate})
    on conflict (store_id, business_date) do update set business_date = excluded.business_date
    returning id, business_date, sales_vehicles, safety_checks, safety_model, valid_reviews, used_sold, used_received,
      sales_saved_at, closing_status, closed_at, revision, updated_at
  `
  if (!rows[0]) throw new Error('DAY_UPSERT_FAILED')
  return rows[0]
}

export async function registerClosingRoutes(app: FastifyInstance, sql: Database, config: AppConfig): Promise<void> {
  const auth = createAuthMiddleware(sql, config)
  const writeGuards = [auth.loadSession, auth.requirePasswordChanged, auth.requireCsrf]

  app.get('/api/v1/daily-closing/current', { preHandler: [auth.loadSession, auth.requirePasswordChanged] }, async (request) => {
    const context = request.auth!
    const businessDate = await businessDateFor(context)
    return { day: mapDay(await getOrCreateDay(sql, context.storeId, businessDate)) }
  })

  app.put('/api/v1/daily-closing/current/sales', { preHandler: writeGuards }, async (request, reply) => {
    const context = request.auth!
    const input = kpiSchema.parse(request.body)
    if (input.safetyChecks > 0 && !input.safetyModel) throw new ApiProblem(400, 'SAFETY_MODEL_REQUIRED', '有安全检查开单时，请填写对应型号或单号。')
    const result = await idempotent(sql, request, async (tx) => {
      const businessDate = await businessDateFor(context)
      const before = mapDay(await getOrCreateDay(tx, context.storeId, businessDate))
      if (before.closedAt) throw new ApiProblem(423, 'DAY_CLOSED', '今日闭店已锁定，请先重新打开。')
      if (input.expectedRevision !== undefined && input.expectedRevision !== before.revision) throw new ApiProblem(409, 'REVISION_CONFLICT', '销售数据已被其他同事修改，请刷新后重试。')
      const rows = await tx<DayRow[]>`
        update bike_ops.daily_closings set
          sales_vehicles = ${input.salesVehicles}, safety_checks = ${input.safetyChecks}, safety_model = ${input.safetyModel},
          valid_reviews = ${input.validReviews}, used_sold = ${input.usedSold}, used_received = ${input.usedReceived},
          sales_saved_at = now(), sales_saved_by = ${context.userId}, revision = revision + 1, updated_at = now()
        where store_id = ${context.storeId} and business_date = ${businessDate} and revision = ${before.revision}
        returning id, business_date, sales_vehicles, safety_checks, safety_model, valid_reviews, used_sold, used_received,
          sales_saved_at, closing_status, closed_at, revision, updated_at
      `
      if (!rows[0]) throw new ApiProblem(409, 'REVISION_CONFLICT', '销售数据已被其他同事修改，请刷新后重试。')
      const after = mapDay(rows[0])
      const eventId = await writeAudit(tx, { context, action: 'save-kpi', entityType: 'daily-closing', entityId: rows[0].id, entityRevision: rows[0].revision, businessDate, summary: `保存当日销售数据：销售车辆 ${input.salesVehicles}`, before, after, reversible: true, requestId: request.id })
      return { status: 200, body: { ok: true, day: after, eventId } }
    })
    return reply.code(result.status).send(result.body)
  })

  app.delete('/api/v1/daily-closing/current/sales', { preHandler: writeGuards }, async (request, reply) => {
    const context = request.auth!
    const body = request.body as { expectedRevision?: number }
    const result = await idempotent(sql, request, async (tx) => {
      const businessDate = await businessDateFor(context)
      const before = mapDay(await getOrCreateDay(tx, context.storeId, businessDate))
      if (before.closedAt) throw new ApiProblem(423, 'DAY_CLOSED', '今日闭店已锁定，请先重新打开。')
      if (body.expectedRevision !== undefined && body.expectedRevision !== before.revision) throw new ApiProblem(409, 'REVISION_CONFLICT', '销售数据已被其他同事修改。')
      const rows = await tx<DayRow[]>`
        update bike_ops.daily_closings set sales_vehicles = 0, safety_checks = 0, safety_model = '', valid_reviews = 0,
          used_sold = 0, used_received = 0, sales_saved_at = null, sales_saved_by = null,
          revision = revision + 1, updated_at = now()
        where store_id = ${context.storeId} and business_date = ${businessDate} and revision = ${before.revision}
        returning id, business_date, sales_vehicles, safety_checks, safety_model, valid_reviews, used_sold, used_received,
          sales_saved_at, closing_status, closed_at, revision, updated_at
      `
      if (!rows[0]) throw new ApiProblem(409, 'REVISION_CONFLICT', '销售数据已被其他同事修改。')
      const after = mapDay(rows[0])
      const eventId = await writeAudit(tx, { context, action: 'clear-kpi', entityType: 'daily-closing', entityId: rows[0].id, entityRevision: rows[0].revision, businessDate, summary: '清空当日销售数据', before, after, reversible: true, requestId: request.id })
      return { status: 200, body: { ok: true, day: after, eventId } }
    })
    return reply.code(result.status).send(result.body)
  })

  app.post('/api/v1/daily-closing/current/close', { preHandler: [...writeGuards, auth.requireRole('manager', 'admin')] }, async (request, reply) => {
    const context = request.auth!
    const result = await idempotent(sql, request, async (tx) => {
      const businessDate = await businessDateFor(context)
      const before = mapDay(await getOrCreateDay(tx, context.storeId, businessDate))
      if (!before.kpiSavedAt) throw new ApiProblem(409, 'SALES_REQUIRED', '请先填写今天的销售数据。')
      if (before.closedAt) return { status: 200, body: { ok: true, day: before } }
      const rows = await tx<DayRow[]>`
        update bike_ops.daily_closings set closing_status = 'closed', closed_at = now(), closed_by = ${context.userId}, revision = revision + 1, updated_at = now()
        where store_id = ${context.storeId} and business_date = ${businessDate} and revision = ${before.revision}
        returning id, business_date, sales_vehicles, safety_checks, safety_model, valid_reviews, used_sold, used_received,
          sales_saved_at, closing_status, closed_at, revision, updated_at
      `
      if (!rows[0]) throw new ApiProblem(409, 'REVISION_CONFLICT', '闭店状态已被其他同事修改。')
      const after = mapDay(rows[0])
      await writeAudit(tx, { context, action: 'close-day', entityType: 'daily-closing', entityId: rows[0].id, entityRevision: rows[0].revision, businessDate, summary: '完成闭店', before, after, reversible: false, requestId: request.id })
      return { status: 200, body: { ok: true, day: after } }
    })
    return reply.code(result.status).send(result.body)
  })

  app.post('/api/v1/daily-closing/current/reopen', { preHandler: [...writeGuards, auth.requireRole('manager', 'admin')] }, async (request, reply) => {
    const context = request.auth!
    const result = await idempotent(sql, request, async (tx) => {
      const businessDate = await businessDateFor(context)
      const before = mapDay(await getOrCreateDay(tx, context.storeId, businessDate))
      if (!before.closedAt) return { status: 200, body: { ok: true, day: before } }
      const rows = await tx<DayRow[]>`
        update bike_ops.daily_closings set closing_status = 'open', closed_at = null, closed_by = null, revision = revision + 1, updated_at = now()
        where store_id = ${context.storeId} and business_date = ${businessDate} and revision = ${before.revision}
        returning id, business_date, sales_vehicles, safety_checks, safety_model, valid_reviews, used_sold, used_received,
          sales_saved_at, closing_status, closed_at, revision, updated_at
      `
      if (!rows[0]) throw new ApiProblem(409, 'REVISION_CONFLICT', '闭店状态已被其他同事修改。')
      const after = mapDay(rows[0])
      await writeAudit(tx, { context, action: 'reopen-day', entityType: 'daily-closing', entityId: rows[0].id, entityRevision: rows[0].revision, businessDate, summary: '重新打开闭店', before, after, reversible: false, requestId: request.id })
      return { status: 200, body: { ok: true, day: after } }
    })
    return reply.code(result.status).send(result.body)
  })
}
