import { Hono } from 'hono'
import { DESIGN_MAX_PAYLOAD_CHARS, designSaveSchema } from '@bike-ops/contracts'
import { isAllowedOrigin } from '../env.js'
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

  // 门店设计实时协作（WebSocket，2026-09-17）。
  // 认证与会话复用同一套中间件；房间名由会话里的 storeId 决定（门店边界）。
  // 只读降级会话不允许连接 —— 实时协作本质是持续写操作。
  // Origin 显式白名单：浏览器 WebSocket 不受同源策略约束（跨站页面也能发起
  // 连接、并自动携带 cookie），必须像写接口一样校验来源，防跨站劫持写通道。
  app.get('/api/v1/design/ws', ...read, async (c) => {
    if ((c.req.header('upgrade') ?? '').toLowerCase() !== 'websocket') {
      throw new ApiProblem(426, 'EXPECTED_WEBSOCKET', '该端点仅接受 WebSocket 升级请求。')
    }
    const context = c.get('auth')!
    if (context.readOnly) {
      throw new ApiProblem(403, 'READONLY_SESSION', '只读模式下无法使用实时协作，恢复写入后可重试。')
    }
    const namespace = c.env.DESIGN_ROOM
    if (!namespace) {
      // 未配置 Durable Object 绑定时向前端报「不可用」，工具自动退回手动保存模式。
      throw new ApiProblem(503, 'REALTIME_UNAVAILABLE', '实时协作暂未启用。')
    }
    if (!isAllowedOrigin(c.req.header('origin'), c.get('config').allowedOrigins)) {
      throw new ApiProblem(403, 'ORIGIN_NOT_ALLOWED', '来源不在允许列表中。')
    }
    const stub = namespace.get(namespace.idFromName(`store:${context.storeId}`))
    // 转发给房间 DO：必须以「原始 Request 为模板」构造（new Request(url, request)），
    // Workerd 只在这种构造下保留 WebSocket 升级语义；手工 new Request(url, {headers})
    // 会丢失升级标志、握手直接失败（2026-09-17 冒烟实测 500）。
    // 展示名走 URL query 传递：Request headers 不可变（immutable），拿不到第二条通道；
    // 名字来自服务端会话，客户端无法伪造。
    const forwardUrl = new URL(c.req.url)
    forwardUrl.searchParams.set('x-design-user', context.displayName)
    try {
      const response = await stub.fetch(new Request(forwardUrl, c.req.raw))
      if (response.status >= 500) {
        const detail = await response.text().catch(() => '')
        console.error('[design-ws] DO responded', response.status, detail.slice(0, 500))
        return c.json({ error: 'REALTIME_UNAVAILABLE', message: '实时协作暂时不可用，请稍后重试。' }, 502)
      }
      return response
    } catch (error) {
      console.error('[design-ws] forward failed', error)
      throw new ApiProblem(502, 'REALTIME_UNAVAILABLE', '实时协作暂时不可用，请稍后重试。')
    }
  })

  return app
}
