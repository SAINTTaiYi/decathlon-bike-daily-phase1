import { Hono } from 'hono'
import type { AppConfig, WorkerEnv } from '../env.js'
import type { AuthContext } from '../auth/types.js'
import { createAuthMiddleware } from '../auth/middleware.js'
import { ApiProblem } from '../services/problems.js'
import { D1MetricsUpstreamError, fetchD1MetricsSnapshot, isD1MetricsConfigured } from '../services/d1-metrics.js'

type Vars = { config: AppConfig; auth: AuthContext | null }

// D1 当日读行监控（总览页 admin 卡片）：只读、账号级配额口径（UTC 日 = 北京 08:00 归零）。
// 未配置 D1_METRICS_TOKEN 时返回 available:false，前端隐藏卡片——功能缺凭据不拖垮任何部署。
// 上游（CF GraphQL Analytics）故障时返回 503，绝不把上游细节泄给客户端。
export function d1MetricsRoutes() {
  const app = new Hono<{ Bindings: WorkerEnv; Variables: Vars }>()
  const auth = createAuthMiddleware()
  const adminRead = [auth.loadSession, auth.requirePasswordChanged, auth.requireRole('admin')] as const

  app.get('/api/v1/d1/metrics', ...adminRead, async (c) => {
    if (!isD1MetricsConfigured(c.env)) return c.json({ available: false })
    try {
      const snapshot = await fetchD1MetricsSnapshot(c.env)
      return c.json(snapshot)
    } catch (error) {
      if (error instanceof D1MetricsUpstreamError) {
        throw new ApiProblem(503, 'D1_METRICS_UNAVAILABLE', 'D1 用量监控暂时不可用，请稍后重试。')
      }
      throw error
    }
  })

  return app
}
