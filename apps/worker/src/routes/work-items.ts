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
import { businessDateFor, ensureDayOpen, writeAudit } from '../services/business.js'
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
  const read = [auth.loadSession, auth.requirePasswordChanged]
  const write = [auth.loadSession, auth.requirePasswordChanged, auth.requireCsrf]

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
      const counter = await first<{ last_value: number }>(db.prepare(`
        INSERT INTO work_item_counters (store_id, last_value)
        VALUES (?, 1)
        ON CONFLICT(store_id) DO UPDATE SET last_value = last_value + 1
        RETURNING last_value
      `).bind(context.storeId))
      if (!counter) throw new ApiProblem(500, 'TICKET_NUMBER_FAILED', '无法生成维修单号，请稍后重试。')
      const ticketNo = Number(counter.last_value)
      const id = uuid()
      const stamp = nowIso()
      await db.prepare(`
        INSERT INTO work_items (
          id, store_id, ticket_no, kind, title, detail, meta, status, lifecycle, revision,
          created_by, updated_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', 1, ?, ?, ?, ?)
      `).bind(id, context.storeId, ticketNo, kindForScene(input.scene), title, detail, meta, status, context.userId, context.userId, stamp, stamp).run()

      if (input.scene === 'repair' && repairFields) {
        const key = requireContactKey(config)
        await db.prepare(`
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
        ).run()
      } else if (input.scene === 'pickup' && pickupFields) {
        await db.prepare(`
          INSERT INTO pickup_details (work_item_id, pickup_source, self_pickup_platform, notification_status)
          VALUES (?, ?, ?, 'pending')
        `).bind(id, pickupFields.pickupSource, pickupFields.selfPickupPlatform || null).run()
      } else if (input.scene === 'resale') {
        await db.prepare(`INSERT INTO resale_details (work_item_id, resale_stage) VALUES (?, 'pending')`).bind(id).run()
      } else {
        await db.prepare(`INSERT INTO handover_details (work_item_id) VALUES (?)`).bind(id).run()
      }

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
      let title = ''
      let detail = ''
      let meta = ''
      let status = ''
      if (repairLike) {
        const normalized = normalizeRepair(input.values)
        if (!normalized.ok) throw new ApiProblem(400, 'INVALID_REPAIR', normalized.error)
        const fields = normalized.fields
        title = fields.title ?? ''
        detail = fields.repairProject ?? ''
        meta = fields.repairType ?? ''
        status = fields.status ?? ''
        const key = requireContactKey(config)
        await db.prepare(`
          UPDATE repair_details SET contact_type = ?, contact_ciphertext = ?, contact_fingerprint = ?,
            repair_type = ?, repair_project = ?, pickup_date = ?, repair_status = ?
          WHERE work_item_id = ?
        `).bind(
          fields.contactType,
          await encryptContact(fields.contactValue ?? '', key),
          await contactFingerprint(fields.contactValue ?? '', key),
          fields.repairType,
          fields.repairProject,
          fields.pickupDate || null,
          fields.status,
          id
        ).run()
      } else if (kind === 'pickup') {
        const normalized = validatePickup(input.values)
        if (!normalized.ok) throw new ApiProblem(400, 'INVALID_PICKUP', normalized.error)
        const fields = normalized.fields
        title = fields.title ?? ''
        detail = fields.detail ?? ''
        meta = fields.meta ?? ''
        status = fields.status ?? ''
        await db.prepare(`
          UPDATE pickup_details SET pickup_source = ?, self_pickup_platform = ? WHERE work_item_id = ?
        `).bind(fields.pickupSource, fields.selfPickupPlatform || null, id).run()
      } else {
        const values = input.values as { title?: string; detail?: string; meta?: string; status?: string }
        title = values.title?.trim() ?? ''
        detail = values.detail?.trim() ?? ''
        meta = values.meta?.trim() ?? ''
        status = values.status?.trim() ?? ''
        if (!title || !detail || !status) throw new ApiProblem(400, 'VALIDATION_ERROR', '请填写名称、事项说明和当前状态。')
      }
      const stamp = nowIso()
      const updated = await db.prepare(`
        UPDATE work_items SET title = ?, detail = ?, meta = ?, status = ?, updated_by = ?, revision = revision + 1, updated_at = ?
        WHERE id = ? AND store_id = ? AND revision = ? AND deleted_at IS NULL
      `).bind(title, detail, meta, status, context.userId, stamp, id, context.storeId, input.expectedRevision).run()
      if (!updated.meta.changes) throw new ApiProblem(409, 'REVISION_CONFLICT', '数据已被其他同事修改，请刷新后重试。')
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
        const outcome = await handler(db, context, id, input.expectedRevision, businessDate)
        const after = await internalSnapshot(db, context.storeId, id)
        const revision = Number((after?.workItem as any)?.revision ?? input.expectedRevision + 1)
        const eventId = await writeAudit(db, {
          context, action, entityType: 'work-item', entityId: id, entityRevision: revision,
          businessDate, summary: outcome.summary, before, after, reversible: true
        })
        const record = await getWorkItem(db, context.storeId, id, businessDate, config)
        return { status: 200, body: { ok: true, record, eventId, ...(outcome.extra ?? {}) } }
      })
      return c.json(result.body, result.status as any)
    })
  }

  actionRoute('/api/v1/work-items/:id/list-resale', 'complete-resale-listing', async (db, context, id, revision) => {
    const stamp = nowIso()
    const row = await first<{ title: string }>(db.prepare(`
      SELECT w.title FROM work_items w
      JOIN resale_details r ON r.work_item_id = w.id
      WHERE w.id = ? AND w.store_id = ? AND w.revision = ? AND w.lifecycle = 'active' AND r.resale_stage = 'pending'
    `).bind(id, context.storeId, revision))
    if (!row) throw new ApiProblem(409, 'INVALID_STATE', '只有待上架二手车可以完成上架。')
    const updated = await db.prepare(`
      UPDATE work_items SET status = '已上架', revision = revision + 1, updated_by = ?, updated_at = ?
      WHERE id = ? AND store_id = ? AND revision = ?
    `).bind(context.userId, stamp, id, context.storeId, revision).run()
    if (!updated.meta.changes) throw new ApiProblem(409, 'INVALID_STATE', '只有待上架二手车可以完成上架。')
    await db.prepare(`UPDATE resale_details SET resale_stage = 'listed', listed_at = ? WHERE work_item_id = ?`).bind(stamp, id).run()
    return { summary: `维修完毕并上架：${row.title}` }
  })

  actionRoute('/api/v1/work-items/:id/sell-resale', 'sell-resale', async (db, context, id, revision) => {
    const stamp = nowIso()
    const row = await first<{ title: string }>(db.prepare(`
      SELECT w.title FROM work_items w
      JOIN resale_details r ON r.work_item_id = w.id
      WHERE w.id = ? AND w.store_id = ? AND w.revision = ? AND w.lifecycle = 'active' AND r.resale_stage = 'listed'
    `).bind(id, context.storeId, revision))
    if (!row) throw new ApiProblem(409, 'INVALID_STATE', '只有已上架二手车可以标记售出。')
    const updated = await db.prepare(`
      UPDATE work_items SET lifecycle = 'sold', revision = revision + 1, updated_by = ?, updated_at = ?
      WHERE id = ? AND store_id = ? AND revision = ?
    `).bind(context.userId, stamp, id, context.storeId, revision).run()
    if (!updated.meta.changes) throw new ApiProblem(409, 'INVALID_STATE', '只有已上架二手车可以标记售出。')
    await db.prepare(`UPDATE resale_details SET resale_stage = 'sold', sold_at = ? WHERE work_item_id = ?`).bind(stamp, id).run()
    return { summary: `已售出：${row.title}` }
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
      const updated = await db.prepare(`
        UPDATE work_items SET status = '已完成', lifecycle = 'completed', revision = revision + 1, updated_by = ?, updated_at = ?
        WHERE id = ? AND store_id = ? AND revision = ?
      `).bind(context.userId, stamp, id, context.storeId, revision).run()
      if (!updated.meta.changes) throw new ApiProblem(409, 'REVISION_CONFLICT', '维修记录已被其他同事修改。')
      await db.prepare(`
        UPDATE repair_details SET repair_status = '已完成', repair_completed_at = ?, completed_on = ?, completed_at = ?
        WHERE work_item_id = ?
      `).bind(stamp, businessDate, stamp, id).run()
      return { summary: `维修完毕：${repair.title}`, extra: { route: 'completed' } }
    }
    const updated = await db.prepare(`
      UPDATE work_items SET kind = 'pickup', revision = revision + 1, updated_by = ?, updated_at = ?
      WHERE id = ? AND store_id = ? AND revision = ?
    `).bind(context.userId, stamp, id, context.storeId, revision).run()
    if (!updated.meta.changes) throw new ApiProblem(409, 'REVISION_CONFLICT', '维修记录已被其他同事修改。')
    await db.prepare(`UPDATE repair_details SET repair_completed_at = ? WHERE work_item_id = ?`).bind(stamp, id).run()
    await db.prepare(`
      INSERT INTO pickup_details (work_item_id, pickup_source, self_pickup_platform, notification_status, repair_work_item_id)
      VALUES (?, 'repair', NULL, 'pending', ?)
    `).bind(id, id).run()
    return { summary: `维修完毕并转入待取：${repair.title}`, extra: { route: 'pickup' } }
  })

  actionRoute('/api/v1/work-items/:id/complete-handover', 'complete-handover', async (db, context, id, revision, businessDate) => {
    const stamp = nowIso()
    const row = await first<{ title: string }>(db.prepare(`
      SELECT title FROM work_items
      WHERE id = ? AND store_id = ? AND revision = ? AND kind = 'handover' AND lifecycle = 'active'
    `).bind(id, context.storeId, revision))
    if (!row) throw new ApiProblem(409, 'INVALID_STATE', '没有找到可完成的交接事项。')
    const updated = await db.prepare(`
      UPDATE work_items SET status = '已完成', lifecycle = 'completed', revision = revision + 1, updated_by = ?, updated_at = ?
      WHERE id = ? AND store_id = ? AND revision = ?
    `).bind(context.userId, stamp, id, context.storeId, revision).run()
    if (!updated.meta.changes) throw new ApiProblem(409, 'INVALID_STATE', '没有找到可完成的交接事项。')
    await db.prepare(`
      UPDATE handover_details SET completed_on = ?, completed_at = ?, completed_by = ? WHERE work_item_id = ?
    `).bind(businessDate, stamp, context.userId, id).run()
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
      const updated = await db.prepare(`
        UPDATE work_items SET revision = revision + 1, updated_by = ?, updated_at = ?
        WHERE id = ? AND store_id = ? AND revision = ?
      `).bind(context.userId, stamp, id, context.storeId, input.expectedRevision).run()
      if (!updated.meta.changes) throw new ApiProblem(409, 'INVALID_STATE', '已取车辆或已修改记录不能更新通知状态。')
      await db.prepare(`UPDATE pickup_details SET notification_status = ? WHERE work_item_id = ?`).bind(input.notificationStatus, id).run()
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
      const updated = await db.prepare(`
        UPDATE work_items SET status = '已取车', lifecycle = 'picked-up', revision = revision + 1, updated_by = ?, updated_at = ?
        WHERE id = ? AND store_id = ? AND revision = ?
      `).bind(context.userId, stamp, id, context.storeId, input.expectedRevision).run()
      if (!updated.meta.changes) throw new ApiProblem(409, 'REVISION_CONFLICT', '待取记录已被其他同事修改。')
      await db.prepare(`
        UPDATE pickup_details SET picked_up_on = ?, picked_up_at = ?, picked_up_by = ? WHERE work_item_id = ?
      `).bind(businessDate, stamp, context.userId, id).run()
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
      const updated = await db.prepare(`
        UPDATE work_items SET lifecycle = 'deleted', deleted_at = ?, deleted_by = ?, updated_by = ?, revision = revision + 1, updated_at = ?
        WHERE id = ? AND store_id = ? AND revision = ?
      `).bind(stamp, context.userId, context.userId, stamp, id, context.storeId, input.expectedRevision).run()
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
