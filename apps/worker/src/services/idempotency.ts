import type { Context } from 'hono'
import type { AppConfig, WorkerEnv } from '../env.js'
import type { AuthContext } from '../auth/types.js'
import { first, nowIso } from '../db.js'
import { sha256 } from '../lib/crypto.js'
import { ApiProblem } from './problems.js'

export interface IdempotentResult<T = unknown> {
  status: number
  body: T
}

type Vars = { config: AppConfig; auth: AuthContext | null }

function readIdempotencyKey(c: Context<{ Bindings: WorkerEnv; Variables: Vars }>): string {
  const value = c.req.header('idempotency-key')
  if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
    throw new ApiProblem(400, 'IDEMPOTENCY_KEY_REQUIRED', '写操作必须携带有效的 Idempotency-Key。')
  }
  return value
}

export async function idempotent<T>(
  c: Context<{ Bindings: WorkerEnv; Variables: Vars }>,
  body: unknown,
  handler: (db: D1Database) => Promise<IdempotentResult<T>>
): Promise<IdempotentResult<T>> {
  const auth = c.get('auth')
  if (!auth) throw new ApiProblem(401, 'UNAUTHENTICATED', '请重新登录。')
  const key = readIdempotencyKey(c)
  const hash = await sha256(`${c.req.method}\n${new URL(c.req.url).pathname}\n${JSON.stringify(body ?? null)}`)
  const stamp = nowIso()
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

  const insert = await c.env.DB.prepare(`
    INSERT OR IGNORE INTO idempotency_requests (store_id, user_id, idempotency_key, request_hash, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(auth.storeId, auth.userId, key, hash, stamp, expiresAt).run()

  if (!insert.meta.changes) {
    const existing = await first<{ request_hash: string; response_status: number | null; response_body: string | null }>(
      c.env.DB.prepare(`
        SELECT request_hash, response_status, response_body
        FROM idempotency_requests
        WHERE store_id = ? AND user_id = ? AND idempotency_key = ?
      `).bind(auth.storeId, auth.userId, key)
    )
    if (!existing || existing.request_hash !== hash) throw new ApiProblem(409, 'IDEMPOTENCY_KEY_REUSED', '该请求标识已经用于不同操作。')
    if (existing.response_status === null || existing.response_body === null) {
      throw new ApiProblem(409, 'REQUEST_IN_PROGRESS', '相同操作正在处理中，请稍后刷新。')
    }
    return { status: existing.response_status, body: JSON.parse(existing.response_body) as T }
  }

  let result: IdempotentResult<T>
  try {
    result = await handler(c.env.DB)
  } catch (error) {
    if (error instanceof ApiProblem) {
      result = {
        status: error.status,
        body: { error: error.code, message: error.message } as T
      }
    } else {
      await c.env.DB.prepare(`
        DELETE FROM idempotency_requests
        WHERE store_id = ? AND user_id = ? AND idempotency_key = ? AND response_status IS NULL
      `).bind(auth.storeId, auth.userId, key).run()
      throw error
    }
  }
  await c.env.DB.prepare(`
    UPDATE idempotency_requests
    SET response_status = ?, response_body = ?
    WHERE store_id = ? AND user_id = ? AND idempotency_key = ?
  `).bind(result.status, JSON.stringify(result.body), auth.storeId, auth.userId, key).run()
  return result
}
