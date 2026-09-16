import { Hono } from 'hono'
import { DESIGN_MAX_PAYLOAD_CHARS, designSaveSchema } from '@bike-ops/contracts'
import type { AppConfig, WorkerEnv } from '../env.js'
import type { AuthContext } from '../auth/types.js'
import { createAuthMiddleware } from '../auth/middleware.js'
import { saveStoreDesign, readStoreDesign } from '../services/store-design.js'
import { ApiProblem } from '../services/problems.js'

type Vars = { config: AppConfig; auth: AuthContext | null }

// 门店设计云端图纸路由（2026-09-17）。
// 门店边界：storeId 只来自会话（auth.storeId），请求体不接受门店标识 ——
// 因此不存在把其他门店的图纸读出来或写进去的路径。
export function designRoutes() {
  const app = new Hono<{ Bindings: WorkerEnv; Variables: Vars }>()
  const auth = createAuthMiddleware()
  const read = [auth.loadSession, auth.requirePasswordChanged] as const
  const write = [auth.loadSession, auth.requirePasswordChanged, auth.requireCsrf] as const

  app.get('/api/v1/design', ...read, async (c) => {
    const context = c.get('auth')!
    const record = await readStoreDesign(c.env.DB, context.storeId)
    if (!record) return c.json({ design: null })
    let payload: unknown = null
    try {
      payload = JSON.parse(record.payload)
    } catch {
      // 落库内容损坏时不能让整条 GET 500：前端宁可按「云端无图纸」处理。
      throw new ApiProblem(500, 'DESIGN_CORRUPT', '云端图纸已损坏，请联系管理员。')
    }
    return c.json({
      design: {
        payload,
        revision: record.revision,
        updatedAt: record.updatedAt,
        updatedByName: record.updatedByName
      }
    })
  })

  app.put('/api/v1/design', ...write, async (c) => {
    const context = c.get('auth')!
    const input = designSaveSchema.parse(await c.req.json())
    const payload = JSON.stringify(input.payload)
    if (payload.length > DESIGN_MAX_PAYLOAD_CHARS) {
      throw new ApiProblem(413, 'DESIGN_TOO_LARGE', '设计数据过大，无法保存到云端（请精简布置后重试）。')
    }
    const result = await saveStoreDesign(
      c.env.DB,
      context.storeId,
      { userId: context.userId, displayName: context.displayName },
      { expectedRevision: input.expectedRevision, payload }
    )
    if (!result.ok) {
      if (result.reason === 'too_large') {
        throw new ApiProblem(413, 'DESIGN_TOO_LARGE', '设计数据过大，无法保存到云端（请精简布置后重试）。')
      }
      const who = result.updatedByName || '其他同事'
      return c.json({
        error: 'DESIGN_CONFLICT',
        message: `云端图纸已被 ${who} 更新（版本 ${result.revision}），请先载入最新版本再保存。`,
        design: { revision: result.revision, updatedAt: result.updatedAt, updatedByName: result.updatedByName }
      }, 409)
    }
    return c.json({ design: { revision: result.revision, updatedAt: result.updatedAt, updatedByName: result.updatedByName } })
  })

  return app
}
