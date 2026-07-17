import { Hono } from 'hono'
import type { AppConfig, WorkerEnv } from '../env.js'
import type { AuthContext } from '../auth/types.js'
import { createAuthMiddleware } from '../auth/middleware.js'
import { listWorkItems } from '../repositories/work-items.js'
import { listAudit } from './audit.js'
import { getOrCreateDay, mapDay } from '../services/closing.js'
import { businessDateFor, cleanupPreviousCompleted } from '../services/business.js'

type Vars = { config: AppConfig; auth: AuthContext | null }

export function bootstrapRoutes() {
  const app = new Hono<{ Bindings: WorkerEnv; Variables: Vars }>()
  const auth = createAuthMiddleware()

  app.get('/api/v1/bootstrap', auth.loadSession, auth.requirePasswordChanged, async (c) => {
    const context = c.get('auth')!
    const config = c.get('config')
    const businessDate = await businessDateFor(context)
    await cleanupPreviousCompleted(c.env.DB, context, businessDate)
    const [day, records, events] = await Promise.all([
      getOrCreateDay(c.env.DB, context.storeId, businessDate),
      listWorkItems(c.env.DB, context.storeId, businessDate, config),
      listAudit(c.env.DB, context.storeId, undefined, businessDate)
    ])
    return c.json({
      businessDate,
      store: {
        id: context.storeId,
        code: context.storeCode,
        name: context.storeName,
        timezone: context.storeTimezone,
        role: context.role
      },
      day: mapDay(day),
      records,
      events
    })
  })

  return app
}
