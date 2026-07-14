import Fastify, { type FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import type { Database } from '@bike-ops/database'
import type { AppConfig } from './config.js'
import './auth/types.js'
import { registerAuthRoutes } from './auth/routes.js'
import { registerAuditRoutes } from './routes/audit.js'
import { registerBootstrapRoute } from './routes/bootstrap.js'
import { registerClosingRoutes } from './routes/closing.js'
import { registerMediaRoutes } from './routes/media.js'
import { registerMigrationRoutes } from './routes/migrations.js'
import { registerWorkItemRoutes } from './routes/work-items.js'
import { ApiProblem } from './services/idempotency.js'

export async function buildServer(config: AppConfig, sql: Database): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { redact: ['req.headers.authorization', 'req.headers.cookie', 'req.body.password', 'req.body.currentPassword', 'req.body.nextPassword', 'req.body.pickupCode', 'res.headers.set-cookie'] },
    trustProxy: config.TRUST_PROXY,
    bodyLimit: 1024 * 1024,
    requestIdHeader: 'x-request-id'
  })
  app.decorateRequest('auth', null)
  await app.register(cookie)
  await app.register(cors, {
    origin(origin, callback) {
      if (!origin || config.allowedOrigins.includes(origin)) return callback(null, true)
      return callback(new Error('ORIGIN_NOT_ALLOWED'), false)
    },
    credentials: true,
    allowedHeaders: ['content-type', 'x-csrf-token', 'x-store-id', 'idempotency-key', 'if-match'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
  })
  await app.register(helmet, { contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-site' } })
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' })

  app.get('/health/live', async () => ({ status: 'ok', version: config.APP_VERSION, gitSha: config.GIT_SHA }))
  app.get('/health/ready', async (_request, reply) => {
    try {
      await sql`select 1`
      return { status: 'ready', version: config.APP_VERSION, gitSha: config.GIT_SHA }
    } catch {
      return reply.code(503).send({ status: 'not-ready' })
    }
  })
  app.get('/api/v1/meta/version', async () => ({ appVersion: config.APP_VERSION, apiVersion: '1.0.0', schemaVersion: '202607150001_initial_fullstack', gitSha: config.GIT_SHA, environment: config.APP_ENV }))

  await registerAuthRoutes(app, sql, config)
  await registerClosingRoutes(app, sql, config)
  await registerWorkItemRoutes(app, sql, config)
  await registerAuditRoutes(app, sql, config)
  await registerMediaRoutes(app, sql, config)
  await registerMigrationRoutes(app, sql, config)
  await registerBootstrapRoute(app, sql, config)

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ApiProblem) return reply.code(error.status).send({ error: error.code, message: error.message })
    if (error.name === 'ZodError') return reply.code(400).send({ error: 'VALIDATION_ERROR', message: '提交内容不完整或格式不正确。', details: 'issues' in error ? error.issues : undefined })
    if (error.message === 'ORIGIN_NOT_ALLOWED') return reply.code(403).send({ error: 'ORIGIN_NOT_ALLOWED', message: '请求来源不受允许。' })
    app.log.error(error)
    return reply.code(error.statusCode && error.statusCode < 500 ? error.statusCode : 500).send({ error: 'INTERNAL_ERROR', message: '服务暂时不可用，请稍后重试。' })
  })
  return app
}
