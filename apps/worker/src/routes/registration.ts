import { Hono } from 'hono'
import {
  platformAdminSetupSchema,
  registrationCompleteSchema,
  registrationOtpSchema,
  registrationVerifyOtpSchema
} from '@bike-ops/contracts'
import { localBusinessDate, usernameKey, redactEmail } from '@bike-ops/domain'
import type { AppConfig, WorkerEnv } from '../env.js'
import type { AuthContext } from '../auth/types.js'
import { createAuthMiddleware } from '../auth/middleware.js'
import { createSessionSecrets, setSessionCookie } from '../auth/session.js'
import { first, nowIso, uuid } from '../db.js'
import { hashPassword, keyedHash, randomToken, safeEqualHex, sha256 } from '../lib/crypto.js'
import { prepareAudit, prepareConditionalAudit } from '../services/business.js'
import { normalizeCorporateEmail, randomOtp, requestClientHash, sendRegistrationOtp } from '../services/registration.js'
import { ApiProblem } from '../services/problems.js'
import { requireJsonBody } from '../lib/json.js'

type Vars = { config: AppConfig; auth: AuthContext | null }
type StoreRow = { id: string; code: string; name: string; timezone: string; status: 'active' | 'disabled'; self_registration_pending: number }

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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

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

async function registrationStore(db: D1Database, storeId: string): Promise<StoreRow | null> {
  return first<StoreRow>(db.prepare(`
    SELECT id, code, name, timezone, status, self_registration_pending
    FROM stores
    WHERE id = ?
  `).bind(storeId))
}

async function findStoreByCode(db: D1Database, code: string): Promise<StoreRow | null> {
  return first<StoreRow>(db.prepare(`
    SELECT id, code, name, timezone, status, self_registration_pending
    FROM stores
    WHERE code = ? COLLATE NOCASE
    LIMIT 1
  `).bind(code))
}

async function hasActiveMembership(db: D1Database, storeId: string): Promise<boolean> {
  return Boolean(await first<{ id: string }>(db.prepare(`SELECT id FROM store_members WHERE store_id = ? AND status = 'active' LIMIT 1`).bind(storeId)))
}

async function releaseAbandonedRegistrationStore(db: D1Database, store: StoreRow, stamp: string): Promise<boolean> {
  if (store.status !== 'disabled' || store.self_registration_pending !== 1 || await hasActiveMembership(db, store.id)) return false
  const activeChallenge = await first<{ id: string }>(db.prepare(`
    SELECT id FROM registration_challenges
    WHERE store_id = ? AND status IN ('pending', 'verified') AND expires_at > ?
    LIMIT 1
  `).bind(store.id, stamp))
  if (activeChallenge) return false
  const results = await db.batch([
    db.prepare(`DELETE FROM registration_challenges WHERE store_id = ? AND status <> 'completed'`).bind(store.id),
    db.prepare(`
      DELETE FROM stores
      WHERE id = ? AND status = 'disabled' AND self_registration_pending = 1
        AND NOT EXISTS (SELECT 1 FROM store_members WHERE store_id = stores.id AND status = 'active')
        AND NOT EXISTS (SELECT 1 FROM registration_challenges WHERE store_id = stores.id)
    `).bind(store.id)
  ])
  return results[1]?.meta?.changes === 1
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
    role: 'admin',
    isPlatformAdmin: false,
    sessionTokenHash: '',
    csrfHash: ''
  }
}

export function registrationRoutes() {
  const app = new Hono<{ Bindings: WorkerEnv; Variables: Vars }>()
  const auth = createAuthMiddleware()

  app.post('/api/v1/registration/otp', requireJsonBody, async (c) => {
    const config = c.get('config')
    requireRegistrationConfig(config)
    const input = registrationOtpSchema.parse(await c.req.json())
    const emailKey = normalizeCorporateEmail(input.email)
    const userKey = usernameKey(input.username)
    const displayName = input.displayName ?? input.username
    const storeCode = input.storeCode.toLocaleUpperCase('en-US')
    const clientHash = await requestClientHash(c.req.raw, config.REGISTRATION_SECRET)
    const now = Date.now()
    const stamp = nowIso()
    const syntheticChallengeId = uuid()

    let existingStore = await findStoreByCode(c.env.DB, storeCode)
    if (existingStore && await releaseAbandonedRegistrationStore(c.env.DB, existingStore, stamp)) existingStore = null

    const recentByEmail = await first<{ id: string; created_at: string; resend_count: number; status: string; expires_at: string; store_id: string; username_key: string }>(c.env.DB.prepare(`
      SELECT id, created_at, resend_count, status, expires_at, store_id, username_key
      FROM registration_challenges
      WHERE email_key = ? AND created_at > ?
      ORDER BY created_at DESC LIMIT 1
    `).bind(emailKey, new Date(now - HOUR_MS).toISOString()))
    const recentByClient = clientHash ? await first<{ count: number }>(c.env.DB.prepare(`
      SELECT COUNT(*) AS count FROM registration_challenges WHERE client_hash = ? AND created_at > ?
    `).bind(clientHash, new Date(now - HOUR_MS).toISOString())) : null
    const ownsReservation = Boolean(
      existingStore
      && existingStore.status === 'disabled'
      && existingStore.self_registration_pending === 1
      && existingStore.name === input.storeName
      && recentByEmail?.store_id === existingStore.id
      && recentByEmail.username_key === userKey
      && recentByEmail.status === 'pending'
      && Date.parse(recentByEmail.expires_at) > now
    )
    if (existingStore && !ownsReservation) {
      throw new ApiProblem(409, 'STORE_ALREADY_EXISTS', '门店编号已存在，无法创建门店。')
    }

    const reusableChallengeId = ownsReservation ? recentByEmail!.id : syntheticChallengeId
    if ((recentByEmail?.resend_count ?? 0) >= 5 || (recentByClient?.count ?? 0) >= 12) {
      return c.json(registrationOtpResponse(reusableChallengeId))
    }
    if (ownsReservation && recentByEmail && now - Date.parse(recentByEmail.created_at) < RESEND_COOLDOWN_MS) {
      return c.json(registrationOtpResponse(reusableChallengeId, Math.ceil((RESEND_COOLDOWN_MS - (now - Date.parse(recentByEmail.created_at))) / 1000)))
    }

    const [existingEmail, existingUsername] = await Promise.all([
      first<{ id: string }>(c.env.DB.prepare('SELECT id FROM users WHERE email_key = ? LIMIT 1').bind(emailKey)),
      first<{ id: string }>(c.env.DB.prepare('SELECT id FROM users WHERE username_key = ? LIMIT 1').bind(userKey))
    ])
    if (existingEmail || existingUsername) {
      // Timing equalization: keep the anti-enumeration branch within the same
      // latency band as the store-reservation + email-send path.
      await delay(300 + Math.floor(Math.random() * 400))
      return c.json(registrationOtpResponse(syntheticChallengeId))
    }

    let store = existingStore
    if (!store) {
      const storeId = uuid()
      try {
        await c.env.DB.prepare(`
          INSERT INTO stores (id, code, name, timezone, status, self_registration_pending, created_at, updated_at)
          VALUES (?, ?, ?, 'Asia/Shanghai', 'disabled', 1, ?, ?)
        `).bind(storeId, storeCode, input.storeName, stamp, stamp).run()
        store = { id: storeId, code: storeCode, name: input.storeName, timezone: 'Asia/Shanghai', status: 'disabled', self_registration_pending: 1 }
      } catch (error) {
        if (await findStoreByCode(c.env.DB, storeCode)) {
          throw new ApiProblem(409, 'STORE_ALREADY_EXISTS', '门店编号已存在，无法创建门店。')
        }
        throw error
      }
    }

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
      await c.env.DB.batch([
        c.env.DB.prepare(`DELETE FROM registration_challenges WHERE store_id = ? AND status <> 'completed'`).bind(store.id),
        c.env.DB.prepare(`
          DELETE FROM stores
          WHERE id = ? AND status = 'disabled' AND self_registration_pending = 1
            AND NOT EXISTS (SELECT 1 FROM store_members WHERE store_id = stores.id AND status = 'active')
            AND NOT EXISTS (SELECT 1 FROM registration_challenges WHERE store_id = stores.id)
        `).bind(store.id)
      ])
      console.error('registration email delivery failed', error instanceof Error ? error.message : 'unknown')
      throw new ApiProblem(503, 'REGISTRATION_DELIVERY_FAILED', '验证码暂时无法发送，请稍后重试。')
    }
    return c.json(registrationOtpResponse(id))
  })

  app.post('/api/v1/registration/verify-otp', requireJsonBody, async (c) => {
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

  app.post('/api/v1/registration/complete', requireJsonBody, async (c) => {
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
    const store = await registrationStore(c.env.DB, challenge.store_id)
    if (!store || store.status !== 'disabled' || store.self_registration_pending !== 1 || await hasActiveMembership(c.env.DB, store.id)) throw new ApiProblem(409, 'STORE_NOT_AVAILABLE', '门店已不可注册，请重新开始。')
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
      after: { email: redactEmail(challenge.email_key), username: challenge.username_key, storeId: store.id, role: 'admin' }, reversible: false
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
        UPDATE stores
        SET status = 'active', self_registration_pending = 0, pending_review = 1, updated_at = ?
        WHERE id = ? AND status = 'disabled' AND self_registration_pending = 1
          AND NOT EXISTS (SELECT 1 FROM store_members WHERE store_id = stores.id AND status = 'active')
      `).bind(stamp, store.id),
      c.env.DB.prepare(`
        INSERT INTO store_members (id, store_id, user_id, role, status, effective_from, created_at)
        SELECT ?, ?, ?, 'admin', 'active', ?, ?
        WHERE EXISTS (SELECT 1 FROM users WHERE id = ?)
          AND EXISTS (SELECT 1 FROM stores WHERE id = ? AND status = 'active' AND self_registration_pending = 0)
          AND NOT EXISTS (SELECT 1 FROM store_members WHERE store_id = ? AND status = 'active')
      `).bind(membershipId, store.id, userId, stamp, stamp, userId, store.id, store.id),
      c.env.DB.prepare(`
        INSERT INTO auth_sessions (token_hash, csrf_hash, user_id, expires_at, last_seen_at, created_at, user_agent)
        SELECT ?, ?, ?, ?, ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM store_members WHERE id = ? AND status = 'active')
      `).bind(secrets.tokenHash, secrets.csrfHash, userId, new Date(Date.now() + config.SESSION_TTL_HOURS * 60 * 60 * 1000).toISOString(), stamp, stamp, (c.req.header('user-agent') ?? '').slice(0, 500) || null, membershipId),
      audit.statement
    ])
    if (result[0]?.meta?.changes !== 1 || result[1]?.meta?.changes !== 1 || result[2]?.meta?.changes !== 1 || result[3]?.meta?.changes !== 1 || result[4]?.meta?.changes !== 1 || result[5]?.meta?.changes !== 1) {
      throw new ApiProblem(409, 'REGISTRATION_GRANT_INVALID', '注册验证已失效，请重新获取验证码。')
    }
    const assignedRole = 'admin' as const
    setSessionCookie(c, secrets.token, config)
    return c.json({
      user: { id: userId, displayName: challenge.display_name, mustChangePassword: false, isPlatformAdmin: false },
      stores: [{ storeId: store.id, storeCode: store.code, storeName: store.name, timezone: store.timezone, role: assignedRole }],
      currentStoreId: store.id,
      csrfToken: secrets.csrfToken
    }, 201)
  })

  app.post('/api/v1/registration/platform-admin', requireJsonBody, async (c) => {
    const config = c.get('config')
    if (!config.PLATFORM_ADMIN_SETUP_TOKEN_HASH) throw new ApiProblem(404, 'PLATFORM_SETUP_DISABLED', '平台管理员初始化未开启。')
    const input = platformAdminSetupSchema.parse(await c.req.json())
    if (!safeEqualHex(await sha256(input.token), config.PLATFORM_ADMIN_SETUP_TOKEN_HASH)) throw new ApiProblem(403, 'INVALID_PLATFORM_SETUP_TOKEN', '平台管理员初始化链接无效或已过期。')
    const exists = await first<{ count: number }>(c.env.DB.prepare('SELECT COUNT(*) AS count FROM users WHERE is_platform_admin = 1'))
    if ((exists?.count ?? 0) > 0) throw new ApiProblem(409, 'PLATFORM_ADMIN_ALREADY_EXISTS', '平台管理员已初始化。')
    const store = await registrationStore(c.env.DB, input.storeId)
    if (!store || store.status !== 'active') throw new ApiProblem(409, 'STORE_NOT_AVAILABLE', '所选门店暂不可用。')
    const profile = await first<{ id: string }>(c.env.DB.prepare('SELECT id FROM users WHERE username_key = ?').bind('chu13'))
    if (profile) throw new ApiProblem(409, 'PLATFORM_PROFILE_EXISTS', 'CHU13 Profile 已存在，无法安全接管。')
    const userId = uuid()
    const stamp = nowIso()
    const passwordHash = await hashPassword(input.password, config.PASSWORD_PEPPER)
    const context: AuthContext = { ...registrationAuditContext(userId, 'CHU13', store), role: 'admin', isPlatformAdmin: true }
    const audit = prepareAudit(c.env.DB, { context, action: 'platform-admin-setup', entityType: 'account', entityId: userId, businessDate: localBusinessDate(store.timezone), summary: '初始化平台管理员：CHU13', after: { username: 'CHU13', platformAdmin: true, storeId: store.id }, reversible: false })
    try {
      await c.env.DB.batch([
      c.env.DB.prepare(`INSERT INTO users (id, username_key, display_name, password_hash, status, must_change_password, failed_login_count, is_platform_admin, created_at, updated_at) VALUES (?, 'chu13', 'CHU13', ?, 'active', 0, 0, 1, ?, ?)`)
        .bind(userId, passwordHash, stamp, stamp),
      c.env.DB.prepare(`INSERT INTO store_members (id, store_id, user_id, role, status, effective_from, created_at) VALUES (?, ?, ?, 'admin', 'active', ?, ?)`)
        .bind(uuid(), store.id, userId, stamp, stamp),
      audit.statement
      ])
      return c.json({ ok: true, message: '平台管理员 CHU13 已初始化，请使用 CHU13 登录。' }, 201)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (/unique|constraint/iu.test(message)) throw new ApiProblem(409, 'PLATFORM_ADMIN_ALREADY_EXISTS', '平台管理员已初始化。')
      throw error
    }
  })

  app.get('/api/v1/registration/status', auth.loadSession, async (c) => c.json({ isPlatformAdmin: c.get('auth')!.isPlatformAdmin }))
  return app
}
