import { Hono } from 'hono'
import type { AppConfig, WorkerEnv } from '../env.js'
import type { AuthContext } from '../auth/types.js'

type Vars = { config: AppConfig; auth: AuthContext | null }

export function healthRoutes() {
  const app = new Hono<{ Bindings: WorkerEnv; Variables: Vars }>()

  app.get('/health/live', (c) => {
    const config = c.get('config')
    return c.json({ status: 'ok', version: config.APP_VERSION, gitSha: config.GIT_SHA })
  })

  app.get('/health/ready', async (c) => {
    const config = c.get('config')
    try {
      await c.env.DB.prepare('SELECT 1 AS ok').first()
      return c.json({ status: 'ready', version: config.APP_VERSION, gitSha: config.GIT_SHA })
    } catch {
      return c.json({ status: 'not-ready' }, 503)
    }
  })

  app.get('/api/v1/meta/version', (c) => {
    const config = c.get('config')
    return c.json({
      appVersion: config.APP_VERSION,
      apiVersion: '1.0.0',
      schemaVersion: '0001_initial_sqlite',
      gitSha: config.GIT_SHA,
      environment: config.APP_ENV,
      platform: 'cloudflare-workers-d1'
    })
  })

  return app
}
