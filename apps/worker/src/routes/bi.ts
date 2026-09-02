import { Hono } from 'hono'
import type { AppConfig, WorkerEnv } from '../env.js'
import type { AuthContext } from '../auth/types.js'
import { createAuthMiddleware } from '../auth/middleware.js'
import { requireJsonBody } from '../lib/json.js'
import { latestSyncedAt, listBiSkuNames, syncBiSkuNames } from '../services/bi-sku-sync.js'
import { MasterDataUpstreamError } from '../lib/masterdata-login.js'
import { ApiProblem } from '../services/problems.js'

type Vars = { config: AppConfig; auth: AuthContext | null }

// BI 车型名（masterdata 官方同步）：只读查询 + 管理员手动触发同步。
// 命名数据非门店敏感数据，读端点仅需登录会话；手动同步需 manager/admin + CSRF。
export function biRoutes() {
  const app = new Hono<{ Bindings: WorkerEnv; Variables: Vars }>()
  const auth = createAuthMiddleware()
  const read = [auth.loadSession, auth.requirePasswordChanged] as const
  const managerWrite = [auth.loadSession, auth.requirePasswordChanged, auth.requireCsrf, auth.requireRole('manager', 'admin')] as const

  app.get('/api/v1/bi/sku-names', ...read, async (c) => {
    const rows = await listBiSkuNames(c.env.DB)
    const names: Record<string, { label: string; productionLabel: string | null; conceptionCode: string | null; productType: string | null }> = {}
    for (const row of rows) {
      names[row.code] = {
        label: row.label,
        productionLabel: row.production_label,
        conceptionCode: row.conception_code,
        productType: row.product_type
      }
    }
    return c.json({ names, syncedAt: latestSyncedAt(rows) })
  })

  // 手动同步（强制刷新，忽略 24h 陈旧度守卫）。codes 可选：补充 BI 快照新增码。
  app.post('/api/v1/bi/sku-names/sync', requireJsonBody, ...managerWrite, async (c) => {
    const body = await c.req.json().catch(() => ({})) as { codes?: unknown }
    const extraCodes = Array.isArray(body.codes)
      ? body.codes.map((value) => String(value)).filter((value) => /^\d{6,10}$/u.test(value)).slice(0, 50)
      : []
    try {
      const result = await syncBiSkuNames(c.env, { trigger: 'manual', force: true, extraCodes })
      return c.json(result)
    } catch (error) {
      // ApiProblem 由全局 onError 统一渲染；上游错误转 503，绝不把上游细节泄给客户端。
      if (error instanceof MasterDataUpstreamError) {
        throw new ApiProblem(503, error.code, '车型名称同步暂时不可用，请稍后重试。')
      }
      throw error
    }
  })

  return app
}
