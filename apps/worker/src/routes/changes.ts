import { Hono } from 'hono'
import type { AppConfig, WorkerEnv } from '../env.js'
import type { AuthContext } from '../auth/types.js'
import { createAuthMiddleware } from '../auth/middleware.js'
import { readStoreVersion } from '../services/store-changes.js'

type Vars = { config: AppConfig; auth: AuthContext | null }

// ── 长轮询变更端点（2026-09-09 实时推送第一批）────────────────────────
// GET /api/v1/changes?since=<version>
//
// 语义：
//   本地版本号 < 服务端版本号 → 立即返回 { changed: true, version }
//   相等 → 挂起等待，最多 HOLD_MS，期间每秒复查一次
//   超时 → 返回 { changed: false, version: since }（前端立即再发一轮）
//
// 为什么每秒复查而不是等通知：Workers 无跨请求内存广播（需要 Durable Object），
// D1 没有 watch/notify。每秒一次 D1 点查（走主键）成本极低，且 setTimeout
// 等待不计 CPU 时间，可安全挂起。
//
// 请求成本控制：
//   有变更 → 立刻返回（一次点查）
//   无变更 → 25 秒挂起 + 约 25 次点查，然后前端立刻重发
//   单店单页面 ≈ 每分钟 2.4 个请求，远低于免费层 10 万/日。
const HOLD_MS = 25_000
const POLL_MS = 1_000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function changesRoutes() {
  const app = new Hono<{ Bindings: WorkerEnv; Variables: Vars }>()
  const auth = createAuthMiddleware()
  const read = [auth.loadSession, auth.requirePasswordChanged] as const

  app.get('/api/v1/changes', ...read, async (c) => {
    const context = c.get('auth')!
    const raw = c.req.query('since')
    const since = Number.isFinite(Number(raw)) && Number(raw) >= 0 ? Math.floor(Number(raw)) : 0
    const deadline = Date.now() + HOLD_MS

    let version = await readStoreVersion(c.env.DB, context.storeId)
    if (version > since) {
      return c.json({ changed: true, version })
    }
    while (Date.now() < deadline) {
      await sleep(POLL_MS)
      version = await readStoreVersion(c.env.DB, context.storeId)
      if (version > since) {
        return c.json({ changed: true, version })
      }
    }
    return c.json({ changed: false, version })
  })

  return app
}
