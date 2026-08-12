import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { bodyLimit } from 'hono/body-limit'
import { ZodError } from 'zod'
import type { AppConfig, WorkerEnv } from './env.js'
import { isAllowedOrigin, loadConfig } from './env.js'
import type { AuthContext } from './auth/types.js'
import { authRoutes } from './routes/auth.js'
import { auditRoutes } from './routes/audit.js'
import { bootstrapRoutes } from './routes/bootstrap.js'
import { closingRoutes } from './routes/closing.js'
import { healthRoutes } from './routes/health.js'
import { workItemRoutes } from './routes/work-items.js'
import { registrationRoutes } from './routes/registration.js'
import { governanceRoutes } from './routes/governance.js'
import { adminRoutes } from './routes/admin.js'
import { ApiProblem } from './services/problems.js'
import { routeIncomingRequest } from './request-routing.js'

type Vars = {
  config: AppConfig
  auth: AuthContext | null
}

const app = new Hono<{ Bindings: WorkerEnv; Variables: Vars }>()


app.use('/api/*', bodyLimit({
  maxSize: 1024 * 1024,
  onError: (c) => c.json({ error: 'REQUEST_BODY_TOO_LARGE', message: '请求内容超过允许大小。' }, 413)
}))

function needsSecrets(path: string): boolean {
  // Public identity/health endpoints must read plain env vars (APP_VERSION/GIT_SHA)
  // so post-deploy verification is not blocked by secret loading or stale secret-path config.
  if (path === '/health/live') return false
  if (path === '/health/ready') return false
  if (path === '/api/v1/meta/version') return false
  if (path.startsWith('/health/') || path.startsWith('/api/')) return true
  return false
}

app.use('*', async (c, next) => {
  const path = new URL(c.req.url).pathname
  if (path.startsWith('/api/') || path.startsWith('/health/')) {
    c.set('auth', null)
    if (needsSecrets(path)) {
      c.set('config', loadConfig(c.env))
    } else {
      // Minimal config for public health/meta without requiring secrets.
      c.set('config', {
        APP_ENV: (c.env.APP_ENV ?? 'staging') as AppConfig['APP_ENV'],
        APP_VERSION: c.env.APP_VERSION ?? '0.0.0',
        GIT_SHA: c.env.GIT_SHA ?? 'unknown',
        COOKIE_SECURE: (c.env.COOKIE_SECURE ?? 'true') === 'true',
        SESSION_TTL_HOURS: Number(c.env.SESSION_TTL_HOURS ?? '12'),
        allowedOrigins: ['https://bike-ops-staging.workers.dev'],
        SESSION_SECRET: 'public-route-placeholder-not-used',
        CSRF_SECRET: 'public-route-placeholder-not-used',
        PASSWORD_PEPPER: 'public-route-placeholder-not-used'
      })
    }
    const origin = c.req.header('origin')
    if (origin && needsSecrets(path)) {
      if (!isAllowedOrigin(origin, c.get('config').allowedOrigins)) {
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
app.route('/', registrationRoutes())
app.route('/', governanceRoutes())
app.route('/', adminRoutes())
app.route('/', closingRoutes())
app.route('/', workItemRoutes())
app.route('/', auditRoutes())
app.route('/', bootstrapRoutes())

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
  if (error instanceof SyntaxError) {
    return c.json({ error: 'INVALID_JSON', message: '请求内容不是有效的 JSON。' }, 400)
  }
  if (error instanceof HTTPException) {
    return error.getResponse()
  }
  console.error(error)
  return c.json({ error: 'INTERNAL_ERROR', message: '服务暂时不可用，请稍后重试。' }, 500)
})

export async function handleRequest(request: Request, env: WorkerEnv, executionCtx: ExecutionContext): Promise<Response> {
  return routeIncomingRequest(request, env.ASSETS, (apiRequest) => app.fetch(apiRequest, env, executionCtx))
}

export default { fetch: handleRequest }
