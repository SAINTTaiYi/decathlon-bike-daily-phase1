import type { FastifyInstance } from 'fastify'
import type { Database } from '@bike-ops/database'
import { createAuthMiddleware } from '../auth/middleware.js'
import type { AppConfig } from '../config.js'
import { listAudit } from './audit.js'
import { getOrCreateDay, mapDay } from './closing.js'
import { listAssignedToMe, listStoreMembers, listWorkItems } from '../repositories/work-items.js'
import { businessDateFor, cleanupPreviousCompleted } from '../services/business.js'

export async function registerBootstrapRoute(app: FastifyInstance, sql: Database, config: AppConfig): Promise<void> {
  const auth = createAuthMiddleware(sql, config)
  app.get('/api/v1/bootstrap', { preHandler: [auth.loadSession, auth.requirePasswordChanged] }, async (request) => {
    const context = request.auth!
    const businessDate = await businessDateFor(context)
    await sql.begin(async (tx) => {
      await cleanupPreviousCompleted(tx as unknown as Database, context, businessDate)
    })
    const [day, records, events, members, assignedToMe] = await Promise.all([
      getOrCreateDay(sql, context.storeId, businessDate),
      listWorkItems(sql, context.storeId, businessDate, config),
      listAudit(sql, context.storeId, undefined, businessDate),
      listStoreMembers(sql, context.storeId),
      listAssignedToMe(sql, context.storeId, context.userId, businessDate, config)
    ])
    return {
      businessDate,
      store: { id: context.storeId, code: context.storeCode, name: context.storeName, timezone: context.storeTimezone, role: context.role },
      day: mapDay(day),
      records,
      events,
      members,
      assignedToMe
    }
  })
}
