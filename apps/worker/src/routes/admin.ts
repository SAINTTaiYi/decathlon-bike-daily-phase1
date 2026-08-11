import { Hono } from 'hono'
import { localBusinessDate } from '@bike-ops/domain'
import { adminCreateUserSchema, adminPasswordResetSchema, adminStoreDecisionSchema, adminStoreMemberRemoveSchema, adminStoreMemberUpdateSchema, adminUserStatusSchema } from '@bike-ops/contracts'
import type { AuthContext } from '../auth/types.js'
import type { AppConfig, WorkerEnv } from '../env.js'
import { createAuthMiddleware } from '../auth/middleware.js'
import { all, camelRows, first, nowIso, uuid } from '../db.js'
import { mapAuditEvent } from './audit.js'
import { prepareAudit, prepareConditionalAudit } from '../services/business.js'
import type { AuditModule } from '../services/business.js'
import { ApiProblem } from '../services/problems.js'
import { idempotent } from '../services/idempotency.js'
import { hashPassword, keyedHash } from '../lib/crypto.js'

type Vars = { config: AppConfig; auth: AuthContext | null }

const AUDIT_MODULES = new Set<AuditModule>(['sales', 'closing', 'pickup', 'repair', 'resale', 'handover', 'account', 'system'])

function requireContext(c: { get(key: 'auth'): AuthContext | null }): AuthContext {
  const context = c.get('auth')
  if (!context) throw new ApiProblem(401, 'UNAUTHENTICATED', '请重新登录。')
  return context
}


function todayStartIso(): string {
  const today = localBusinessDate('Asia/Shanghai')
  return new Date(`${today}T00:00:00+08:00`).toISOString()
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString()
}

function tomorrowStartIso(): string {
  const tomorrow = new Date(Date.parse(todayStartIso()) + 86400000)
  return tomorrow.toISOString()
}

function parseHistoryFilters(query: (key: string) => string | undefined): { date: string; module: AuditModule | 'all'; cursor: string; limit: number } {
  const date = query('date') ?? ''
  if (date && !/^\d{4}-\d{2}-\d{2}$/u.test(date)) throw new ApiProblem(400, 'INVALID_HISTORY_FILTER', '日期筛选格式无效。')
  const module = query('module') ?? 'all'
  if (module !== 'all' && !AUDIT_MODULES.has(module as AuditModule)) throw new ApiProblem(400, 'INVALID_HISTORY_FILTER', '模块筛选无效。')
  const cursor = query('cursor') ?? ''
  const limitRaw = Number(query('limit') ?? 80)
  const limit = Number.isInteger(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 80
  return { date, module: module as AuditModule | 'all', cursor, limit }
}

function parseApprovalFilters(query: (key: string) => string | undefined): { type: 'role' | 'transfer'; group: 'pending' | 'expired' | 'decided'; cursor: string; limit: number } {
  const type = query('type') ?? 'role'
  if (type !== 'role' && type !== 'transfer') throw new ApiProblem(400, 'INVALID_APPROVAL_FILTER', '审批类型无效。')
  const group = query('group') ?? 'pending'
  if (!['pending', 'expired', 'decided'].includes(group)) throw new ApiProblem(400, 'INVALID_APPROVAL_FILTER', '审批分组无效。')
  const cursor = query('cursor') ?? ''
  const limitRaw = Number(query('limit') ?? 50)
  const limit = Number.isInteger(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 50
  return { type, group: group as 'pending' | 'expired' | 'decided', cursor, limit }
}

function applyCursor(clauses: string[], values: Array<string | number>, cursor: string) {
  const [createdAt, id] = cursor.split('|')
  if (!createdAt || !id) throw new ApiProblem(400, 'INVALID_APPROVAL_CURSOR', '审批列表翻页标识无效。')
  clauses.push('(r.created_at < ? OR (r.created_at = ? AND r.id < ?))')
  values.push(createdAt, createdAt, id)
}

export function adminRoutes() {
  const app = new Hono<{ Bindings: WorkerEnv; Variables: Vars }>()
  const auth = createAuthMiddleware()
  const platformRead = [auth.loadSession, auth.requirePasswordChanged, auth.requirePlatformAdmin] as const
  const platformWrite = [auth.loadSession, auth.requirePasswordChanged, auth.requireCsrf, auth.requirePlatformAdmin] as const

  // ---- 平台总览（含今日 / 周期统计 / 变化流）----
  app.get('/api/v1/admin/overview', ...platformRead, async (c) => {
    const d7 = daysAgoIso(7)
    const d30 = daysAgoIso(30)
    const todayStart = todayStartIso()
    const [storeCount, storeDisabledCount, storePendingCount, userCount, members, pendingRoles, pendingTransfers, todayNewStores, todayNewUsers, todayRoleApproved, todayTransferApproved, todayItems, newStores7d, newStores30d, newUsers7d, newUsers30d, roleTotal7d, roleTotal30d, roleStats7d, roleStats30d, recentAudit] = await Promise.all([
      first<{ n: number }>(c.env.DB.prepare("SELECT COUNT(*) AS n FROM stores WHERE status = 'active' AND pending_review = 0")),
      first<{ n: number }>(c.env.DB.prepare("SELECT COUNT(*) AS n FROM stores WHERE status = 'disabled' AND pending_review = 0")),
      first<{ n: number }>(c.env.DB.prepare("SELECT COUNT(*) AS n FROM stores WHERE pending_review = 1")),
      first<{ n: number }>(c.env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE status = 'active'")),
      all<{ role: string; n: number }>(c.env.DB.prepare("SELECT role, COUNT(*) AS n FROM store_members WHERE status = 'active' GROUP BY role")),
      first<{ n: number }>(c.env.DB.prepare("SELECT COUNT(*) AS n FROM role_change_requests WHERE status = 'pending' AND expires_at > ?").bind(nowIso())),
      first<{ n: number }>(c.env.DB.prepare("SELECT COUNT(*) AS n FROM store_transfer_requests WHERE status = 'pending' AND expires_at > ?").bind(nowIso())),
      first<{ n: number }>(c.env.DB.prepare('SELECT COUNT(*) AS n FROM stores WHERE created_at >= ?').bind(todayStart)),
      first<{ n: number }>(c.env.DB.prepare('SELECT COUNT(*) AS n FROM users WHERE created_at >= ?').bind(todayStart)),
      first<{ n: number }>(c.env.DB.prepare("SELECT COUNT(*) AS n FROM role_change_requests WHERE status = 'approved' AND decided_at >= ?").bind(todayStart)),
      first<{ n: number }>(c.env.DB.prepare("SELECT COUNT(*) AS n FROM store_transfer_requests WHERE status = 'approved' AND decided_at >= ?").bind(todayStart)),
      all<{ kind: string; n: number }>(c.env.DB.prepare('SELECT kind, COUNT(*) AS n FROM work_items WHERE created_at >= ? AND created_at < ? AND deleted_at IS NULL GROUP BY kind').bind(todayStart, tomorrowStartIso())),
      first<{ n: number }>(c.env.DB.prepare('SELECT COUNT(*) AS n FROM stores WHERE created_at >= ?').bind(d7)),
      first<{ n: number }>(c.env.DB.prepare('SELECT COUNT(*) AS n FROM stores WHERE created_at >= ?').bind(d30)),
      first<{ n: number }>(c.env.DB.prepare('SELECT COUNT(*) AS n FROM users WHERE created_at >= ?').bind(d7)),
      first<{ n: number }>(c.env.DB.prepare('SELECT COUNT(*) AS n FROM users WHERE created_at >= ?').bind(d30)),
      first<{ n: number }>(c.env.DB.prepare('SELECT COUNT(*) AS n FROM role_change_requests WHERE created_at >= ?').bind(d7)),
      first<{ n: number }>(c.env.DB.prepare('SELECT COUNT(*) AS n FROM role_change_requests WHERE created_at >= ?').bind(d30)),
      all<{ store_code: string; store_name: string; initiated: number; approved: number; rejected: number }>(c.env.DB.prepare(`
        SELECT st.code AS store_code, st.name AS store_name,
               SUM(CASE WHEN rr.created_at >= ? THEN 1 ELSE 0 END) AS initiated,
               SUM(CASE WHEN rr.status = 'approved' AND rr.decided_at >= ? THEN 1 ELSE 0 END) AS approved,
               SUM(CASE WHEN rr.status = 'rejected' AND rr.decided_at >= ? THEN 1 ELSE 0 END) AS rejected
        FROM role_change_requests rr JOIN stores st ON st.id = rr.store_id
        WHERE rr.created_at >= ? OR rr.decided_at >= ?
        GROUP BY rr.store_id
        ORDER BY initiated DESC, rr.store_id ASC
        LIMIT 8
      `).bind(d7, d7, d7, d7, d7)),
      all<{ store_code: string; store_name: string; initiated: number; approved: number; rejected: number }>(c.env.DB.prepare(`
        SELECT st.code AS store_code, st.name AS store_name,
               SUM(CASE WHEN rr.created_at >= ? THEN 1 ELSE 0 END) AS initiated,
               SUM(CASE WHEN rr.status = 'approved' AND rr.decided_at >= ? THEN 1 ELSE 0 END) AS approved,
               SUM(CASE WHEN rr.status = 'rejected' AND rr.decided_at >= ? THEN 1 ELSE 0 END) AS rejected
        FROM role_change_requests rr JOIN stores st ON st.id = rr.store_id
        WHERE rr.created_at >= ? OR rr.decided_at >= ?
        GROUP BY rr.store_id
        ORDER BY initiated DESC, rr.store_id ASC
        LIMIT 8
      `).bind(d30, d30, d30, d30, d30)),
      all(c.env.DB.prepare(`
        SELECT e.id, e.action, e.entity_type, e.entity_id, e.actor_name_snapshot, e.business_date,
               e.summary, e.reversible, e.audit_module, e.created_at,
               st.code AS store_code, st.name AS store_name
        FROM audit_events e JOIN stores st ON st.id = e.store_id
        ORDER BY e.created_at DESC, e.id DESC
        LIMIT 8
      `))
    ])

    const recentChanges = camelRows(await all(c.env.DB.prepare(`
      SELECT type, id, store_code, title, at FROM (
        SELECT 'new-store' AS type, st.id, st.code AS store_code,
               '新增门店：' || st.code || ' ' || st.name AS title, st.created_at AS at
        FROM stores st WHERE st.created_at >= ?
        UNION ALL
        SELECT 'new-user', u.id, NULL,
               '新增用户：' || u.display_name, u.created_at
        FROM users u WHERE u.created_at >= ?
        UNION ALL
        SELECT 'role-approved', rr.id, st.code,
               '角色批准：' || u.display_name || ' @ ' || st.code, rr.decided_at
        FROM role_change_requests rr JOIN users u ON u.id = rr.user_id JOIN stores st ON st.id = rr.store_id
        WHERE rr.status = 'approved' AND rr.decided_at >= ?
        UNION ALL
        SELECT 'transfer-approved', tr.id, target.code,
               '调店批准：' || u.display_name || ' ' || source.code || ' → ' || target.code, tr.decided_at
        FROM store_transfer_requests tr JOIN users u ON u.id = tr.user_id
        JOIN stores source ON source.id = tr.source_store_id JOIN stores target ON target.id = tr.target_store_id
        WHERE tr.status = 'approved' AND tr.decided_at >= ?
      ) ORDER BY at DESC, id DESC LIMIT 10
    `).bind(d30, d30, d30, d30)))

    return c.json({
      counts: {
        stores: storeCount?.n ?? 0,
        storesDisabled: storeDisabledCount?.n ?? 0,
        storesPending: storePendingCount?.n ?? 0,
        users: userCount?.n ?? 0,
        membersByRole: Object.fromEntries((members || []).map((row) => [row.role, row.n]))
      },
      pending: { roleRequests: pendingRoles?.n ?? 0, transferRequests: pendingTransfers?.n ?? 0, stores: storePendingCount?.n ?? 0 },
      today: {
        newStores: todayNewStores?.n ?? 0,
        newUsers: todayNewUsers?.n ?? 0,
        roleApproved: todayRoleApproved?.n ?? 0,
        transferApproved: todayTransferApproved?.n ?? 0,
        items: Object.fromEntries((todayItems || []).map((row) => [row.kind, row.n]))
      },
      periods: {
        newStores: { d7: newStores7d?.n ?? 0, d30: newStores30d?.n ?? 0 },
        newUsers: { d7: newUsers7d?.n ?? 0, d30: newUsers30d?.n ?? 0 },
        roleChanges: {
          d7: { total: roleTotal7d?.n ?? 0, byStore: camelRows(roleStats7d) },
          d30: { total: roleTotal30d?.n ?? 0, byStore: camelRows(roleStats30d) }
        }
      },
      recentChanges,
      recentAudit: camelRows(recentAudit)
    })
  })

  // ---- 门店详情（组织路径 / 成员 / 业务概览）----
  app.get('/api/v1/admin/stores/:storeId', ...platformRead, async (c) => {
    const storeId = String(c.req.param('storeId') ?? '')
    const store = await first<{ id: string; code: string; name: string; status: string; timezone: string; created_at: string; pending_review: number }>(c.env.DB.prepare('SELECT id, code, name, status, timezone, created_at, pending_review FROM stores WHERE id = ?').bind(storeId))
    if (!store) throw new ApiProblem(404, 'STORE_NOT_FOUND', '门店不存在。')
    const [members, todayItems, closing, memberCount] = await Promise.all([
      all<{ membership_id: string; id: string; display_name: string; username_key: string; role: string; membership_status: string; user_status: string; user_updated_at: string; last_login_at: string | null; is_platform_admin: number }>(c.env.DB.prepare(`
        SELECT sm.id AS membership_id, u.id, u.display_name, u.username_key, sm.role, sm.status AS membership_status, u.status AS user_status, u.updated_at AS user_updated_at, u.last_login_at, u.is_platform_admin
        FROM store_members sm JOIN users u ON u.id = sm.user_id
        WHERE sm.store_id = ? AND sm.status = 'active'
        ORDER BY sm.role, u.display_name ASC
      `).bind(storeId)),
      all<{ kind: string; n: number }>(c.env.DB.prepare('SELECT kind, COUNT(*) AS n FROM work_items WHERE store_id = ? AND created_at >= ? AND created_at < ? AND deleted_at IS NULL GROUP BY kind').bind(storeId, todayStartIso(), tomorrowStartIso())),
      first<{ n: number }>(c.env.DB.prepare('SELECT COUNT(*) AS n FROM daily_closings WHERE store_id = ? AND business_date = ?').bind(storeId, localBusinessDate(store.timezone))),
      first<{ n: number }>(c.env.DB.prepare("SELECT COUNT(*) AS n FROM store_members WHERE store_id = ? AND status = 'active'").bind(storeId))
    ])
    return c.json({
      store: { id: store.id, code: store.code, name: store.name, status: store.pending_review === 1 ? 'pending' : store.status, timezone: store.timezone, createdAt: store.created_at },
      path: null,
      members: members.map((row) => ({ id: row.id, userId: row.id, membershipId: row.membership_id, displayName: row.display_name, username: row.username_key, role: row.role, status: row.user_status === 'active' && row.membership_status === 'active' ? 'active' : 'disabled', updatedAt: row.user_updated_at, lastLoginAt: row.last_login_at, isPlatformAdmin: row.is_platform_admin === 1 })),
      overview: {
        todayItems: Object.fromEntries(todayItems.map((row) => [row.kind, row.n])),
        closedToday: Boolean(closing?.n),
        memberCount: memberCount?.n ?? 0
      }
    })
  })

  // ---- 审批列表（角色 / 调店 × 待审批 / 已过期 / 已处理）----
  app.get('/api/v1/admin/approvals', ...platformRead, async (c) => {
    const { type, group, cursor, limit } = parseApprovalFilters((key) => c.req.query(key))
    const clauses: string[] = []
    const values: Array<string | number> = []
    const nowIsoValue = nowIso()
    if (group === 'pending') { clauses.push("r.status = 'pending'"); clauses.push('r.expires_at > ?'); values.push(nowIsoValue) }
    if (group === 'expired') { clauses.push("r.status = 'pending'"); clauses.push('r.expires_at <= ?'); values.push(nowIsoValue) }
    if (group === 'decided') { clauses.push("r.status IN ('approved', 'rejected', 'cancelled')") }
    if (cursor) applyCursor(clauses, values, cursor)
    values.push(limit + 1)
    const sql = type === 'role'
      ? `
        SELECT r.id, r.user_id, u.display_name AS user_name, r.store_id, st.code AS store_code, st.name AS store_name,
               r.from_role, r.target_role, r.reason, r.status, r.revision, r.expires_at, r.created_at,
               r.decision_reason, r.decided_at
        FROM role_change_requests r
        JOIN users u ON u.id = r.user_id
        JOIN stores st ON st.id = r.store_id
        WHERE ${clauses.join(' AND ')}
        ORDER BY r.created_at DESC, r.id DESC
        LIMIT ?
      `
      : `
        SELECT r.id, r.user_id, u.display_name AS user_name, r.source_store_id,
               source.code AS source_store_code, source.name AS source_store_name,
               r.target_store_id, target.code AS target_store_code, target.name AS target_store_name,
               r.reason, r.status, r.revision, r.expires_at, r.created_at,
               r.decision_reason, r.decided_at
        FROM store_transfer_requests r
        JOIN users u ON u.id = r.user_id
        JOIN stores source ON source.id = r.source_store_id
        JOIN stores target ON target.id = r.target_store_id
        WHERE ${clauses.join(' AND ')}
        ORDER BY r.created_at DESC, r.id DESC
        LIMIT ?
      `
    const page = await all(c.env.DB.prepare(sql).bind(...values))
    const hasMore = page.length > limit
    const rows = page.slice(0, limit)
    const last = rows[rows.length - 1]
    return c.json({ requests: camelRows(rows), nextCursor: hasMore && last ? `${last.created_at}|${last.id}` : null })
  })

  // ---- 轻量待审批计数（供门店工作台角标轮询）----
  app.get('/api/v1/admin/pending-count', ...platformRead, async (c) => {
    const currentTime = nowIso()
    const [roleRequests, transferRequests, storesPending] = await Promise.all([
      first<{ n: number }>(c.env.DB.prepare("SELECT COUNT(*) AS n FROM role_change_requests WHERE status = 'pending' AND expires_at > ?").bind(currentTime)),
      first<{ n: number }>(c.env.DB.prepare("SELECT COUNT(*) AS n FROM store_transfer_requests WHERE status = 'pending' AND expires_at > ?").bind(currentTime)),
      first<{ n: number }>(c.env.DB.prepare("SELECT COUNT(*) AS n FROM stores WHERE pending_review = 1"))
    ])
    return c.json({ roleRequests: roleRequests?.n ?? 0, transferRequests: transferRequests?.n ?? 0, storesPending: storesPending?.n ?? 0 })
  })

  // ---- 用户列表（稳定用户级游标分页，避免成员 JOIN 截断）----
  app.get('/api/v1/admin/users', ...platformRead, async (c) => {
    const q = (c.req.query('q') ?? '').trim().slice(0, 80)
    const storeId = (c.req.query('storeId') ?? '').trim()
    const cursor = (c.req.query('cursor') ?? '').trim()
    const limitRaw = Number(c.req.query('limit') ?? 50)
    const limit = Number.isInteger(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 50
    const clauses = ["(? = '' OR u.display_name LIKE ? OR u.username_key LIKE ?)"]
    const values: Array<string | number> = [q, `%${q}%`, `%${q}%`]
    if (storeId) {
      clauses.push("EXISTS (SELECT 1 FROM store_members sf WHERE sf.user_id = u.id AND sf.store_id = ? AND sf.status = 'active')")
      values.push(storeId)
    }
    if (cursor) {
      const [createdAt, id] = cursor.split('|')
      if (!createdAt || !id) throw new ApiProblem(400, 'INVALID_USER_CURSOR', '用户列表翻页标识无效。')
      clauses.push('(u.created_at > ? OR (u.created_at = ? AND u.id > ?))')
      values.push(createdAt, createdAt, id)
    }
    values.push(limit + 1)
    const page = await all<any>(c.env.DB.prepare(`
      SELECT u.id, u.username_key, u.display_name, u.status, u.is_platform_admin,
             u.last_login_at, u.created_at, u.updated_at
      FROM users u WHERE ${clauses.join(' AND ')}
      ORDER BY u.created_at ASC, u.id ASC LIMIT ?
    `).bind(...values))
    const hasMore = page.length > limit
    const users = page.slice(0, limit)
    const memberships = users.length ? await all<any>(c.env.DB.prepare(`
      SELECT sm.user_id, sm.store_id, st.code AS store_code, st.name AS store_name,
             sm.role AS member_role, sm.status AS member_status
      FROM store_members sm JOIN stores st ON st.id = sm.store_id
      WHERE sm.status = 'active' AND sm.user_id IN (${users.map(() => '?').join(',')})
      ORDER BY sm.user_id, sm.effective_from ASC, sm.created_at ASC
    `).bind(...users.map((user) => user.id))) : []
    const membershipsByUser = new Map<string, any[]>()
    for (const row of memberships) {
      const list = membershipsByUser.get(row.user_id) ?? []
      list.push({ storeId: row.store_id, storeCode: row.store_code, storeName: row.store_name, role: row.member_role, status: row.member_status })
      membershipsByUser.set(row.user_id, list)
    }
    const mapped = users.map((user) => ({
      id: user.id, username: user.username_key, displayName: user.display_name, status: user.status,
      isPlatformAdmin: user.is_platform_admin === 1, lastLoginAt: user.last_login_at,
      createdAt: user.created_at, updatedAt: user.updated_at, memberships: membershipsByUser.get(user.id) ?? []
    }))
    const last = users[users.length - 1]
    return c.json({ users: mapped, nextCursor: hasMore && last ? `${last.created_at}|${last.id}` : null })
  })

  // ---- 平台审计（门店 / 操作人 / 动作类型 / 日期 / 模块）----
  app.get('/api/v1/admin/audit-events', ...platformRead, async (c) => {
    const { date, module, cursor, limit } = parseHistoryFilters((key) => c.req.query(key))
    const storeId = (c.req.query('storeId') ?? '').trim()
    const actor = (c.req.query('actor') ?? '').trim()
    const action = (c.req.query('action') ?? '').trim()
    const clauses: string[] = []
    const values: Array<string | number> = []
    if (date) { clauses.push('e.business_date = ?'); values.push(date) }
    if (module !== 'all') { clauses.push('e.audit_module = ?'); values.push(module) }
    if (storeId) { clauses.push('e.store_id = ?'); values.push(storeId) }
    if (actor) { clauses.push('e.actor_name_snapshot LIKE ?'); values.push(`%${actor}%`) }
    if (action) { clauses.push('e.action LIKE ?'); values.push(`%${action}%`) }
    if (cursor) {
      const [createdAt, id] = cursor.split('|')
      if (!createdAt || !id) throw new ApiProblem(400, 'INVALID_HISTORY_CURSOR', '历史记录翻页标识无效。')
      clauses.push('(e.created_at < ? OR (e.created_at = ? AND e.id < ?))')
      values.push(createdAt, createdAt, id)
    }
    values.push(limit + 1)
    const page = await all(c.env.DB.prepare(`
      SELECT e.id, e.action, e.entity_type, e.entity_id, e.actor_name_snapshot, e.business_date,
             e.summary, e.reversible, e.before_state, e.after_state, e.audit_module, e.created_at,
             st.code AS store_code, st.name AS store_name,
             rev.id AS reverted_by, rev.created_at AS reverted_at
      FROM audit_events e
      LEFT JOIN stores st ON st.id = e.store_id
      LEFT JOIN audit_events rev ON rev.reverted_event_id = e.id
      ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
      ORDER BY e.created_at DESC, e.id DESC
      LIMIT ?
    `).bind(...values))
    const hasMore = page.length > limit
    const rows = page.slice(0, limit)
    const events = rows.map((row) => ({ ...mapAuditEvent(row), storeCode: row.store_code, storeName: row.store_name }))
    const last = rows[rows.length - 1]
    return c.json({ events, nextCursor: hasMore && last ? `${last.created_at}|${last.id}` : null })
  })

  // ---- 创建账号（严格共享契约 + 幂等）----
  app.post('/api/v1/admin/users', ...platformWrite, async (c) => {
    const context = requireContext(c)
    const rawBody = await c.req.json()
    const input = adminCreateUserSchema.parse(rawBody)
    const username = input.username.toLocaleLowerCase('zh-CN')
    const result = await idempotent(c, rawBody, async (db) => {
      const [existing, store] = await Promise.all([
        first<{ id: string }>(db.prepare('SELECT id FROM users WHERE username_key = ?').bind(username)),
        first<{ id: string; code: string; name: string; timezone: string }>(db.prepare("SELECT id, code, name, timezone FROM stores WHERE id = ? AND status = 'active' AND pending_review = 0").bind(input.storeId))
      ])
      if (existing) throw new ApiProblem(409, 'USERNAME_TAKEN', '该登录名已被占用。')
      if (!store) throw new ApiProblem(409, 'STORE_NOT_ACTIVE', '目标门店不存在、待审核或未生效。')
      const passwordHash = await hashPassword(input.password, c.get('config').PASSWORD_PEPPER)
      const userId = uuid(); const membershipId = uuid(); const stamp = nowIso()
      const audit = prepareConditionalAudit(db, {
        context: { ...context, storeId: store.id, storeCode: store.code, storeName: store.name, storeTimezone: store.timezone },
        action: 'admin-create-user', entityType: 'account', entityId: userId,
        businessDate: localBusinessDate(store.timezone),
        summary: `平台创建账号：${input.displayName}（${username} @ ${store.code}，${input.role}）`,
        after: { username, displayName: input.displayName, storeId: store.id, role: input.role }, reversible: false
      }, 'EXISTS (SELECT 1 FROM users WHERE id = ?)', [userId])
      const batch = await db.batch([
        db.prepare('INSERT INTO users (id, username_key, display_name, password_hash, status, must_change_password, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)').bind(userId, username, input.displayName, passwordHash, 'active', stamp, stamp),
        db.prepare('INSERT INTO store_members (id, store_id, user_id, role, status, effective_from, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(membershipId, store.id, userId, input.role, 'active', stamp, stamp),
        audit.statement
      ])
      if (batch[0]?.meta?.changes !== 1 || batch[1]?.meta?.changes !== 1) throw new ApiProblem(409, 'USER_CREATE_CONFLICT', '创建账号冲突，请重试。')
      return { status: 201, body: { ok: true, id: userId, message: '账号已创建。' } }
    })
    return c.json(result.body, result.status as any)
  })

  // ---- 禁用 / 恢复账号（乐观锁 + 幂等；禁用立即撤销会话）----
  app.patch('/api/v1/admin/users/:id', ...platformWrite, async (c) => {
    const context = requireContext(c); const id = String(c.req.param('id') ?? '')
    const rawBody = await c.req.json(); const input = adminUserStatusSchema.parse(rawBody)
    const result = await idempotent(c, rawBody, async (db) => {
      const target = await first<any>(db.prepare('SELECT id, display_name, is_platform_admin, status, updated_at FROM users WHERE id = ?').bind(id))
      if (!target) throw new ApiProblem(404, 'USER_NOT_FOUND', '账号不存在。')
      if (target.is_platform_admin === 1) throw new ApiProblem(409, 'PLATFORM_ADMIN_PROTECTED', '不能修改平台管理员账号。')
      if (target.status !== input.expectedStatus || target.updated_at !== input.expectedUpdatedAt) throw new ApiProblem(409, 'USER_STATUS_CONFLICT', '账号状态刚刚被其他操作修改，请刷新后重试。')
      const stamp = nowIso()
      const audit = prepareConditionalAudit(db, {
        context, action: input.status === 'disabled' ? 'admin-disable-user' : 'admin-enable-user', entityType: 'account', entityId: id,
        businessDate: localBusinessDate(context.storeTimezone), summary: `${input.status === 'disabled' ? '禁用' : '恢复'}账号：${target.display_name}`,
        before: { status: target.status }, after: { status: input.status }, reversible: false
      }, 'EXISTS (SELECT 1 FROM users WHERE id = ? AND status = ? AND updated_at = ?)', [id, input.status, stamp])
      const statements = [db.prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ? AND is_platform_admin = 0 AND status = ? AND updated_at = ?').bind(input.status, stamp, id, input.expectedStatus, input.expectedUpdatedAt), audit.statement]
      if (input.status === 'disabled') statements.splice(1, 0, db.prepare("UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL AND EXISTS (SELECT 1 FROM users WHERE id = ? AND status = 'disabled' AND updated_at = ?)").bind(stamp, id, id, stamp))
      const batch = await db.batch(statements)
      if (batch[0]?.meta?.changes !== 1) throw new ApiProblem(409, 'USER_STATUS_CONFLICT', '账号状态刚刚被其他操作修改，请刷新后重试。')
      return { status: 200, body: { ok: true, updatedAt: stamp, message: input.status === 'disabled' ? '账号已禁用，其会话已立即失效。' : '账号已恢复，可重新登录。' } }
    })
    return c.json(result.body, result.status as any)
  })

  // ---- 重置密码（平台管理员受保护；幂等响应不落明文密码）----
  app.post('/api/v1/admin/users/:id/reset-password', ...platformWrite, async (c) => {
    const context = requireContext(c); const id = String(c.req.param('id') ?? '')
    const rawBody = await c.req.json(); const input = adminPasswordResetSchema.parse(rawBody)
    const requestKey = c.req.header('idempotency-key') ?? ''
    const tempPassword = (await keyedHash(`admin-reset:${context.userId}:${id}:${requestKey}`, c.get('config').PASSWORD_PEPPER)).slice(0, 24)
    const result = await idempotent(c, rawBody, async (db) => {
      const target = await first<any>(db.prepare('SELECT id, display_name, status, is_platform_admin, updated_at FROM users WHERE id = ?').bind(id))
      if (!target) throw new ApiProblem(404, 'USER_NOT_FOUND', '账号不存在。')
      if (target.is_platform_admin === 1) throw new ApiProblem(409, 'PLATFORM_ADMIN_PROTECTED', '不能通过普通后台流程重置平台管理员密码。')
      if (target.status !== 'active') throw new ApiProblem(409, 'USER_NOT_ACTIVE', '仅生效账号可重置密码。')
      if (target.updated_at !== input.expectedUpdatedAt) throw new ApiProblem(409, 'PASSWORD_RESET_CONFLICT', '账号刚刚被其他操作修改，请刷新后重试。')
      const passwordHash = await hashPassword(tempPassword, c.get('config').PASSWORD_PEPPER); const stamp = nowIso()
      const audit = prepareConditionalAudit(db, {
        context, action: 'admin-reset-password', entityType: 'account', entityId: id,
        businessDate: localBusinessDate(context.storeTimezone), summary: `平台重置密码：${target.display_name}`,
        after: { mustChangePassword: true }, reversible: false
      }, 'EXISTS (SELECT 1 FROM users WHERE id = ? AND must_change_password = 1 AND updated_at = ?)', [id, stamp])
      const batch = await db.batch([
        db.prepare("UPDATE users SET password_hash = ?, must_change_password = 1, updated_at = ? WHERE id = ? AND status = 'active' AND is_platform_admin = 0 AND updated_at = ?").bind(passwordHash, stamp, id, input.expectedUpdatedAt),
        db.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL AND EXISTS (SELECT 1 FROM users WHERE id = ? AND must_change_password = 1 AND updated_at = ?)').bind(stamp, id, id, stamp), audit.statement
      ])
      if (batch[0]?.meta?.changes !== 1) throw new ApiProblem(409, 'PASSWORD_RESET_CONFLICT', '重置密码冲突，请刷新后重试。')
      return { status: 200, body: { ok: true, updatedAt: stamp, message: '临时密码已生成；下次登录将强制修改。' } }
    })
    return c.json({ ...(result.body as any), ...(result.status < 400 ? { tempPassword } : {}) }, result.status as any)
  })

  // ---- 门店成员 inline 编辑 / 移除（保留用户与审计历史）----
  app.patch('/api/v1/admin/stores/:storeId/members/:userId', ...platformWrite, async (c) => {
    const context = requireContext(c); const storeId = String(c.req.param('storeId') ?? ''); const userId = String(c.req.param('userId') ?? '')
    const input = adminStoreMemberUpdateSchema.parse(await c.req.json())
    const target = await first<any>(c.env.DB.prepare("SELECT u.id, u.display_name, u.updated_at, u.is_platform_admin, sm.id AS membership_id, sm.role FROM users u JOIN store_members sm ON sm.user_id = u.id AND sm.store_id = ? AND sm.status = 'active' WHERE u.id = ?").bind(storeId, userId))
    if (!target) throw new ApiProblem(404, 'STORE_MEMBER_NOT_FOUND', '门店成员不存在。')
    if (target.is_platform_admin === 1) throw new ApiProblem(409, 'PLATFORM_ADMIN_PROTECTED', '平台管理员成员受保护。')
    if (target.updated_at !== input.expectedUpdatedAt) throw new ApiProblem(409, 'STORE_MEMBER_CONFLICT', '成员资料刚刚被其他操作修改，请刷新后重试。')
    const store = await first<any>(c.env.DB.prepare('SELECT id, code, name, timezone FROM stores WHERE id = ?').bind(storeId)); if (!store) throw new ApiProblem(404, 'STORE_NOT_FOUND', '门店不存在。')
    const stamp = nowIso(); const nextName = input.displayName ?? target.display_name; const nextRole = input.role ?? target.role
    const audit = prepareConditionalAudit(c.env.DB, { context: { ...context, storeId, storeCode: store.code, storeName: store.name, storeTimezone: store.timezone }, action: 'admin-update-store-member', entityType: 'account', entityId: userId, businessDate: localBusinessDate(store.timezone), summary: `更新门店成员：${nextName}`, before: { displayName: target.display_name, role: target.role }, after: { displayName: nextName, role: nextRole }, reversible: false }, 'EXISTS (SELECT 1 FROM users WHERE id = ? AND updated_at = ?)', [userId, stamp])
    const result = await c.env.DB.batch([c.env.DB.prepare('UPDATE users SET display_name = ?, updated_at = ? WHERE id = ? AND updated_at = ? AND is_platform_admin = 0').bind(nextName, stamp, userId, input.expectedUpdatedAt), c.env.DB.prepare("UPDATE store_members SET role = ? WHERE id = ? AND status = 'active'").bind(nextRole, target.membership_id), audit.statement])
    if (result[0]?.meta?.changes !== 1) throw new ApiProblem(409, 'STORE_MEMBER_CONFLICT', '成员资料刚刚被其他操作修改，请刷新后重试。')
    return c.json({ ok: true, updatedAt: stamp, message: '成员资料已更新。' })
  })

  app.delete('/api/v1/admin/stores/:storeId/members/:userId', ...platformWrite, async (c) => {
    const context = requireContext(c); const storeId = String(c.req.param('storeId') ?? ''); const userId = String(c.req.param('userId') ?? '')
    const input = adminStoreMemberRemoveSchema.parse(await c.req.json())
    const target = await first<any>(c.env.DB.prepare("SELECT u.id, u.display_name, u.updated_at, u.is_platform_admin, sm.id AS membership_id, sm.role FROM users u JOIN store_members sm ON sm.user_id = u.id AND sm.store_id = ? AND sm.status = 'active' WHERE u.id = ?").bind(storeId, userId))
    if (!target) throw new ApiProblem(404, 'STORE_MEMBER_NOT_FOUND', '门店成员不存在。')
    if (target.is_platform_admin === 1) throw new ApiProblem(409, 'PLATFORM_ADMIN_PROTECTED', '平台管理员成员受保护。')
    if (target.updated_at !== input.expectedUpdatedAt) throw new ApiProblem(409, 'STORE_MEMBER_CONFLICT', '成员资料刚刚被其他操作修改，请刷新后重试。')
    const store = await first<any>(c.env.DB.prepare('SELECT id, code, name, timezone FROM stores WHERE id = ?').bind(storeId)); if (!store) throw new ApiProblem(404, 'STORE_NOT_FOUND', '门店不存在。')
    const stamp = nowIso(); const audit = prepareConditionalAudit(c.env.DB, { context: { ...context, storeId, storeCode: store.code, storeName: store.name, storeTimezone: store.timezone }, action: 'admin-remove-store-member', entityType: 'account', entityId: userId, businessDate: localBusinessDate(store.timezone), summary: `移除门店成员：${target.display_name}`, before: { role: target.role, status: 'active' }, after: { status: 'inactive' }, reversible: false }, 'EXISTS (SELECT 1 FROM store_members WHERE id = ? AND status = \'inactive\' AND effective_to = ?)', [target.membership_id, stamp])
    const result = await c.env.DB.batch([c.env.DB.prepare("UPDATE store_members SET status = 'inactive', effective_to = ?, ended_by = ?, end_reason = ? WHERE id = ? AND status = 'active'").bind(stamp, context.userId, '平台管理员移除成员', target.membership_id), c.env.DB.prepare('UPDATE users SET updated_at = ? WHERE id = ? AND updated_at = ? AND is_platform_admin = 0').bind(stamp, userId, input.expectedUpdatedAt), c.env.DB.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').bind(stamp, userId), audit.statement])
    if (result[0]?.meta?.changes !== 1 || result[1]?.meta?.changes !== 1) throw new ApiProblem(409, 'STORE_MEMBER_CONFLICT', '成员刚刚被其他操作处理，请刷新后重试。')
    return c.json({ ok: true, updatedAt: stamp, message: '成员已从门店移除，其会话已失效。' })
  })

  // ---- 门店审核（严格输入 + 乐观锁 + 幂等）----
  app.post('/api/v1/admin/stores/:id/decision', ...platformWrite, async (c) => {
    const context = requireContext(c); const id = String(c.req.param('id') ?? '')
    const rawBody = await c.req.json(); const input = adminStoreDecisionSchema.parse(rawBody)
    const result = await idempotent(c, rawBody, async (db) => {
      const store = await first<any>(db.prepare('SELECT id, code, name, status, timezone, updated_at, pending_review FROM stores WHERE id = ?').bind(id))
      if (!store) throw new ApiProblem(404, 'STORE_NOT_FOUND', '门店不存在。')
      if (store.pending_review !== 1) throw new ApiProblem(409, 'STORE_NOT_PENDING', '该门店不在待审核状态。')
      if (store.updated_at !== input.expectedUpdatedAt) throw new ApiProblem(409, 'STORE_REVIEW_CONFLICT', '门店审核状态刚刚被其他操作修改，请刷新后重试。')
      const nextStatus = input.approve ? 'active' : 'disabled'; const stamp = nowIso()
      const audit = prepareConditionalAudit(db, {
        context: { ...context, storeId: store.id, storeCode: store.code, storeName: store.name, storeTimezone: store.timezone },
        action: input.approve ? 'admin-approve-store' : 'admin-reject-store', entityType: 'store', entityId: id,
        businessDate: localBusinessDate(store.timezone), summary: `${input.approve ? '批准' : '拒绝'}门店审核：${store.code} ${store.name}${input.reason ? `（${input.reason}）` : ''}`,
        before: { status: 'pending' }, after: { status: nextStatus, reason: input.reason }, reversible: false
      }, 'EXISTS (SELECT 1 FROM stores WHERE id = ? AND status = ? AND pending_review = 0 AND updated_at = ?)', [id, nextStatus, stamp])
      const batch = await db.batch([
        db.prepare('UPDATE stores SET status = ?, pending_review = 0, updated_at = ? WHERE id = ? AND pending_review = 1 AND updated_at = ?').bind(nextStatus, stamp, id, input.expectedUpdatedAt), audit.statement
      ])
      if (batch[0]?.meta?.changes !== 1) throw new ApiProblem(409, 'STORE_REVIEW_CONFLICT', '门店审核状态刚刚被其他操作修改，请刷新后重试。')
      return { status: 200, body: { ok: true, updatedAt: stamp, message: input.approve ? '门店已生效，可接受注册。' : '门店审核未通过，已置为停用。' } }
    })
    return c.json(result.body, result.status as any)
  })

  return app
}
