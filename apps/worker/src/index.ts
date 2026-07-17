import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { ZodError } from 'zod'
import type { AppConfig, WorkerEnv } from './env.js'
import { loadConfig } from './env.js'
import type { AuthContext } from './auth/types.js'
import { authRoutes } from './routes/auth.js'
import { auditRoutes } from './routes/audit.js'
import { bootstrapRoutes } from './routes/bootstrap.js'
import { closingRoutes } from './routes/closing.js'
import { healthRoutes } from './routes/health.js'
import { workItemRoutes } from './routes/work-items.js'
import { ApiProblem } from './services/problems.js'

type Vars = {
  config: AppConfig
  auth: AuthContext | null
}

const app = new Hono<{ Bindings: WorkerEnv; Variables: Vars }>()

app.use('*', async (c, next) => {
  const path = new URL(c.req.url).pathname
  if (path.startsWith('/api/') || path.startsWith('/health/')) {
    c.set('config', loadConfig(c.env))
    c.set('auth', null)
    const origin = c.req.header('origin')
    if (origin) {
      if (!c.get('config').allowedOrigins.includes(origin)) {
        throw new ApiProblem(403, 'ORIGIN_NOT_ALLOWED', '请求来源不受允许。')
      }
      c.header('Access-Control-Allow-Origin', origin)
      c.header('Access-Control-Allow-Credentials', 'true')
      c.header('Vary', 'Origin')
      c.header('Access-Control-Allow-Headers', 'content-type, x-csrf-token, x-store-id, idempotency-key, if-match')
      c.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
    }
    if (c.req.method === 'OPTIONS') return c.body(null, 204)
  }
  return next()
})

app.route('/', healthRoutes())
app.route('/', authRoutes())
app.route('/', closingRoutes())
app.route('/', workItemRoutes())
app.route('/', auditRoutes())
app.route('/', bootstrapRoutes())

// Product has no file-storage requirement on the Cloudflare path.
app.all('/api/v1/attachments/*', (c) => c.json({
  error: 'MEDIA_DISABLED',
  message: '当前 Cloudflare 架构不包含文件存储；附件功能已禁用。'
}, 410))

app.onError((error, c) => {
  if (error instanceof ApiProblem) {
    return c.json({ error: error.code, message: error.message }, error.status as any)
  }
  if (error instanceof ZodError) {
    return c.json({ error: 'VALIDATION_ERROR', message: '提交内容不完整或格式不正确。', details: error.issues }, 400)
  }
  if (error instanceof HTTPException) {
    return error.getResponse()
  }
  console.error(error)
  return c.json({ error: 'INTERNAL_ERROR', message: '服务暂时不可用，请稍后重试。' }, 500)
})

export default app
