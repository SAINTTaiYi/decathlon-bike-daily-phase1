import { Hono } from 'hono'
import { foodBatchActionSchema, foodBatchCreateSchema, foodBatchFilters, foodShelfLifeUpsertSchema } from '@bike-ops/contracts'
import { localBusinessDate } from '@bike-ops/domain'
import type { AppConfig, WorkerEnv } from '../env.js'
import type { AuthContext } from '../auth/types.js'
import { createAuthMiddleware } from '../auth/middleware.js'
import {
  createFoodBatch,
  foodOverview,
  listFoodBatches,
  listShelfLife,
  setFoodBatchStatus,
  upsertShelfLife
} from '../services/food-ledger.js'
import { idempotent } from '../services/idempotency.js'
import { ApiProblem } from '../services/problems.js'

type Vars = { config: AppConfig; auth: AuthContext | null }

// 食品保质期台账路由（2026-09-13）。业务逻辑在 services/food-ledger.ts，
// 这里只做鉴权、参数校验与响应整形，便于 service 层直测（项目测试惯例）。
export function foodRoutes() {
  const app = new Hono<{ Bindings: WorkerEnv; Variables: Vars }>()
  const auth = createAuthMiddleware()
  const read = [auth.loadSession, auth.requirePasswordChanged] as const
  const write = [auth.loadSession, auth.requirePasswordChanged, auth.requireCsrf] as const
  const manage = [auth.loadSession, auth.requirePasswordChanged, auth.requireCsrf, auth.requireRole('manager', 'admin')] as const

  app.get('/api/v1/food/shelf-life', ...read, async (c) => {
    return c.json({ items: await listShelfLife(c.env.DB) })
  })

  app.put('/api/v1/food/shelf-life', ...manage, async (c) => {
    const input = foodShelfLifeUpsertSchema.parse(await c.req.json())
    return c.json({ item: await upsertShelfLife(c.env.DB, input) })
  })

  app.get('/api/v1/food/overview', ...read, async (c) => {
    const context = c.get('auth')!
    return c.json(await foodOverview(c.env.DB, context.storeId, localBusinessDate(context.storeTimezone)))
  })

  app.get('/api/v1/food/batches', ...read, async (c) => {
    const context = c.get('auth')!
    const filterRaw = c.req.query('filter') ?? 'flagged'
    if (!(foodBatchFilters as readonly string[]).includes(filterRaw)) {
      throw new ApiProblem(400, 'FOOD_FILTER_INVALID', '筛选条件无效。')
    }
    const page = await listFoodBatches(c.env.DB, {
      storeId: context.storeId,
      today: localBusinessDate(context.storeTimezone),
      filter: filterRaw as typeof foodBatchFilters[number],
      kind: c.req.query('kind') ?? '',
      query: c.req.query('q') ?? '',
      limit: Number(c.req.query('limit') ?? 100),
      offset: Number(c.req.query('offset') ?? 0)
    })
    return c.json({ ...page, today: localBusinessDate(context.storeTimezone), filter: filterRaw })
  })

  app.post('/api/v1/food/batches', ...write, async (c) => {
    const context = c.get('auth')!
    const body = await c.req.json()
    const input = foodBatchCreateSchema.parse(body)
    const result = await idempotent(c, body, async (db) => ({
      status: 201,
      body: await createFoodBatch(db, { storeId: context.storeId, displayName: context.displayName }, input)
    }))
    return c.json(result.body, result.status as 201)
  })

  app.patch('/api/v1/food/batches/:id', ...write, async (c) => {
    const context = c.get('auth')!
    const id = c.req.param('id')
    const body = await c.req.json()
    const input = foodBatchActionSchema.parse(body)
    const result = await idempotent(c, body, async (db) => ({
      status: 200,
      body: { batch: await setFoodBatchStatus(db, { storeId: context.storeId, displayName: context.displayName }, id, input) }
    }))
    return c.json(result.body, result.status as 200)
  })

  return app
}
