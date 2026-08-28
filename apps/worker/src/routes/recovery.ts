import { Hono } from 'hono'
import {
  passwordResetOtpSchema,
  passwordResetVerifyOtpSchema,
  passwordResetCompleteSchema
} from '@bike-ops/contracts'
import { localBusinessDate, usernameKey, redactEmail } from '@bike-ops/domain'
import type { AppConfig, WorkerEnv } from '../env.js'
import type { AuthContext } from '../auth/types.js'
import { first, nowIso, uuid } from '../db.js'
import { hashPassword, keyedHash, randomToken, safeEqualHex } from '../lib/crypto.js'
import { prepareAudit } from '../services/business.js'
import { normalizeCorporateEmail, randomOtp, requestClientHash, sendPasswordResetOtp, registrationReady } from '../services/registration.js'
import { ApiProblem } from '../services/problems.js'
import { requireJsonBody } from '../lib/json.js'

const CHALLENGE_TTL_MS = 10 * 60 * 1000
const COMPLETION_TTL_MS = 10 * 60 * 1000
const RESEND_COOLDOWN_MS = 60 * 1000
const HOUR_MS = 60 * 60 * 1000
const MAX_RESEND_PER_EMAIL = 5
const MAX_PER_CLIENT_HOUR = 12
const MAX_ATTEMPTS = 5

type ResetChallengeRow = {
  id: string
  user_id: string
  email_key: string
  otp_hash: string
  completion_token_hash: string | null
  client_hash: string | null
  status: string
  attempts: number
  expires_at: string
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function requireRecoveryConfig(config: AppConfig): asserts config is AppConfig & { REGISTRATION_SECRET: string } {
  if (!registrationReady(config)) {
    throw new ApiProblem(503, 'PASSWORD_RESET_UNAVAILABLE', '自助改密暂未开放，请联系门店管理员重置密码。')
  }
}

// 单一出口：无论账号/邮箱是否存在、是否匹配、是否被锁定、是否触发限流，
// 响应体在字段与措辞上完全一致，调用方无法据此判断账号状态。
function resetOtpResponse(challengeId: string, retryAfterSeconds = 60) {
  return {
    ok: true as const,
    challengeId,
    message: '如用户名与邮箱匹配，验证码会发送到该公司邮箱。请检查收件箱后继续。',
    retryAfterSeconds
  }
}

export function recoveryRoutes() {
  const app = new Hono<{ Bindings: WorkerEnv; Variables: { config: AppConfig; auth?: AuthContext } }>()

  app.post('/api/v1/recovery/otp', requireJsonBody, async (c) => {
    const config = c.get('config')
    requireRecoveryConfig(config)
    const input = passwordResetOtpSchema.parse(await c.req.json())
    const emailKey = normalizeCorporateEmail(input.email)
    const userKey = usernameKey(input.username)
    const clientHash = await requestClientHash(c.req.raw, config.REGISTRATION_SECRET)
    const now = Date.now()
    const stamp = nowIso()
    const windowStart = new Date(now - HOUR_MS).toISOString()
    // 账号无效时也要返回一个形状合法的 challengeId，否则响应可区分。
    const syntheticChallengeId = uuid()

    const recentByClient = clientHash ? await first<{ count: number }>(c.env.DB.prepare(`
      SELECT COUNT(*) AS count FROM password_reset_challenges WHERE client_hash = ? AND created_at > ?
    `).bind(clientHash, windowStart)) : null
    // 发起端整体限流先行：即便逐个账号试探，也无法靠换用户名放大发信量。
    if ((recentByClient?.count ?? 0) >= MAX_PER_CLIENT_HOUR) {
      await delay(300 + Math.floor(Math.random() * 400))
      return c.json(resetOtpResponse(syntheticChallengeId))
    }

    // 用户名与邮箱必须同时命中同一账号。仅凭用户名不得发信，
    // 否则任何人都能用他人用户名向其邮箱投递验证码。
    const user = await first<{ id: string; display_name: string; status: string; email_key: string | null }>(c.env.DB.prepare(`
      SELECT id, display_name, status, email_key FROM users WHERE username_key = ? LIMIT 1
    `).bind(userKey))
    const eligible = Boolean(
      user
      && user.status === 'active'
      && user.email_key
      && safeEqualHex(
        await keyedHash(user.email_key, config.REGISTRATION_SECRET),
        await keyedHash(emailKey, config.REGISTRATION_SECRET)
      )
    )
    if (!user || !eligible) {
      // 时序对齐：让不可发信分支与发信分支落在同一延迟带内，
      // 避免"秒回=账号不存在"这类侧信道。
      await delay(300 + Math.floor(Math.random() * 400))
      return c.json(resetOtpResponse(syntheticChallengeId))
    }

    const recentByEmail = await first<{ id: string; created_at: string; resend_count: number }>(c.env.DB.prepare(`
      SELECT id, created_at, resend_count FROM password_reset_challenges
      WHERE email_key = ? AND created_at > ?
      ORDER BY created_at DESC LIMIT 1
    `).bind(emailKey, windowStart))
    if ((recentByEmail?.resend_count ?? 0) >= MAX_RESEND_PER_EMAIL) {
      return c.json(resetOtpResponse(recentByEmail?.id ?? syntheticChallengeId))
    }
    if (recentByEmail && now - Date.parse(recentByEmail.created_at) < RESEND_COOLDOWN_MS) {
      return c.json(resetOtpResponse(recentByEmail.id, Math.ceil((RESEND_COOLDOWN_MS - (now - Date.parse(recentByEmail.created_at))) / 1000)))
    }

    const otp = randomOtp()
    const id = uuid()
    const expiresAt = new Date(now + CHALLENGE_TTL_MS).toISOString()
    const otpHash = await keyedHash(`${id}:${otp}`, config.REGISTRATION_SECRET)
    await c.env.DB.batch([
      // 同一邮箱旧挑战立即作废：任一时刻至多一个可用验证码。
      c.env.DB.prepare(`UPDATE password_reset_challenges SET status = 'expired', updated_at = ? WHERE email_key = ? AND status IN ('pending', 'verified')`).bind(stamp, emailKey),
      c.env.DB.prepare(`
        INSERT INTO password_reset_challenges (id, user_id, email_key, otp_hash, client_hash, status, attempts, resend_count, expires_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?, ?)
      `).bind(id, user.id, emailKey, otpHash, clientHash, (recentByEmail?.resend_count ?? 0) + 1, expiresAt, stamp, stamp)
    ])
    try {
      await sendPasswordResetOtp(config, { email: emailKey, displayName: user.display_name, otp, expiresAt })
    } catch (error) {
      await c.env.DB.prepare(`UPDATE password_reset_challenges SET status = 'expired', updated_at = ? WHERE id = ?`).bind(nowIso(), id).run()
      // 只记录失败事实，不写入邮箱、验证码或密码。
      console.error('password reset email delivery failed', error instanceof Error ? error.message : 'unknown')
      throw new ApiProblem(503, 'PASSWORD_RESET_DELIVERY_FAILED', '验证码暂时无法发送，请稍后重试。')
    }
    return c.json(resetOtpResponse(id))
  })

  app.post('/api/v1/recovery/verify-otp', requireJsonBody, async (c) => {
    const config = c.get('config')
    requireRecoveryConfig(config)
    const input = passwordResetVerifyOtpSchema.parse(await c.req.json())
    const challenge = await first<ResetChallengeRow>(c.env.DB.prepare(`
      SELECT id, user_id, email_key, otp_hash, completion_token_hash, client_hash, status, attempts, expires_at
      FROM password_reset_challenges WHERE id = ? LIMIT 1
    `).bind(input.challengeId))
    // 不存在的 challengeId 与错误验证码共用同一错误，避免枚举有效挑战。
    if (!challenge) {
      throw new ApiProblem(400, 'OTP_INVALID_OR_EXPIRED', '验证码无效或已过期，请重新获取。')
    }
    if (challenge.attempts >= MAX_ATTEMPTS) {
      throw new ApiProblem(429, 'OTP_LOCKED', '验证码错误次数过多，请重新获取验证码。')
    }
    if (challenge.status !== 'pending' || Date.parse(challenge.expires_at) <= Date.now()) {
      if (challenge.status === 'pending') {
        await c.env.DB.prepare(`UPDATE password_reset_challenges SET status = 'expired', updated_at = ? WHERE id = ?`).bind(nowIso(), challenge.id).run()
      }
      throw new ApiProblem(400, 'OTP_INVALID_OR_EXPIRED', '验证码无效或已过期，请重新获取。')
    }
    const expected = await keyedHash(`${challenge.id}:${input.otp}`, config.REGISTRATION_SECRET)
    if (!safeEqualHex(expected, challenge.otp_hash)) {
      const stamp = nowIso()
      const updated = await c.env.DB.prepare(`
        UPDATE password_reset_challenges
        SET attempts = attempts + 1,
            status = CASE WHEN attempts + 1 >= ${MAX_ATTEMPTS} THEN 'expired' ELSE 'pending' END,
            updated_at = ?
        WHERE id = ? AND status = 'pending' AND attempts < ${MAX_ATTEMPTS} AND expires_at > ?
      `).bind(stamp, challenge.id, stamp).run()
      if (updated.meta.changes === 1 && challenge.attempts + 1 >= MAX_ATTEMPTS) {
        throw new ApiProblem(429, 'OTP_LOCKED', '验证码错误次数过多，请重新获取验证码。')
      }
      throw new ApiProblem(400, 'OTP_INVALID_OR_EXPIRED', '验证码无效或已过期，请重新获取。')
    }
    const completionToken = randomToken()
    // 完成令牌同时绑定 challenge 与发起端：验证码若在传输中被截获，
    // 换出口 IP 也无法兑现（比注册链路更严一档，改密比建号更敏感）。
    const completionHash = await keyedHash(`${challenge.id}:${challenge.client_hash ?? 'no-client'}:${completionToken}`, config.REGISTRATION_SECRET)
    const stamp = nowIso()
    const updated = await c.env.DB.prepare(`
      UPDATE password_reset_challenges
      SET status = 'verified', completion_token_hash = ?, expires_at = ?, verified_at = ?, updated_at = ?
      WHERE id = ? AND status = 'pending' AND expires_at > ?
    `).bind(completionHash, new Date(Date.now() + COMPLETION_TTL_MS).toISOString(), stamp, stamp, challenge.id, stamp).run()
    if (updated.meta.changes !== 1) throw new ApiProblem(409, 'OTP_ALREADY_CONSUMED', '验证码已被处理，请重新获取。')
    return c.json({ ok: true, challengeId: challenge.id, completionToken, message: '邮箱已验证，请设置新密码。' })
  })

  app.post('/api/v1/recovery/complete', requireJsonBody, async (c) => {
    const config = c.get('config')
    requireRecoveryConfig(config)
    const input = passwordResetCompleteSchema.parse(await c.req.json())
    const challenge = await first<ResetChallengeRow>(c.env.DB.prepare(`
      SELECT id, user_id, email_key, otp_hash, completion_token_hash, client_hash, status, attempts, expires_at
      FROM password_reset_challenges WHERE id = ? LIMIT 1
    `).bind(input.challengeId))
    const clientHash = await requestClientHash(c.req.raw, config.REGISTRATION_SECRET)
    const providedHash = await keyedHash(`${input.challengeId}:${clientHash ?? 'no-client'}:${input.completionToken}`, config.REGISTRATION_SECRET)
    if (
      !challenge
      || challenge.status !== 'verified'
      || Date.parse(challenge.expires_at) <= Date.now()
      || !safeEqualHex(providedHash, challenge.completion_token_hash ?? undefined)
    ) {
      throw new ApiProblem(400, 'PASSWORD_RESET_GRANT_INVALID', '改密验证已失效，请重新获取验证码。')
    }
    const user = await first<{ id: string; display_name: string; username_key: string; status: string }>(c.env.DB.prepare(`
      SELECT id, display_name, username_key, status FROM users WHERE id = ? LIMIT 1
    `).bind(challenge.user_id))
    if (!user || user.status !== 'active') {
      throw new ApiProblem(409, 'PASSWORD_RESET_NOT_AVAILABLE', '账号当前无法自助改密，请联系门店管理员。')
    }
    const passwordHash = await hashPassword(input.password, config.PASSWORD_PEPPER)
    const consumptionMarker = await keyedHash(`${challenge.id}:${randomToken()}`, config.REGISTRATION_SECRET)
    const stamp = nowIso()
    const store = await first<{ id: string; code: string; name: string; timezone: string; role: 'operator' | 'manager' | 'admin' }>(c.env.DB.prepare(`
      SELECT s.id, s.code, s.name, s.timezone, m.role FROM store_members m JOIN stores s ON s.id = m.store_id
      WHERE m.user_id = ? AND m.status = 'active' ORDER BY m.created_at LIMIT 1
    `).bind(user.id))
    const timezone = store?.timezone ?? 'Asia/Shanghai'
    const audit = prepareAudit(c.env.DB, {
      // 自助改密没有登录态，审计主体记为账号本人；无门店归属时留空串，
      // 与既有 registrationAuditContext 的处理方式一致。
      context: {
        userId: user.id,
        displayName: user.display_name,
        mustChangePassword: false,
        storeId: store?.id ?? '',
        storeCode: store?.code ?? '',
        storeName: store?.name ?? '',
        storeTimezone: timezone,
        role: store?.role ?? 'operator',
        isPlatformAdmin: false,
        sessionTokenHash: '',
        csrfHash: ''
      },
      action: 'password-reset', entityType: 'account', entityId: user.id,
      businessDate: localBusinessDate(timezone),
      summary: `自助改密：${user.display_name}`,
      // 审计只保留脱敏邮箱，绝不写入验证码、令牌或密码。
      after: { email: redactEmail(challenge.email_key), username: user.username_key, method: 'email-otp' },
      reversible: false
    })
    // D1 batch 事务：先消费一次性凭据，再改密。凭据重放或过期时
    // 后续语句的 EXISTS 断言不成立，密码不会被改写。
    const result = await c.env.DB.batch([
      c.env.DB.prepare(`
        UPDATE password_reset_challenges
        SET status = 'completed', completed_at = ?, completion_token_hash = ?, updated_at = ?
        WHERE id = ? AND status = 'verified' AND completion_token_hash = ? AND expires_at > ?
      `).bind(stamp, consumptionMarker, stamp, challenge.id, providedHash, stamp),
      c.env.DB.prepare(`
        UPDATE users
        SET password_hash = ?, must_change_password = 0, failed_login_count = 0, locked_until = NULL, updated_at = ?
        WHERE id = ? AND status = 'active'
          AND EXISTS (SELECT 1 FROM password_reset_challenges WHERE id = ? AND status = 'completed' AND completion_token_hash = ? AND completed_at = ?)
      `).bind(passwordHash, stamp, user.id, challenge.id, consumptionMarker, stamp),
      // 改密后撤销该用户全部会话（含发起端），任何既有登录态立即失效。
      c.env.DB.prepare(`
        UPDATE auth_sessions SET revoked_at = ?
        WHERE user_id = ? AND revoked_at IS NULL
          AND EXISTS (SELECT 1 FROM users WHERE id = ? AND updated_at = ? AND password_hash = ?)
      `).bind(stamp, user.id, user.id, stamp, passwordHash),
      // 同一账号其余未完成挑战一并作废，避免并行链路留下可用凭据。
      c.env.DB.prepare(`
        UPDATE password_reset_challenges SET status = 'expired', updated_at = ?
        WHERE user_id = ? AND id <> ? AND status IN ('pending', 'verified')
      `).bind(stamp, user.id, challenge.id),
      audit.statement
    ])
    if ((result[1]?.meta.changes ?? 0) !== 1) {
      throw new ApiProblem(409, 'PASSWORD_RESET_CONFLICT', '改密未生效，请重新获取验证码。')
    }
    return c.json({ ok: true, message: '密码已更新，请用新密码登录。' })
  })

  return app
}
