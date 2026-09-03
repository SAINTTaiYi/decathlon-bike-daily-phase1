import { Hono } from 'hono'
import type { AppConfig, WorkerEnv } from '../env.js'
import type { AuthContext } from '../auth/types.js'
import { createAuthMiddleware } from '../auth/middleware.js'
import { requireJsonBody } from '../lib/json.js'
import { latestSyncedAt, listBiSkuNames, syncBiSkuNames } from '../services/bi-sku-sync.js'
import { MasterDataUpstreamError } from '../lib/masterdata-login.js'
import { businessDateFor } from '../services/business.js'
import { PerfecoUpstreamError, getBikeWeek, isPerfecoConfigured, readBikeDay, resolveArticleVehicleInfo, resolveModelVehicleInfo, syncBikeDay } from '../services/bi-bikes.js'
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

  // ── perfeco 整车数据（2026-09-04 换源）────────────────────────
  // 全部只读 GET（幂等服务端缓存写）：登录会话即可，无 CSRF/角色门槛。
  // 未配置 perfeco 凭据 → available:false，前端隐藏同步提示，绝不拖垮弹窗。

  // 当日新车/二手车实销（闭店 KPI 弹窗「填写数据」自动同步）。
  app.get('/api/v1/bi/bikes/day', ...read, async (c) => {
    if (!isPerfecoConfigured(c.env)) return c.json({ available: false })
    const context = c.get('auth')!
    try {
      const requested = c.req.query('date')
      const businessDate = /^\d{4}-\d{2}-\d{2}$/u.test(requested ?? '') ? requested! : await businessDateFor(context)
      const snapshot = await syncBikeDay(c.env, {
        storeId: context.storeId,
        storeCode: context.storeCode,
        businessDate
      })
      return c.json(snapshot ?? { available: false })
    } catch (error) {
      if (error instanceof PerfecoUpstreamError) {
        throw new ApiProblem(503, error.code, '自行车销量同步暂时不可用，请稍后重试。')
      }
      throw error
    }
  })

  // 周整车榜（BI 车型榜换源，本周 vs 上周环比）。
  app.get('/api/v1/bi/bikes/week', ...read, async (c) => {
    if (!isPerfecoConfigured(c.env)) return c.json({ available: false })
    const context = c.get('auth')!
    try {
      const payload = await getBikeWeek(c.env, { storeId: context.storeId, storeCode: context.storeCode })
      return c.json(payload ?? { available: false })
    } catch (error) {
      if (error instanceof PerfecoUpstreamError) {
        throw new ApiProblem(503, error.code, '车型周榜同步暂时不可用，请稍后重试。')
      }
      throw error
    }
  })

  // article 码分类（Shiphub 日报：sku → 车型名 + 整车过滤）。
  app.get('/api/v1/bi/vehicles', ...read, async (c) => {
    if (!isPerfecoConfigured(c.env)) return c.json({ available: false })
    const codes = (c.req.query('articles') ?? '').split(',').map((code) => code.trim()).filter((code) => /^\d{4,10}$/u.test(code)).slice(0, 60)
    if (!codes.length) return c.json({ available: true, vehicles: {} })
    try {
      const info = await resolveArticleVehicleInfo(c.env, codes)
      const vehicles: Record<string, { model: string; label: string | null; isBike: boolean; isBuyback: boolean }> = {}
      for (const [article, value] of info) {
        vehicles[article] = { model: value.modelCode, label: value.label, isBike: value.isBike, isBuyback: value.isBuyback }
      }
      return c.json({ available: true, vehicles })
    } catch (error) {
      if (error instanceof PerfecoUpstreamError) {
        throw new ApiProblem(503, error.code, '车型分类暂时不可用，请稍后重试。')
      }
      throw error
    }
  })

  // model 码分类（BI 旧 M218 allChannel 行的整车过滤）。
  app.get('/api/v1/bi/vehicle-models', ...read, async (c) => {
    if (!isPerfecoConfigured(c.env)) return c.json({ available: false })
    const codes = (c.req.query('codes') ?? '').split(',').map((code) => code.trim()).filter((code) => /^\d{4,10}$/u.test(code)).slice(0, 60)
    if (!codes.length) return c.json({ available: true, vehicles: {} })
    try {
      const info = await resolveModelVehicleInfo(c.env, codes)
      const vehicles: Record<string, { model: string; label: string | null; isBike: boolean; isBuyback: boolean }> = {}
      for (const [code, value] of info) {
        vehicles[code] = { model: value.modelCode, label: value.label, isBike: value.isBike, isBuyback: value.isBuyback }
      }
      return c.json({ available: true, vehicles })
    } catch (error) {
      if (error instanceof PerfecoUpstreamError) {
        throw new ApiProblem(503, error.code, '车型分类暂时不可用，请稍后重试。')
      }
      throw error
    }
  })

  // 手动同步（强制刷新，忽略当日守卫）。codes 可选：补充 BI 快照新增码。
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
