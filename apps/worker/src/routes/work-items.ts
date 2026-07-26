import { Hono } from 'hono'
import {
  actionSchema,
  notificationSchema,
  pickupCompleteSchema,
  workItemCreateSchema,
  workItemUpdateSchema
} from '@bike-ops/contracts'
import {
  normalizeRepair,
  repairCompletionRoute,
  validatePickup,
  validatePickupCompletion
} from '@bike-ops/domain'
import type { AppConfig, WorkerEnv } from '../env.js'
import type { AuthContext } from '../auth/types.js'
import { createAuthMiddleware } from '../auth/middleware.js'
import { first, nowIso, uuid } from '../db.js'
import { contactFingerprint, encryptContact } from '../lib/contact-crypto.js'
import { getWorkItem, internalSnapshot, listWorkItems } from '../repositories/work-items.js'
import { buildRestoreSnapshotStatements } from '../services/restore.js'
import { batchWhileDayOpen, businessDateFor, ensureDayOpen, runWhileDayOpen, writeAudit } from '../services/business.js'
import { idempotent } from '../services/idempotency.js'
import { ApiProblem } from '../services/problems.js'

type Vars = { config: AppConfig; auth: AuthContext | null }

function requireContactKey(config: AppConfig): string {
  if (!config.CONTACT_ENCRYPTION_KEY) throw new ApiProblem(503, 'CONTACT_ENCRYPTION_NOT_CONFIGURED', '联系方式加密尚未配置。')
  return config.CONTACT_ENCRYPTION_KEY
}

function kindForScene(scene: string): 'pickup' | 'handover' | 'repair' | 'resale' {
  return scene === 'poster' ? 'handover' : scene as 'pickup' | 'repair' | 'resale'
}

export function workItemRoutes() {
  const app = new Hono<{ Bindings: WorkerEnv; Variables: Vars }>()
  const auth = createAuthMiddleware()
  const read = [auth.loadSession, auth.requirePasswordChanged] as const
  const write = [auth.loadSession, auth.requirePasswordChanged, auth.requireCsrf] as const

  app.get('/api/v1/work-items', ...read, async (c) => {
    const context = c.get('auth')!
    const config = c.get('config')
    const businessDate = await businessDateFor(context)
    return c.json({
      records: await listWorkItems(c.env.DB, context.storeId, businessDate, config),
      businessDate
    })
  })

  app.post('/api/v1/work-items', ...write, async (c) => {
    const context = c.get('auth')!
    const config = c.get('config')
    const body = await c.req.json()
    const input = workItemCreateSchema.parse(body)
    const result = await idempotent(c, body, async (db) => {
      const businessDate = await businessDateFor(context)
      await ensureDayOpen(db, context, businessDate)
      let title = ''
      let detail = ''
      let meta = ''
      let status = ''
      let repairFields: any = null
      let pickupFields: any = null
      if (input.scene === 'repair') {
        const normalized = normalizeRepair(input.values)
        if (!normalized.ok) throw new ApiProblem(400, 'INVALID_REPAIR', normalized.error)
        repairFields = normalized.fields
        title = repairFields.title
        detail = repairFields.repairProject
        meta = repairFields.repairType
        status = repairFields.status
      } else if (input.scene === 'pickup') {
        const normalized = validatePickup(input.values)
        if (!normalized.ok) throw new ApiProblem(400, 'INVALID_PICKUP', normalized.error)
        pickupFields = normalized.fields
        title = pickupFields.title
        detail = pickupFields.detail
        meta = pickupFields.meta
        status = pickupFields.status
      } else {
        ;({ title, detail, meta, status } = input.values as any)
      }
      const id = uuid()
      const stamp = nowIso()
      let detailStatement: D1PreparedStatement
      if (input.scene === 'repair' && repairFields) {
        const key = requireContactKey(config)
        detailStatement = db.prepare(`
          INSERT INTO repair_details (
            work_item_id, contact_type, contact_ciphertext, contact_fingerprint,
            repair_type, repair_project, pickup_date, repair_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          id,
          repairFields.contactType,
          await encryptContact(repairFields.contactValue, key),
          await contactFingerprint(repairFields.contactValue, key),
          repairFields.repairType,
          repairFields.repairProject,
          repairFields.pickupDate || null,
          repairFields.status
        )
      } else if (input.scene === 'pickup' && pickupFields) {
        detailStatement = db.prepare(`
          INSERT INTO pickup_details (work_item_id, pickup_source, self_pickup_platform, notification_status)
          VALUES (?, ?, ?, 'pending')
        `).bind(id, pickupFields.pickupSource, pickupFields.selfPickupPlatform || null)
      } else if (input.scene === 'resale') {
        detailStatement = db.prepare(`INSERT INTO resale_details (work_item_id, resale_stage) VALUES (?, 'pending')`).bind(id)
      } else {
        detailStatement = db.prepare(`INSERT INTO handover_details (work_item_id) VALUES (?)`).bind(id)
      }
      const [, inserted] = await batchWhileDayOpen(db, context, businessDate, [
        db.prepare(`
          INSERT INTO work_item_counters (store_id, last_value)
          VALUES (?, 1)
          ON CONFLICT(store_id) DO UPDATE SET last_value = last_value + 1
        `).bind(context.storeId),
        db.prepare(`
          INSERT INTO work_items (
            id, store_id, ticket_no, kind, title, detail, meta, status, lifecycle, revision,
            created_by, updated_by, created_at, updated_at
          )
          SELECT ?, ?, last_value, ?, ?, ?, ?, ?, 'active', 1, ?, ?, ?, ?
          FROM work_item_counters WHERE store_id = ?
        `).bind(
          id, context.storeId, kindForScene(input.scene), title, detail, meta, status,
          context.userId, context.userId, stamp, stamp, context.storeId
        ),
        detailStatement
      ])
      if (!inserted?.meta?.changes) throw new ApiProblem(500, 'TICKET_NUMBER_FAILED', '无法生成维修单号，请稍后重试。')

      const after = await internalSnapshot(db, context.storeId, id)
      const eventId = await writeAudit(db, {
        context, action: 'add-record', entityType: 'work-item', entityId: id, entityRevision: 1,
        businessDate, summary: `增加：${title}`, before: null, after, reversible: true
      })
      const record = await getWorkItem(db, context.storeId, id, businessDate, config)
      return { status: 201, body: { ok: true, record, eventId } }
    })
    return c.json(result.body, result.status as any)
  })

  app.patch('/api/v1/work-items/:id', ...write, async (c) => {
    const context = c.get('auth')!
    const config = c.get('config')
    const id = String(c.req.param('id') ?? '')
    const body = await c.req.json()
    const input = workItemUpdateSchema.parse(body)
    const result = await idempotent(c, body, async (db) => {
      const businessDate = await businessDateFor(context)
      await ensureDayOpen(db, context, businessDate)
      const before = await internalSnapshot(db, context.storeId, id)
      if (!before) throw new ApiProblem(404, 'NOT_FOUND', '没有找到这条台账记录。')
      const workItem = before.workItem as Record<string, unknown>
      if (workItem.revision !== input.expectedRevision) throw new ApiProblem(409, 'REVISION_CONFLICT', '数据已被其他同事修改，请刷新后重试。')
      if (workItem.lifecycle !== 'active') throw new ApiProblem(409, 'ITEM_RESOLVED', '已完成记录不能继续编辑。')
      const kind = String(workItem.kind)
      const pickup = before.pickup as Record<string, unknown> | null
      const repairLike = kind === 'repair' || (kind === 'pickup' && pickup?.pickupSource === 'repair')
      const completedRepairPickup = kind === 'pickup' && pickup?.pickupSource === 'repair' && workItem.status === '维修完成'
      let title = ''
      let detail = ''
      let meta = ''
      let status = ''
      let detailStatement: D1PreparedStatement | null = null
      if (repairLike) {
        const repair = before.repair as Record<string, unknown> | null
        const persistedRepairStatus = String(repair?.repairStatus ?? repair?.repair_status ?? '')
        const normalized = normalizeRepair(completedRepairPickup
          ? { ...(input.values as Record<string, unknown>), status: persistedRepairStatus }
          : input.values)
        if (!normalized.ok) throw new ApiProblem(400, 'INVALID_REPAIR', normalized.error)
        const fields = normalized.fields
        title = fields.title ?? ''
        detail = fields.repairProject ?? ''
        meta = fields.repairType ?? ''
        status = completedRepairPickup ? '维修完成' : fields.status ?? ''
        const key = requireContactKey(config)
        detailStatement = db.prepare(`
          UPDATE repair_details SET contact_type = ?, contact_ciphertext = ?, contact_fingerprint = ?,
            repair_type = ?, repair_project = ?, pickup_date = ?, repair_status = ?
          WHERE work_item_id = ? AND changes() = 1
        `).bind(
          fields.contactType,
          await encryptContact(fields.contactValue ?? '', key),
          await contactFingerprint(fields.contactValue ?? '', key),
          fields.repairType,
          fields.repairProject,
          fields.pickupDate || null,
          fields.status,
          id
        )
      } else if (kind === 'pickup') {
        const normalized = validatePickup(input.values)
        if (!normalized.ok) throw new ApiProblem(400, 'INVALID_PICKUP', normalized.error)
        const fields = normalized.fields
        const resaleOriginUsedCar = pickup?.pickupSource === 'used-car' && String((before.resale as Record<string, unknown> | null)?.resaleStage ?? '') === 'sold'
        if (resaleOriginUsedCar && fields.pickupSource !== 'used-car') {
          throw new ApiProblem(400, 'USED_CAR_SOURCE_LOCKED', '二手车售出后转入待取，来源不能改为其它类型。')
        }
        title = fields.title ?? ''
        detail = fields.detail ?? ''
        meta = fields.meta ?? ''
        status = fields.status ?? ''
        detailStatement = db.prepare(`
          UPDATE pickup_details SET pickup_source = ?, self_pickup_platform = ?
          WHERE work_item_id = ? AND changes() = 1
        `).bind(fields.pickupSource, fields.selfPickupPlatform || null, id)
      } else {
        const values = input.values as { title?: string; detail?: string; meta?: string; status?: string }
        title = values.title?.trim() ?? ''
        detail = values.detail?.trim() ?? ''
        meta = values.meta?.trim() ?? ''
        status = values.status?.trim() ?? ''
        if (!title || !detail || !status) throw new ApiProblem(400, 'VALIDATION_ERROR', '请填写名称、事项说明和当前状态。')
      }
      const stamp = nowIso()
      const [updated] = await batchWhileDayOpen(db, context, businessDate, [
        db.prepare(`
          UPDATE work_items SET title = ?, detail = ?, meta = ?, status = ?, updated_by = ?, revision = revision + 1, updated_at = ?
          WHERE id = ? AND store_id = ? AND revision = ? AND deleted_at IS NULL AND lifecycle = 'active'
        `).bind(title, detail, meta, status, context.userId, stamp, id, context.storeId, input.expectedRevision),
        ...(detailStatement ? [detailStatement] : [])
      ])
      if (!updated?.meta?.changes) throw new ApiProblem(409, 'REVISION_CONFLICT', '数据已被其他同事修改，请刷新后重试。')
      const after = await internalSnapshot(db, context.storeId, id)
      const revision = Number((after?.workItem as any)?.revision ?? input.expectedRevision + 1)
      const eventId = await writeAudit(db, {
        context, action: 'edit-record', entityType: 'work-item', entityId: id, entityRevision: revision,
        businessDate, summary: `编辑：${title}`, before, after, reversible: true
      })
      const record = await getWorkItem(db, context.storeId, id, businessDate, config)
      return { status: 200, body: { ok: true, record, eventId } }
    })
    return c.json(result.body, result.status as any)
  })

  function actionRoute(
    path: string,
    action: string,
    handler: (db: D1Database, context: AuthContext, id: string, revision: number, businessDate: string) => Promise<{ summary: string; extra?: Record<string, unknown> }>
  ) {
    app.post(path, ...write, async (c) => {
      const context = c.get('auth')!
      const config = c.get('config')
      const id = String(c.req.param('id') ?? '')
      if (!id) throw new ApiProblem(400, 'VALIDATION_ERROR', '缺少业务记录标识。')
      const body = await c.req.json()
      const input = actionSchema.parse(body)
      const result = await idempotent(c, body, async (db) => {
        const businessDate = await businessDateFor(context)
        await ensureDayOpen(db, context, businessDate)
        const before = await internalSnapshot(db, context.storeId, id)
        if (!before) throw new ApiProblem(404, 'NOT_FOUND', '没有找到这条台账记录。')
        const item = before.workItem as Record<string, unknown>
        if (item.revision !== input.expectedRevision) throw new ApiProblem(409, 'REVISION_CONFLICT', '数据已被其他同事修改。')
        let outcome: { summary: string; extra?: Record<string, unknown> }
        let eventId: string
        let stateChanged = false
        try {
          outcome = await handler(db, context, id, input.expectedRevision, businessDate)
          stateChanged = true
          const after = await internalSnapshot(db, context.storeId, id)
          const revision = Number((after?.workItem as any)?.revision ?? input.expectedRevision + 1)
          eventId = await writeAudit(db, {
            context, action, entityType: 'work-item', entityId: id, entityRevision: revision,
            businessDate, summary: outcome.summary, before, after, reversible: true
          })
        } catch (error) {
          // Only roll back after a completed state transition when its audit write fails; validation/conflict failures must not rewrite a concurrent record.
          if (stateChanged) await batchWhileDayOpen(db, context, businessDate, buildRestoreSnapshotStatements(db, before))
          throw error
        }
        const record = await getWorkItem(db, context.storeId, id, businessDate, config)
        return { status: 200, body: { ok: true, record, eventId, ...(outcome.extra ?? {}) } }
      })
      return c.json(result.body, result.status as any)
    })
  }

  actionRoute('/api/v1/work-items/:id/list-resale', 'complete-resale-listing', async (db, context, id, revision, businessDate) => {
    const stamp = nowIso()
    const row = await first<{ title: string }>(db.prepare(`
      SELECT w.title FROM work_items w
      JOIN resale_details r ON r.work_item_id = w.id
      WHERE w.id = ? AND w.store_id = ? AND w.revision = ? AND w.lifecycle = 'active' AND r.resale_stage = 'pending'
    `).bind(id, context.storeId, revision))
    if (!row) throw new ApiProblem(409, 'INVALID_STATE', '只有待上架二手车可以完成上架。')
    const [updated] = await batchWhileDayOpen(db, context, businessDate, [
      db.prepare(`
        UPDATE work_items SET status = '已上架', revision = revision + 1, updated_by = ?, updated_at = ?
        WHERE id = ? AND store_id = ? AND revision = ?
      `).bind(context.userId, stamp, id, context.storeId, revision),
      db.prepare(`
        UPDATE resale_details SET resale_stage = 'listed', listed_at = ?
        WHERE work_item_id = ? AND changes() = 1
      `).bind(stamp, id)
    ])
    if (!updated?.meta?.changes) throw new ApiProblem(409, 'INVALID_STATE', '只有待上架二手车可以完成上架。')
    return { summary: `维修完毕并上架：${row.title}` }
  })

  actionRoute('/api/v1/work-items/:id/sell-resale', 'sell-resale', async (db, context, id, revision, businessDate) => {
    const stamp = nowIso()
    const [updated] = await batchWhileDayOpen(db, context, businessDate, [
      db.prepare(`
        UPDATE work_items SET kind = 'pickup', status = '等待取车', lifecycle = 'active', revision = revision + 1, updated_by = ?, updated_at = ?
        WHERE id = ? AND store_id = ? AND revision = ? AND lifecycle = 'active'
          AND EXISTS (SELECT 1 FROM resale_details WHERE work_item_id = ? AND resale_stage = 'listed')
      `).bind(context.userId, stamp, id, context.storeId, revision, id),
      db.prepare(`
        UPDATE resale_details SET resale_stage = 'sold', sold_at = ?
        WHERE work_item_id = ? AND changes() = 1
      `).bind(stamp, id),
      db.prepare(`
        INSERT INTO pickup_details (
          work_item_id, pickup_source, self_pickup_platform, notification_status,
          repair_work_item_id, picked_up_on, picked_up_at, picked_up_by
        )
        SELECT ?, 'used-car', NULL, 'pending', NULL, NULL, NULL, NULL
        WHERE changes() = 1
        ON CONFLICT(work_item_id) DO UPDATE SET
          pickup_source = 'used-car', self_pickup_platform = NULL, notification_status = 'pending',
          repair_work_item_id = NULL, picked_up_on = NULL, picked_up_at = NULL, picked_up_by = NULL
      `).bind(id)
    ])
    if (!updated?.meta.changes) throw new ApiProblem(409, 'INVALID_STATE', '只有已上架二手车可以标记售出。')
    const row = await first<{ title: string }>(db.prepare('SELECT title FROM work_items WHERE id = ? AND store_id = ?').bind(id, context.storeId))
    return { summary: `已售出并转入待取（二手车）：${row?.title ?? ''}`, extra: { route: 'pickup' } }
  })

  actionRoute('/api/v1/work-items/:id/complete-repair', 'complete-repair', async (db, context, id, revision, businessDate) => {
    const repair = await first<{ title: string; repair_type: string }>(db.prepare(`
      SELECT w.title, r.repair_type FROM work_items w
      JOIN repair_details r ON r.work_item_id = w.id
      WHERE w.id = ? AND w.store_id = ? AND w.kind = 'repair' AND w.lifecycle = 'active'
    `).bind(id, context.storeId))
    if (!repair) throw new ApiProblem(409, 'INVALID_STATE', '没有找到可完成的维修车辆。')
    const route = repairCompletionRoute({ repairType: repair.repair_type })
    if (!route.ok) throw new ApiProblem(400, 'INVALID_REPAIR', route.error)
    const stamp = nowIso()
    if (route.route === 'completed') {
      const [updated] = await batchWhileDayOpen(db, context, businessDate, [
        db.prepare(`
          UPDATE work_items SET status = '已完成', lifecycle = 'completed', revision = revision + 1, updated_by = ?, updated_at = ?
          WHERE id = ? AND store_id = ? AND revision = ?
        `).bind(context.userId, stamp, id, context.storeId, revision),
        db.prepare(`
          UPDATE repair_details SET repair_status = '已完成', repair_completed_at = ?, completed_on = ?, completed_at = ?
          WHERE work_item_id = ? AND changes() = 1
        `).bind(stamp, businessDate, stamp, id)
      ])
      if (!updated?.meta?.changes) throw new ApiProblem(409, 'REVISION_CONFLICT', '维修记录已被其他同事修改。')
      return { summary: `维修完毕：${repair.title}`, extra: { route: 'completed' } }
    }
    // Keep the non-store repair transition all-or-nothing. This also removes a stale pickup row
    // left by an older undo before reinserting the canonical repair-origin pickup detail.
    const [updated] = await batchWhileDayOpen(db, context, businessDate, [
      db.prepare(`
        UPDATE work_items SET kind = 'pickup', status = '维修完成', revision = revision + 1, updated_by = ?, updated_at = ?
        WHERE id = ? AND store_id = ? AND revision = ?
      `).bind(context.userId, stamp, id, context.storeId, revision),
      db.prepare(`
        UPDATE repair_details SET repair_completed_at = ?
        WHERE work_item_id = ? AND changes() = 1
      `).bind(stamp, id),
      db.prepare(`
        INSERT INTO pickup_details (
          work_item_id, pickup_source, self_pickup_platform, notification_status,
          repair_work_item_id, picked_up_on, picked_up_at, picked_up_by
        )
        SELECT ?, 'repair', NULL, 'pending', ?, NULL, NULL, NULL
        WHERE changes() = 1
        ON CONFLICT(work_item_id) DO UPDATE SET
          pickup_source = 'repair', self_pickup_platform = NULL, notification_status = 'pending',
          repair_work_item_id = excluded.repair_work_item_id,
          picked_up_on = NULL, picked_up_at = NULL, picked_up_by = NULL
      `).bind(id, id)
    ])
    if (!updated?.meta.changes) throw new ApiProblem(409, 'REVISION_CONFLICT', '维修记录已被其他同事修改。')
    return { summary: `维修完毕并转入待取：${repair.title}`, extra: { route: 'pickup' } }
  })

  actionRoute('/api/v1/work-items/:id/complete-handover', 'complete-handover', async (db, context, id, revision, businessDate) => {
    const stamp = nowIso()
    const row = await first<{ title: string }>(db.prepare(`
      SELECT title FROM work_items
      WHERE id = ? AND store_id = ? AND revision = ? AND kind = 'handover' AND lifecycle = 'active'
    `).bind(id, context.storeId, revision))
    if (!row) throw new ApiProblem(409, 'INVALID_STATE', '没有找到可完成的交接事项。')
    const [updated] = await batchWhileDayOpen(db, context, businessDate, [
      db.prepare(`
        UPDATE work_items SET status = '已完成', lifecycle = 'completed', revision = revision + 1, updated_by = ?, updated_at = ?
        WHERE id = ? AND store_id = ? AND revision = ?
      `).bind(context.userId, stamp, id, context.storeId, revision),
      db.prepare(`
        UPDATE handover_details SET completed_on = ?, completed_at = ?, completed_by = ?
        WHERE work_item_id = ? AND changes() = 1
      `).bind(businessDate, stamp, context.userId, id)
    ])
    if (!updated?.meta?.changes) throw new ApiProblem(409, 'INVALID_STATE', '没有找到可完成的交接事项。')
    return { summary: `完成交接：${row.title}` }
  })

  app.post('/api/v1/work-items/:id/notification', ...write, async (c) => {
    const context = c.get('auth')!
    const config = c.get('config')
    const id = String(c.req.param('id') ?? '')
    const body = await c.req.json()
    const input = notificationSchema.parse(body)
    const result = await idempotent(c, body, async (db) => {
      const businessDate = await businessDateFor(context)
      await ensureDayOpen(db, context, businessDate)
      const before = await internalSnapshot(db, context.storeId, id)
      if (!before) throw new ApiProblem(404, 'NOT_FOUND', '没有找到待取车辆。')
      const item = before.workItem as Record<string, unknown>
      if (item.revision !== input.expectedRevision) throw new ApiProblem(409, 'REVISION_CONFLICT', '通知状态已被其他同事修改。')
      const stamp = nowIso()
      const row = await first<{ title: string }>(db.prepare(`
        SELECT w.title FROM work_items w
        JOIN pickup_details p ON p.work_item_id = w.id
        WHERE w.id = ? AND w.store_id = ? AND w.revision = ? AND w.lifecycle = 'active' AND p.picked_up_on IS NULL
      `).bind(id, context.storeId, input.expectedRevision))
      if (!row) throw new ApiProblem(409, 'INVALID_STATE', '已取车辆或已修改记录不能更新通知状态。')
      const [updated] = await batchWhileDayOpen(db, context, businessDate, [
        db.prepare(`
          UPDATE work_items SET revision = revision + 1, updated_by = ?, updated_at = ?
          WHERE id = ? AND store_id = ? AND revision = ?
        `).bind(context.userId, stamp, id, context.storeId, input.expectedRevision),
        db.prepare(`
          UPDATE pickup_details SET notification_status = ?
          WHERE work_item_id = ? AND changes() = 1
        `).bind(input.notificationStatus, id)
      ])
      if (!updated?.meta?.changes) throw new ApiProblem(409, 'INVALID_STATE', '已取车辆或已修改记录不能更新通知状态。')
      const after = await internalSnapshot(db, context.storeId, id)
      const revision = Number((after?.workItem as any)?.revision ?? input.expectedRevision + 1)
      const eventId = await writeAudit(db, {
        context, action: 'update-pickup-notification', entityType: 'work-item', entityId: id, entityRevision: revision,
        businessDate,
        summary: `${input.notificationStatus === 'notified' ? '已通知' : '等待确认通知'}：${row.title}`,
        before, after, reversible: true
      })
      const record = await getWorkItem(db, context.storeId, id, businessDate, config)
      return { status: 200, body: { ok: true, record, eventId } }
    })
    return c.json(result.body, result.status as any)
  })

  app.post('/api/v1/work-items/:id/pick-up', ...write, async (c) => {
    const context = c.get('auth')!
    const config = c.get('config')
    const id = String(c.req.param('id') ?? '')
    const body = await c.req.json()
    const input = pickupCompleteSchema.parse(body)
    const result = await idempotent(c, body, async (db) => {
      const businessDate = await businessDateFor(context)
      await ensureDayOpen(db, context, businessDate)
      const current = await getWorkItem(db, context.storeId, id, businessDate, config)
      if (!current) throw new ApiProblem(404, 'NOT_FOUND', '没有找到可取车的记录。')
      if (current.revision !== input.expectedRevision) throw new ApiProblem(409, 'REVISION_CONFLICT', '待取记录已被其他同事修改。')
      const validation = validatePickupCompletion(current, input.pickupCode)
      if (!validation.ok) throw new ApiProblem(409, 'PICKUP_VALIDATION_FAILED', validation.error ?? '当前记录不能确认取车。')
      const before = await internalSnapshot(db, context.storeId, id)
      const stamp = nowIso()
      const row = await first<{ title: string }>(db.prepare(`
        SELECT w.title FROM work_items w
        JOIN pickup_details p ON p.work_item_id = w.id
        WHERE w.id = ? AND w.store_id = ? AND w.revision = ? AND w.lifecycle = 'active' AND p.picked_up_on IS NULL
      `).bind(id, context.storeId, input.expectedRevision))
      if (!row) throw new ApiProblem(409, 'REVISION_CONFLICT', '待取记录已被其他同事修改。')
      const [updated] = await batchWhileDayOpen(db, context, businessDate, [
        db.prepare(`
          UPDATE work_items SET status = '已取车', lifecycle = 'picked-up', revision = revision + 1, updated_by = ?, updated_at = ?
          WHERE id = ? AND store_id = ? AND revision = ?
        `).bind(context.userId, stamp, id, context.storeId, input.expectedRevision),
        db.prepare(`
          UPDATE pickup_details SET picked_up_on = ?, picked_up_at = ?, picked_up_by = ?
          WHERE work_item_id = ? AND changes() = 1
        `).bind(businessDate, stamp, context.userId, id)
      ])
      if (!updated?.meta?.changes) throw new ApiProblem(409, 'REVISION_CONFLICT', '待取记录已被其他同事修改。')
      const after = await internalSnapshot(db, context.storeId, id)
      const revision = Number((after?.workItem as any)?.revision ?? input.expectedRevision + 1)
      const eventId = await writeAudit(db, {
        context, action: 'complete-pickup', entityType: 'work-item', entityId: id, entityRevision: revision,
        businessDate, summary: `确认取车：${row.title}`, before, after, reversible: true
      })
      const record = await getWorkItem(db, context.storeId, id, businessDate, config)
      return { status: 200, body: { ok: true, record, eventId } }
    })
    return c.json(result.body, result.status as any)
  })

  app.delete('/api/v1/work-items/:id', ...write, async (c) => {
    const context = c.get('auth')!
    const id = String(c.req.param('id') ?? '')
    const body = await c.req.json()
    const input = actionSchema.parse(body)
    const result = await idempotent(c, body, async (db) => {
      const businessDate = await businessDateFor(context)
      await ensureDayOpen(db, context, businessDate)
      const before = await internalSnapshot(db, context.storeId, id)
      if (!before) throw new ApiProblem(404, 'NOT_FOUND', '没有找到这条台账记录。')
      const stamp = nowIso()
      const row = await first<{ title: string }>(db.prepare(`
        SELECT title FROM work_items
        WHERE id = ? AND store_id = ? AND revision = ? AND lifecycle = 'active' AND deleted_at IS NULL
      `).bind(id, context.storeId, input.expectedRevision))
      if (!row) throw new ApiProblem(409, 'REVISION_CONFLICT', '该记录已完成、删除或被其他同事修改。')
      const updated = await runWhileDayOpen(db, context, businessDate, db.prepare(`
        UPDATE work_items SET lifecycle = 'deleted', deleted_at = ?, deleted_by = ?, updated_by = ?, revision = revision + 1, updated_at = ?
        WHERE id = ? AND store_id = ? AND revision = ?
      `).bind(stamp, context.userId, context.userId, stamp, id, context.storeId, input.expectedRevision))
      if (!updated.meta.changes) throw new ApiProblem(409, 'REVISION_CONFLICT', '该记录已完成、删除或被其他同事修改。')
      const after = await internalSnapshot(db, context.storeId, id)
      const revision = Number((after?.workItem as any)?.revision ?? input.expectedRevision + 1)
      const eventId = await writeAudit(db, {
        context, action: 'remove-record', entityType: 'work-item', entityId: id, entityRevision: revision,
        businessDate, summary: `删除：${row.title}`, before, after, reversible: true
      })
      return { status: 200, body: { ok: true, id, eventId } }
    })
    return c.json(result.body, result.status as any)
  })

  return app
}
