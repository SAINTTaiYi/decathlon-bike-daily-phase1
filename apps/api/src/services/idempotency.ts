import { createHash } from 'node:crypto'
import type { FastifyRequest } from 'fastify'
import type { Database } from '@bike-ops/database'

export class ApiProblem extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message)
  }
}

export interface IdempotentResult<T = unknown> {
  status: number
  body: T
}

function requestHash(request: FastifyRequest): string {
  return createHash('sha256').update(`${request.method}\n${request.routeOptions.url}\n${JSON.stringify(request.body ?? null)}`).digest('hex')
}

export function readIdempotencyKey(request: FastifyRequest): string {
  const value = request.headers['idempotency-key']
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
    throw new ApiProblem(400, 'IDEMPOTENCY_KEY_REQUIRED', '写操作必须携带有效的 Idempotency-Key。')
  }
  return value
}

export async function idempotent<T>(sql: Database, request: FastifyRequest, handler: (tx: Database) => Promise<IdempotentResult<T>>): Promise<IdempotentResult<T>> {
  if (!request.auth) throw new ApiProblem(401, 'UNAUTHENTICATED', '请重新登录。')
  const key = readIdempotencyKey(request)
  const hash = requestHash(request)
  const context = request.auth
  return sql.begin(async (transaction) => {
    const tx = transaction as unknown as Database
    const inserted = await tx<{ idempotencyKey: string }[]>`
      insert into bike_ops.idempotency_requests (store_id, user_id, idempotency_key, request_hash)
      values (${context.storeId}, ${context.userId}, ${key}, ${hash})
      on conflict do nothing returning idempotency_key
    `
    if (!inserted.length) {
      const [existing] = await tx<{ requestHash: string; responseStatus: number | null; responseBody: T | null }[]>`
        select request_hash, response_status, response_body
        from bike_ops.idempotency_requests
        where store_id = ${context.storeId} and user_id = ${context.userId} and idempotency_key = ${key}
      `
      if (!existing || existing.requestHash !== hash) throw new ApiProblem(409, 'IDEMPOTENCY_KEY_REUSED', '该请求标识已经用于不同操作。')
      if (existing.responseStatus === null || existing.responseBody === null) throw new ApiProblem(409, 'REQUEST_IN_PROGRESS', '相同操作正在处理中，请稍后刷新。')
      return { status: existing.responseStatus, body: existing.responseBody }
    }
    const result = await handler(tx)
    await tx`
      update bike_ops.idempotency_requests set response_status = ${result.status}, response_body = ${tx.json(result.body as never)}
      where store_id = ${context.storeId} and user_id = ${context.userId} and idempotency_key = ${key}
    `
    return result
  }) as Promise<IdempotentResult<T>>
}
