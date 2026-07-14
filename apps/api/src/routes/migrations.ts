import type { FastifyInstance } from 'fastify'
import type { Database } from '@bike-ops/database'
import { localV5ImportSchema } from '@bike-ops/contracts'
import { createAuthMiddleware } from '../auth/middleware.js'
import type { AuthContext } from '../auth/types.js'
import type { AppConfig } from '../config.js'
import { contactFingerprint, encryptContact } from '../lib/contact-crypto.js'
import { businessDateFor, writeAudit } from '../services/business.js'
import { ApiProblem, idempotent } from '../services/idempotency.js'
import { planLegacyRecords, type LegacyRecordPlan } from '../services/legacy-import.js'

interface LegacyInput {
  input: ReturnType<typeof localV5ImportSchema.parse>
  accepted: LegacyRecordPlan[]
  rejected: { index: number; sourceId: string; reason: string }[]
  dayCount: number
  byScene: Record<string, number>
}

function plan(payload: unknown): LegacyInput {
  const input = localV5ImportSchema.parse(payload)
  const ledger = input.ledger as { version?: unknown; records?: unknown }
  if (Number(ledger?.version) !== 5 || !Array.isArray(ledger?.records)) throw new ApiProblem(400, 'INVALID_LOCAL_V5', '本机台账不是可识别的 v5 数据。')
  const byScene = ledger.records.reduce<Record<string, number>>((counts, value) => {
    const scene = typeof value === 'object' && value && 'scene' in value ? String(value.scene) : 'unknown'
    counts[scene] = (counts[scene] ?? 0) + 1
    return counts
  }, {})
  const records = planLegacyRecords(ledger.records)
  return { input, accepted: records.accepted, rejected: records.rejected, dayCount: input.days.length, byScene }
}

function validTimestamp(value: string | null): string | null {
  if (!value) return null
  const timestamp = new Date(value)
  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString()
}

function validDay(value: unknown): value is { dateKey: string; kpi: Record<string, unknown>; kpiSavedAt: string } {
  if (!value || typeof value !== 'object') return false
  const day = value as Record<string, unknown>
  return /^\d{4}-\d{2}-\d{2}$/u.test(String(day.dateKey ?? '')) && Boolean(day.kpi && typeof day.kpi === 'object') && Boolean(validTimestamp(String(day.kpiSavedAt ?? '')))
}

function count(value: unknown): number {
  const number = Number.parseInt(String(value ?? 0), 10)
  return Number.isFinite(number) && number >= 0 ? Math.min(number, 9999) : 0
}

async function insertLegacyRecord(tx: Database, config: AppConfig, context: AuthContext, record: LegacyRecordPlan): Promise<string> {
  const [created] = await tx<{ id: string }[]>`
    insert into bike_ops.work_items (store_id, kind, title, detail, meta, status, lifecycle, created_by, updated_by)
    values (${context.storeId}, ${record.kind}, ${record.title}, ${record.detail}, ${record.meta}, ${record.status}, ${record.lifecycle}, ${context.userId}, ${context.userId})
    returning id
  `
  if (!created) throw new Error('LEGACY_WORK_ITEM_INSERT_FAILED')

  if (record.repair) {
    if (!config.CONTACT_ENCRYPTION_KEY) throw new ApiProblem(503, 'CONTACT_ENCRYPTION_NOT_CONFIGURED', '联系方式加密尚未配置。')
    const repair = record.repair
    await tx`
      insert into bike_ops.repair_details (work_item_id, contact_type, contact_ciphertext, contact_fingerprint, repair_type, repair_project, pickup_date, repair_status, repair_completed_at, completed_on, completed_at)
      values (${created.id}, ${repair.contactType}, ${encryptContact(repair.contactValue, config.CONTACT_ENCRYPTION_KEY)},
        ${contactFingerprint(repair.contactValue, config.CONTACT_ENCRYPTION_KEY)}, ${repair.repairType}, ${repair.repairProject}, ${repair.pickupDate || null},
        ${repair.repairStatus}, ${validTimestamp(repair.repairCompletedAt)}, ${repair.completedOn}, ${validTimestamp(repair.completedAt)})
    `
  }
  if (record.pickup) {
    const pickup = record.pickup
    await tx`
      insert into bike_ops.pickup_details (work_item_id, pickup_source, self_pickup_platform, notification_status, repair_work_item_id, picked_up_on, picked_up_at, picked_up_by)
      values (${created.id}, ${pickup.pickupSource}, ${pickup.selfPickupPlatform}, ${pickup.notificationStatus},
        ${pickup.pickupSource === 'repair' ? created.id : null}, ${pickup.pickedUpOn}, ${validTimestamp(pickup.pickedUpAt)}, ${pickup.pickedUpOn ? context.userId : null})
    `
  }
  if (record.resale) {
    await tx`insert into bike_ops.resale_details (work_item_id, resale_stage, listed_at) values (${created.id}, ${record.resale.resaleStage}, ${validTimestamp(record.resale.listedAt)})`
  }
  if (record.handover) {
    await tx`
      insert into bike_ops.handover_details (work_item_id, completed_on, completed_at, completed_by)
      values (${created.id}, ${record.handover.completedOn}, ${validTimestamp(record.handover.completedAt)}, ${record.handover.completedOn ? context.userId : null})
    `
  }
  return created.id
}

export async function registerMigrationRoutes(app: FastifyInstance, sql: Database, config: AppConfig): Promise<void> {
  const auth = createAuthMiddleware(sql, config)
  app.post('/api/v1/migrations/local-v5/preview', { preHandler: [auth.loadSession, auth.requirePasswordChanged, auth.requireCsrf, auth.requireRole('manager', 'admin')] }, async (request) => {
    const result = plan(request.body)
    return {
      ok: true,
      recordCount: result.accepted.length + result.rejected.length,
      acceptedCount: result.accepted.length,
      rejectedCount: result.rejected.length,
      rejected: result.rejected.slice(0, 100),
      dayCount: result.dayCount,
      byScene: result.byScene,
      warning: '只有通过新服务端规则的记录会导入；拒绝项不会写入数据库。'
    }
  })

  app.post('/api/v1/migrations/local-v5/import', { preHandler: [auth.loadSession, auth.requirePasswordChanged, auth.requireCsrf, auth.requireRole('manager', 'admin')] }, async (request, reply) => {
    const context = request.auth!
    const migrationPlan = plan(request.body)
    const total = migrationPlan.accepted.length + migrationPlan.rejected.length
    if (total > 5000) throw new ApiProblem(413, 'IMPORT_TOO_LARGE', '单次导入最多 5000 条记录。')
    const result = await idempotent(sql, request, async (tx) => {
      const [existing] = await tx<{ id: string; status: string; result: unknown }[]>`
        select id, status, result from bike_ops.import_jobs
        where store_id = ${context.storeId} and source_fingerprint = ${migrationPlan.input.sourceFingerprint}
      `
      if (existing) throw new ApiProblem(409, 'IMPORT_ALREADY_EXISTS', '同一份本机数据已经导入。')
      const [job] = await tx<{ id: string }[]>`
        insert into bike_ops.import_jobs (store_id, imported_by, source_version, source_fingerprint, status, result)
        values (${context.storeId}, ${context.userId}, 5, ${migrationPlan.input.sourceFingerprint}, 'planned',
          ${tx.json({ acceptedCount: migrationPlan.accepted.length, rejected: migrationPlan.rejected } as never)}) returning id
      `
      if (!job) throw new Error('IMPORT_JOB_CREATE_FAILED')

      const importedIds: string[] = []
      for (const record of migrationPlan.accepted) importedIds.push(await insertLegacyRecord(tx, config, context, record))

      let importedDays = 0
      for (const unknownDay of migrationPlan.input.days) {
        if (!validDay(unknownDay)) continue
        const day = unknownDay as { dateKey: string; kpi: Record<string, unknown>; kpiSavedAt: string }
        const savedAt = validTimestamp(day.kpiSavedAt)
        const inserted = await tx`
          insert into bike_ops.daily_closings (
            store_id, business_date, sales_vehicles, safety_checks, safety_model, valid_reviews, used_sold, used_received,
            sales_saved_at, sales_saved_by
          ) values (
            ${context.storeId}, ${day.dateKey}, ${count(day.kpi.salesVehicles)}, ${count(day.kpi.safetyChecks)}, ${String(day.kpi.safetyModel ?? '').trim().slice(0, 120)},
            ${count(day.kpi.validReviews)}, ${count(day.kpi.usedSold)}, ${count(day.kpi.usedReceived)}, ${savedAt}, ${context.userId}
          ) on conflict (store_id, business_date) do nothing returning id
        `
        if (inserted.length) importedDays += 1
      }

      const resultBody = {
        acceptedCount: importedIds.length,
        rejectedCount: migrationPlan.rejected.length,
        rejected: migrationPlan.rejected,
        importedDays,
        skippedDays: migrationPlan.dayCount - importedDays
      }
      await tx`update bike_ops.import_jobs set status = 'completed', result = ${tx.json(resultBody as never)}, completed_at = now() where id = ${job.id}`
      const businessDate = await businessDateFor(context)
      await writeAudit(tx, {
        context, action: 'import-local-v5', entityType: 'import-job', entityId: job.id, businessDate,
        summary: `导入 v5：${importedIds.length} 条记录，拒绝 ${migrationPlan.rejected.length} 条`,
        before: null, after: resultBody, reversible: false, requestId: request.id
      })
      return { status: 201, body: { ok: true, importJobId: job.id, status: 'completed', ...resultBody } }
    })
    return reply.code(result.status).send(result.body)
  })
}
