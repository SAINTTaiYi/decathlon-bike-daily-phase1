import { Hono } from 'hono'
import { decisionSchema, directoryEntitySchema, roleChangeRequestSchema, storeTransferRequestSchema } from '@bike-ops/contracts'
import { localBusinessDate } from '@bike-ops/domain'
import type { AuthContext } from '../auth/types.js'
import type { AppConfig, WorkerEnv } from '../env.js'
import { createAuthMiddleware } from '../auth/middleware.js'
import { all, camelRow, camelRows, first, nowIso, uuid } from '../db.js'
import { prepareAudit, prepareConditionalAudit } from '../services/business.js'
import { ApiProblem } from '../services/problems.js'

type Vars = { config: AppConfig; auth: AuthContext | null }
type Role = 'operator' | 'manager' | 'admin'

const ROLE_RANK: Record<Role, number> = { operator: 0, manager: 1, admin: 2 }
const REQUEST_TTL_MS = 7 * 24 * 60 * 60 * 1000

function requireContext(c: { get(key: 'auth'): AuthContext | null }): AuthContext {
  const context = c.get('auth')
  if (!context) throw new ApiProblem(401, 'UNAUTHENTICATED', '请重新登录。')
  return context
}

async function currentMembership(db: D1Database, userId: string) {
  return first<{ id: string; store_id: string; role: Role; store_code: string; store_name: string; timezone: string }>(db.prepare(`
    SELECT sm.id, sm.store_id, sm.role, st.code AS store_code, st.name AS store_name, st.timezone
    FROM store_members sm JOIN stores st ON st.id = sm.store_id
    WHERE sm.user_id = ? AND sm.status = 'active' AND st.status = 'active'
    LIMIT 1
  `).bind(userId))
}

async function storeSummary(db: D1Database, storeId: string) {
  return first<{ id: string; code: string; name: string; timezone: string }>(db.prepare('SELECT id, code, name, timezone FROM stores WHERE id = ? AND status = ?').bind(storeId, 'active'))
}

function auditContext(context: AuthContext, store: { id: string; code: string; name: string; timezone: string }): AuthContext {
  return { ...context, storeId: store.id, storeCode: store.code, storeName: store.name, storeTimezone: store.timezone }
}

function normalizedName(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('zh-CN')
}

async function activeParentExists(db: D1Database, table: 'regions' | 'cities', id: string): Promise<boolean> {
  return Boolean(await first<{ id: string }>(db.prepare(`SELECT id FROM ${table} WHERE id = ? AND status = 'active'`).bind(id)))
}

async function directoryPayload(db: D1Database, includeDisabled: boolean) {
  // CHU13 must see newly created empty regions/cities to continue building the directory.
  // The public registration endpoint stays separately restricted to active full store paths.
  const rows = await all<{
    region_id: string; region_name: string; region_status: string
    city_id: string | null; city_name: string | null; city_status: string | null
    store_id: string | null; store_code: string | null; store_name: string | null; store_status: string | null
  }>(db.prepare(`
    SELECT rg.id AS region_id, rg.name AS region_name, rg.status AS region_status,
           ct.id AS city_id, ct.name AS city_name, ct.status AS city_status,
           st.id AS store_id, st.code AS store_code, st.name AS store_name, st.status AS store_status
    FROM regions rg
    LEFT JOIN cities ct ON ct.region_id = rg.id ${includeDisabled ? '' : "AND ct.status = 'active'"}
    LEFT JOIN stores st ON st.city_id = ct.id ${includeDisabled ? '' : "AND st.status = 'active'"}
    ${includeDisabled ? '' : "WHERE rg.status = 'active'"}
    ORDER BY rg.sort_order, rg.name, ct.sort_order, ct.name, st.code
  `))
  const regions = new Map<string, { id: string; name: string; status: string; cities: Map<string, { id: string; name: string; status: string; stores: Array<{ id: string; code: string; name: string; status: string }> }> }>()
  for (const row of rows) {
    if (!regions.has(row.region_id)) regions.set(row.region_id, { id: row.region_id, name: row.region_name, status: row.region_status, cities: new Map() })
    if (!row.city_id || !row.city_name || !row.city_status) continue
    const region = regions.get(row.region_id)!
    if (!region.cities.has(row.city_id)) region.cities.set(row.city_id, { id: row.city_id, name: row.city_name, status: row.city_status, stores: [] })
    if (row.store_id && row.store_code && row.store_name && row.store_status) {
      region.cities.get(row.city_id)!.stores.push({ id: row.store_id, code: row.store_code, name: row.store_name, status: row.store_status })
    }
  }
  return [...regions.values()].map((region) => ({ ...region, cities: [...region.cities.values()] }))
}

export function governanceRoutes() {
  const app = new Hono<{ Bindings: WorkerEnv; Variables: Vars }>()
  const auth = createAuthMiddleware()
  const protectedRead = [auth.loadSession, auth.requirePasswordChanged]
  const protectedWrite = [auth.loadSession, auth.requirePasswordChanged, auth.requireCsrf]

  app.get('/api/v1/governance/overview', ...protectedRead, async (c) => {
    const context = requireContext(c)
    const [roleRequests, transferRequests, directory] = await Promise.all([
      context.isPlatformAdmin
        ? all(c.env.DB.prepare(`
          SELECT rr.id, rr.user_id, u.display_name AS user_name, rr.store_id, st.code AS store_code, st.name AS store_name,
                 rr.from_role, rr.target_role, rr.reason, rr.status, rr.revision, rr.expires_at, rr.created_at
          FROM role_change_requests rr JOIN users u ON u.id = rr.user_id JOIN stores st ON st.id = rr.store_id
          WHERE rr.status = 'pending' ORDER BY rr.created_at ASC
        `))
        : all(c.env.DB.prepare(`
          SELECT id, user_id, store_id, from_role, target_role, reason, status, revision, expires_at, created_at
          FROM role_change_requests WHERE requested_by = ? ORDER BY created_at DESC
        `).bind(context.userId)),
      context.isPlatformAdmin || context.role === 'admin'
        ? all(c.env.DB.prepare(`
          SELECT tr.id, tr.user_id, u.display_name AS user_name, tr.source_store_id, source.code AS source_store_code, source.name AS source_store_name,
                 tr.target_store_id, target.code AS target_store_code, target.name AS target_store_name,
                 tr.reason, tr.status, tr.revision, tr.expires_at, tr.created_at
          FROM store_transfer_requests tr
          JOIN users u ON u.id = tr.user_id
          JOIN stores source ON source.id = tr.source_store_id
          JOIN stores target ON target.id = tr.target_store_id
          WHERE tr.status = 'pending' AND (${context.isPlatformAdmin ? '1 = 1' : 'tr.target_store_id = ?'})
          ORDER BY tr.created_at ASC
        `).bind(...(context.isPlatformAdmin ? [] : [context.storeId])))
        : all(c.env.DB.prepare(`
          SELECT id, user_id, source_store_id, target_store_id, reason, status, revision, expires_at, created_at
          FROM store_transfer_requests WHERE user_id = ? ORDER BY created_at DESC
        `).bind(context.userId)),
      context.isPlatformAdmin ? directoryPayload(c.env.DB, true) : directoryPayload(c.env.DB, false)
    ])
    return c.json({
      actor: { isPlatformAdmin: context.isPlatformAdmin, role: context.role, storeId: context.storeId },
      directory,
      roleRequests: camelRows(roleRequests),
      transferRequests: camelRows(transferRequests)
    })
  })

  app.post('/api/v1/governance/role-requests', ...protectedWrite, async (c) => {
    const context = requireContext(c)
    const input = roleChangeRequestSchema.parse(await c.req.json())
    if (input.userId && input.userId !== context.userId && !context.isPlatformAdmin) throw new ApiProblem(403, 'FORBIDDEN', '只能为本人申请角色提权。')
    const userId = input.userId ?? context.userId
    const membership = await currentMembership(c.env.DB, userId)
    if (!membership) throw new ApiProblem(409, 'NO_ACTIVE_MEMBERSHIP', '目标账号没有有效门店成员关系。')
    if (ROLE_RANK[input.targetRole] <= ROLE_RANK[membership.role]) throw new ApiProblem(400, 'ROLE_CHANGE_NOT_ELEVATION', '只能申请高于当前角色的权限。')
    const existing = await first<{ id: string }>(c.env.DB.prepare(`SELECT id FROM role_change_requests WHERE user_id = ? AND store_id = ? AND status = 'pending'`).bind(userId, membership.store_id))
    if (existing) throw new ApiProblem(409, 'ROLE_REQUEST_ALREADY_PENDING', '该账号已有待审批的角色申请。')
    const id = uuid()
    const stamp = nowIso()
    const store = { id: membership.store_id, code: membership.store_code, name: membership.store_name, timezone: membership.timezone }
    const audit = prepareAudit(c.env.DB, {
      context: auditContext(context, store), action: 'request-role-elevation', entityType: 'role-change-request', entityId: id,
      businessDate: localBusinessDate(store.timezone), summary: `申请角色提权：${membership.role} → ${input.targetRole}`,
      after: { userId, fromRole: membership.role, targetRole: input.targetRole, reason: input.reason }, reversible: false
    })
    await c.env.DB.batch([
      c.env.DB.prepare(`INSERT INTO role_change_requests (id, user_id, store_id, requested_by, from_role, target_role, reason, status, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`)
        .bind(id, userId, membership.store_id, context.userId, membership.role, input.targetRole, input.reason, new Date(Date.now() + REQUEST_TTL_MS).toISOString(), stamp, stamp),
      audit.statement
    ])
    return c.json({ ok: true, id, message: '角色提权申请已提交，等待 CHU13 审批。' }, 201)
  })

  app.post('/api/v1/governance/role-requests/:id/decision', ...protectedWrite, auth.requirePlatformAdmin, async (c) => {
    const context = requireContext(c)
    const input = decisionSchema.parse(await c.req.json())
    const request = await first<{ id: string; user_id: string; store_id: string; from_role: Role; target_role: 'manager' | 'admin'; status: string; revision: number; expires_at: string; store_code: string; store_name: string; timezone: string }>(c.env.DB.prepare(`
      SELECT rr.*, st.code AS store_code, st.name AS store_name, st.timezone
      FROM role_change_requests rr JOIN stores st ON st.id = rr.store_id WHERE rr.id = ?
    `).bind(c.req.param('id')))
    if (!request || request.status !== 'pending' || request.revision !== input.expectedRevision || Date.parse(request.expires_at) <= Date.now()) throw new ApiProblem(409, 'ROLE_REQUEST_NOT_ACTIONABLE', '该角色申请已过期、已处理或已更新。')
    const membership = await first<{ id: string; role: Role }>(c.env.DB.prepare(`SELECT id, role FROM store_members WHERE user_id = ? AND store_id = ? AND status = 'active'`).bind(request.user_id, request.store_id))
    if (!membership || membership.role !== request.from_role || ROLE_RANK[request.target_role] <= ROLE_RANK[membership.role]) throw new ApiProblem(409, 'ROLE_REQUEST_MEMBERSHIP_CHANGED', '目标账号的门店关系或角色已变化，不能继续审批。')
    const stamp = nowIso()
    const nextStatus = input.approve ? 'approved' : 'rejected'
    const nextRevision = input.expectedRevision + 1
    const statePredicate = `EXISTS (
      SELECT 1 FROM role_change_requests
      WHERE id = ? AND status = ? AND revision = ? AND decided_by = ?
    )`
    const stateValues: Array<string | number | null> = [request.id, nextStatus, nextRevision, context.userId]
    const store = { id: request.store_id, code: request.store_code, name: request.store_name, timezone: request.timezone }
    const audit = prepareConditionalAudit(c.env.DB, {
      context: auditContext(context, store), action: input.approve ? 'approve-role-elevation' : 'reject-role-elevation', entityType: 'role-change-request', entityId: request.id,
      businessDate: localBusinessDate(store.timezone), summary: `${input.approve ? '批准' : '拒绝'}角色提权：${request.from_role} → ${request.target_role}`,
      before: { role: membership.role }, after: { approved: input.approve, reason: input.reason, targetRole: request.target_role }, reversible: false
    }, statePredicate, stateValues)
    const decisionGuard = `
      EXISTS (
        SELECT 1 FROM store_members
        WHERE id = ? AND user_id = ? AND store_id = ? AND role = ? AND status = 'active'
      )
    `
    const statements = [
      c.env.DB.prepare(`
        UPDATE role_change_requests
        SET status = ?, decision_reason = ?, decided_by = ?, decided_at = ?, revision = revision + 1, updated_at = ?
        WHERE id = ? AND status = 'pending' AND revision = ? AND expires_at > ? AND ${decisionGuard}
      `).bind(nextStatus, input.reason, context.userId, stamp, stamp, request.id, input.expectedRevision, stamp, membership.id, request.user_id, request.store_id, request.from_role)
    ]
    if (input.approve) {
      statements.push(
        c.env.DB.prepare(`UPDATE store_members SET role = ? WHERE id = ? AND status = 'active' AND ${statePredicate}`).bind(request.target_role, membership.id, ...stateValues),
        c.env.DB.prepare(`UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL AND ${statePredicate}`).bind(stamp, request.user_id, ...stateValues)
      )
    }
    statements.push(audit.statement)
    const result = await c.env.DB.batch(statements)
    if (result[0]?.meta?.changes !== 1) throw new ApiProblem(409, 'ROLE_REQUEST_NOT_ACTIONABLE', '该角色申请刚刚被其他操作处理。')
    return c.json({ ok: true, message: input.approve ? '角色提权已批准，目标账号需要重新登录。' : '角色提权申请已拒绝。' })
  })

  app.post('/api/v1/governance/transfer-requests', ...protectedWrite, async (c) => {
    const context = requireContext(c)
    const input = storeTransferRequestSchema.parse(await c.req.json())
    if (input.targetStoreId === context.storeId) throw new ApiProblem(400, 'TRANSFER_SAME_STORE', '目标门店不能与当前门店相同。')
    const target = await storeSummary(c.env.DB, input.targetStoreId)
    if (!target) throw new ApiProblem(409, 'TARGET_STORE_NOT_AVAILABLE', '目标门店不可用。')
    const hasTargetAdmin = await first<{ id: string }>(c.env.DB.prepare(`SELECT id FROM store_members WHERE store_id = ? AND status = 'active' AND role = 'admin' LIMIT 1`).bind(target.id))
    if (!hasTargetAdmin) throw new ApiProblem(409, 'TARGET_STORE_ADMIN_REQUIRED', '目标门店暂无有效管理员，无法审批调动。')
    const existing = await first<{ id: string }>(c.env.DB.prepare(`SELECT id FROM store_transfer_requests WHERE user_id = ? AND status = 'pending'`).bind(context.userId))
    if (existing) throw new ApiProblem(409, 'TRANSFER_ALREADY_PENDING', '当前账号已有待审批的调店申请。')
    const id = uuid()
    const stamp = nowIso()
    const audit = prepareAudit(c.env.DB, {
      context, action: 'request-store-transfer', entityType: 'store-transfer-request', entityId: id, businessDate: localBusinessDate(context.storeTimezone),
      summary: `申请调店：${context.storeName} → ${target.name}`, after: { sourceStoreId: context.storeId, targetStoreId: target.id, reason: input.reason }, reversible: false
    })
    await c.env.DB.batch([
      c.env.DB.prepare(`INSERT INTO store_transfer_requests (id, user_id, source_store_id, target_store_id, reason, status, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`)
        .bind(id, context.userId, context.storeId, target.id, input.reason, new Date(Date.now() + REQUEST_TTL_MS).toISOString(), stamp, stamp),
      audit.statement
    ])
    return c.json({ ok: true, id, message: '调店申请已发送给目标门店管理员。' }, 201)
  })

  app.post('/api/v1/governance/transfer-requests/:id/decision', ...protectedWrite, async (c) => {
    const context = requireContext(c)
    const input = decisionSchema.parse(await c.req.json())
    const request = await first<{ id: string; user_id: string; source_store_id: string; target_store_id: string; status: string; revision: number; expires_at: string; target_code: string; target_name: string; target_timezone: string }>(c.env.DB.prepare(`
      SELECT tr.*, target.code AS target_code, target.name AS target_name, target.timezone AS target_timezone
      FROM store_transfer_requests tr JOIN stores target ON target.id = tr.target_store_id AND target.status = 'active' WHERE tr.id = ?
    `).bind(c.req.param('id')))
    if (!request || request.status !== 'pending' || request.revision !== input.expectedRevision || Date.parse(request.expires_at) <= Date.now()) throw new ApiProblem(409, 'TRANSFER_NOT_ACTIONABLE', '该调店申请已过期、已处理或已更新。')
    const approver = await first<{ id: string }>(c.env.DB.prepare(`SELECT id FROM store_members WHERE user_id = ? AND store_id = ? AND status = 'active' AND role = 'admin' LIMIT 1`).bind(context.userId, request.target_store_id))
    if (!approver) throw new ApiProblem(403, 'TARGET_STORE_ADMIN_REQUIRED', '只有目标门店的有效管理员可以审批调店。')
    const member = await first<{ id: string }>(c.env.DB.prepare(`SELECT id FROM store_members WHERE user_id = ? AND store_id = ? AND status = 'active'`).bind(request.user_id, request.source_store_id))
    if (!member) throw new ApiProblem(409, 'TRANSFER_SOURCE_CHANGED', '申请人的原门店关系已变化，不能继续审批。')
    const stamp = nowIso()
    const nextStatus = input.approve ? 'approved' : 'rejected'
    const nextRevision = input.expectedRevision + 1
    const targetMembershipId = input.approve ? uuid() : null
    const decisionPredicate = `EXISTS (
      SELECT 1 FROM store_transfer_requests
      WHERE id = ? AND status = ? AND revision = ? AND decided_by = ?
    )`
    const decisionValues: Array<string | number | null> = [request.id, nextStatus, nextRevision, context.userId]
    const target = { id: request.target_store_id, code: request.target_code, name: request.target_name, timezone: request.target_timezone }
    const auditPredicate = input.approve
      ? `${decisionPredicate} AND EXISTS (SELECT 1 FROM store_members WHERE id = ? AND user_id = ? AND store_id = ? AND role = 'operator' AND status = 'active')`
      : decisionPredicate
    const auditValues = input.approve
      ? [...decisionValues, targetMembershipId!, request.user_id, request.target_store_id]
      : decisionValues
    const audit = prepareConditionalAudit(c.env.DB, {
      context: auditContext(context, target), action: input.approve ? 'approve-store-transfer' : 'reject-store-transfer', entityType: 'store-transfer-request', entityId: request.id,
      businessDate: localBusinessDate(target.timezone), summary: `${input.approve ? '批准' : '拒绝'}调店申请`,
      before: { sourceStoreId: request.source_store_id }, after: { targetStoreId: request.target_store_id, approved: input.approve, reason: input.reason, targetRole: input.approve ? 'operator' : undefined }, reversible: false
    }, auditPredicate, auditValues)
    const decisionGuard = `
      EXISTS (SELECT 1 FROM store_members WHERE id = ? AND user_id = ? AND store_id = ? AND status = 'active')
      AND EXISTS (SELECT 1 FROM store_members WHERE id = ? AND user_id = ? AND store_id = ? AND role = 'admin' AND status = 'active')
    `
    const statements = [
      c.env.DB.prepare(`
        UPDATE store_transfer_requests
        SET status = ?, decision_reason = ?, decided_by = ?, decided_at = ?, revision = revision + 1, updated_at = ?
        WHERE id = ? AND status = 'pending' AND revision = ? AND expires_at > ? AND ${decisionGuard}
      `).bind(nextStatus, input.reason, context.userId, stamp, stamp, request.id, input.expectedRevision, stamp, member.id, request.user_id, request.source_store_id, approver.id, context.userId, request.target_store_id)
    ]
    if (input.approve) {
      statements.push(
        c.env.DB.prepare(`UPDATE store_members SET status = 'inactive', effective_to = ?, ended_by = ?, end_reason = ? WHERE id = ? AND status = 'active' AND ${decisionPredicate}`)
          .bind(stamp, context.userId, `调店至 ${target.name}`, member.id, ...decisionValues),
        c.env.DB.prepare(`
          INSERT INTO store_members (id, store_id, user_id, role, status, effective_from, created_at)
          SELECT ?, ?, ?, 'operator', 'active', ?, ?
          WHERE EXISTS (SELECT 1 FROM store_members WHERE id = ? AND status = 'inactive' AND effective_to = ? AND ended_by = ?)
            AND ${decisionPredicate}
        `).bind(targetMembershipId!, target.id, request.user_id, stamp, stamp, member.id, stamp, context.userId, ...decisionValues),
        c.env.DB.prepare(`UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL AND EXISTS (SELECT 1 FROM store_members WHERE id = ? AND status = 'active')`)
          .bind(stamp, request.user_id, targetMembershipId!)
      )
    }
    statements.push(audit.statement)
    const result = await c.env.DB.batch(statements)
    if (result[0]?.meta?.changes !== 1) throw new ApiProblem(409, 'TRANSFER_NOT_ACTIONABLE', '该调店申请刚刚被其他操作处理。')
    return c.json({ ok: true, message: input.approve ? '调店已批准，申请人已转为目标门店操作员并需要重新登录。' : '调店申请已拒绝。' })
  })

  app.post('/api/v1/governance/directory/:kind', ...protectedWrite, auth.requirePlatformAdmin, async (c) => {
    const context = requireContext(c)
    const kind = c.req.param('kind')
    const input = directoryEntitySchema.parse(await c.req.json())
    const stamp = nowIso()
    if (kind === 'regions') {
      const id = uuid()
      const audit = prepareAudit(c.env.DB, { context, action: 'create-directory-region', entityType: 'region', entityId: id, businessDate: localBusinessDate(context.storeTimezone), summary: `新增区域：${input.name}`, after: { status: input.status ?? 'active' }, reversible: false })
      await c.env.DB.batch([
        c.env.DB.prepare(`INSERT INTO regions (id, name, normalized_name, status, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)`)
          .bind(id, input.name, input.name.normalize('NFKC').trim().toLocaleLowerCase('zh-CN'), input.status ?? 'active', stamp, stamp), audit.statement
      ])
      return c.json({ ok: true, id }, 201)
    }
    if (kind === 'cities') {
      if (!input.parentId) throw new ApiProblem(400, 'REGION_REQUIRED', '请选择所属区域。')
      if (!await activeParentExists(c.env.DB, 'regions', input.parentId)) throw new ApiProblem(409, 'REGION_NOT_AVAILABLE', '所属区域不可用。')
      const id = uuid()
      const audit = prepareAudit(c.env.DB, { context, action: 'create-directory-city', entityType: 'city', entityId: id, businessDate: localBusinessDate(context.storeTimezone), summary: `新增城市：${input.name}`, after: { regionId: input.parentId, status: input.status ?? 'active' }, reversible: false })
      await c.env.DB.batch([
        c.env.DB.prepare(`INSERT INTO cities (id, region_id, name, normalized_name, status, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)`)
          .bind(id, input.parentId, input.name, input.name.normalize('NFKC').trim().toLocaleLowerCase('zh-CN'), input.status ?? 'active', stamp, stamp), audit.statement
      ])
      return c.json({ ok: true, id }, 201)
    }
    if (kind === 'stores') {
      if (!input.parentId || !input.code) throw new ApiProblem(400, 'CITY_AND_CODE_REQUIRED', '请选择城市并填写门店代码。')
      if (!await activeParentExists(c.env.DB, 'cities', input.parentId)) throw new ApiProblem(409, 'CITY_NOT_AVAILABLE', '所属城市不可用。')
      const id = uuid()
      const audit = prepareAudit(c.env.DB, { context, action: 'create-directory-store', entityType: 'store', entityId: id, businessDate: localBusinessDate(context.storeTimezone), summary: `新增门店：${input.code} ${input.name}`, after: { cityId: input.parentId, status: input.status ?? 'active' }, reversible: false })
      await c.env.DB.batch([
        c.env.DB.prepare(`INSERT INTO stores (id, city_id, code, name, timezone, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'Asia/Shanghai', ?, ?, ?)`)
          .bind(id, input.parentId, input.code, input.name, input.status ?? 'active', stamp, stamp), audit.statement
      ])
      return c.json({ ok: true, id }, 201)
    }
    throw new ApiProblem(404, 'DIRECTORY_KIND_NOT_FOUND', '目录类型不存在。')
  })

  app.patch('/api/v1/governance/directory/:kind/:id', ...protectedWrite, auth.requirePlatformAdmin, async (c) => {
    const context = requireContext(c)
    const input = directoryEntitySchema.parse(await c.req.json())
    const kind = c.req.param('kind')
    const table = kind === 'regions' ? 'regions' : kind === 'cities' ? 'cities' : kind === 'stores' ? 'stores' : null
    if (!table || !input.status) throw new ApiProblem(400, 'DIRECTORY_STATUS_REQUIRED', '请提供有效目录状态。')
    if (input.status === 'active') {
      if (kind === 'cities') {
        const city = await first<{ region_id: string }>(c.env.DB.prepare('SELECT region_id FROM cities WHERE id = ?').bind(c.req.param('id')))
        if (!city || !await activeParentExists(c.env.DB, 'regions', city.region_id)) throw new ApiProblem(409, 'PARENT_DIRECTORY_NOT_ACTIVE', '所属区域未启用，不能启用城市。')
      }
      if (kind === 'stores') {
        const store = await first<{ city_id: string | null }>(c.env.DB.prepare('SELECT city_id FROM stores WHERE id = ?').bind(c.req.param('id')))
        if (!store?.city_id || !await activeParentExists(c.env.DB, 'cities', store.city_id)) throw new ApiProblem(409, 'PARENT_DIRECTORY_NOT_ACTIVE', '所属城市未启用，不能启用门店。')
      }
    }
    const stamp = nowIso()
    const audit = prepareConditionalAudit(c.env.DB, { context, action: 'update-directory-status', entityType: kind.slice(0, -1), entityId: c.req.param('id'), businessDate: localBusinessDate(context.storeTimezone), summary: `更新目录状态：${kind}`, after: { status: input.status }, reversible: false }, `EXISTS (SELECT 1 FROM ${table} WHERE id = ? AND status = ? AND updated_at = ?)`, [c.req.param('id'), input.status, stamp])
    const result = await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE ${table} SET status = ?, updated_at = ? WHERE id = ?`).bind(input.status, stamp, c.req.param('id')),
      audit.statement
    ])
    if (result[0]?.meta?.changes !== 1) throw new ApiProblem(404, 'DIRECTORY_ENTRY_NOT_FOUND', '目录项不存在。')
    return c.json({ ok: true })
  })


  return app
}
