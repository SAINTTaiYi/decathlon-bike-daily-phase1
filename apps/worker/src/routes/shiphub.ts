import { Hono } from 'hono'
import type { AppConfig, WorkerEnv } from '../env.js'
import type { AuthContext } from '../auth/types.js'
import { createAuthMiddleware } from '../auth/middleware.js'
import { businessDateFor, prepareAudit } from '../services/business.js'
import { requireJsonBody } from '../lib/json.js'
import { ShipHubUpstreamError, type ShipHubCategory } from '../lib/shiphub-client.js'
import { completeShipHubAuthorization, createShipHubAuthorization, shipHubIdentityFingerprint } from '../lib/shiphub-oauth.js'
import { encryptShipHubSecret } from '../lib/shiphub-crypto.js'
import { performShipHubProgrammaticLogin } from '../lib/shiphub-login.js'
import { first, nowIso } from '../db.js'
import { idempotent } from '../services/idempotency.js'
import { ApiProblem } from '../services/problems.js'
import {
  activeInStoreTimezone,
  getShipHubConnection,
  getShipHubOrder,
  getShipHubSummary,
  listShipHubOrders,
  SHIPHUB_SYNC_TIMEZONE,
  syncStoreCategory
} from '../services/shiphub-sync.js'

type Vars = { config: AppConfig; auth: AuthContext | null }

function category(value: string | undefined): ShipHubCategory {
  if (value !== 'hand' && value !== 'pick' && value !== 'receive' && value !== 'ship') throw new ApiProblem(400, 'INVALID_SHIPHUB_CATEGORY', 'Shiphub 分类无效。')
  return value
}

function mapOrder(order: any) {
  if (!order) return null
  return {
    id: order.upstream_order_id,
    category: order.category,
    displayLabel: order.display_label,
    sourceLabel: order.source_label,
    status: order.order_status,
    orderNumber: order.order_number ?? null,
    customerPhone: order.customer_phone ?? null,
    isEncryptedOrder: Boolean(order.is_encrypted_order),
    vehicleInfo: order.vehicle_info ?? null,
    channel: order.channel ?? null,
    scheduledAt: order.scheduled_at,
    upstreamUpdatedAt: order.upstream_updated_at,
    firstSeenAt: order.first_seen_at,
    lastSeenAt: order.last_seen_at,
    localActionState: order.localActionState ?? order.local_action_state ?? null,
    items: order.items
  }
}

function mapUpstreamError(error: unknown): ApiProblem {
  if (error instanceof ShipHubUpstreamError) {
    const status = error.code === 'OAUTH_STATE_INVALID' || error.code === 'INVALID_OAUTH_CALLBACK' ? 400 : 503
    return new ApiProblem(status, error.code, 'Shiphub 暂时不可用，请稍后重试。')
  }
  return new ApiProblem(503, 'SHIPHUB_UNAVAILABLE', 'Shiphub 暂时不可用，请稍后重试。')
}

function requireManager(context: AuthContext): void {
  if (context.role !== 'manager' && context.role !== 'admin') throw new ApiProblem(403, 'FORBIDDEN', '当前账号没有管理 Shiphub 连接的权限。')
}

export function shipHubRoutes() {
  const app = new Hono<{ Bindings: WorkerEnv; Variables: Vars }>()
  const auth = createAuthMiddleware()
  const read = [auth.loadSession, auth.requirePasswordChanged] as const
  const managerRead = [auth.loadSession, auth.requirePasswordChanged, auth.requireRole('manager', 'admin')] as const
  const write = [auth.loadSession, auth.requirePasswordChanged, auth.requireCsrf] as const
  const managerWrite = [auth.loadSession, auth.requirePasswordChanged, auth.requireCsrf, auth.requireRole('manager', 'admin')] as const

  app.get('/api/v1/settings/shiphub', ...managerRead, async (c) => {
    const context = c.get('auth')!
    return c.json({ enabled: c.get('config').SHIPHUB.enabled, connection: await getShipHubConnection(c.env.DB, context.storeId) })
  })

  // 权限拆分：重连（复用已存本店凭据）允许门店任意角色（含操作员）；
  // 添加/更换账号（body 携带 login 凭据）仅门店管理员（manager/admin）
  app.post('/api/v1/settings/shiphub/connect/start', requireJsonBody, auth.loadSession, auth.requirePasswordChanged, auth.requireCsrf, async (c) => {
    const config = c.get('config')
    if (!config.SHIPHUB.enabled) throw new ApiProblem(404, 'SHIPHUB_DISABLED', 'Shiphub 接入尚未启用。')
    if (config.SHIPHUB.mode !== 'live') throw new ApiProblem(409, 'SSO_NOT_AVAILABLE_IN_FIXTURE', 'Preview fixture 不启用真实 Shiphub 授权。')
    if (!config.SHIPHUB.liveConfirmed) throw new ApiProblem(503, 'LIVE_NOT_CONFIRMED', '真实 Shiphub 尚未完成授权与连通性验证。')
    const context = c.get('auth')!
    const body = await c.req.json().catch(() => ({})) as { returnTo?: string; login?: { username?: string; password?: string; locationNum?: string } }
    // 每店独立上游身份（推荐）：门店可提供自己的 ShipHub 账号与 location_num，加密存于本店
    // 连接行，后续重连/同步使用本店身份；不填则回退到部署级共享凭据（仅兼容存量连接）。
    const login = body.login ?? null
    const storeUsername = login?.username?.trim()
    const storePassword = login?.password
    const perStoreLogin = Boolean(login && (login.username || login.password || login.locationNum))
    // 添加/更换本店账号仅限门店管理员；操作员只用已存凭据重连
    if (perStoreLogin) requireManager(context)
    if (perStoreLogin) {
      if (!storeUsername || !storePassword) throw new ApiProblem(400, 'SHIPHUB_LOGIN_INCOMPLETE', '提供本店 ShipHub 账号时，用户名与密码必须同时填写。')
      if (storeUsername.length > 128 || storePassword.length > 128 || !storePassword.trim()) throw new ApiProblem(400, 'SHIPHUB_LOGIN_INVALID', 'ShipHub 账号凭据格式不正确。')
    }
    const key = config.SHIPHUB.tokenEncryptionKey
    if (!key) throw new ShipHubUpstreamError('TOKEN_ENCRYPTION_NOT_CONFIGURED')
    const [loginUsernameEnc, loginPasswordEnc] = perStoreLogin && storeUsername && storePassword
      ? await Promise.all([encryptShipHubSecret(storeUsername, key), encryptShipHubSecret(storePassword, key)])
      : [null, null]
    const effectiveLocationNum = login?.locationNum?.trim() || config.SHIPHUB.locationNum?.trim() || null
    const fingerprint = await shipHubIdentityFingerprint(effectiveLocationNum, perStoreLogin ? storeUsername : undefined)
    // 同一上游身份只允许一个门店连接：拒绝把共享账号连接到第二家店（历史事故根因）
    if (fingerprint) {
      const conflicting = await first<{ store_code: string }>(c.env.DB.prepare(`
        SELECT st.code AS store_code
        FROM shiphub_connections c JOIN stores st ON st.id = c.store_id
        WHERE c.identity_fingerprint = ? AND c.store_id != ? AND c.enabled = 1
          AND c.authorization_status IN ('connected', 'reauth_required')
        LIMIT 1
      `).bind(fingerprint, context.storeId))
      if (conflicting) throw new ApiProblem(409, 'SHIPHUB_IDENTITY_IN_USE', `该 ShipHub 账号已被门店 ${conflicting.store_code} 使用，一个上游账号只能连接一个门店。`)
    }
    // 程序化登录（推荐）：优先本店独立账号；未提供时用部署级共享凭据（CF secret），
    // 服务端自动完成 PingFederate 登录与 OAuth code 交换，无需浏览器跳转。
    if (config.SHIPHUB.loginKey && (config.SHIPHUB.loginUsernameEnc && config.SHIPHUB.loginPasswordEnc || perStoreLogin)) {
      try {
        const token = await performShipHubProgrammaticLogin(config.SHIPHUB, perStoreLogin && storeUsername && storePassword ? { username: storeUsername, password: storePassword } : undefined)
        if (!token.refreshToken) throw new ShipHubUpstreamError('OAUTH_REFRESH_TOKEN_MISSING')
        const encrypted = await encryptShipHubSecret(token.refreshToken, key)
        const stamp = nowIso()
        const audit = prepareAudit(c.env.DB, {
          context,
          action: 'shiphub-connect',
          entityType: 'shiphub-connection',
          entityId: context.storeId,
          businessDate: await businessDateFor(context),
          summary: perStoreLogin ? '使用本店独立账号完成 Shiphub 授权' : '通过门店账号自动完成 Shiphub 授权',
          module: 'account'
        })
        await c.env.DB.batch([
          c.env.DB.prepare(`
            INSERT INTO shiphub_connections (
              store_id, enabled, mode, refresh_token_ciphertext, refresh_token_nonce, refresh_token_key_version,
              login_username_enc, login_password_enc, login_key_version, location_num, identity_fingerprint,
              token_expires_at, token_updated_at, authorization_status, last_auth_error_code, created_at, updated_at
            ) VALUES (?, 1, 'live', ?, ?, 'v1', ?, ?, ?, ?, ?, ?, ?, 'connected', NULL, ?, ?)
            ON CONFLICT(store_id) DO UPDATE SET
              enabled = 1, mode = 'live', refresh_token_ciphertext = excluded.refresh_token_ciphertext,
              refresh_token_nonce = excluded.refresh_token_nonce, refresh_token_key_version = excluded.refresh_token_key_version,
              login_username_enc = COALESCE(excluded.login_username_enc, shiphub_connections.login_username_enc),
              login_password_enc = COALESCE(excluded.login_password_enc, shiphub_connections.login_password_enc),
              login_key_version = COALESCE(excluded.login_key_version, shiphub_connections.login_key_version),
              location_num = COALESCE(excluded.location_num, shiphub_connections.location_num),
              identity_fingerprint = COALESCE(excluded.identity_fingerprint, shiphub_connections.identity_fingerprint),
              token_expires_at = excluded.token_expires_at, token_updated_at = excluded.token_updated_at,
              authorization_status = 'connected', last_auth_error_code = NULL, updated_at = excluded.updated_at
          `).bind(context.storeId, encrypted.ciphertext, encrypted.nonce, loginUsernameEnc, loginPasswordEnc, loginUsernameEnc ? 'v1' : null, effectiveLocationNum, fingerprint, token.expiresAt, stamp, stamp, stamp),
          audit.statement
        ])
        const waitUntil = c.executionCtx?.waitUntil?.bind(c.executionCtx)
        if (waitUntil) {
          for (const selected of ['hand', 'pick', 'receive', 'ship'] as const) {
            waitUntil(syncStoreCategory(c.env.DB, config, context.storeId, selected, { trigger: 'authorization' }))
          }
        }
        return c.json({ connected: true, mode: 'live' })
      } catch (error) {
        throw mapUpstreamError(error)
      }
    }
    // 浏览器 SSO 兜底：未配置门店账号凭据时沿用原跳转授权流程
    try {
      return c.json({ authorizationUrl: await createShipHubAuthorization(c.env.DB, config, context, body.returnTo) })
    } catch (error) {
      throw mapUpstreamError(error)
    }
  })

  app.get('/api/v1/settings/shiphub/callback', ...read, async (c) => {
    const context = c.get('auth')!
    requireManager(context)
    try {
      const result = await completeShipHubAuthorization(
        c.env.DB,
        c.get('config'),
        context,
        c.req.query('state') ?? '',
        c.req.query('code') ?? ''
      )
      const target = new URL(result.returnTo, c.req.url)
      target.searchParams.set('shiphub', 'connected')
      return c.redirect(target.toString(), 302)
    } catch (error) {
      throw mapUpstreamError(error)
    }
  })

  app.post('/api/v1/settings/shiphub/disconnect', requireJsonBody, ...managerWrite, async (c) => {
    const context = c.get('auth')!
    const body = await c.req.json().catch(() => ({}))
    const result = await idempotent(c, body, async (db) => {
      const stamp = new Date().toISOString()
      const audit = prepareAudit(db, {
        context,
        action: 'shiphub-disconnect',
        entityType: 'shiphub-connection',
        entityId: context.storeId,
        businessDate: await businessDateFor(context),
        summary: '断开 Shiphub 门店连接',
        module: 'account'
      })
      await db.batch([
        db.prepare('DELETE FROM shiphub_oauth_states WHERE store_id = ?').bind(context.storeId),
        db.prepare(`
          UPDATE shiphub_connections SET enabled = 0, refresh_token_ciphertext = NULL, refresh_token_nonce = NULL,
            refresh_token_key_version = NULL, token_expires_at = NULL, token_updated_at = NULL,
            authorization_status = 'disconnected', last_auth_error_code = NULL, updated_at = ?
          WHERE store_id = ?
        `).bind(stamp, context.storeId),
        audit.statement
      ])
      return { status: 200, body: { disconnected: true } }
    })
    return c.json(result.body, result.status as any)
  })

  app.get('/api/v1/shiphub/summary', ...read, async (c) => c.json(await getShipHubSummary(c.env.DB, c.get('config'), c.get('auth')!.storeId)))

  app.get('/api/v1/shiphub/orders', ...read, async (c) => {
    const selected = category(c.req.query('category'))
    const limitRaw = Number(c.req.query('limit') ?? 50)
    const limit = Number.isInteger(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 50
    const result = await listShipHubOrders(c.env.DB, c.get('auth')!.storeId, selected, c.req.query('cursor') ?? null, limit)
    return c.json({ category: selected, orders: result.orders.map(mapOrder), nextCursor: result.nextCursor })
  })

  app.get('/api/v1/shiphub/orders/:category/:id', ...read, async (c) => {
    const selected = category(c.req.param('category'))
    const order = await getShipHubOrder(c.env.DB, c.get('auth')!.storeId, selected, c.req.param('id'))
    if (!order) throw new ApiProblem(404, 'SHIPHUB_ORDER_NOT_FOUND', 'Shiphub 订单不存在或已离开当前缓存。')
    return c.json({ order: mapOrder(order) })
  })

  app.post('/api/v1/shiphub/orders/:category/:id/actions', requireJsonBody, ...write, async (c) => {
    const selected = category(c.req.param('category'))
    const context = c.get('auth')!
    const body = await c.req.json() as { state?: string }
    if (body.state !== 'completed' && body.state !== 'revoked') throw new ApiProblem(400, 'INVALID_SHIPHUB_ACTION', '本地操作状态无效。')
    const result = await idempotent(c, body, async (db) => {
      const order = await getShipHubOrder(db, context.storeId, selected, c.req.param('id'))
      if (!order) throw new ApiProblem(404, 'SHIPHUB_ORDER_NOT_FOUND', 'Shiphub 订单不存在或已离开当前缓存。')
      const stamp = new Date().toISOString()
      const actionType = selected === 'hand' ? 'pickup' : selected
      const audit = prepareAudit(db, {
        context,
        action: `shiphub-${body.state}`,
        entityType: 'shiphub-order-action',
        entityId: c.req.param('id'),
        businessDate: await businessDateFor(context),
        summary: body.state === 'completed' ? '确认 Shiphub 本地处理' : '撤销 Shiphub 本地处理',
        module: selected === 'hand' || selected === 'pick' ? 'pickup' : 'handover'
      })
      await db.batch([
        db.prepare(`
          INSERT INTO shiphub_order_actions (
            id, store_id, category, upstream_order_id, action_type, local_state, actor_user_id,
            acted_at, revoked_at, revoked_by, idempotency_key, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          crypto.randomUUID(), context.storeId, selected, c.req.param('id'), actionType, body.state,
          context.userId, stamp, body.state === 'revoked' ? stamp : null, body.state === 'revoked' ? context.userId : null,
          c.req.header('idempotency-key') ?? null, stamp
        ),
        audit.statement
      ])
      return { status: 200, body: { state: body.state, waitingForUpstream: body.state === 'completed' } }
    })
    return c.json(result.body, result.status as any)
  })

  app.post('/api/v1/shiphub/sync', requireJsonBody, ...managerWrite, async (c) => {
    const context = c.get('auth')!
    const config = c.get('config')
    // 硬规则：营业时间（北京时间 10:00–22:00）外禁止手动同步，半夜部署/排查也不放行
    if (!activeInStoreTimezone(SHIPHUB_SYNC_TIMEZONE, new Date(), config.SHIPHUB.activeStartHour, config.SHIPHUB.activeEndHour)) {
      throw new ApiProblem(403, 'SHIPHUB_OUTSIDE_BUSINESS_HOURS', '门店营业时间外（北京时间 10:00–22:00）不可同步 Shiphub 数据。')
    }
    const body = await c.req.json().catch(() => ({}))
    const result = await idempotent(c, body, async (db) => {
      const now = new Date()
      const batchId = crypto.randomUUID()
      // 手动同步必须等真实结果再回响应：旧实现 202 + waitUntil + 同步前 summary，
      // 后台失败时前端只看到转圈结束、数据没变、没有任何报错（2026-08-30 事故的
      // 「点同步没反应」正是这个）。四个分类逐个执行并回报每类结果。
      const results: Record<string, { status: string; reason: string | null }> = {}
      for (const selected of ['hand', 'pick', 'receive', 'ship'] as const) {
        try {
          const outcome = await syncStoreCategory(db, config, context.storeId, selected, { trigger: 'manual', batchId, now })
          results[selected] = { status: outcome.status, reason: outcome.reason ?? null }
        } catch (error) {
          results[selected] = { status: 'failed', reason: error instanceof Error ? error.message : 'SYNC_FAILED' }
        }
      }
      // skipped 分为两类：CACHE_FRESH/NOT_DUE 是健康结果（数据已新鲜），
      // 不能报成失败；只有真 failed 才算同步没成。
      const failed = Object.entries(results).filter(([, value]) => value.status === 'failed')
      return {
        status: 200,
        body: {
          synced: failed.length === 0,
          results,
          failedCategories: failed.map(([category]) => category),
          errorCode: failed[0]?.[1]?.reason ?? null,
          summary: await getShipHubSummary(db, config, context.storeId)
        }
      }
    })
    return c.json(result.body, result.status as any)
  })

  return app
}
