import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { Database } from '@bike-ops/database'
import { attachmentCompleteSchema, attachmentPrepareSchema } from '@bike-ops/contracts'
import { createAuthMiddleware } from '../auth/middleware.js'
import type { AppConfig } from '../config.js'
import { businessDateFor, ensureDayOpen, writeAudit } from '../services/business.js'
import { ApiProblem, idempotent } from '../services/idempotency.js'
import { createSupabaseStorage, deleteObject, requireSupabaseStorage, signDownload, signUpload, verifyObject } from '../storage/supabase.js'

const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

export async function registerMediaRoutes(app: FastifyInstance, sql: Database, config: AppConfig): Promise<void> {
  const auth = createAuthMiddleware(sql, config)
  const mediaStorage = createSupabaseStorage(config)
  const guards = [auth.loadSession, auth.requirePasswordChanged, auth.requireCsrf]

  app.post('/api/v1/attachments/prepare', { preHandler: guards }, async (request, reply) => {
    const context = request.auth!
    const input = attachmentPrepareSchema.parse(request.body)
    const result = await idempotent(sql, request, async (tx) => {
      const businessDate = await businessDateFor(context)
      await ensureDayOpen(tx, context, businessDate)
      const [item] = await tx<{ id: string }[]>`select id from bike_ops.work_items where id = ${input.workItemId} and store_id = ${context.storeId} and deleted_at is null`
      if (!item) throw new ApiProblem(404, 'NOT_FOUND', '没有找到关联业务记录。')
      const countRows = await tx<{ count: number }[]>`select count(*)::int as count from bike_ops.attachments where work_item_id = ${input.workItemId} and status <> 'deleted'`
      if ((countRows[0]?.count ?? 0) >= 6) throw new ApiProblem(409, 'ATTACHMENT_LIMIT', '每条业务记录最多上传 6 张图片。')
      const attachmentId = randomUUID()
      const objectKey = `${config.APP_ENV}/${context.storeId}/${input.workItemId}/${attachmentId}.${extensions[input.mimeType]}`
      await tx`
        insert into bike_ops.attachments (id, store_id, work_item_id, object_key, original_name, mime_type, byte_size, sha256, uploaded_by)
        values (${attachmentId}, ${context.storeId}, ${input.workItemId}, ${objectKey}, ${input.fileName}, ${input.mimeType}, ${input.byteSize}, ${input.sha256}, ${context.userId})
      `
      const storage = requireSupabaseStorage(mediaStorage)
      const signed = await signUpload(storage, objectKey, input.mimeType, input.sha256)
      return { status: 201, body: { attachmentId, objectKey, ...signed } }
    })
    return reply.code(result.status).send(result.body)
  })

  app.post('/api/v1/attachments/complete', { preHandler: guards }, async (request, reply) => {
    const context = request.auth!
    const input = attachmentCompleteSchema.parse(request.body)
    const storage = requireSupabaseStorage(mediaStorage)
    const [attachment] = await sql<{ id: string; workItemId: string; objectKey: string; byteSize: number; mimeType: string; sha256: string; status: string }[]>`
      select id, work_item_id, object_key, byte_size, mime_type, sha256, status from bike_ops.attachments
      where id = ${input.attachmentId} and store_id = ${context.storeId}
    `
    if (!attachment) throw new ApiProblem(404, 'NOT_FOUND', '没有找到待确认图片。')
    if (attachment.status === 'ready') return reply.send({ ok: true, attachmentId: attachment.id })
    await verifyObject(storage, attachment.objectKey, attachment.byteSize, attachment.mimeType, attachment.sha256)
    const result = await idempotent(sql, request, async (tx) => {
      const businessDate = await businessDateFor(context)
      await tx`update bike_ops.attachments set width = ${input.width}, height = ${input.height}, status = 'ready', ready_at = now() where id = ${attachment.id} and status = 'pending'`
      await writeAudit(tx, { context, action: 'add-attachment', entityType: 'work-item', entityId: attachment.workItemId, businessDate, summary: '上传业务图片', reversible: false, requestId: request.id })
      return { status: 200, body: { ok: true, attachmentId: attachment.id } }
    })
    return reply.code(result.status).send(result.body)
  })

  app.get('/api/v1/work-items/:id/attachments', { preHandler: [auth.loadSession, auth.requirePasswordChanged] }, async (request) => {
    const context = request.auth!
    const workItemId = (request.params as { id: string }).id
    const rows = await sql<{ id: string; objectKey: string; originalName: string; mimeType: string; byteSize: number; width: number; height: number; createdAt: Date }[]>`
      select id, object_key, original_name, mime_type, byte_size, width, height, created_at from bike_ops.attachments
      where store_id = ${context.storeId} and work_item_id = ${workItemId} and status = 'ready' order by created_at
    `
    const storage = requireSupabaseStorage(mediaStorage)
    return { attachments: await Promise.all(rows.map(async (row) => ({ ...row, url: await signDownload(storage, row.objectKey), expiresIn: 300 }))) }
  })

  app.delete('/api/v1/attachments/:id', { preHandler: guards }, async (request, reply) => {
    const context = request.auth!
    const id = (request.params as { id: string }).id
    const [attachment] = await sql<{ id: string; objectKey: string; workItemId: string }[]>`select id, object_key, work_item_id from bike_ops.attachments where id = ${id} and store_id = ${context.storeId} and status <> 'deleted'`
    if (!attachment) throw new ApiProblem(404, 'NOT_FOUND', '没有找到图片。')
    const result = await idempotent(sql, request, async (tx) => {
      const businessDate = await businessDateFor(context)
      await ensureDayOpen(tx, context, businessDate)
      await tx`update bike_ops.attachments set status = 'deleted', deleted_at = now() where id = ${id}`
      await writeAudit(tx, { context, action: 'remove-attachment', entityType: 'work-item', entityId: attachment.workItemId, businessDate, summary: '删除业务图片', reversible: false, requestId: request.id })
      return { status: 200, body: { ok: true } }
    })
    const storage = requireSupabaseStorage(mediaStorage)
    await deleteObject(storage, attachment.objectKey).catch((error) => app.log.error({ error, attachmentId: id }, 'Supabase Storage cleanup failed; database remains soft-deleted'))
    return reply.code(result.status).send(result.body)
  })
}
