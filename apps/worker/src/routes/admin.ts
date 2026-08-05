import { Hono } from 'hono'
import { localBusinessDate } from '@bike-ops/domain'
import { passwordSchema } from '@bike-ops/contracts'
import type { AuthContext } from '../auth/types.js'
import type { AppConfig, WorkerEnv } from '../env.js'
import { createAuthMiddleware } from '../auth/middleware.js'
import { all, camelRows, first, nowIso, uuid } from '../db.js'
import { mapAuditEvent } from './audit.js'
import { prepareAudit, prepareConditionalAudit } from '../services/business.js'
import type { AuditModule } from '../services/business.js'
import { ApiProblem } from '../services/problems.js'
import { hashPassword, randomToken } from '../lib/crypto.js'

type Vars = { config: AppConfig; auth: AuthContext | null }
type Role = 'operator' | 'manager' | 'admin'

const AUDIT_MODULES = new Set<AuditModule>(['sales', 'closing', 'pickup', 'repair', 'resale', 'handover', 'account', 'system'])
const ROLES = new Set<Role>(['operator', 'manager', 'admin'])

function requireContext(c: { get(key: 'auth'): AuthContext | null }): AuthContext {
  const context = c.get('auth')
  if (!context) throw new ApiProblem(401, 'UNAUTHENTICATED', '请重新登录。')
  return context
}

function normalizedUsername(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('zh-CN')
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
    const [regionCount, cityCount, storeCount, storeDisabledCount, storePendingCount, userCount, members, pendingRoles, pendingTransfers, todayNewStores, todayNewUsers, todayRoleApproved, todayTransferApproved, todayItems, newStores7d, newStores30d, newUsers7d, newUsers30d, roleStats7d, roleStats30d, recentAudit] = await Promise.all([
      first<{ n: number }>(c.env.DB.prepare("SELECT COUNT(*) AS n FROM regions WHERE status = 'active'")),
      first<{ n: number }>(c.env.DB.prepare("SELECT COUNT(*) AS n FROM cities WHERE status = 'active'")),
      first<{ n: number }>(c.env.DB.prepare("SELECT COUNT(*) AS n FROM stores WHERE status = 'active'")),
      first<{ n: number }>(c.env.DB.prepare("SELECT COUNT(*) AS n FROM stores WHERE status = 'disabled'")),
      first<{ n: number }>(c.env.DB.prepare("SELECT COUNT(*) AS n FROM stores WHERE pending_review = 1")),
      first<{ n: number }>(c.env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE status = 'active'")),
      all<{ role: string; n: number }>(c.env.DB.prepare("SELECT role, COUNT(*) AS n FROM store_members WHERE status = 'active' GROUP BY role")),
      first<{ n: number }>(c.env.DB.prepare("SELECT COUNT(*) AS n FROM role_change_requests WHERE status = 'pending'")),
      first<{ n: number }>(c.env.DB.prepare("SELECT COUNT(*) AS n FROM store_transfer_requests WHERE status = 'pending'")),
      first<{ n: number }>(c.env.DB.prepare('SELECT COUNT(*) AS n FROM stores WHERE created_at >= ?').bind(todayStart)),
      first<{ n: number }>(c.env.DB.prepare('SELECT COUNT(*) AS n FROM users WHERE created_at >= ?').bind(todayStart)),
      first<{ n: number }>(c.env.DB.prepare("SELECT COUNT(*) AS n FROM role_change_requests WHERE status = 'approved' AND decided_at >= ?").bind(todayStart)),
      first<{ n: number }>(c.env.DB.prepare("SELECT COUNT(*) AS n FROM store_transfer_requests WHERE status = 'approved' AND decided_at >= ?").bind(todayStart)),
      all<{ kind: string; n: number }>(c.env.DB.prepare('SELECT kind, COUNT(*) AS n FROM work_items WHERE created_at >= ? AND created_at < ? AND deleted_at IS NULL GROUP BY kind').bind(todayStart, tomorrowStartIso())),
      first<{ n: number }>(c.env.DB.prepare('SELECT COUNT(*) AS n FROM stores WHERE created_at >= ?').bind(d7)),
      first<{ n: number }>(c.env.DB.prepare('SELECT COUNT(*) AS n FROM stores WHERE created_at >= ?').bind(d30)),
      first<{ n: number }>(c.env.DB.prepare('SELECT COUNT(*) AS n FROM users WHERE created_at >= ?').bind(d7)),
      first<{ n: number }>(c.env.DB.prepare('SELECT COUNT(*) AS n FROM users WHERE created_at >= ?').bind(d30)),
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

    const [recentStores, recentUsers, recentRoleApproved, recentTransfers] = await Promise.all([
      all<{ id: string; name: string; code: string; created_at: string }>(c.env.DB.prepare('SELECT id, name, code, created_at FROM stores WHERE created_at >= ? ORDER BY created_at DESC LIMIT 4').bind(d30)),
      all<{ id: string; display_name: string; created_at: string }>(c.env.DB.prepare('SELECT id, display_name, created_at FROM users WHERE created_at >= ? ORDER BY created_at DESC LIMIT 4').bind(d30)),
      all<{ id: string; store_code: string; store_name: string; display_name: string; decided_at: string }>(c.env.DB.prepare(`
        SELECT rr.id, st.code AS store_code, st.name AS store_name, u.display_name, rr.decided_at
        FROM role_change_requests rr JOIN users u ON u.id = rr.user_id JOIN stores st ON st.id = rr.store_id
        WHERE rr.status = 'approved' AND rr.decided_at >= ? ORDER BY rr.decided_at DESC LIMIT 4
      `).bind(d30)),
      all<{ id: string; source_code: string; target_code: string; display_name: string; decided_at: string }>(c.env.DB.prepare(`
        SELECT tr.id, source.code AS source_code, target.code AS target_code, u.display_name, tr.decided_at
        FROM store_transfer_requests tr JOIN users u ON u.id = tr.user_id
        JOIN stores source ON source.id = tr.source_store_id JOIN stores target ON target.id = tr.target_store_id
        WHERE tr.status = 'approved' AND tr.decided_at >= ? ORDER BY tr.decided_at DESC LIMIT 4
      `).bind(d30))
    ])

    const recentChanges = [
      ...recentStores.map((row) => ({ type: 'new-store', id: row.id, storeCode: row.code, title: `新增门店：${row.code} ${row.name}`, at: row.created_at })),
      ...recentUsers.map((row) => ({ type: 'new-user', id: row.id, storeCode: null, title: `新增用户：${row.display_name}`, at: row.created_at })),
      ...recentRoleApproved.map((row) => ({ type: 'role-approved', id: row.id, storeCode: row.store_code, title: `角色批准：${row.display_name} @ ${row.store_code}`, at: row.decided_at })),
      ...recentTransfers.map((row) => ({ type: 'transfer-approved', id: row.id, storeCode: row.target_code, title: `调店批准：${row.display_name} ${row.source_code} → ${row.target_code}`, at: row.decided_at }))
    ].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 10)

    return c.json({
      counts: {
        regions: regionCount?.n ?? 0,
        cities: cityCount?.n ?? 0,
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
          d7: { total: (roleStats7d || []).reduce((sum, row) => sum + row.initiated, 0), byStore: camelRows(roleStats7d) },
          d30: { total: (roleStats30d || []).reduce((sum, row) => sum + row.initiated, 0), byStore: camelRows(roleStats30d) }
        }
      },
      recentChanges,
      recentAudit: camelRows(recentAudit)
    })
  })

  // ---- 门店详情（组织路径 / 成员 / 业务概览）----
  app.get('/api/v1/admin/stores/:storeId', ...platformRead, async (c) => {
    const storeId = String(c.req.param('storeId') ?? '')
    const store = await first<{ id: string; code: string; name: string; status: string; timezone: string; created_at: string; city_id: string | null; pending_review: number }>(c.env.DB.prepare('SELECT id, code, name, status, timezone, created_at, city_id, pending_review FROM stores WHERE id = ?').bind(storeId))
    if (!store) throw new ApiProblem(404, 'STORE_NOT_FOUND', '门店不存在。')
    const [path, members, todayItems, closing, memberCount] = await Promise.all([
      first<{ region_id: string; region_name: string; city_id: string; city_name: string }>(c.env.DB.prepare(`
        SELECT rg.id AS region_id, rg.name AS region_name, ct.id AS city_id, ct.name AS city_name
        FROM stores st JOIN cities ct ON ct.id = st.city_id JOIN regions rg ON rg.id = ct.region_id
        WHERE st.id = ?
      `).bind(storeId)),
      all<{ id: string; display_name: string; username_key: string; role: string; status: string; last_login_at: string | null; is_platform_admin: number }>(c.env.DB.prepare(`
        SELECT u.id, u.display_name, u.username_key, sm.role, u.status, u.last_login_at, u.is_platform_admin
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
      path: path ? { regionId: path.region_id, regionName: path.region_name, cityId: path.city_id, cityName: path.city_name } : null,
      members: members.map((row) => ({ id: row.id, displayName: row.display_name, username: row.username_key, role: row.role, status: row.status, lastLoginAt: row.last_login_at, isPlatformAdmin: row.is_platform_admin === 1 })),
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
    values.push(limit)
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
    const rows = await all(c.env.DB.prepare(sql).bind(...values))
    const last = rows[rows.length - 1]
    return c.json({ requests: camelRows(rows), nextCursor: rows.length === limit && last ? `${last.created_at}|${last.id}` : null })
  })

  // ---- 轻量待审批计数（供门店工作台角标轮询）----
  app.get('/api/v1/admin/pending-count', ...platformRead, async (c) => {
    const [roleRequests, transferRequests, storesPending] = await Promise.all([
      first<{ n: number }>(c.env.DB.prepare("SELECT COUNT(*) AS n FROM role_change_requests WHERE status = 'pending'")),
      first<{ n: number }>(c.env.DB.prepare("SELECT COUNT(*) AS n FROM store_transfer_requests WHERE status = 'pending'")),
      first<{ n: number }>(c.env.DB.prepare("SELECT COUNT(*) AS n FROM stores WHERE pending_review = 1"))
    ])
    return c.json({ roleRequests: roleRequests?.n ?? 0, transferRequests: transferRequests?.n ?? 0, storesPending: storesPending?.n ?? 0 })
  })

  // ---- 用户列表（q / storeId 过滤）----
  app.get('/api/v1/admin/users', ...platformRead, async (c) => {
    const q = (c.req.query('q') ?? '').trim()
    const storeId = (c.req.query('storeId') ?? '').trim()
    const clauses: string[] = ["(? = '' OR u.display_name LIKE ? OR u.username_key LIKE ?)"]
    const values: Array<string | number> = [q, `%${q}%`, `%${q}%`]
    if (storeId) { clauses.push('sm.store_id = ?'); values.push(storeId) }
    values.push(200)
    const rows = await all(c.env.DB.prepare(`
      SELECT u.id, u.username_key, u.display_name, u.status, u.is_platform_admin,
             u.last_login_at, u.created_at,
             sm.store_id, st.code AS store_code, st.name AS store_name,
             sm.role AS member_role, sm.status AS member_status
      FROM users u
      LEFT JOIN store_members sm ON sm.user_id = u.id AND sm.status = 'active'
      LEFT JOIN stores st ON st.id = sm.store_id
      WHERE ${clauses.join(' AND ')}
      ORDER BY u.created_at ASC
      LIMIT ?
    `).bind(...values))
    const byUser = new Map<string, {
      id: string; username: string; displayName: string; status: string; isPlatformAdmin: boolean
      lastLoginAt: string | null; createdAt: string; memberships: Array<{ storeId: string; storeCode: string; storeName: string; role: string; status: string }>
    }>()
    for (const row of rows) {
      let entry = byUser.get(row.id)
      if (!entry) {
        entry = {
          id: row.id,
          username: row.username_key,
          displayName: row.display_name,
          status: row.status,
          isPlatformAdmin: row.is_platform_admin === 1,
          lastLoginAt: row.last_login_at,
          createdAt: row.created_at,
          memberships: []
        }
        byUser.set(row.id, entry)
      }
      if (row.store_id && row.member_role) {
        entry.memberships.push({ storeId: row.store_id, storeCode: row.store_code, storeName: row.store_name, role: row.member_role, status: row.member_status })
      }
    }
    return c.json({ users: [...byUser.values()] })
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
    values.push(limit)
    const rows = await all(c.env.DB.prepare(`
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
    const events = rows.map((row) => ({ ...mapAuditEvent(row), storeCode: row.store_code, storeName: row.store_name }))
    const last = rows[rows.length - 1]
    return c.json({ events, nextCursor: rows.length === limit && last ? `${last.created_at}|${last.id}` : null })
  })

  // ---- 创建账号（CHU13 专属，可直授 operator/manager/admin）----
  app.post('/api/v1/admin/users', ...platformWrite, async (c) => {
    const context = requireContext(c)
    const body = await c.req.json() as { username?: string; displayName?: string; storeId?: string; role?: string; password?: string }
    const username = normalizedUsername(String(body.username ?? ''))
    const displayName = String(body.displayName ?? '').trim()
    const role = String(body.role ?? '')
    const storeId = String(body.storeId ?? '')
    if (!username || username.length > 64) throw new ApiProblem(400, 'INVALID_USERNAME', '登录名无效。')
    if (!displayName || displayName.length > 80) throw new ApiProblem(400, 'INVALID_DISPLAY_NAME', '姓名无效。')
    if (!ROLES.has(role as Role)) throw new ApiProblem(400, 'INVALID_ROLE', '角色无效。')
    const nextPassword = passwordSchema.parse(String(body.password ?? ''))
    const [existing, store] = await Promise.all([
      first<{ id: string }>(c.env.DB.prepare('SELECT id FROM users WHERE username_key = ?').bind(username)),
      first<{ id: string; code: string; name: string; timezone: string }>(c.env.DB.prepare("SELECT id, code, name, timezone FROM stores WHERE id = ? AND status = 'active'").bind(storeId))
    ])
    if (existing) throw new ApiProblem(409, 'USERNAME_TAKEN', '该登录名已被占用。')
    if (!store) throw new ApiProblem(409, 'STORE_NOT_ACTIVE', '目标门店不存在或未生效。')
    const passwordHash = await hashPassword(nextPassword, c.get('config').PASSWORD_PEPPER)
    const userId = uuid()
    const membershipId = uuid()
    const stamp = nowIso()
    const storeForAudit = { id: store.id, code: store.code, name: store.name, timezone: store.timezone }
    const audit = prepareConditionalAudit(c.env.DB, {
      context: { ...context, storeId: store.id, storeCode: store.code, storeName: store.name, storeTimezone: store.timezone },
      action: 'admin-create-user', entityType: 'account', entityId: userId,
      businessDate: localBusinessDate(store.timezone),
      summary: `平台创建账号：${displayName}（${username} @ ${store.code}，${role}）`,
      after: { username, displayName, storeId: store.id, role }, reversible: false
    }, 'EXISTS (SELECT 1 FROM users WHERE id = ?)', [userId])
    const result = await c.env.DB.batch([
      c.env.DB.prepare('INSERT INTO users (id, username_key, display_name, password_hash, status, must_change_password, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)')
        .bind(userId, username, displayName, passwordHash, 'active', stamp, stamp),
      c.env.DB.prepare('INSERT INTO store_members (id, store_id, user_id, role, status, effective_from, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(membershipId, store.id, userId, role, 'active', stamp, stamp),
      audit.statement
    ])
    if (result[0]?.meta?.changes !== 1 || result[1]?.meta?.changes !== 1) throw new ApiProblem(409, 'USER_CREATE_CONFLICT', '创建账号冲突，请重试。')
    return c.json({ ok: true, id: userId }, 201)
  })

  // ---- 禁用 / 恢复账号（禁用时立即撤销会话）----
  app.patch('/api/v1/admin/users/:id', ...platformWrite, async (c) => {
    const context = requireContext(c)
    const id = String(c.req.param('id') ?? '')
    const body = await c.req.json() as { status?: string }
    const status = String(body.status ?? '')
    if (status !== 'active' && status !== 'disabled') throw new ApiProblem(400, 'INVALID_STATUS', '状态无效。')
    const target = await first<{ id: string; display_name: string; is_platform_admin: number; status: string; updated_at: string }>(c.env.DB.prepare('SELECT id, display_name, is_platform_admin, status, updated_at FROM users WHERE id = ?').bind(id))
    if (!target) throw new ApiProblem(404, 'USER_NOT_FOUND', '账号不存在。')
    if (target.is_platform_admin === 1) throw new ApiProblem(409, 'PLATFORM_ADMIN_PROTECTED', '不能禁用平台管理员账号。')
    const stamp = nowIso()
    const audit = prepareConditionalAudit(c.env.DB, {
      context, action: status === 'disabled' ? 'admin-disable-user' : 'admin-enable-user', entityType: 'account', entityId: id,
      businessDate: localBusinessDate(context.storeTimezone),
      summary: `${status === 'disabled' ? '禁用' : '恢复'}账号：${target.display_name}`,
      before: { status: target.status }, after: { status }, reversible: false
    }, 'EXISTS (SELECT 1 FROM users WHERE id = ? AND status = ? AND updated_at = ?)', [id, status, stamp])
    const statements = [
      c.env.DB.prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ? AND is_platform_admin = 0').bind(status, stamp, id),
      audit.statement
    ]
    if (status === 'disabled') {
      statements.splice(1, 0, c.env.DB.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').bind(stamp, id))
    }
    const result = await c.env.DB.batch(statements)
    if (result[0]?.meta?.changes !== 1) throw new ApiProblem(409, 'USER_STATUS_CONFLICT', '账号状态刚刚被其他操作修改。')
    return c.json({ ok: true, message: status === 'disabled' ? '账号已禁用，其会话已立即失效。' : '账号已恢复，可重新登录。' })
  })

  // ---- 重置密码（一次性临时密码，强制下次改密）----
  app.post('/api/v1/admin/users/:id/reset-password', ...platformWrite, async (c) => {
    const context = requireContext(c)
    const id = String(c.req.param('id') ?? '')
    const target = await first<{ id: string; display_name: string; status: string }>(c.env.DB.prepare('SELECT id, display_name, status FROM users WHERE id = ?').bind(id))
    if (!target) throw new ApiProblem(404, 'USER_NOT_FOUND', '账号不存在。')
    if (target.status !== 'active') throw new ApiProblem(409, 'USER_NOT_ACTIVE', '仅生效账号可重置密码。')
    const tempPassword = randomToken(12)
    const passwordHash = await hashPassword(tempPassword, c.get('config').PASSWORD_PEPPER)
    const stamp = nowIso()
    const audit = prepareConditionalAudit(c.env.DB, {
      context, action: 'admin-reset-password', entityType: 'account', entityId: id,
      businessDate: localBusinessDate(context.storeTimezone),
      summary: `平台重置密码：${target.display_name}`,
      after: { mustChangePassword: true }, reversible: false
    }, 'EXISTS (SELECT 1 FROM users WHERE id = ? AND must_change_password = 1 AND updated_at = ?)', [id, stamp])
    const result = await c.env.DB.batch([
      c.env.DB.prepare('UPDATE users SET password_hash = ?, must_change_password = 1, updated_at = ? WHERE id = ?').bind(passwordHash, stamp, id),
      c.env.DB.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').bind(stamp, id),
      audit.statement
    ])
    if (result[0]?.meta?.changes !== 1) throw new ApiProblem(409, 'PASSWORD_RESET_CONFLICT', '重置密码冲突，请重试。')
    return c.json({ ok: true, tempPassword, message: '临时密码仅显示一次，请立即转交给对方；下次登录将强制修改。' })
  })

  // ---- 门店审核（pending → active / disabled）----
  app.post('/api/v1/admin/stores/:id/decision', ...platformWrite, async (c) => {
    const context = requireContext(c)
    const id = String(c.req.param('id') ?? '')
    const body = await c.req.json() as { approve?: boolean; reason?: string }
    const approve = body.approve === true
    const reason = String(body.reason ?? '').trim().slice(0, 500)
    const store = await first<{ id: string; code: string; name: string; status: string; timezone: string; updated_at: string; pending_review: number }>(c.env.DB.prepare('SELECT id, code, name, status, timezone, updated_at, pending_review FROM stores WHERE id = ?').bind(id))
    if (!store) throw new ApiProblem(404, 'STORE_NOT_FOUND', '门店不存在。')
    if (store.pending_review !== 1) throw new ApiProblem(409, 'STORE_NOT_PENDING', '该门店不在待审核状态。')
    const nextStatus = approve ? 'active' : 'disabled'
    const stamp = nowIso()
    const audit = prepareConditionalAudit(c.env.DB, {
      context: { ...context, storeId: store.id, storeCode: store.code, storeName: store.name, storeTimezone: store.timezone },
      action: approve ? 'admin-approve-store' : 'admin-reject-store', entityType: 'store', entityId: id,
      businessDate: localBusinessDate(store.timezone),
      summary: `${approve ? '批准' : '拒绝'}门店审核：${store.code} ${store.name}${reason ? `（${reason}）` : ''}`,
      before: { status: 'pending' }, after: { status: nextStatus, reason: reason || undefined }, reversible: false
    }, 'EXISTS (SELECT 1 FROM stores WHERE id = ? AND status = ? AND pending_review = 0 AND updated_at = ?)', [id, nextStatus, stamp])
    const result = await c.env.DB.batch([
      c.env.DB.prepare('UPDATE stores SET status = ?, pending_review = 0, updated_at = ? WHERE id = ? AND pending_review = 1').bind(nextStatus, stamp, id),
      audit.statement
    ])
    if (result[0]?.meta?.changes !== 1) throw new ApiProblem(409, 'STORE_REVIEW_CONFLICT', '门店审核状态刚刚被其他操作修改。')
    return c.json({ ok: true, message: approve ? '门店已生效，可接受注册。' : '门店审核未通过，已置为停用。' })
  })

  return app
}
