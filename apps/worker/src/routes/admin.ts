import { Hono } from 'hono'
import { localBusinessDate } from '@bike-ops/domain'
import type { AuthContext } from '../auth/types.js'
import type { AppConfig, WorkerEnv } from '../env.js'
import { createAuthMiddleware } from '../auth/middleware.js'
import { all, camelRows, first } from '../db.js'
import { mapAuditEvent } from './audit.js'
import type { AuditModule } from '../services/business.js'
import { ApiProblem } from '../services/problems.js'

type Vars = { config: AppConfig; auth: AuthContext | null }

const AUDIT_MODULES = new Set<AuditModule>(['sales', 'closing', 'pickup', 'repair', 'resale', 'handover', 'account', 'system'])

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

export function adminRoutes() {
  const app = new Hono<{ Bindings: WorkerEnv; Variables: Vars }>()
  const auth = createAuthMiddleware()
  const platformRead = [auth.loadSession, auth.requirePasswordChanged, auth.requirePlatformAdmin] as const

  app.get('/api/v1/admin/overview', ...platformRead, async (c) => {
    const [regionCount, cityCount, storeCount, storeDisabledCount, userCount, members, pendingRoles, pendingTransfers, todayItems, recentAudit] = await Promise.all([
      first<{ n: number }>(c.env.DB.prepare("SELECT COUNT(*) AS n FROM regions WHERE status = 'active'")),
      first<{ n: number }>(c.env.DB.prepare("SELECT COUNT(*) AS n FROM cities WHERE status = 'active'")),
      first<{ n: number }>(c.env.DB.prepare("SELECT COUNT(*) AS n FROM stores WHERE status = 'active'")),
      first<{ n: number }>(c.env.DB.prepare("SELECT COUNT(*) AS n FROM stores WHERE status = 'disabled'")),
      first<{ n: number }>(c.env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE status = 'active'")),
      all<{ role: string; n: number }>(c.env.DB.prepare("SELECT role, COUNT(*) AS n FROM store_members WHERE status = 'active' GROUP BY role")),
      first<{ n: number }>(c.env.DB.prepare("SELECT COUNT(*) AS n FROM role_change_requests WHERE status = 'pending'")),
      first<{ n: number }>(c.env.DB.prepare("SELECT COUNT(*) AS n FROM store_transfer_requests WHERE status = 'pending'")),
      all<{ kind: string; n: number }>(c.env.DB.prepare("SELECT kind, COUNT(*) AS n FROM work_items WHERE business_date = ? AND deleted_at IS NULL GROUP BY kind").bind(localBusinessDate())),
      all(c.env.DB.prepare(`
        SELECT e.id, e.action, e.entity_type, e.entity_id, e.actor_name_snapshot, e.business_date,
               e.summary, e.reversible, e.audit_module, e.created_at,
               st.code AS store_code, st.name AS store_name
        FROM audit_events e JOIN stores st ON st.id = e.store_id
        ORDER BY e.created_at DESC, e.id DESC
        LIMIT 8
      `))
    ])
    return c.json({
      counts: {
        regions: regionCount?.n ?? 0,
        cities: cityCount?.n ?? 0,
        stores: storeCount?.n ?? 0,
        storesDisabled: storeDisabledCount?.n ?? 0,
        users: userCount?.n ?? 0,
        membersByRole: Object.fromEntries((members || []).map((row) => [row.role, row.n]))
      },
      pending: { roleRequests: pendingRoles?.n ?? 0, transferRequests: pendingTransfers?.n ?? 0 },
      todayItems: Object.fromEntries((todayItems || []).map((row) => [row.kind, row.n])),
      recentAudit: camelRows(recentAudit)
    })
  })

  app.get('/api/v1/admin/users', ...platformRead, async (c) => {
    const q = (c.req.query('q') ?? '').trim()
    const rows = await all(c.env.DB.prepare(`
      SELECT u.id, u.username_key, u.display_name, u.status, u.is_platform_admin,
             u.last_login_at, u.created_at,
             sm.store_id, st.code AS store_code, st.name AS store_name,
             sm.role AS member_role, sm.status AS member_status
      FROM users u
      LEFT JOIN store_members sm ON sm.user_id = u.id AND sm.status = 'active'
      LEFT JOIN stores st ON st.id = sm.store_id
      WHERE (? = '' OR u.display_name LIKE ? OR u.username_key LIKE ?)
      ORDER BY u.created_at ASC
      LIMIT 200
    `).bind(q, `%${q}%`, `%${q}%`))
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
        entry.memberships.push({
          storeId: row.store_id,
          storeCode: row.store_code,
          storeName: row.store_name,
          role: row.member_role,
          status: row.member_status
        })
      }
    }
    return c.json({ users: [...byUser.values()] })
  })

  app.get('/api/v1/admin/audit-events', ...platformRead, async (c) => {
    const { date, module, cursor, limit } = parseHistoryFilters((key) => c.req.query(key))
    const clauses: string[] = []
    const values: Array<string | number> = []
    if (date) { clauses.push('e.business_date = ?'); values.push(date) }
    if (module !== 'all') { clauses.push('e.audit_module = ?'); values.push(module) }
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

  return app
}
