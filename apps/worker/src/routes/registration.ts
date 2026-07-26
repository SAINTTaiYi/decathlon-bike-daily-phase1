import { Hono } from 'hono'
import {
  platformAdminSetupSchema,
  registrationCompleteSchema,
  registrationOtpSchema,
  registrationVerifyOtpSchema
} from '@bike-ops/contracts'
import { localBusinessDate, usernameKey } from '@bike-ops/domain'
import type { AppConfig, WorkerEnv } from '../env.js'
import type { AuthContext } from '../auth/types.js'
import { createAuthMiddleware } from '../auth/middleware.js'
import { createSessionSecrets, setSessionCookie } from '../auth/session.js'
import { all, first, nowIso, uuid } from '../db.js'
import { hashPassword, keyedHash, randomToken, safeEqualHex, sha256 } from '../lib/crypto.js'
import { prepareAudit, prepareConditionalAudit } from '../services/business.js'
import { normalizeCorporateEmail, randomOtp, requestClientHash, sendRegistrationOtp } from '../services/registration.js'
import { ApiProblem } from '../services/problems.js'

type Vars = { config: AppConfig; auth: AuthContext | null }
type StoreRow = { id: string; code: string; name: string; timezone: string; city_id: string; city_name: string; region_id: string; region_name: string }

type ChallengeRow = {
  id: string
  email_key: string
  username_key: string
  display_name: string
  store_id: string
  otp_hash: string
  status: 'pending' | 'verified' | 'completed' | 'expired'
  attempts: number
  expires_at: string
  completion_token_hash?: string | null
}

const CHALLENGE_TTL_MS = 10 * 60 * 1000
const COMPLETION_TTL_MS = 10 * 60 * 1000
const RESEND_COOLDOWN_MS = 60 * 1000
const HOUR_MS = 60 * 60 * 1000

function genericRegistrationMessage() {
  return '如邮箱与门店信息有效，验证码会发送到公司邮箱。请检查收件箱后继续。'
}

function registrationOtpResponse(challengeId: string, retryAfterSeconds = 60) {
  return { ok: true, challengeId, message: genericRegistrationMessage(), retryAfterSeconds }
}

function requireRegistrationConfig(config: AppConfig): asserts config is AppConfig & { REGISTRATION_SECRET: string; RESEND_API_KEY: string; RESEND_FROM: string } {
  if (!config.REGISTRATION_SECRET || config.REGISTRATION_SECRET.length < 32 || !config.RESEND_API_KEY || !config.RESEND_FROM) {
    throw new ApiProblem(503, 'REGISTRATION_UNAVAILABLE', '注册邮件服务暂未配置，请联系平台管理员。')
  }
}

async function activeDirectoryStore(db: D1Database, storeId: string): Promise<StoreRow | null> {
  return first<StoreRow>(db.prepare(`
    SELECT st.id, st.code, st.name, st.timezone, ct.id AS city_id, ct.name AS city_name, rg.id AS region_id, rg.name AS region_name
    FROM stores st
    JOIN cities ct ON ct.id = st.city_id AND ct.status = 'active'
    JOIN regions rg ON rg.id = ct.region_id AND rg.status = 'active'
    WHERE st.id = ? AND st.status = 'active'
  `).bind(storeId))
}

function registrationAuditContext(userId: string, displayName: string, store: Pick<StoreRow, 'id' | 'code' | 'name' | 'timezone'>): AuthContext {
  return {
    userId,
    displayName,
    mustChangePassword: false,
    storeId: store.id,
    storeCode: store.code,
    storeName: store.name,
    storeTimezone: store.timezone,
    role: 'operator',
    isPlatformAdmin: false,
    sessionTokenHash: '',
    csrfHash: ''
  }
}

export function registrationRoutes() {
  const app = new Hono<{ Bindings: WorkerEnv; Variables: Vars }>()
  const auth = createAuthMiddleware()

  app.get('/api/v1/registration/directory', async (c) => {
    const rows = await all<StoreRow>(c.env.DB.prepare(`
      SELECT st.id, st.code, st.name, st.timezone, ct.id AS city_id, ct.name AS city_name, rg.id AS region_id, rg.name AS region_name
      FROM stores st
      JOIN cities ct ON ct.id = st.city_id AND ct.status = 'active'
      JOIN regions rg ON rg.id = ct.region_id AND rg.status = 'active'
      WHERE st.status = 'active'
      ORDER BY rg.sort_order, rg.name, ct.sort_order, ct.name, st.code
    `))
    const regionMap = new Map<string, { id: string; name: string; cities: Map<string, { id: string; name: string; stores: Array<{ id: string; code: string; name: string }> }> }>()
    for (const row of rows) {
      if (!regionMap.has(row.region_id)) regionMap.set(row.region_id, { id: row.region_id, name: row.region_name, cities: new Map() })
      const region = regionMap.get(row.region_id)!
      if (!region.cities.has(row.city_id)) region.cities.set(row.city_id, { id: row.city_id, name: row.city_name, stores: [] })
      region.cities.get(row.city_id)!.stores.push({ id: row.id, code: row.code, name: row.name })
    }
    return c.json({ regions: [...regionMap.values()].map((region) => ({ id: region.id, name: region.name, cities: [...region.cities.values()] })) })
  })

  app.post('/api/v1/registration/otp', async (c) => {
    const config = c.get('config')
    requireRegistrationConfig(config)
    const input = registrationOtpSchema.parse(await c.req.json())
    const emailKey = normalizeCorporateEmail(input.email)
    const userKey = usernameKey(input.username)
    const displayName = input.displayName ?? input.username
    const clientHash = await requestClientHash(c.req.raw, config.REGISTRATION_SECRET)
    const now = Date.now()
    const stamp = nowIso()
    const syntheticChallengeId = uuid()

    const recentByEmail = await first<{ id: string; created_at: string; resend_count: number; status: string; expires_at: string }>(c.env.DB.prepare(`
      SELECT id, created_at, resend_count, status, expires_at FROM registration_challenges
      WHERE email_key = ? AND created_at > ?
      ORDER BY created_at DESC LIMIT 1
    `).bind(emailKey, new Date(now - HOUR_MS).toISOString()))
    const recentByClient = clientHash ? await first<{ count: number }>(c.env.DB.prepare(`
      SELECT COUNT(*) AS count FROM registration_challenges WHERE client_hash = ? AND created_at > ?
    `).bind(clientHash, new Date(now - HOUR_MS).toISOString())) : null
    const reusableChallengeId = recentByEmail?.status === 'pending' && Date.parse(recentByEmail.expires_at) > now
      ? recentByEmail.id
      : syntheticChallengeId
    if ((recentByEmail?.resend_count ?? 0) >= 5 || (recentByClient?.count ?? 0) >= 12) {
      return c.json(registrationOtpResponse(reusableChallengeId))
    }
    if (recentByEmail && now - Date.parse(recentByEmail.created_at) < RESEND_COOLDOWN_MS) {
      return c.json(registrationOtpResponse(reusableChallengeId, Math.ceil((RESEND_COOLDOWN_MS - (now - Date.parse(recentByEmail.created_at))) / 1000)))
    }

    const [existingEmail, existingUsername, store] = await Promise.all([
      first<{ id: string }>(c.env.DB.prepare('SELECT id FROM users WHERE email_key = ? LIMIT 1').bind(emailKey)),
      first<{ id: string }>(c.env.DB.prepare('SELECT id FROM users WHERE username_key = ? LIMIT 1').bind(userKey)),
      activeDirectoryStore(c.env.DB, input.storeId)
    ])
    if (existingEmail || existingUsername || !store) return c.json(registrationOtpResponse(syntheticChallengeId))

    const otp = randomOtp()
    const id = uuid()
    const expiresAt = new Date(now + CHALLENGE_TTL_MS).toISOString()
    const otpHash = await keyedHash(`${id}:${otp}`, config.REGISTRATION_SECRET)
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE registration_challenges SET status = 'expired', updated_at = ? WHERE email_key = ? AND status = 'pending'`).bind(stamp, emailKey),
      c.env.DB.prepare(`
        INSERT INTO registration_challenges (id, email_key, username_key, display_name, store_id, otp_hash, client_hash, status, attempts, resend_count, expires_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?, ?)
      `).bind(id, emailKey, userKey, displayName, store.id, otpHash, clientHash, (recentByEmail?.resend_count ?? 0) + 1, expiresAt, stamp, stamp)
    ])
    try {
      await sendRegistrationOtp(config, { email: emailKey, displayName, otp, expiresAt })
    } catch (error) {
      await c.env.DB.prepare(`UPDATE registration_challenges SET status = 'expired', updated_at = ? WHERE id = ?`).bind(nowIso(), id).run()
      console.error('registration email delivery failed', error instanceof Error ? error.message : 'unknown')
      throw new ApiProblem(503, 'REGISTRATION_DELIVERY_FAILED', '验证码暂时无法发送，请稍后重试。')
    }
    return c.json(registrationOtpResponse(id))
  })

  app.post('/api/v1/registration/verify-otp', async (c) => {
    const config = c.get('config')
    requireRegistrationConfig(config)
    const input = registrationVerifyOtpSchema.parse(await c.req.json())
    const challenge = await first<ChallengeRow>(c.env.DB.prepare(`
      SELECT id, email_key, username_key, display_name, store_id, otp_hash, status, attempts, expires_at
      FROM registration_challenges WHERE id = ? LIMIT 1
    `).bind(input.challengeId))
    if (!challenge || challenge.status !== 'pending' || Date.parse(challenge.expires_at) <= Date.now() || challenge.attempts >= 5) {
      if (challenge?.status === 'pending') await c.env.DB.prepare(`UPDATE registration_challenges SET status = 'expired', updated_at = ? WHERE id = ?`).bind(nowIso(), challenge.id).run()
      throw new ApiProblem(400, 'OTP_INVALID_OR_EXPIRED', '验证码无效或已过期，请重新获取。')
    }
    const expected = await keyedHash(`${challenge.id}:${input.otp}`, config.REGISTRATION_SECRET)
    if (!safeEqualHex(expected, challenge.otp_hash)) {
      const stamp = nowIso()
      await c.env.DB.prepare(`
        UPDATE registration_challenges
        SET attempts = attempts + 1,
            status = CASE WHEN attempts + 1 >= 5 THEN 'expired' ELSE 'pending' END,
            updated_at = ?
        WHERE id = ? AND status = 'pending' AND attempts < 5 AND expires_at > ?
      `).bind(stamp, challenge.id, stamp).run()
      throw new ApiProblem(400, 'OTP_INVALID_OR_EXPIRED', '验证码无效或已过期，请重新获取。')
    }
    const completionToken = randomToken()
    const completionHash = await keyedHash(`${challenge.id}:${completionToken}`, config.REGISTRATION_SECRET)
    const updated = await c.env.DB.prepare(`
      UPDATE registration_challenges
      SET status = 'verified', completion_token_hash = ?, expires_at = ?, verified_at = ?, updated_at = ?
      WHERE id = ? AND status = 'pending' AND expires_at > ?
    `).bind(completionHash, new Date(Date.now() + COMPLETION_TTL_MS).toISOString(), nowIso(), nowIso(), challenge.id, nowIso()).run()
    if (updated.meta.changes !== 1) throw new ApiProblem(409, 'OTP_ALREADY_CONSUMED', '验证码已被处理，请重新获取。')
    return c.json({ ok: true, challengeId: challenge.id, completionToken, message: '邮箱已验证，请设置密码完成注册。' })
  })

  app.post('/api/v1/registration/complete', async (c) => {
    const config = c.get('config')
    requireRegistrationConfig(config)
    const input = registrationCompleteSchema.parse(await c.req.json())
    const challenge = await first<ChallengeRow & { completion_token_hash: string | null }>(c.env.DB.prepare(`
      SELECT id, email_key, username_key, display_name, store_id, otp_hash, completion_token_hash, status, attempts, expires_at
      FROM registration_challenges WHERE id = ? LIMIT 1
    `).bind(input.challengeId))
    const providedHash = await keyedHash(`${input.challengeId}:${input.completionToken}`, config.REGISTRATION_SECRET)
    if (!challenge || challenge.status !== 'verified' || Date.parse(challenge.expires_at) <= Date.now() || !safeEqualHex(providedHash, challenge.completion_token_hash ?? undefined)) {
      throw new ApiProblem(400, 'REGISTRATION_GRANT_INVALID', '注册验证已失效，请重新获取验证码。')
    }
    const store = await activeDirectoryStore(c.env.DB, challenge.store_id)
    if (!store) throw new ApiProblem(409, 'STORE_NOT_AVAILABLE', '所选门店已不可注册，请重新选择。')
    const [existingEmail, existingUsername] = await Promise.all([
      first<{ id: string }>(c.env.DB.prepare('SELECT id FROM users WHERE email_key = ? LIMIT 1').bind(challenge.email_key)),
      first<{ id: string }>(c.env.DB.prepare('SELECT id FROM users WHERE username_key = ? LIMIT 1').bind(challenge.username_key))
    ])
    if (existingEmail || existingUsername) throw new ApiProblem(409, 'REGISTRATION_NOT_AVAILABLE', '当前信息无法完成注册，请登录或联系平台管理员。')
    const passwordHash = await hashPassword(input.password, config.PASSWORD_PEPPER)
    // A unique, server-derived 64-hex marker lets every following statement prove it
    // belongs to this exact successful consumption, even under concurrent completion.
    const consumptionMarker = await keyedHash(`${challenge.id}:${randomToken()}`, config.REGISTRATION_SECRET)
    const userId = uuid()
    const membershipId = uuid()
    const secrets = await createSessionSecrets(config)
    const stamp = nowIso()
    const context = registrationAuditContext(userId, challenge.display_name, store)
    const audit = prepareConditionalAudit(c.env.DB, {
      context: { ...context, sessionTokenHash: secrets.tokenHash, csrfHash: secrets.csrfHash }, action: 'self-register', entityType: 'account', entityId: userId,
      businessDate: localBusinessDate(store.timezone), summary: `自助注册账号：${challenge.display_name}`,
      after: { email: challenge.email_key, username: challenge.username_key, storeId: store.id, role: 'operator' }, reversible: false
    }, 'EXISTS (SELECT 1 FROM auth_sessions WHERE token_hash = ? AND user_id = ? AND revoked_at IS NULL)', [secrets.tokenHash, userId])
    // D1 batches run transactionally. Consume the short-lived grant first, then create every
    // account artifact in the same batch so a duplicate/expired grant cannot leave a user behind.
    const result = await c.env.DB.batch([
      c.env.DB.prepare(`
        UPDATE registration_challenges
        SET status = 'completed', completed_at = ?, completion_token_hash = ?, updated_at = ?
        WHERE id = ? AND status = 'verified' AND completion_token_hash = ? AND expires_at > ?
      `).bind(stamp, consumptionMarker, stamp, challenge.id, providedHash, stamp),
      c.env.DB.prepare(`
        INSERT INTO users (id, username_key, display_name, email_key, password_hash, status, must_change_password, failed_login_count, created_at, updated_at)
        SELECT ?, ?, ?, ?, ?, 'active', 0, 0, ?, ?
        WHERE EXISTS (SELECT 1 FROM registration_challenges WHERE id = ? AND status = 'completed' AND completion_token_hash = ? AND completed_at = ?)
      `).bind(userId, challenge.username_key, challenge.display_name, challenge.email_key, passwordHash, stamp, stamp, challenge.id, consumptionMarker, stamp),
      c.env.DB.prepare(`
        INSERT INTO store_members (id, store_id, user_id, role, status, effective_from, created_at)
        SELECT ?, ?, ?, 'operator', 'active', ?, ?
        WHERE EXISTS (SELECT 1 FROM users WHERE id = ?)
      `).bind(membershipId, store.id, userId, stamp, stamp, userId),
      c.env.DB.prepare(`
        INSERT INTO auth_sessions (token_hash, csrf_hash, user_id, expires_at, last_seen_at, created_at, user_agent)
        SELECT ?, ?, ?, ?, ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM store_members WHERE id = ? AND status = 'active')
      `).bind(secrets.tokenHash, secrets.csrfHash, userId, new Date(Date.now() + config.SESSION_TTL_HOURS * 60 * 60 * 1000).toISOString(), stamp, stamp, (c.req.header('user-agent') ?? '').slice(0, 500) || null, membershipId),
      audit.statement
    ])
    if (result[0]?.meta?.changes !== 1 || result[1]?.meta?.changes !== 1 || result[2]?.meta?.changes !== 1 || result[3]?.meta?.changes !== 1) {
      throw new ApiProblem(409, 'REGISTRATION_GRANT_INVALID', '注册验证已失效，请重新获取验证码。')
    }
    setSessionCookie(c, secrets.token, config)
    return c.json({
      user: { id: userId, displayName: challenge.display_name, mustChangePassword: false, isPlatformAdmin: false },
      stores: [{ storeId: store.id, storeCode: store.code, storeName: store.name, timezone: store.timezone, role: 'operator' }],
      currentStoreId: store.id,
      csrfToken: secrets.csrfToken
    }, 201)
  })

  app.post('/api/v1/registration/platform-admin', async (c) => {
    const config = c.get('config')
    if (!config.PLATFORM_ADMIN_SETUP_TOKEN_HASH) throw new ApiProblem(404, 'PLATFORM_SETUP_DISABLED', '平台管理员初始化未开启。')
    const input = platformAdminSetupSchema.parse(await c.req.json())
    if (!safeEqualHex(await sha256(input.token), config.PLATFORM_ADMIN_SETUP_TOKEN_HASH)) throw new ApiProblem(403, 'INVALID_PLATFORM_SETUP_TOKEN', '平台管理员初始化链接无效或已过期。')
    const exists = await first<{ count: number }>(c.env.DB.prepare('SELECT COUNT(*) AS count FROM users WHERE is_platform_admin = 1'))
    if ((exists?.count ?? 0) > 0) throw new ApiProblem(409, 'PLATFORM_ADMIN_ALREADY_EXISTS', '平台管理员已初始化。')
    const store = await activeDirectoryStore(c.env.DB, input.storeId)
    if (!store) throw new ApiProblem(409, 'STORE_NOT_AVAILABLE', '所选门店暂不可用。')
    const profile = await first<{ id: string }>(c.env.DB.prepare('SELECT id FROM users WHERE username_key = ?').bind('chu13'))
    if (profile) throw new ApiProblem(409, 'PLATFORM_PROFILE_EXISTS', 'CHU13 Profile 已存在，无法安全接管。')
    const userId = uuid()
    const stamp = nowIso()
    const passwordHash = await hashPassword(input.password, config.PASSWORD_PEPPER)
    const context: AuthContext = { ...registrationAuditContext(userId, 'CHU13', store), role: 'admin', isPlatformAdmin: true }
    const audit = prepareAudit(c.env.DB, { context, action: 'platform-admin-setup', entityType: 'account', entityId: userId, businessDate: localBusinessDate(store.timezone), summary: '初始化平台管理员：CHU13', after: { username: 'CHU13', platformAdmin: true, storeId: store.id }, reversible: false })
    await c.env.DB.batch([
      c.env.DB.prepare(`INSERT INTO users (id, username_key, display_name, password_hash, status, must_change_password, failed_login_count, is_platform_admin, created_at, updated_at) VALUES (?, 'chu13', 'CHU13', ?, 'active', 0, 0, 1, ?, ?)`)
        .bind(userId, passwordHash, stamp, stamp),
      c.env.DB.prepare(`INSERT INTO store_members (id, store_id, user_id, role, status, effective_from, created_at) VALUES (?, ?, ?, 'admin', 'active', ?, ?)`)
        .bind(uuid(), store.id, userId, stamp, stamp),
      audit.statement
    ])
    return c.json({ ok: true, message: '平台管理员 CHU13 已初始化，请使用 CHU13 登录。' }, 201)
  })

  app.get('/api/v1/registration/status', auth.loadSession, async (c) => c.json({ isPlatformAdmin: c.get('auth')!.isPlatformAdmin }))
  return app
}
