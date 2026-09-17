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
import { changesRoutes } from './routes/changes.js'
import { closingRoutes } from './routes/closing.js'
import { healthRoutes } from './routes/health.js'
import { releaseRoutes } from './routes/release.js'
import { workItemRoutes } from './routes/work-items.js'
import { registrationRoutes } from './routes/registration.js'
import { recoveryRoutes } from './routes/recovery.js'
import { accountRoutes } from './routes/account.js'
import { governanceRoutes } from './routes/governance.js'
import { adminRoutes } from './routes/admin.js'
import { shipHubRoutes } from './routes/shiphub.js'
import { biRoutes } from './routes/bi.js'
import { d1MetricsRoutes } from './routes/d1-metrics.js'
import { foodRoutes } from './routes/food.js'
import { designRoutes } from './routes/design.js'
import { runScheduledShipHubSync } from './services/shiphub-sync.js'
import { BI_SCHEDULED_CRON, runScheduledBiSync } from './services/bi-weekly.js'
import { runD1UsageAlert } from './services/d1-usage-alert.js'
import { detectD1LimitError, d1LimitProblemBody, errorChainText } from './lib/d1-limits.js'
import { ApiProblem } from './services/problems.js'
import { routeIncomingRequest } from './request-routing.js'

// 门店设计实时协作房间（Durable Object，2026-09-17）：
// Workers 运行时要求类以顶层 named export 暴露（wrangler migrations 里声明 class_name）。
export { DesignRoom } from './design/room.js'

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
  if (path === '/api/release/info') return false
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
        PASSWORD_PEPPER: 'public-route-placeholder-not-used',
        SHIPHUB: { enabled: false, mode: 'fixture', liveConfirmed: false, oauthScope: 'read', requestTimeoutMs: 8000, activeStartHour: 10, activeEndHour: 22 },
        MASTERDATA: { authorizeUrl: 'https://idpdecathlon.oxylane.com/as/authorization.oauth2', tokenUrl: 'https://idpdecathlon.oxylane.com/as/token.oauth2', redirectUri: 'com.decathlon.authentication://com.oxylane.android.cubeinstore', scope: 'openid profile', baseUrl: 'https://api-cn.decathlon.com.cn' }
      })
    }
    const origin = c.req.header('origin')
    // WebSocket 升级请求：浏览器不强制 CORS、且升级响应（101）的 headers 在
    // Workerd 里不可修改 —— 对升级请求跳过 CORS 头注入，否则附加头会抛错、
    // 握手直接 500（2026-09-17 冒烟实测：设计协作 WS 首连 500 的根因之一）。
    const isUpgrade = (c.req.header('upgrade') ?? '').toLowerCase() === 'websocket'
    if (origin && needsSecrets(path) && !isUpgrade) {
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

// 所有 /api/* 响应携带当前部署版本头。门店端在任意业务请求上即可第一时间
// 发现服务端版本变化，无需等待轮询心跳。
app.use('/api/*', async (c, next) => {
  await next()
  // 升级响应（101）不能附加/修改 headers，直接放行 —— 否则附加版本头会把
  // WebSocket 握手打崩成 500（2026-09-17 冒烟实测的另一处根因）。
  if (c.res && c.res.status === 101) return
  const config = c.get('config')
  if (config) {
    c.header('X-App-Version', config.APP_VERSION)
    c.header('Access-Control-Expose-Headers', 'x-app-version')
  }
})

app.route('/', healthRoutes())
app.route('/', releaseRoutes())
app.route('/', authRoutes())
app.route('/', registrationRoutes())
app.route('/', recoveryRoutes())
app.route('/', accountRoutes())
app.route('/', governanceRoutes())
app.route('/', adminRoutes())
app.route('/', closingRoutes())
app.route('/', workItemRoutes())
app.route('/', auditRoutes())
app.route('/', bootstrapRoutes())
app.route('/', changesRoutes())
app.route('/', shipHubRoutes())
app.route('/', biRoutes())
app.route('/', d1MetricsRoutes())
app.route('/', foodRoutes())
app.route('/', designRoutes())

app.all('/api/v1/attachments/*', (c) => c.json({
  error: 'MEDIA_DISABLED',
  message: '当前 Cloudflare 架构不包含文件存储；附件功能已禁用。'
}, 410))

app.onError((error, c) => {
  if (error instanceof ApiProblem) {
    // D1 限额类错误（含只读会话拦写）必须带上恢复时间：门店要靠它知道「还要等多久」，
    // 少了这个字段前端只能显示一句无期限的报错。
    if (error.code === 'D1_WRITE_LIMIT' || error.code === 'D1_READ_LIMIT') {
      const body = d1LimitProblemBody(error.code === 'D1_WRITE_LIMIT' ? 'write' : 'read')
      return c.json({ ...body, message: error.message }, error.status as any)
    }
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
  // D1 免费层限额（读/写额度用尽，平台错误 7500 一类）：转成结构化 503，
  // 前端据此进入应急模式（可查看 + 应急交接），而不是笼统的「服务暂时不可用」。
  const limitKind = detectD1LimitError(errorChainText(error))
  if (limitKind) {
    console.error(`D1_LIMIT · ${limitKind}`)
    return c.json(d1LimitProblemBody(limitKind), 503)
  }
  console.error(error)
  return c.json({ error: 'INTERNAL_ERROR', message: '服务暂时不可用，请稍后重试。' }, 500)
})

export async function handleRequest(request: Request, env: WorkerEnv, executionCtx: ExecutionContext): Promise<Response> {
  return routeIncomingRequest(request, env.ASSETS, (apiRequest) => app.fetch(apiRequest, env, executionCtx))
}

export default {
  fetch: handleRequest,
  // ── 定时任务拆分（2026-09-15 晚间 CPU 风暴修复）──────────────────────────
  // 背景：免费层 CPU 预算 10ms/调用。BI 缓存过期时的拉取重路径（perfeco 拉取 +
  // 解析 + 落库，单次实测 20–49ms）此前与 Shiphub 同步同处一次 scheduled 调用，
  // 把整轮 tick 拖过预算；平台在用量高峰会终止这类超限调用，连带正在进行的
  // Shiphub 同步被腰斩、50 秒租约残留 —— 晚间 25–45 分钟同步停摆的机制。
  // 拆分后：BI 走独立 cron（每小时 :07/:37），被杀只损失一次缓存预热；
  // 每分钟 tick 只剩 Shiphub 同步与 D1 用量预警，回到 CPU 预算内。
  // 路由用精确匹配：若未来 cron 串被平台规范化，BI 会回落到每分钟 tick
  // （即旧行为），不会静默漏跑。
  scheduled(controller: ScheduledController, env: WorkerEnv, executionCtx: ExecutionContext): void {
    const fireTime = new Date(controller.scheduledTime)
    if (controller.cron === BI_SCHEDULED_CRON) {
      executionCtx.waitUntil(Promise.allSettled([runScheduledBiSync(env, fireTime)]))
      return
    }
    // 每分钟 tick：Shiphub 同步 + D1 用量预警；两者都绝不抛错（内部全量兜底）。
    executionCtx.waitUntil(Promise.allSettled([
      runScheduledShipHubSync(env),
      runD1UsageAlert(env, fireTime)
    ]))
  }
}
