import { Hono } from 'hono'
import { emailBindingOtpSchema, emailBindingVerifySchema } from '@bike-ops/contracts'
import { localBusinessDate, redactEmail } from '@bike-ops/domain'
import type { AppConfig, WorkerEnv } from '../env.js'
import type { AuthContext } from '../auth/types.js'
import { createAuthMiddleware } from '../auth/middleware.js'
import { first, nowIso, uuid } from '../db.js'
import { hashPassword, keyedHash, safeEqualHex } from '../lib/crypto.js'
import { normalizeCorporateEmail, randomOtp, requestClientHash, sendEmailBindingOtp } from '../services/registration.js'
import { ApiProblem } from '../services/problems.js'
import { prepareAudit } from '../services/business.js'
import { requireJsonBody } from '../lib/json.js'

type Vars = { config: AppConfig; auth: AuthContext | null }

type BindingChallengeRow = {
  id: string
  user_id: string
  email_key: string
  otp_hash: string
  status: string
  attempts: number
  resend_count: number
  expires_at: string
}

const CHALLENGE_TTL_MS = 10 * 60 * 1000
const RESEND_COOLDOWN_MS = 60 * 1000
const HOUR_MS = 60 * 60 * 1000
const MAX_ATTEMPTS = 5
const MAX_RESEND_PER_HOUR = 5
// 跨挑战预算（与自助改密同款）：换新验证码不得重置总猜测上限。
const MAX_VERIFY_FAILURES_PER_HOUR = 10

function requireBindingConfig(config: AppConfig): asserts config is AppConfig & { REGISTRATION_SECRET: string; RESEND_API_KEY: string; RESEND_FROM: string } {
  if (!config.REGISTRATION_SECRET || config.REGISTRATION_SECRET.length < 32 || !config.RESEND_API_KEY || !config.RESEND_FROM) {
    throw new ApiProblem(503, 'EMAIL_BINDING_UNAVAILABLE', '邮箱绑定服务暂未配置，请联系平台管理员。')
  }
}

async function verifyFailuresLastHour(db: D1Database, userId: string): Promise<number> {
  const row = await first<{ failures: number }>(db.prepare(`
    SELECT COALESCE(SUM(attempts), 0) AS failures
    FROM email_binding_challenges
    WHERE user_id = ? AND created_at > ?
  `).bind(userId, new Date(Date.now() - HOUR_MS).toISOString()))
  return row?.failures ?? 0
}

export function accountRoutes() {
  const app = new Hono<{ Bindings: WorkerEnv; Variables: Vars }>()
  const auth = createAuthMiddleware()

  // 登录态下的强制邮箱绑定引导：只有未完成绑定（且未豁免）的账号会走到这里，
  // 因此两个端点都不挂 requirePasswordChanged——它们本身就是解锁通道。
  app.post('/api/v1/account/binding/otp', auth.loadSession, auth.requireCsrf, requireJsonBody, async (c) => {
    const config = c.get('config')
    requireBindingConfig(config)
    const context = c.get('auth')!
    const input = emailBindingOtpSchema.parse(await c.req.json())
    const emailKey = normalizeCorporateEmail(input.email)
    const clientHash = await requestClientHash(c.req.raw, config.REGISTRATION_SECRET)
    const now = Date.now()
    const stamp = nowIso()
    const windowStart = new Date(now - HOUR_MS).toISOString()

    // 邮箱必须未被其它账号占用：绑定目标是自己的公司邮箱，
    // 被占用时明确告知，避免验证码发往他人已占用的邮箱后产生困惑。
    const occupied = await first<{ id: string }>(c.env.DB.prepare(`
      SELECT id FROM users WHERE email_key = ? AND id <> ? LIMIT 1
    `).bind(emailKey, context.userId))
    if (occupied) {
      throw new ApiProblem(409, 'EMAIL_ALREADY_BOUND', '该邮箱已绑定其它账号，请确认邮箱地址后重试。')
    }

    const recent = await first<{ id: string; created_at: string; resend_count: number }>(c.env.DB.prepare(`
      SELECT id, created_at, resend_count FROM email_binding_challenges
      WHERE user_id = ? AND created_at > ?
      ORDER BY created_at DESC LIMIT 1
    `).bind(context.userId, windowStart))
    if ((recent?.resend_count ?? 0) >= MAX_RESEND_PER_HOUR) {
      throw new ApiProblem(429, 'BINDING_RATE_LIMITED', '验证码发送过于频繁，请一小时后再试。')
    }
    if (recent && now - Date.parse(recent.created_at) < RESEND_COOLDOWN_MS) {
      return c.json({
        ok: true as const,
        challengeId: recent.id,
        retryAfterSeconds: Math.ceil((RESEND_COOLDOWN_MS - (now - Date.parse(recent.created_at))) / 1000),
        message: '验证码发送冷却中，请稍候再试。'
      })
    }
    // 跨挑战预算：错误验证码达到上限后不再发新码，爆破面收敛。
    if (await verifyFailuresLastHour(c.env.DB, context.userId) >= MAX_VERIFY_FAILURES_PER_HOUR) {
      throw new ApiProblem(429, 'OTP_LOCKED', '验证码错误次数过多，请一小时后再试。')
    }

    const otp = randomOtp()
    const id = uuid()
    const expiresAt = new Date(now + CHALLENGE_TTL_MS).toISOString()
    const otpHash = await keyedHash(`${id}:${otp}`, config.REGISTRATION_SECRET)
    await c.env.DB.batch([
      // 同一账号旧挑战立即作废：任一时刻至多一个可用验证码。
      c.env.DB.prepare(`UPDATE email_binding_challenges SET status = 'expired', updated_at = ? WHERE user_id = ? AND status = 'pending'`).bind(stamp, context.userId),
      c.env.DB.prepare(`
        INSERT INTO email_binding_challenges (id, user_id, email_key, otp_hash, client_hash, status, attempts, resend_count, expires_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?, ?)
      `).bind(id, context.userId, emailKey, otpHash, clientHash, (recent?.resend_count ?? 0) + 1, expiresAt, stamp, stamp)
    ])
    try {
      await sendEmailBindingOtp(config, { email: emailKey, displayName: context.displayName, otp, expiresAt })
    } catch (error) {
      await c.env.DB.prepare(`UPDATE email_binding_challenges SET status = 'expired', updated_at = ? WHERE id = ?`).bind(nowIso(), id).run()
      console.error('email binding delivery failed', error instanceof Error ? error.message : 'unknown')
      throw new ApiProblem(503, 'EMAIL_BINDING_DELIVERY_FAILED', '验证码暂时无法发送，请稍后重试。')
    }
    return c.json({ ok: true as const, challengeId: id, retryAfterSeconds: 60, message: '验证码已发送，请查收公司邮箱。' })
  })

  app.post('/api/v1/account/binding/verify', auth.loadSession, auth.requireCsrf, requireJsonBody, async (c) => {
    const config = c.get('config')
    requireBindingConfig(config)
    const context = c.get('auth')!
    const input = emailBindingVerifySchema.parse(await c.req.json())
    const challenge = await first<BindingChallengeRow>(c.env.DB.prepare(`
      SELECT id, user_id, email_key, otp_hash, status, attempts, resend_count, expires_at
      FROM email_binding_challenges WHERE id = ? LIMIT 1
    `).bind(input.challengeId))
    // 挑战不存在或属于他人时共用同一错误，不暴露挑战有效性。
    if (!challenge || challenge.user_id !== context.userId) {
      throw new ApiProblem(400, 'OTP_INVALID_OR_EXPIRED', '验证码无效或已过期，请重新获取。')
    }
    if (challenge.attempts >= MAX_ATTEMPTS) {
      throw new ApiProblem(429, 'OTP_LOCKED', '验证码错误次数过多，请重新获取验证码。')
    }
    if (challenge.status !== 'pending' || Date.parse(challenge.expires_at) <= Date.now()) {
      if (challenge.status === 'pending') {
        await c.env.DB.prepare(`UPDATE email_binding_challenges SET status = 'expired', updated_at = ? WHERE id = ?`).bind(nowIso(), challenge.id).run()
      }
      throw new ApiProblem(400, 'OTP_INVALID_OR_EXPIRED', '验证码无效或已过期，请重新获取。')
    }
    // 跨挑战预算 · 比对前兜底：换新验证码不得重置总猜测上限。
    if (await verifyFailuresLastHour(c.env.DB, context.userId) >= MAX_VERIFY_FAILURES_PER_HOUR) {
      throw new ApiProblem(429, 'OTP_LOCKED', '验证码错误次数过多，请一小时后再试。')
    }
    const expected = await keyedHash(`${challenge.id}:${input.otp}`, config.REGISTRATION_SECRET)
    if (!safeEqualHex(expected, challenge.otp_hash)) {
      const stamp = nowIso()
      const updated = await c.env.DB.prepare(`
        UPDATE email_binding_challenges
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

    // OTP 验证通过：绑定邮箱 + 重设密码（允许与旧密码一致）一步完成。
    // 绑定完成后可使用公司邮箱自助找回密码，这是本次引导的直接目的。
    const passwordHash = await hashPassword(input.password, config.PASSWORD_PEPPER)
    const stamp = nowIso()
    const audit = prepareAudit(c.env.DB, {
      context,
      action: 'email-binding', entityType: 'account', entityId: context.userId,
      businessDate: localBusinessDate(context.storeTimezone),
      summary: `绑定公司邮箱并重设密码：${context.displayName}`,
      after: { email: redactEmail(challenge.email_key), method: 'email-otp' },
      reversible: false,
      module: 'account'
    })
    // D1 batch 事务：先条件化消费挑战，再落绑定与密码。重放或过期时
    // 后续语句的 EXISTS 断言不成立，账号不会被改写。
    const result = await c.env.DB.batch([
      c.env.DB.prepare(`
        UPDATE email_binding_challenges
        SET status = 'completed', completed_at = ?, updated_at = ?
        WHERE id = ? AND status = 'pending' AND expires_at > ?
      `).bind(stamp, stamp, challenge.id, stamp),
      c.env.DB.prepare(`
        UPDATE users
        SET email_key = ?, password_hash = ?, must_change_password = 0, failed_login_count = 0, updated_at = ?
        WHERE id = ?
          AND EXISTS (SELECT 1 FROM email_binding_challenges WHERE id = ? AND status = 'completed' AND completed_at = ?)
      `).bind(challenge.email_key, passwordHash, stamp, context.userId, challenge.id, stamp),
      // 绑定即重设密码：撤销其它设备的会话，保留当前会话继续使用。
      c.env.DB.prepare(`
        UPDATE auth_sessions SET revoked_at = ?
        WHERE user_id = ? AND token_hash <> ? AND revoked_at IS NULL
          AND EXISTS (SELECT 1 FROM users WHERE id = ? AND updated_at = ? AND password_hash = ?)
      `).bind(stamp, context.userId, context.sessionTokenHash, context.userId, stamp, passwordHash),
      audit.statement
    ])
    if ((result[1]?.meta.changes ?? 0) !== 1) {
      throw new ApiProblem(409, 'EMAIL_BINDING_CONFLICT', '绑定未生效，请重新获取验证码后再试。')
    }
    return c.json({ ok: true as const, message: '邮箱绑定完成，密码已更新。' })
  })

  return app
}
