import type { FastifyInstance } from 'fastify'
import type { Database } from '@bike-ops/database'
import { actionSchema, notificationSchema, pickupCompleteSchema, workItemCreateSchema, workItemUpdateSchema } from '@bike-ops/contracts'
import { normalizeRepair, repairCompletionRoute, validatePickup, validatePickupCompletion } from '@bike-ops/domain'
import type { NormalizedPickupFields, NormalizedRepairFields } from '@bike-ops/domain'
import { createAuthMiddleware } from '../auth/middleware.js'
import type { AuthContext } from '../auth/types.js'
import type { AppConfig } from '../config.js'
import { contactFingerprint, encryptContact } from '../lib/contact-crypto.js'
import { businessDateFor, ensureDayOpen, writeAudit } from '../services/business.js'
import { ApiProblem, idempotent } from '../services/idempotency.js'
import { getWorkItem, internalSnapshot, listWorkItems } from '../repositories/work-items.js'

function requireContactKey(config: AppConfig): string {
  if (!config.CONTACT_ENCRYPTION_KEY) throw new ApiProblem(503, 'CONTACT_ENCRYPTION_NOT_CONFIGURED', '联系方式加密尚未配置。')
  return config.CONTACT_ENCRYPTION_KEY
}

function kindForScene(scene: string): 'pickup' | 'handover' | 'repair' | 'resale' {
  return scene === 'poster' ? 'handover' : scene as 'pickup' | 'repair' | 'resale'
}

interface ActionOutcome {
  summary: string
  extra?: Record<string, unknown>
}

type ActionHandler = (
  tx: Database,
  context: AuthContext,
  id: string,
  revision: number,
  businessDate: string
) => Promise<ActionOutcome>

export async function registerWorkItemRoutes(app: FastifyInstance, sql: Database, config: AppConfig): Promise<void> {
  const auth = createAuthMiddleware(sql, config)
  const guards = [auth.loadSession, auth.requirePasswordChanged, auth.requireCsrf]

  app.get('/api/v1/work-items', { preHandler: [auth.loadSession, auth.requirePasswordChanged] }, async (request) => {
    const context = request.auth!
    const businessDate = await businessDateFor(context)
    return { records: await listWorkItems(sql, context.storeId, businessDate, config), businessDate }
  })

  app.post('/api/v1/work-items', { preHandler: guards }, async (request, reply) => {
    const context = request.auth!
    const input = workItemCreateSchema.parse(request.body)
    const result = await idempotent(sql, request, async (tx) => {
      const businessDate = await businessDateFor(context)
      await ensureDayOpen(tx, context, businessDate)
      let title = ''
      let detail = ''
      let meta = ''
      let status = ''
      let repairFields: NormalizedRepairFields | null = null
      let pickupFields: NormalizedPickupFields | null = null
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
        ;({ title, detail, meta, status } = input.values)
      }
      const [created] = await tx<{ id: string; revision: number }[]>`
        insert into bike_ops.work_items (store_id, kind, title, detail, meta, status, created_by, updated_by)
        values (${context.storeId}, ${kindForScene(input.scene)}, ${title}, ${detail}, ${meta}, ${status}, ${context.userId}, ${context.userId})
        returning id, revision
      `
      if (!created) throw new Error('WORK_ITEM_INSERT_FAILED')
      if (input.scene === 'repair' && repairFields) {
        const key = requireContactKey(config)
        await tx`
          insert into bike_ops.repair_details (work_item_id, contact_type, contact_ciphertext, contact_fingerprint, repair_type, repair_project, pickup_date, repair_status)
          values (${created.id}, ${repairFields.contactType}, ${encryptContact(repairFields.contactValue, key)}, ${contactFingerprint(repairFields.contactValue, key)},
            ${repairFields.repairType}, ${repairFields.repairProject}, ${repairFields.pickupDate || null}, ${repairFields.status})
        `
      } else if (input.scene === 'pickup' && pickupFields) {
        await tx`
          insert into bike_ops.pickup_details (work_item_id, pickup_source, self_pickup_platform, notification_status)
          values (${created.id}, ${pickupFields.pickupSource}, ${pickupFields.selfPickupPlatform || null}, 'pending')
        `
      } else if (input.scene === 'resale') {
        await tx`insert into bike_ops.resale_details (work_item_id, resale_stage) values (${created.id}, 'pending')`
      } else {
        await tx`insert into bike_ops.handover_details (work_item_id) values (${created.id})`
      }
      const after = await internalSnapshot(tx, context.storeId, created.id)
      const eventId = await writeAudit(tx, { context, action: 'add-record', entityType: 'work-item', entityId: created.id, entityRevision: created.revision, businessDate, summary: `增加：${title}`, before: null, after, reversible: true, requestId: request.id })
      const record = await getWorkItem(tx, context.storeId, created.id, businessDate, config)
      return { status: 201, body: { ok: true, record, eventId } }
    })
    return reply.code(result.status).send(result.body)
  })

  app.patch('/api/v1/work-items/:id', { preHandler: guards }, async (request, reply) => {
    const context = request.auth!
    const id = (request.params as { id: string }).id
    const input = workItemUpdateSchema.parse(request.body)
    const result = await idempotent(sql, request, async (tx) => {
      const businessDate = await businessDateFor(context)
      await ensureDayOpen(tx, context, businessDate)
      const before = await internalSnapshot(tx, context.storeId, id)
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
        await tx`
          update bike_ops.repair_details set contact_type = ${fields.contactType}, contact_ciphertext = ${encryptContact(fields.contactValue ?? '', key)},
            contact_fingerprint = ${contactFingerprint(fields.contactValue ?? '', key)}, repair_type = ${fields.repairType}, repair_project = ${fields.repairProject},
            pickup_date = ${fields.pickupDate || null}, repair_status = ${fields.status}
          where work_item_id = ${id}
        `
      } else if (kind === 'pickup') {
        const normalized = validatePickup(input.values)
        if (!normalized.ok) throw new ApiProblem(400, 'INVALID_PICKUP', normalized.error)
        const fields = normalized.fields
        title = fields.title ?? ''
        detail = fields.detail ?? ''
        meta = fields.meta ?? ''
        status = fields.status ?? ''
        await tx`update bike_ops.pickup_details set pickup_source = ${fields.pickupSource}, self_pickup_platform = ${fields.selfPickupPlatform || null} where work_item_id = ${id}`
      } else {
        const values = input.values as { title?: string; detail?: string; meta?: string; status?: string }
        title = values.title?.trim() ?? ''
        detail = values.detail?.trim() ?? ''
        meta = values.meta?.trim() ?? ''
        status = values.status?.trim() ?? ''
        if (!title || !detail || !status) throw new ApiProblem(400, 'VALIDATION_ERROR', '请填写名称、事项说明和当前状态。')
      }
      const updated = await tx<{ revision: number }[]>`
        update bike_ops.work_items set title = ${title}, detail = ${detail}, meta = ${meta}, status = ${status}, updated_by = ${context.userId}, revision = revision + 1, updated_at = now()
        where id = ${id} and store_id = ${context.storeId} and revision = ${input.expectedRevision} and deleted_at is null
        returning revision
      `
      if (!updated[0]) throw new ApiProblem(409, 'REVISION_CONFLICT', '数据已被其他同事修改，请刷新后重试。')
      const after = await internalSnapshot(tx, context.storeId, id)
      const eventId = await writeAudit(tx, { context, action: 'edit-record', entityType: 'work-item', entityId: id, entityRevision: updated[0].revision, businessDate, summary: `编辑：${title}`, before, after, reversible: true, requestId: request.id })
      const record = await getWorkItem(tx, context.storeId, id, businessDate, config)
      return { status: 200, body: { ok: true, record, eventId } }
    })
    return reply.code(result.status).send(result.body)
  })

  async function actionRoute(path: string, action: string, handler: ActionHandler): Promise<void> {
    app.post(path, { preHandler: guards }, async (request, reply) => {
      const context = request.auth!
      const id = (request.params as { id: string }).id
      const input = actionSchema.parse(request.body)
      const result = await idempotent(sql, request, async (tx) => {
        const businessDate = await businessDateFor(context)
        await ensureDayOpen(tx, context, businessDate)
        const before = await internalSnapshot(tx, context.storeId, id)
        if (!before) throw new ApiProblem(404, 'NOT_FOUND', '没有找到这条台账记录。')
        const item = before.workItem as Record<string, unknown>
        if (item.revision !== input.expectedRevision) throw new ApiProblem(409, 'REVISION_CONFLICT', '数据已被其他同事修改。')
        const outcome = await handler(tx, context, id, input.expectedRevision, businessDate)
        const after = await internalSnapshot(tx, context.storeId, id)
        const revision = Number((after?.workItem as Record<string, unknown> | undefined)?.revision ?? input.expectedRevision + 1)
        const eventId = await writeAudit(tx, { context, action, entityType: 'work-item', entityId: id, entityRevision: revision, businessDate, summary: outcome.summary, before, after, reversible: true, requestId: request.id })
        const record = await getWorkItem(tx, context.storeId, id, businessDate, config)
        return { status: 200, body: { ok: true, record, eventId, ...(outcome.extra ?? {}) } }
      })
      return reply.code(result.status).send(result.body)
    })
  }

  await actionRoute('/api/v1/work-items/:id/list-resale', 'complete-resale-listing', async (tx, context, id, revision) => {
    const rows = await tx<{ title: string }[]>`
      update bike_ops.work_items w set status = '已上架', revision = revision + 1, updated_by = ${context.userId}, updated_at = now()
      from bike_ops.resale_details r
      where w.id = ${id} and w.store_id = ${context.storeId} and w.revision = ${revision}
        and w.lifecycle = 'active' and r.work_item_id = w.id and r.resale_stage = 'pending'
      returning w.title
    `
    if (!rows[0]) throw new ApiProblem(409, 'INVALID_STATE', '只有待上架二手车可以完成上架。')
    await tx`update bike_ops.resale_details set resale_stage = 'listed', listed_at = now() where work_item_id = ${id}`
    return { summary: `维修完毕并上架：${rows[0].title}` }
  })

  await actionRoute('/api/v1/work-items/:id/sell-resale', 'sell-resale', async (tx, context, id, revision) => {
    const rows = await tx<{ title: string }[]>`
      update bike_ops.work_items w set lifecycle = 'sold', revision = revision + 1, updated_by = ${context.userId}, updated_at = now()
      from bike_ops.resale_details r
      where w.id = ${id} and w.store_id = ${context.storeId} and w.revision = ${revision}
        and w.lifecycle = 'active' and r.work_item_id = w.id and r.resale_stage = 'listed'
      returning w.title
    `
    if (!rows[0]) throw new ApiProblem(409, 'INVALID_STATE', '只有已上架二手车可以标记售出。')
    await tx`update bike_ops.resale_details set resale_stage = 'sold', sold_at = now() where work_item_id = ${id}`
    return { summary: `已售出：${rows[0].title}` }
  })

  await actionRoute('/api/v1/work-items/:id/complete-repair', 'complete-repair', async (tx, context, id, revision, businessDate) => {
    const [repair] = await tx<{ title: string; repairType: string }[]>`
      select w.title, r.repair_type from bike_ops.work_items w join bike_ops.repair_details r on r.work_item_id = w.id
      where w.id = ${id} and w.store_id = ${context.storeId} and w.kind = 'repair' and w.lifecycle = 'active'
    `
    if (!repair) throw new ApiProblem(409, 'INVALID_STATE', '没有找到可完成的维修车辆。')
    const route = repairCompletionRoute(repair)
    if (!route.ok) throw new ApiProblem(400, 'INVALID_REPAIR', route.error)
    if (route.route === 'completed') {
      const updated = await tx`
        update bike_ops.work_items set status = '已完成', lifecycle = 'completed', revision = revision + 1, updated_by = ${context.userId}, updated_at = now()
        where id = ${id} and store_id = ${context.storeId} and revision = ${revision}
        returning id
      `
      if (!updated.length) throw new ApiProblem(409, 'REVISION_CONFLICT', '维修记录已被其他同事修改。')
      await tx`update bike_ops.repair_details set repair_status = '已完成', repair_completed_at = now(), completed_on = ${businessDate}, completed_at = now() where work_item_id = ${id}`
      return { summary: `门店产品维修已完成：${repair.title}`, extra: { route: 'completed' } }
    }
    const updated = await tx`
      update bike_ops.work_items set kind = 'pickup', revision = revision + 1, updated_by = ${context.userId}, updated_at = now()
      where id = ${id} and store_id = ${context.storeId} and revision = ${revision}
      returning id
    `
    if (!updated.length) throw new ApiProblem(409, 'REVISION_CONFLICT', '维修记录已被其他同事修改。')
    await tx`update bike_ops.repair_details set repair_completed_at = now() where work_item_id = ${id}`
    await tx`
      insert into bike_ops.pickup_details (work_item_id, pickup_source, self_pickup_platform, notification_status, repair_work_item_id)
      values (${id}, 'repair', null, 'pending', ${id})
    `
    return { summary: `维修完毕并转入待取：${repair.title}`, extra: { route: 'pickup' } }
  })

  await actionRoute('/api/v1/work-items/:id/complete-handover', 'complete-handover', async (tx, context, id, revision, businessDate) => {
    const rows = await tx<{ title: string }[]>`
      update bike_ops.work_items set status = '已完成', lifecycle = 'completed', revision = revision + 1, updated_by = ${context.userId}, updated_at = now()
      where id = ${id} and store_id = ${context.storeId} and revision = ${revision} and kind = 'handover' and lifecycle = 'active'
      returning title
    `
    if (!rows[0]) throw new ApiProblem(409, 'INVALID_STATE', '没有找到可完成的交接事项。')
    await tx`update bike_ops.handover_details set completed_on = ${businessDate}, completed_at = now(), completed_by = ${context.userId} where work_item_id = ${id}`
    return { summary: `完成交接：${rows[0].title}` }
  })

  app.post('/api/v1/work-items/:id/notification', { preHandler: guards }, async (request, reply) => {
    const context = request.auth!
    const id = (request.params as { id: string }).id
    const input = notificationSchema.parse(request.body)
    const result = await idempotent(sql, request, async (tx) => {
      const businessDate = await businessDateFor(context)
      await ensureDayOpen(tx, context, businessDate)
      const before = await internalSnapshot(tx, context.storeId, id)
      if (!before) throw new ApiProblem(404, 'NOT_FOUND', '没有找到待取车辆。')
      const item = before.workItem as Record<string, unknown>
      if (item.revision !== input.expectedRevision) throw new ApiProblem(409, 'REVISION_CONFLICT', '通知状态已被其他同事修改。')
      const rows = await tx<{ title: string; revision: number }[]>`
        update bike_ops.work_items w set revision = revision + 1, updated_by = ${context.userId}, updated_at = now()
        from bike_ops.pickup_details p
        where w.id = ${id} and w.store_id = ${context.storeId} and w.revision = ${input.expectedRevision}
          and w.lifecycle = 'active' and p.work_item_id = w.id and p.picked_up_on is null
        returning w.title, w.revision
      `
      if (!rows[0]) throw new ApiProblem(409, 'INVALID_STATE', '已取车辆或已修改记录不能更新通知状态。')
      await tx`update bike_ops.pickup_details set notification_status = ${input.notificationStatus} where work_item_id = ${id}`
      const after = await internalSnapshot(tx, context.storeId, id)
      const eventId = await writeAudit(tx, { context, action: 'update-pickup-notification', entityType: 'work-item', entityId: id, entityRevision: rows[0].revision, businessDate, summary: `${input.notificationStatus === 'notified' ? '已通知' : '等待确认通知'}：${rows[0].title}`, before, after, reversible: true, requestId: request.id })
      const record = await getWorkItem(tx, context.storeId, id, businessDate, config)
      return { status: 200, body: { ok: true, record, eventId } }
    })
    return reply.code(result.status).send(result.body)
  })

  app.post('/api/v1/work-items/:id/pick-up', { preHandler: guards }, async (request, reply) => {
    const context = request.auth!
    const id = (request.params as { id: string }).id
    const input = pickupCompleteSchema.parse(request.body)
    const result = await idempotent(sql, request, async (tx) => {
      const businessDate = await businessDateFor(context)
      await ensureDayOpen(tx, context, businessDate)
      const current = await getWorkItem(tx, context.storeId, id, businessDate, config)
      if (!current) throw new ApiProblem(404, 'NOT_FOUND', '没有找到可取车的记录。')
      if (current.revision !== input.expectedRevision) throw new ApiProblem(409, 'REVISION_CONFLICT', '待取记录已被其他同事修改。')
      const validation = validatePickupCompletion(current, input.pickupCode)
      if (!validation.ok) throw new ApiProblem(409, 'PICKUP_VALIDATION_FAILED', validation.error ?? '当前记录不能确认取车。')
      const before = await internalSnapshot(tx, context.storeId, id)
      const rows = await tx<{ title: string; revision: number }[]>`
        update bike_ops.work_items w set status = '已取车', lifecycle = 'picked-up', revision = revision + 1, updated_by = ${context.userId}, updated_at = now()
        from bike_ops.pickup_details p
        where w.id = ${id} and w.store_id = ${context.storeId} and w.revision = ${input.expectedRevision}
          and w.lifecycle = 'active' and p.work_item_id = w.id and p.picked_up_on is null
        returning w.title, w.revision
      `
      if (!rows[0]) throw new ApiProblem(409, 'REVISION_CONFLICT', '待取记录已被其他同事修改。')
      await tx`update bike_ops.pickup_details set picked_up_on = ${businessDate}, picked_up_at = now(), picked_up_by = ${context.userId} where work_item_id = ${id}`
      const after = await internalSnapshot(tx, context.storeId, id)
      const eventId = await writeAudit(tx, { context, action: 'complete-pickup', entityType: 'work-item', entityId: id, entityRevision: rows[0].revision, businessDate, summary: `确认取车：${rows[0].title}`, before, after, reversible: true, requestId: request.id })
      const record = await getWorkItem(tx, context.storeId, id, businessDate, config)
      return { status: 200, body: { ok: true, record, eventId } }
    })
    return reply.code(result.status).send(result.body)
  })

  app.delete('/api/v1/work-items/:id', { preHandler: guards }, async (request, reply) => {
    const context = request.auth!
    const id = (request.params as { id: string }).id
    const input = actionSchema.parse(request.body)
    const result = await idempotent(sql, request, async (tx) => {
      const businessDate = await businessDateFor(context)
      await ensureDayOpen(tx, context, businessDate)
      const before = await internalSnapshot(tx, context.storeId, id)
      if (!before) throw new ApiProblem(404, 'NOT_FOUND', '没有找到这条台账记录。')
      const rows = await tx<{ title: string; revision: number }[]>`
        update bike_ops.work_items set lifecycle = 'deleted', deleted_at = now(), deleted_by = ${context.userId}, updated_by = ${context.userId}, revision = revision + 1, updated_at = now()
        where id = ${id} and store_id = ${context.storeId} and revision = ${input.expectedRevision} and lifecycle = 'active' and deleted_at is null
        returning title, revision
      `
      if (!rows[0]) throw new ApiProblem(409, 'REVISION_CONFLICT', '该记录已完成、删除或被其他同事修改。')
      const after = await internalSnapshot(tx, context.storeId, id)
      const eventId = await writeAudit(tx, { context, action: 'remove-record', entityType: 'work-item', entityId: id, entityRevision: rows[0].revision, businessDate, summary: `删除：${rows[0].title}`, before, after, reversible: true, requestId: request.id })
      return { status: 200, body: { ok: true, id, eventId } }
    })
    return reply.code(result.status).send(result.body)
  })
}
