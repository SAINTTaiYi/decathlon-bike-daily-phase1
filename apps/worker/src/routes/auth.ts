import { Hono } from 'hono'
import { createUserSchema, loginSchema, passwordSchema, setupAdminSchema } from '@bike-ops/contracts'
import { localBusinessDate, usernameKey } from '@bike-ops/domain'
import type { AppConfig, WorkerEnv } from '../env.js'
import type { AuthContext } from '../auth/types.js'
import { createAuthMiddleware } from '../auth/middleware.js'
import {
  clearSessionCookie,
  createSessionSecrets,
  csrfTokenHash,
  setSessionCookie,
  SESSION_COOKIE
} from '../auth/session.js'
import { all, first, nowIso, uuid } from '../db.js'
import { hashPassword, keyedHash, randomToken, safeEqualHex, sha256, verifyPassword } from '../lib/crypto.js'
import { ApiProblem } from '../services/problems.js'
import { prepareAudit } from '../services/business.js'

type Vars = { config: AppConfig; auth: AuthContext | null }

export function authRoutes() {
  const app = new Hono<{ Bindings: WorkerEnv; Variables: Vars }>()
  const auth = createAuthMiddleware()

  app.post('/api/v1/auth/setup', async (c) => {
    const config = c.get('config')
    if (!config.ADMIN_SETUP_TOKEN_HASH) throw new ApiProblem(404, 'SETUP_DISABLED', '首次管理员初始化未开启。')
    const input = setupAdminSchema.parse(await c.req.json())
    if (!safeEqualHex(await sha256(input.token), config.ADMIN_SETUP_TOKEN_HASH)) {
      throw new ApiProblem(403, 'INVALID_SETUP_TOKEN', '初始化链接无效或已过期。')
    }
    const existing = await first<{ count: number }>(c.env.DB.prepare('SELECT COUNT(*) AS count FROM users'))
    if ((existing?.count ?? 0) > 0) throw new ApiProblem(409, 'SETUP_ALREADY_COMPLETED', '系统已经存在管理员，初始化链接已失效。')
    const passwordHash = await hashPassword(input.password, config.PASSWORD_PEPPER)
    const stamp = nowIso()
    const storeId = uuid()
    const userId = uuid()
    const audit = prepareAudit(c.env.DB, {
      context: { userId, displayName: input.displayName, mustChangePassword: false, storeId, storeCode: input.storeCode, storeName: input.storeName, storeTimezone: 'Asia/Shanghai', role: 'admin', sessionTokenHash: '', csrfHash: '' },
      action: 'initial-setup', entityType: 'account', entityId: userId, businessDate: localBusinessDate('Asia/Shanghai'),
      summary: `初始化管理员：${input.displayName}`, after: { username: input.username, displayName: input.displayName, role: 'admin' }, reversible: false
    })
    await c.env.DB.batch([
      c.env.DB.prepare(`
        INSERT INTO stores (id, code, name, timezone, status, created_at, updated_at)
        VALUES (?, ?, ?, 'Asia/Shanghai', 'active', ?, ?)
      `).bind(storeId, input.storeCode, input.storeName, stamp, stamp),
      c.env.DB.prepare(`
        INSERT INTO users (id, username_key, display_name, password_hash, status, must_change_password, failed_login_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'active', 0, 0, ?, ?)
      `).bind(userId, usernameKey(input.username), input.displayName, passwordHash, stamp, stamp),
      c.env.DB.prepare(`
        INSERT INTO store_members (store_id, user_id, role, created_at) VALUES (?, ?, 'admin', ?)
      `).bind(storeId, userId, stamp),
      audit.statement
    ])
    return c.json({ ok: true, message: '首位管理员已创建，请使用新账号登录。' }, 201)
  })

  app.post('/api/v1/auth/login', async (c) => {
    const config = c.get('config')
    const input = loginSchema.parse(await c.req.json())
    const genericFailure = { error: 'INVALID_CREDENTIALS', message: '用户名或密码不正确。' }
    const user = await first<{
      id: string
      display_name: string
      password_hash: string
      must_change_password: number
      failed_login_count: number
      locked_until: string | null
    }>(c.env.DB.prepare(`
      SELECT id, display_name, password_hash, must_change_password, failed_login_count, locked_until
      FROM users WHERE username_key = ? AND status = 'active' LIMIT 1
    `).bind(usernameKey(input.username)))
    if (!user || (user.locked_until && Date.parse(user.locked_until) > Date.now())) {
      return c.json(genericFailure, 401)
    }
    const valid = await verifyPassword(user.password_hash, input.password, config.PASSWORD_PEPPER)
    if (!valid) {
      const nextCount = user.failed_login_count + 1
      const lockedUntil = nextCount >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : user.locked_until
      await c.env.DB.prepare(`
        UPDATE users SET failed_login_count = ?, locked_until = ?, updated_at = ? WHERE id = ?
      `).bind(nextCount, lockedUntil, nowIso(), user.id).run()
      return c.json(genericFailure, 401)
    }
    const memberships = await all<{
      store_id: string
      store_code: string
      store_name: string
      timezone: string
      role: 'operator' | 'manager' | 'admin'
    }>(c.env.DB.prepare(`
      SELECT st.id AS store_id, st.code AS store_code, st.name AS store_name, st.timezone, sm.role
      FROM store_members sm
      JOIN stores st ON st.id = sm.store_id
      WHERE sm.user_id = ? AND st.status = 'active'
      ORDER BY sm.created_at ASC
    `).bind(user.id))
    if (!memberships.length) throw new ApiProblem(403, 'NO_STORE_ACCESS', '账号尚未分配可访问门店。')
    const secrets = await createSessionSecrets(config)
    const expiresAt = new Date(Date.now() + config.SESSION_TTL_HOURS * 60 * 60 * 1000).toISOString()
    const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || ''
    const ipHash = ip ? await keyedHash(ip, config.SESSION_SECRET) : null
    const stamp = nowIso()
    const primaryStore = memberships[0]!
    const audit = prepareAudit(c.env.DB, {
      context: { userId: user.id, displayName: user.display_name, mustChangePassword: user.must_change_password === 1, storeId: primaryStore.store_id, storeCode: primaryStore.store_code, storeName: primaryStore.store_name, storeTimezone: primaryStore.timezone, role: primaryStore.role, sessionTokenHash: secrets.tokenHash, csrfHash: secrets.csrfHash },
      action: 'login', entityType: 'account', entityId: user.id, businessDate: localBusinessDate(primaryStore.timezone),
      summary: `登录工作台：${user.display_name}`, after: { userId: user.id, storeId: primaryStore.store_id }, reversible: false
    })
    await c.env.DB.batch([
      c.env.DB.prepare(`
        INSERT INTO auth_sessions (token_hash, csrf_hash, user_id, expires_at, last_seen_at, created_at, ip_hash, user_agent)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        secrets.tokenHash,
        secrets.csrfHash,
        user.id,
        expiresAt,
        stamp,
        stamp,
        ipHash,
        (c.req.header('user-agent') ?? '').slice(0, 500) || null
      ),
      c.env.DB.prepare(`
        UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = ?, updated_at = ? WHERE id = ?
      `).bind(stamp, stamp, user.id),
      audit.statement
    ])
    setSessionCookie(c, secrets.token, config)
    return c.json({
      user: {
        id: user.id,
        displayName: user.display_name,
        mustChangePassword: user.must_change_password === 1
      },
      stores: memberships.map((row) => ({
        storeId: row.store_id,
        storeCode: row.store_code,
        storeName: row.store_name,
        timezone: row.timezone,
        role: row.role
      })),
      currentStoreId: memberships[0]?.store_id,
      csrfToken: secrets.csrfToken
    })
  })

  app.get('/api/v1/auth/me', auth.loadSession, async (c) => {
    const config = c.get('config')
    const context = c.get('auth')!
    const csrfToken = randomToken()
    const nextHash = await csrfTokenHash(csrfToken, config)
    await c.env.DB.prepare('UPDATE auth_sessions SET csrf_hash = ?, last_seen_at = ? WHERE token_hash = ?')
      .bind(nextHash, nowIso(), context.sessionTokenHash)
      .run()
    const stores = await all<{
      store_id: string
      store_code: string
      store_name: string
      timezone: string
      role: string
    }>(c.env.DB.prepare(`
      SELECT st.id AS store_id, st.code AS store_code, st.name AS store_name, st.timezone, sm.role
      FROM store_members sm
      JOIN stores st ON st.id = sm.store_id
      WHERE sm.user_id = ? AND st.status = 'active'
      ORDER BY sm.created_at ASC
    `).bind(context.userId))
    return c.json({
      user: {
        id: context.userId,
        displayName: context.displayName,
        mustChangePassword: context.mustChangePassword
      },
      stores: stores.map((row) => ({
        storeId: row.store_id,
        storeCode: row.store_code,
        storeName: row.store_name,
        timezone: row.timezone,
        role: row.role
      })),
      currentStoreId: context.storeId,
      csrfToken
    })
  })

  app.post('/api/v1/auth/logout', auth.loadSession, auth.requireCsrf, async (c) => {
    const context = c.get('auth')!
    const audit = prepareAudit(c.env.DB, {
      context, action: 'logout', entityType: 'account', entityId: context.userId, businessDate: localBusinessDate(context.storeTimezone),
      summary: `退出工作台：${context.displayName}`, reversible: false
    })
    await c.env.DB.batch([
      c.env.DB.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE token_hash = ?').bind(nowIso(), context.sessionTokenHash),
      audit.statement
    ])
    clearSessionCookie(c, c.get('config'))
    return c.body(null, 204)
  })


  app.post('/api/v1/users', auth.loadSession, auth.requirePasswordChanged, auth.requireCsrf, auth.requireRole('admin'), async (c) => {
    const config = c.get('config')
    const context = c.get('auth')!
    const input = createUserSchema.parse(await c.req.json())
    const username = input.username
    const displayName = input.displayName ?? input.username
    const role = input.role
    const existing = await first<{ id: string }>(
      c.env.DB.prepare('SELECT id FROM users WHERE username_key = ? LIMIT 1').bind(usernameKey(username))
    )
    if (existing) throw new ApiProblem(409, 'USERNAME_EXISTS', '该用户名已存在。')
    const passwordHash = await hashPassword(input.password, config.PASSWORD_PEPPER)
    const stamp = nowIso()
    const userId = uuid()
    const audit = prepareAudit(c.env.DB, {
      context, action: 'create-user', entityType: 'account', entityId: userId, businessDate: localBusinessDate(context.storeTimezone),
      summary: `创建账号：${displayName}`, after: { username, displayName, role }, reversible: false
    })
    await c.env.DB.batch([
      c.env.DB.prepare(`
        INSERT INTO users (id, username_key, display_name, password_hash, status, must_change_password, failed_login_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'active', 1, 0, ?, ?)
      `).bind(userId, usernameKey(username), displayName, passwordHash, stamp, stamp),
      c.env.DB.prepare(`
        INSERT INTO store_members (store_id, user_id, role, created_at) VALUES (?, ?, ?, ?)
      `).bind(context.storeId, userId, role, stamp),
      audit.statement
    ])
    return c.json({
      ok: true,
      user: {
        id: userId,
        username,
        displayName,
        role,
        mustChangePassword: true
      }
    }, 201)
  })

  app.post('/api/v1/auth/change-password', auth.loadSession, auth.requireCsrf, async (c) => {
    const config = c.get('config')
    const context = c.get('auth')!
    const body = await c.req.json() as { currentPassword?: string; nextPassword?: string }
    const currentPassword = String(body.currentPassword ?? '')
    const nextPassword = passwordSchema.parse(String(body.nextPassword ?? ''))
    const user = await first<{ password_hash: string }>(
      c.env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(context.userId)
    )
    if (!user || !(await verifyPassword(user.password_hash, currentPassword, config.PASSWORD_PEPPER))) {
      throw new ApiProblem(400, 'INVALID_CURRENT_PASSWORD', '当前密码不正确。')
    }
    const passwordHash = await hashPassword(nextPassword, config.PASSWORD_PEPPER)
    const stamp = nowIso()
    const audit = prepareAudit(c.env.DB, {
      context, action: 'change-password', entityType: 'account', entityId: context.userId, businessDate: localBusinessDate(context.storeTimezone),
      summary: `修改密码：${context.displayName}`, before: { mustChangePassword: context.mustChangePassword }, after: { mustChangePassword: false }, reversible: false
    })
    await c.env.DB.batch([
      c.env.DB.prepare('UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?')
        .bind(passwordHash, stamp, context.userId),
      c.env.DB.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND token_hash <> ? AND revoked_at IS NULL')
        .bind(stamp, context.userId, context.sessionTokenHash),
      audit.statement
    ])
    return c.json({ ok: true })
  })

  return app
}
