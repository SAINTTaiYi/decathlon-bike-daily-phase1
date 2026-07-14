import type { FastifyReply, FastifyRequest } from 'fastify'
import type { Database } from '@bike-ops/database'
import type { AppRole } from '@bike-ops/contracts'
import type { AppConfig } from '../config.js'
import { safeEqualHex } from '../lib/crypto.js'
import type { AuthContext } from './types.js'
import { csrfTokenHash, SESSION_COOKIE, sessionTokenHash } from './session.js'

export function requiresPasswordChange(context: Pick<AuthContext, 'mustChangePassword'> | null | undefined): boolean {
  return Boolean(context?.mustChangePassword)
}

interface SessionRow {
  tokenHash: string
  csrfHash: string
  userId: string
  displayName: string
  mustChangePassword: boolean
  storeId: string
  storeCode: string
  storeName: string
  storeTimezone: string
  role: AppRole
}

export function createAuthMiddleware(sql: Database, config: AppConfig) {
  async function loadSession(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const token = request.cookies[SESSION_COOKIE]
    if (!token) return reply.code(401).send({ error: 'UNAUTHENTICATED', message: '登录状态已失效，请重新登录。' })
    const tokenHash = sessionTokenHash(token, config)
    const selectedStore = typeof request.headers['x-store-id'] === 'string' ? request.headers['x-store-id'] : null
    const rows = await sql<SessionRow[]>`
      select s.token_hash, s.csrf_hash, u.id as user_id, u.display_name, u.must_change_password,
             st.id as store_id, st.code as store_code, st.name as store_name, st.timezone as store_timezone, sm.role
      from bike_ops.auth_sessions s
      join bike_ops.users u on u.id = s.user_id and u.status = 'active'
      join bike_ops.store_members sm on sm.user_id = u.id
      join bike_ops.stores st on st.id = sm.store_id and st.status = 'active'
      where s.token_hash = ${tokenHash} and s.revoked_at is null and s.expires_at > now()
        and (${selectedStore}::uuid is null or st.id = ${selectedStore}::uuid)
      order by sm.created_at asc
      limit 1
    `
    const session = rows[0]
    if (!session) return reply.code(401).send({ error: 'UNAUTHENTICATED', message: '登录状态已失效，请重新登录。' })
    request.auth = { sessionTokenHash: tokenHash, ...session }
    void sql`update bike_ops.auth_sessions set last_seen_at = now() where token_hash = ${tokenHash}`
  }

  async function requireCsrf(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!request.auth) return reply.code(401).send({ error: 'UNAUTHENTICATED', message: '请重新登录。' })
    const token = request.headers['x-csrf-token']
    if (typeof token !== 'string' || !safeEqualHex(csrfTokenHash(token, config), request.auth.csrfHash)) {
      return reply.code(403).send({ error: 'INVALID_CSRF', message: '安全令牌已失效，请刷新页面后重试。' })
    }
  }

  async function requirePasswordChanged(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!request.auth) return reply.code(401).send({ error: 'UNAUTHENTICATED', message: '请重新登录。' })
    if (requiresPasswordChange(request.auth)) {
      return reply.code(428).send({ error: 'PASSWORD_CHANGE_REQUIRED', message: '首次登录必须先修改临时密码。' })
    }
  }

  function requireRole(...roles: AppRole[]) {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      if (!request.auth || !roles.includes(request.auth.role)) return reply.code(403).send({ error: 'FORBIDDEN', message: '当前账号没有执行该操作的权限。' })
    }
  }

  return { loadSession, requireCsrf, requirePasswordChanged, requireRole }
}
