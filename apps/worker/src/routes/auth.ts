import { Hono } from 'hono'
import { loginSchema, passwordSchema } from '@bike-ops/contracts'
import { localBusinessDate, usernameKey } from '@bike-ops/domain'
import type { AppConfig, WorkerEnv } from '../env.js'
import type { AuthContext } from '../auth/types.js'
import { createAuthMiddleware } from '../auth/middleware.js'
import { clearSessionCookie, createSessionSecrets, csrfTokenHash, setSessionCookie, SESSION_COOKIE } from '../auth/session.js'
import { all, first, nowIso } from '../db.js'
import { hashPassword, keyedHash, randomToken, verifyPassword } from '../lib/crypto.js'
import { ApiProblem } from '../services/problems.js'
import { prepareAudit } from '../services/business.js'

type Vars = { config: AppConfig; auth: AuthContext | null }
type MembershipRow = { store_id: string; store_code: string; store_name: string; timezone: string; role: 'operator' | 'manager' | 'admin' }

function mapMemberships(rows: MembershipRow[]) {
  return rows.map((row) => ({
    storeId: row.store_id,
    storeCode: row.store_code,
    storeName: row.store_name,
    timezone: row.timezone,
    role: row.role
  }))
}

// The platform admin is deliberately exempt from account lockout: locking it would let anyone
// deny service to the only account that can administer the platform with five wrong passwords.
// That exemption previously left it as the one account open to unlimited online brute force,
// because failed_login_count was incremented and then never consumed by anything.
//
// Exponential backoff closes that gap without reintroducing the lockout DoS: the account always
// stays reachable, but each successive failure costs the attacker more wall-clock time. Delay is
// applied to the failure response only, so a legitimate admin typing the right password is never
// slowed down.
export const LOGIN_BACKOFF_THRESHOLD = 5
// Capped low on purpose. The edge rate limiting rule caps how fast an attacker can
// retry at all, so the in-Worker delay only has to make online guessing impractical.
// A longer sleep would hold a Worker invocation open — the delay itself would become
// a mild amplification surface — and would strand a legitimate user who mistyped.
export const LOGIN_BACKOFF_MAX_MS = 8_000

export function loginBackoffMs(failedCount: number): number {
  if (failedCount < LOGIN_BACKOFF_THRESHOLD) return 0
  const steps = failedCount - LOGIN_BACKOFF_THRESHOLD
  // 1s, 2s, 4s, 8s, 16s, then held at the 30s ceiling.
  const delay = 1000 * 2 ** Math.min(steps, 10)
  return Math.min(delay, LOGIN_BACKOFF_MAX_MS)
}

export function shouldAlertOnFailedLogin(failedCount: number): boolean {
  // One audit record when the threshold is first crossed, then every tenth attempt, so a
  // sustained attack stays visible without flooding the account module.
  if (failedCount < LOGIN_BACKOFF_THRESHOLD) return false
  return failedCount === LOGIN_BACKOFF_THRESHOLD || (failedCount - LOGIN_BACKOFF_THRESHOLD) % 10 === 0
}

async function delay(ms: number): Promise<void> {
  if (ms <= 0) return
  await new Promise((resolve) => setTimeout(resolve, ms))
}

export function authRoutes() {
  const app = new Hono<{ Bindings: WorkerEnv; Variables: Vars }>()
  const auth = createAuthMiddleware()


  // Directory-governed registration replaces the legacy arbitrary store/admin bootstrap.
  // Keep the legacy URL closed rather than allowing it to bypass CHU13 and email OTP controls.
  app.post('/api/v1/auth/setup', async () => {
    throw new ApiProblem(410, 'PLATFORM_ADMIN_SETUP_REQUIRED', '请使用 CHU13 平台管理员初始化流程。')
  })


  app.post('/api/v1/auth/login', async (c) => {
    const config = c.get('config')
    const input = loginSchema.parse(await c.req.json())
    const genericFailure = { error: 'INVALID_CREDENTIALS', message: '用户名或密码不正确。' }
    const user = await first<{ id: string; display_name: string; password_hash: string; must_change_password: number; failed_login_count: number; locked_until: string | null; is_platform_admin: number }>(c.env.DB.prepare(`
      SELECT id, display_name, password_hash, must_change_password, failed_login_count, locked_until, is_platform_admin
      FROM users WHERE username_key = ? AND status = 'active' LIMIT 1
    `).bind(usernameKey(input.username)))
    const accountLockActive = user?.is_platform_admin !== 1 && Boolean(user?.locked_until && Date.parse(user.locked_until) > Date.now())
    if (!user || accountLockActive) return c.json(genericFailure, 401)
    if (!(await verifyPassword(user.password_hash, input.password, config.PASSWORD_PEPPER))) {
      const stamp = nowIso()
      const lockUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString()
      const nextFailedCount = user.failed_login_count + 1
      await c.env.DB.prepare(`
        UPDATE users
        SET failed_login_count = failed_login_count + 1,
            locked_until = CASE
              WHEN is_platform_admin = 1 THEN NULL
              WHEN failed_login_count + 1 >= 5 THEN ?
              ELSE locked_until
            END,
            updated_at = ?
        WHERE id = ?
      `).bind(lockUntil, stamp, user.id).run()

      // Sustained failures must be visible after the fact, not only felt as latency.
      if (shouldAlertOnFailedLogin(nextFailedCount)) {
        const alertStore = await first<{ store_id: string; store_code: string; store_name: string; timezone: string }>(c.env.DB.prepare(`
          SELECT st.id AS store_id, st.code AS store_code, st.name AS store_name, st.timezone
          FROM store_members sm JOIN stores st ON st.id = sm.store_id
          WHERE sm.user_id = ? AND sm.status = 'active' AND st.status = 'active'
          ORDER BY sm.effective_from ASC, sm.created_at ASC LIMIT 1
        `).bind(user.id))
        if (alertStore) {
          const alertContext: AuthContext = {
            userId: user.id, displayName: user.display_name, mustChangePassword: user.must_change_password === 1,
            storeId: alertStore.store_id, storeCode: alertStore.store_code, storeName: alertStore.store_name,
            storeTimezone: alertStore.timezone, role: 'admin', isPlatformAdmin: user.is_platform_admin === 1,
            sessionTokenHash: '', csrfHash: ''
          }
          const alert = prepareAudit(c.env.DB, {
            context: alertContext, action: 'failed-login-threshold', entityType: 'account', entityId: user.id,
            businessDate: localBusinessDate(alertStore.timezone),
            summary: `连续登录失败 ${nextFailedCount} 次：${user.display_name}`,
            after: { failedLoginCount: nextFailedCount, platformAdmin: user.is_platform_admin === 1 },
            reversible: false, module: 'account'
          })
          // Never let alert bookkeeping turn a failed login into a 500.
          try { await alert.statement.run() } catch { /* the 401 below is what matters */ }
        }
      }

      // Backoff is charged on the failure path only; a correct password is never delayed.
      await delay(loginBackoffMs(nextFailedCount))
      return c.json(genericFailure, 401)
    }
    const memberships = await all<MembershipRow>(c.env.DB.prepare(`
      SELECT st.id AS store_id, st.code AS store_code, st.name AS store_name, st.timezone, sm.role
      FROM store_members sm JOIN stores st ON st.id = sm.store_id
      WHERE sm.user_id = ? AND sm.status = 'active' AND st.status = 'active'
      ORDER BY sm.effective_from ASC, sm.created_at ASC
    `).bind(user.id))
    if (!memberships.length) throw new ApiProblem(403, 'NO_STORE_ACCESS', '账号尚未分配可访问门店。')
    const secrets = await createSessionSecrets(config)
    const expiresAt = new Date(Date.now() + config.SESSION_TTL_HOURS * 60 * 60 * 1000).toISOString()
    const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || ''
    const ipHash = ip ? await keyedHash(ip, config.SESSION_SECRET) : null
    const stamp = nowIso()
    const primaryStore = memberships[0]!
    const context: AuthContext = { userId: user.id, displayName: user.display_name, mustChangePassword: user.must_change_password === 1, storeId: primaryStore.store_id, storeCode: primaryStore.store_code, storeName: primaryStore.store_name, storeTimezone: primaryStore.timezone, role: primaryStore.role, isPlatformAdmin: user.is_platform_admin === 1, sessionTokenHash: secrets.tokenHash, csrfHash: secrets.csrfHash }
    const audit = prepareAudit(c.env.DB, { context, action: 'login', entityType: 'account', entityId: user.id, businessDate: localBusinessDate(primaryStore.timezone), summary: `登录工作台：${user.display_name}`, after: { userId: user.id, storeId: primaryStore.store_id }, reversible: false })
    await c.env.DB.batch([
      c.env.DB.prepare('INSERT INTO auth_sessions (token_hash, csrf_hash, user_id, expires_at, last_seen_at, created_at, ip_hash, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(secrets.tokenHash, secrets.csrfHash, user.id, expiresAt, stamp, stamp, ipHash, (c.req.header('user-agent') ?? '').slice(0, 500) || null),
      c.env.DB.prepare('UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = ?, updated_at = ? WHERE id = ?').bind(stamp, stamp, user.id),
      audit.statement
    ])
    setSessionCookie(c, secrets.token, config)
    return c.json({ user: { id: user.id, displayName: user.display_name, mustChangePassword: user.must_change_password === 1, isPlatformAdmin: user.is_platform_admin === 1 }, stores: mapMemberships(memberships), currentStoreId: primaryStore.store_id, csrfToken: secrets.csrfToken })
  })

  app.get('/api/v1/auth/me', auth.loadSession, async (c) => {
    const config = c.get('config')
    const context = c.get('auth')!
    const csrfToken = randomToken()
    const nextHash = await csrfTokenHash(csrfToken, config)
    await c.env.DB.prepare('UPDATE auth_sessions SET csrf_hash = ?, last_seen_at = ? WHERE token_hash = ?').bind(nextHash, nowIso(), context.sessionTokenHash).run()
    const stores = await all<MembershipRow>(c.env.DB.prepare(`
      SELECT st.id AS store_id, st.code AS store_code, st.name AS store_name, st.timezone, sm.role
      FROM store_members sm JOIN stores st ON st.id = sm.store_id
      WHERE sm.user_id = ? AND sm.status = 'active' AND st.status = 'active'
      ORDER BY sm.effective_from ASC, sm.created_at ASC
    `).bind(context.userId))
    return c.json({ user: { id: context.userId, displayName: context.displayName, mustChangePassword: context.mustChangePassword, isPlatformAdmin: context.isPlatformAdmin }, stores: mapMemberships(stores), currentStoreId: context.storeId, csrfToken })
  })

  app.post('/api/v1/auth/logout', auth.loadSession, auth.requireCsrf, async (c) => {
    const context = c.get('auth')!
    const audit = prepareAudit(c.env.DB, { context, action: 'logout', entityType: 'account', entityId: context.userId, businessDate: localBusinessDate(context.storeTimezone), summary: `退出工作台：${context.displayName}`, reversible: false })
    await c.env.DB.batch([c.env.DB.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE token_hash = ?').bind(nowIso(), context.sessionTokenHash), audit.statement])
    clearSessionCookie(c, c.get('config'))
    return c.body(null, 204)
  })

  app.post('/api/v1/users', auth.loadSession, auth.requirePasswordChanged, auth.requireCsrf, async () => {
    throw new ApiProblem(410, 'SELF_SERVICE_REGISTRATION_REQUIRED', '账号必须通过公司邮箱验证码自助注册。')
  })

  app.post('/api/v1/auth/change-password', auth.loadSession, auth.requireCsrf, async (c) => {
    const config = c.get('config')
    const context = c.get('auth')!
    const body = await c.req.json() as { currentPassword?: string; nextPassword?: string }
    const currentPassword = String(body.currentPassword ?? '')
    const nextPassword = passwordSchema.parse(String(body.nextPassword ?? ''))
    const user = await first<{ password_hash: string }>(c.env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(context.userId))
    if (!user || !(await verifyPassword(user.password_hash, currentPassword, config.PASSWORD_PEPPER))) throw new ApiProblem(400, 'INVALID_CURRENT_PASSWORD', '当前密码不正确。')
    if (currentPassword === nextPassword) throw new ApiProblem(400, 'PASSWORD_REUSE', '新密码不能与当前密码相同。')
    const passwordHash = await hashPassword(nextPassword, config.PASSWORD_PEPPER)
    const stamp = nowIso()
    const audit = prepareAudit(c.env.DB, { context, action: 'change-password', entityType: 'account', entityId: context.userId, businessDate: localBusinessDate(context.storeTimezone), summary: `修改密码：${context.displayName}`, before: { mustChangePassword: context.mustChangePassword }, after: { mustChangePassword: false }, reversible: false })
    await c.env.DB.batch([
      c.env.DB.prepare('UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?').bind(passwordHash, stamp, context.userId),
      c.env.DB.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND token_hash <> ? AND revoked_at IS NULL').bind(stamp, context.userId, context.sessionTokenHash),
      audit.statement
    ])
    return c.json({ ok: true })
  })

  app.get('/api/v1/auth/session-cookie-name', async (c) => c.json({ cookieName: SESSION_COOKIE }))
  return app
}
