import type { FastifyInstance } from 'fastify'
import { createDatabase } from '@bike-ops/database'
import { loadConfig } from './config.js'
import { buildServer } from './server.js'
import { createFetchHandler, type EdgeOneRequestContext, type InjectableApp } from './serverless.js'

let appPromise: Promise<FastifyInstance> | undefined

export function getEdgeOneApp(context: EdgeOneRequestContext = { request: new Request('http://localhost/') }): Promise<FastifyInstance> {
  if (!appPromise) {
    appPromise = (async () => {
      const config = loadConfig({ ...process.env, ...(context.env ?? {}) })
      const sql = createDatabase(config.DATABASE_URL, {
        max: config.DATABASE_POOL_MAX,
        prepare: false,
        idleTimeoutSeconds: config.DATABASE_IDLE_TIMEOUT_SECONDS,
        connectTimeoutSeconds: config.DATABASE_CONNECT_TIMEOUT_SECONDS
      })
      const app = await buildServer(config, sql)
      await app.ready()
      return app
    })()
    appPromise.catch(() => { appPromise = undefined })
  }
  return appPromise
}

const onRequest = createFetchHandler(async (context) => await getEdgeOneApp(context) as unknown as InjectableApp)

export { onRequest }
export default onRequest
