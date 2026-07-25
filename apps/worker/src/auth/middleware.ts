import type { MiddlewareHandler } from 'hono'
import type { AppConfig, WorkerEnv } from '../env.js'
import { camelRow, first, nowIso } from '../db.js'
import { safeEqualHex } from '../lib/crypto.js'
import { ApiProblem } from '../services/problems.js'
import type { AuthContext } from './types.js'
import { csrfTokenHash, readCookie, SESSION_COOKIE, sessionTokenHash } from './session.js'

type Vars = {
  config: AppConfig
  auth: AuthContext | null
}

export function createAuthMiddleware(): {
  loadSession: MiddlewareHandler<{ Bindings: WorkerEnv; Variables: Vars }>
  requirePasswordChanged: MiddlewareHandler<{ Bindings: WorkerEnv; Variables: Vars }>
  requireCsrf: MiddlewareHandler<{ Bindings: WorkerEnv; Variables: Vars }>
  requireRole: (...roles: Array<'operator' | 'manager' | 'admin'>) => MiddlewareHandler<{ Bindings: WorkerEnv; Variables: Vars }>
  requirePlatformAdmin: MiddlewareHandler<{ Bindings: WorkerEnv; Variables: Vars }>
} {
  const loadSession: MiddlewareHandler<{ Bindings: WorkerEnv; Variables: Vars }> = async (c, next) => {
    c.set('auth', null)
    const config = c.get('config')
    const token = readCookie(c, SESSION_COOKIE)
    if (!token) throw new ApiProblem(401, 'UNAUTHENTICATED', '登录状态已失效，请重新登录。')
    const tokenHash = await sessionTokenHash(token, config)
    const selectedStore = c.req.header('x-store-id') ?? null
    const row = await first(c.env.DB.prepare(`
      SELECT s.token_hash, s.csrf_hash, u.id AS user_id, u.display_name, u.must_change_password, u.is_platform_admin,
             st.id AS store_id, st.code AS store_code, st.name AS store_name, st.timezone AS store_timezone, sm.role
      FROM auth_sessions s
      JOIN users u ON u.id = s.user_id AND u.status = 'active'
      JOIN store_members sm ON sm.user_id = u.id AND sm.status = 'active'
      JOIN stores st ON st.id = sm.store_id AND st.status = 'active'
      WHERE s.token_hash = ?
        AND s.revoked_at IS NULL
        AND s.expires_at > ?
        AND (? IS NULL OR st.id = ?)
      ORDER BY sm.effective_from ASC, sm.created_at ASC
      LIMIT 1
    `).bind(tokenHash, nowIso(), selectedStore, selectedStore))
    if (!row) throw new ApiProblem(401, 'UNAUTHENTICATED', '登录状态已失效，请重新登录。')
    const mapped = camelRow(row)
    c.set('auth', {
      userId: mapped.userId,
      displayName: mapped.displayName,
      mustChangePassword: mapped.mustChangePassword === 1 || mapped.mustChangePassword === true,
      storeId: mapped.storeId,
      storeCode: mapped.storeCode,
      storeName: mapped.storeName,
      storeTimezone: mapped.storeTimezone ?? mapped.timezone,
      role: mapped.role,
      isPlatformAdmin: mapped.isPlatformAdmin === 1 || mapped.isPlatformAdmin === true,
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

  const requirePasswordChanged: MiddlewareHandler<{ Bindings: WorkerEnv; Variables: Vars }> = async (c, next) => {
    const auth = c.get('auth')
    if (!auth) throw new ApiProblem(401, 'UNAUTHENTICATED', '请重新登录。')
    if (auth.mustChangePassword) throw new ApiProblem(428, 'PASSWORD_CHANGE_REQUIRED', '首次登录必须先修改临时密码。')
    return next()
  }

  const requireCsrf: MiddlewareHandler<{ Bindings: WorkerEnv; Variables: Vars }> = async (c, next) => {
    const auth = c.get('auth')
    if (!auth) throw new ApiProblem(401, 'UNAUTHENTICATED', '请重新登录。')
    const header = c.req.header('x-csrf-token')
    if (!header) throw new ApiProblem(403, 'INVALID_CSRF', '安全令牌已失效，请刷新页面后重试。')
    const hash = await csrfTokenHash(header, c.get('config'))
    if (!safeEqualHex(hash, auth.csrfHash)) throw new ApiProblem(403, 'INVALID_CSRF', '安全令牌已失效，请刷新页面后重试。')
    return next()
  }

  function requireRole(...roles: Array<'operator' | 'manager' | 'admin'>): MiddlewareHandler<{ Bindings: WorkerEnv; Variables: Vars }> {
    return async (c, next) => {
      const auth = c.get('auth')
      if (!auth || !roles.includes(auth.role)) throw new ApiProblem(403, 'FORBIDDEN', '当前账号没有执行该操作的权限。')
      return next()
    }
  }

  const requirePlatformAdmin: MiddlewareHandler<{ Bindings: WorkerEnv; Variables: Vars }> = async (c, next) => {
    const auth = c.get('auth')
    if (!auth?.isPlatformAdmin) throw new ApiProblem(403, 'PLATFORM_ADMIN_REQUIRED', '仅平台管理员可以执行该操作。')
    return next()
  }

  return { loadSession, requirePasswordChanged, requireCsrf, requireRole, requirePlatformAdmin }
}
