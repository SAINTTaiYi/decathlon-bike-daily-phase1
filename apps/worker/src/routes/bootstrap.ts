import { Hono } from 'hono'
import type { AppConfig, WorkerEnv } from '../env.js'
import type { AuthContext } from '../auth/types.js'
import { createAuthMiddleware } from '../auth/middleware.js'
import { listAssignedToMe, listStoreMembers, listWorkItems } from '../repositories/work-items.js'
import { listBootstrapAuditFeed } from './audit.js'
import { getOrCreateDay, mapDay } from '../services/closing.js'
import { businessDateFor, cleanupPreviousCompleted } from '../services/business.js'
import { buildBusinessTrends } from '../services/trends.js'

type Vars = { config: AppConfig; auth: AuthContext | null }

export function bootstrapRoutes() {
  const app = new Hono<{ Bindings: WorkerEnv; Variables: Vars }>()
  const auth = createAuthMiddleware()

  app.get('/api/v1/bootstrap', auth.loadSession, auth.requirePasswordChanged, async (c) => {
    const context = c.get('auth')!
    const config = c.get('config')
    const businessDate = await businessDateFor(context)
    // Cleanup 是跨日边界任务：只在当日首次 bootstrap（创建当日行）时执行，后续刷新
    // 不再重复扫描（2026-09-03 限额预算：该扫描每次读约一百行）。
    const [{ day, created: dayCreated }, records, trends, members, assignedToMe] = await Promise.all([
      getOrCreateDay(c.env.DB, context.storeId, businessDate),
      listWorkItems(c.env.DB, context.storeId, businessDate, config),
      buildBusinessTrends(c.env.DB, context.storeId, businessDate),
      listStoreMembers(c.env.DB, context.storeId),
      listAssignedToMe(c.env.DB, context.storeId, context.userId, businessDate, config)
    ])
    const waitUntil = c.executionCtx?.waitUntil?.bind(c.executionCtx)
    if (dayCreated) {
      // Cleanup must not delay the interactive bootstrap that created the day.
      const cleanup = cleanupPreviousCompleted(c.env.DB, context, businessDate)
      if (waitUntil) waitUntil(cleanup)
      else void cleanup
    }
    // 审计 feed 需要在册记录 id 集合（记录操作记录抽屉跨天可见），在并行批之后单独取。
    const events = await listBootstrapAuditFeed(c.env.DB, context.storeId, businessDate, records.map((record) => record.id))
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
      events,
      trends,
      members,
      assignedToMe
    })
  })

  return app
}
