import type { MiddlewareHandler } from 'hono'
import type { AppConfig, WorkerEnv } from '../env.js'
import { camelRow, first, nowIso } from '../db.js'
import { ApiProblem } from '../services/problems.js'
import type { AuthContext } from './types.js'
import { readCookie, SESSION_COOKIE, sessionTokenHash } from './session.js'

type Vars = {
  config: AppConfig
  auth: AuthContext | null
}

export function createAuthMiddleware(): {
  loadSession: MiddlewareHandler<{ Bindings: WorkerEnv; Variables: Vars }>
  requireAuth: MiddlewareHandler<{ Bindings: WorkerEnv; Variables: Vars }>
  requirePasswordChanged: MiddlewareHandler<{ Bindings: WorkerEnv; Variables: Vars }>
  requireCsrf: MiddlewareHandler<{ Bindings: WorkerEnv; Variables: Vars }>
} {
  const loadSession: MiddlewareHandler<{ Bindings: WorkerEnv; Variables: Vars }> = async (c, next) => {
    c.set('auth', null)
    const config = c.get('config')
    const token = readCookie(c, SESSION_COOKIE)
    if (!token) return next()
    const tokenHash = await sessionTokenHash(token, config)
    const selectedStore = c.req.header('x-store-id') ?? null
    const row = await first(c.env.DB.prepare(`
      SELECT s.token_hash, s.csrf_hash, s.user_id, u.display_name, u.must_change_password,
             st.id AS store_id, st.code AS store_code, st.name AS store_name, st.timezone, sm.role
      FROM auth_sessions s
      JOIN users u ON u.id = s.user_id
      JOIN store_members sm ON sm.user_id = u.id
      JOIN stores st ON st.id = sm.store_id
      WHERE s.token_hash = ?
        AND s.revoked_at IS NULL
        AND s.expires_at > ?
        AND u.status = 'active'
        AND st.status = 'active'
        AND (? IS NULL OR st.id = ?)
      ORDER BY sm.created_at ASC
      LIMIT 1
    `).bind(tokenHash, nowIso(), selectedStore, selectedStore))
    if (!row) return next()
    const mapped = camelRow(row)
    c.set('auth', {
      userId: mapped.userId,
      displayName: mapped.displayName,
      mustChangePassword: mapped.mustChangePassword === 1 || mapped.mustChangePassword === true,
      storeId: mapped.storeId,
      storeCode: mapped.storeCode,
      storeName: mapped.storeName,
      storeTimezone: mapped.timezone,
      role: mapped.role,
      sessionTokenHash: mapped.tokenHash,
      csrfHash: mapped.csrfHash
    } satisfies AuthContext)
    c.executionCtx.waitUntil(
      c.env.DB.prepare('UPDATE auth_sessions SET last_seen_at = ? WHERE token_hash = ?')
        .bind(nowIso(), tokenHash)
        .run()
    )
    return next()
  }

  const requireAuth: MiddlewareHandler<{ Bindings: WorkerEnv; Variables: Vars }> = async (c, next) => {
    if (!c.get('auth')) throw new ApiProblem(401, 'UNAUTHENTICATED', '请重新登录。')
    return next()
  }

  const requirePasswordChanged: MiddlewareHandler<{ Bindings: WorkerEnv; Variables: Vars }> = async (c, next) => {
    const auth = c.get('auth')
    if (!auth) throw new ApiProblem(401, 'UNAUTHENTICATED', '请重新登录。')
    if (auth.mustChangePassword) throw new ApiProblem(403, 'PASSWORD_CHANGE_REQUIRED', '请先修改初始密码。')
    return next()
  }

  const requireCsrf: MiddlewareHandler<{ Bindings: WorkerEnv; Variables: Vars }> = async (c, next) => {
    const auth = c.get('auth')
    if (!auth) throw new ApiProblem(401, 'UNAUTHENTICATED', '请重新登录。')
    const header = c.req.header('x-csrf-token')
    if (!header) throw new ApiProblem(403, 'CSRF_FAILED', '请求缺少安全校验。')
    const { csrfTokenHash } = await import('./session.js')
    const hash = await csrfTokenHash(header, c.get('config'))
    if (hash !== auth.csrfHash) throw new ApiProblem(403, 'CSRF_FAILED', '请求安全校验失败。')
    return next()
  }

  return { loadSession, requireAuth, requirePasswordChanged, requireCsrf }
}
