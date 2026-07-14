import { createDatabase, closeDatabase } from '@bike-ops/database'
import { loadConfig } from './config.js'
import { buildServer } from './server.js'

const config = loadConfig()
const sql = createDatabase(config.DATABASE_URL, { prepare: false })
const app = await buildServer(config, sql)

async function shutdown(signal: string) {
  app.log.info({ signal }, 'shutting down')
  await app.close()
  await closeDatabase(sql)
  process.exit(0)
}

process.once('SIGTERM', () => void shutdown('SIGTERM'))
process.once('SIGINT', () => void shutdown('SIGINT'))

await app.listen({ host: config.HOST, port: config.PORT })
