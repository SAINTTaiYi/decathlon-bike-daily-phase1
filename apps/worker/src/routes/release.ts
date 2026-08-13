import { Hono } from 'hono'
import type { AppConfig, WorkerEnv } from '../env.js'
import type { AuthContext } from '../auth/types.js'
import { RELEASE_INFO } from '../generated/release-info.js'

type Vars = { config: AppConfig; auth: AuthContext | null }

// 发布公告端点：内容在构建期由 scripts/generate-build-metadata.mjs 从
// apps/web/src/data/releaseNotes.js（唯一事实源）烘焙进 Worker 包。
// 部署完成即生效——门店已打开的旧页面也能实时读到本次更新内容。
export function releaseRoutes() {
  const app = new Hono<{ Bindings: WorkerEnv; Variables: Vars }>()

  app.get('/api/release/info', (c) => {
    const config = c.get('config')
    return c.json({
      version: RELEASE_INFO.version,
      date: RELEASE_INFO.date,
      title: RELEASE_INFO.title,
      summary: RELEASE_INFO.summary,
      changes: RELEASE_INFO.changes,
      gitSha: config.GIT_SHA,
      environment: config.APP_ENV
    })
  })

  return app
}
