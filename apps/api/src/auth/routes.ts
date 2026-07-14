import type { FastifyInstance } from 'fastify'
import type { Database } from '@bike-ops/database'
import { loginSchema, passwordSchema, setupAdminSchema, usernameSchema } from '@bike-ops/contracts'
import { usernameKey } from '@bike-ops/domain'
import type { AppConfig } from '../config.js'
import { keyedHash, randomToken, safeEqualHex, sha256 } from '../lib/crypto.js'
import { createAuthMiddleware } from './middleware.js'
import { hashPassword, verifyPassword } from './password.js'
import { clearSessionCookie, createSessionSecrets, csrfTokenHash, setSessionCookie, SESSION_COOKIE, sessionTokenHash } from './session.js'

interface LoginUserRow {
  id: string
  displayName: string
  passwordHash: string
  mustChangePassword: boolean
  failedLoginCount: number
  lockedUntil: Date | null
}

export async function registerAuthRoutes(app: FastifyInstance, sql: Database, config: AppConfig): Promise<void> {
  const auth = createAuthMiddleware(sql, config)

  app.post('/api/v1/auth/setup', { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } }, async (request, reply) => {
    if (!config.ADMIN_SETUP_TOKEN_HASH) return reply.code(404).send({ error: 'SETUP_DISABLED', message: '首次管理员初始化未开启。' })
    const input = setupAdminSchema.parse(request.body)
    if (!safeEqualHex(sha256(input.token), config.ADMIN_SETUP_TOKEN_HASH)) return reply.code(403).send({ error: 'INVALID_SETUP_TOKEN', message: '初始化链接无效或已过期。' })
    const passwordHash = await hashPassword(input.password, config.PASSWORD_PEPPER)
    const result = await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(1847132501)`
      const countRows = await tx<{ count: number }[]>`select count(*)::int as count from bike_ops.users`
      if ((countRows[0]?.count ?? 0) > 0) return null
      const [store] = await tx<{ id: string }[]>`
        insert into bike_ops.stores (code, name) values (${input.storeCode}, ${input.storeName}) returning id
      `
      const [user] = await tx<{ id: string }[]>`
        insert into bike_ops.users (username_key, display_name, password_hash)
        values (${usernameKey(input.username)}, ${input.displayName}, ${passwordHash}) returning id
      `
      if (!store || !user) throw new Error('INITIAL_ADMIN_INSERT_FAILED')
      await tx`insert into bike_ops.store_members (store_id, user_id, role) values (${store.id}, ${user.id}, 'admin')`
      return { userId: user.id, storeId: store.id }
    })
    if (!result) return reply.code(409).send({ error: 'SETUP_ALREADY_COMPLETED', message: '系统已经存在管理员，初始化链接已失效。' })
    return reply.code(201).send({ ok: true, message: '首位管理员已创建，请使用新账号登录。' })
  })

  app.post('/api/v1/auth/login', { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }, async (request, reply) => {
    const input = loginSchema.parse(request.body)
    const [user] = await sql<LoginUserRow[]>`
      select id, display_name, password_hash, must_change_password, failed_login_count, locked_until
      from bike_ops.users where username_key = ${usernameKey(input.username)} and status = 'active' limit 1
    `
    const genericFailure = { error: 'INVALID_CREDENTIALS', message: '用户名或密码不正确。' }
    if (!user || (user.lockedUntil && user.lockedUntil.getTime() > Date.now())) return reply.code(401).send(genericFailure)
    const valid = await verifyPassword(user.passwordHash, input.password, config.PASSWORD_PEPPER)
    if (!valid) {
      await sql`
        update bike_ops.users set failed_login_count = failed_login_count + 1,
          locked_until = case when failed_login_count + 1 >= 5 then now() + interval '15 minutes' else locked_until end,
          updated_at = now()
        where id = ${user.id}
      `
      return reply.code(401).send(genericFailure)
    }
    const memberships = await sql<{ storeId: string; storeCode: string; storeName: string; timezone: string; role: 'operator' | 'manager' | 'admin' }[]>`
      select st.id as store_id, st.code as store_code, st.name as store_name, st.timezone, sm.role
      from bike_ops.store_members sm join bike_ops.stores st on st.id = sm.store_id
      where sm.user_id = ${user.id} and st.status = 'active' order by sm.created_at asc
    `
    if (!memberships.length) return reply.code(403).send({ error: 'NO_STORE_ACCESS', message: '账号尚未分配可访问门店。' })
    const secrets = createSessionSecrets(config)
    const expiresAt = new Date(Date.now() + config.SESSION_TTL_HOURS * 60 * 60 * 1000)
    const ipHash = request.ip ? keyedHash(request.ip, config.SESSION_SECRET) : null
    await sql.begin(async (tx) => {
      await tx`
        insert into bike_ops.auth_sessions (token_hash, csrf_hash, user_id, expires_at, ip_hash, user_agent)
        values (${secrets.tokenHash}, ${secrets.csrfHash}, ${user.id}, ${expiresAt}, ${ipHash}, ${request.headers['user-agent']?.slice(0, 500) ?? null})
      `
      await tx`update bike_ops.users set failed_login_count = 0, locked_until = null, last_login_at = now(), updated_at = now() where id = ${user.id}`
    })
    setSessionCookie(reply, secrets.token, config)
    return reply.send({ user: { id: user.id, displayName: user.displayName, mustChangePassword: user.mustChangePassword }, stores: memberships, currentStoreId: memberships[0]?.storeId, csrfToken: secrets.csrfToken })
  })

  app.get('/api/v1/auth/me', { preHandler: [auth.loadSession] }, async (request, reply) => {
    if (!request.auth) return
    const csrfToken = randomToken()
    const nextHash = csrfTokenHash(csrfToken, config)
    await sql`update bike_ops.auth_sessions set csrf_hash = ${nextHash}, last_seen_at = now() where token_hash = ${request.auth.sessionTokenHash}`
    const stores = await sql<{ storeId: string; storeCode: string; storeName: string; timezone: string; role: string }[]>`
      select st.id as store_id, st.code as store_code, st.name as store_name, st.timezone, sm.role
      from bike_ops.store_members sm join bike_ops.stores st on st.id = sm.store_id
      where sm.user_id = ${request.auth.userId} and st.status = 'active' order by sm.created_at asc
    `
    return reply.send({ user: { id: request.auth.userId, displayName: request.auth.displayName, mustChangePassword: request.auth.mustChangePassword }, stores, currentStoreId: request.auth.storeId, csrfToken })
  })

  app.post('/api/v1/auth/logout', { preHandler: [auth.loadSession, auth.requireCsrf] }, async (request, reply) => {
    if (request.auth) await sql`update bike_ops.auth_sessions set revoked_at = now() where token_hash = ${request.auth.sessionTokenHash}`
    clearSessionCookie(reply, config)
    return reply.code(204).send()
  })

  app.post('/api/v1/auth/change-password', { preHandler: [auth.loadSession, auth.requireCsrf] }, async (request, reply) => {
    if (!request.auth) return
    const context = request.auth
    const body = request.body as { currentPassword?: unknown; nextPassword?: unknown }
    const currentPassword = typeof body?.currentPassword === 'string' ? body.currentPassword : ''
    const nextPassword = passwordSchema.parse(body?.nextPassword)
    if (nextPassword === currentPassword) return reply.code(400).send({ error: 'PASSWORD_REUSE', message: '新密码不能与当前密码相同。' })
    const [user] = await sql<{ passwordHash: string }[]>`select password_hash from bike_ops.users where id = ${context.userId}`
    if (!user || !(await verifyPassword(user.passwordHash, currentPassword, config.PASSWORD_PEPPER))) return reply.code(400).send({ error: 'INVALID_CURRENT_PASSWORD', message: '当前密码不正确。' })
    const passwordHash = await hashPassword(nextPassword, config.PASSWORD_PEPPER)
    await sql.begin(async (tx) => {
      await tx`update bike_ops.users set password_hash = ${passwordHash}, must_change_password = false, updated_at = now() where id = ${context.userId}`
      await tx`update bike_ops.auth_sessions set revoked_at = now() where user_id = ${context.userId} and token_hash <> ${context.sessionTokenHash}`
    })
    return reply.send({ ok: true })
  })

  app.post('/api/v1/users', { preHandler: [auth.loadSession, auth.requireCsrf, auth.requirePasswordChanged, auth.requireRole('admin')] }, async (request, reply) => {
    if (!request.auth) return
    const context = request.auth
    const body = request.body as Record<string, unknown>
    const username = usernameSchema.parse(body.username)
    const displayName = usernameSchema.parse(body.displayName ?? body.username)
    const password = passwordSchema.parse(body.password)
    const role = body.role === 'admin' || body.role === 'manager' ? body.role : 'operator'
    const passwordHash = await hashPassword(password, config.PASSWORD_PEPPER)
    try {
      const user = await sql.begin(async (tx) => {
        const [created] = await tx<{ id: string }[]>`
          insert into bike_ops.users (username_key, display_name, password_hash, must_change_password)
          values (${usernameKey(username)}, ${displayName}, ${passwordHash}, true) returning id
        `
        if (!created) throw new Error('USER_INSERT_FAILED')
        await tx`insert into bike_ops.store_members (store_id, user_id, role) values (${context.storeId}, ${created.id}, ${role})`
        return created
      })
      return reply.code(201).send({ id: user.id, displayName, role, mustChangePassword: true })
    } catch (error) {
      if (typeof error === 'object' && error && 'code' in error && error.code === '23505') return reply.code(409).send({ error: 'USERNAME_EXISTS', message: '该用户名已存在。' })
      throw error
    }
  })

  app.get('/api/v1/auth/session-cookie-name', async (_request, reply) => reply.send({ cookieName: SESSION_COOKIE }))
}
