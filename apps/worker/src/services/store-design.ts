import { first, nowIso } from '../db.js'

// 门店设计云端图纸服务层（2026-09-17）。
//
// 数据边界（铁律）：本模块每个函数都以 storeId 为第一参数，SQL 全部带 store_id，
// 绝不存在跨店读写；storeId 由路由层从会话取得，请求体里不携带门店标识。
//
// 并发：写入带 expectedRevision 乐观锁。首次上传 expectedRevision=0；
// 版本不符返回 conflict（附当前版本与保存人），路由层转 409 让前端先载入。
//
// 本模块刻意不写 audit_events：audit_module 的 CHECK 只允许 8 个既有模块，
// 扩列要重建目前最大的核心表（同 food-ledger 的判断）。本表自带
// revision / updated_at / updated_by / updated_by_name，改动记录已可追溯。

/** 图纸体积上限（字符数）——与 @bike-ops/contracts 的 DESIGN_MAX_PAYLOAD_CHARS 同值。
 *  服务层再兜一道：路由层解析前无法知道体积，任何调用方都不该能把巨型 payload 落库。 */
export const DESIGN_MAX_PAYLOAD_CHARS = 512_000

export interface StoreDesignRecord {
  payload: string
  revision: number
  updatedAt: string
  updatedBy: string | null
  updatedByName: string
}

export interface StoreDesignActor {
  userId: string
  displayName: string
}

export type SaveStoreDesignResult =
  | { ok: true; revision: number; updatedAt: string; updatedByName: string }
  | { ok: false; reason: 'conflict'; revision: number; updatedAt: string; updatedByName: string }
  | { ok: false; reason: 'too_large'; limit: number; size: number }

interface DesignRow {
  payload: string
  revision: number
  updated_at: string
  updated_by: string | null
  updated_by_name: string
}

/** 读取本店图纸；没有则返回 null（不是报错 —— 「还没人保存过」是正常状态）。 */
export async function readStoreDesign(db: D1Database, storeId: string): Promise<StoreDesignRecord | null> {
  const row = await first<DesignRow>(db.prepare(
    'SELECT payload, revision, updated_at, updated_by, updated_by_name FROM store_designs WHERE store_id = ?'
  ).bind(storeId))
  if (!row) return null
  return {
    payload: row.payload,
    revision: row.revision,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    updatedByName: row.updated_by_name
  }
}

/** 保存本店图纸（乐观锁）。payload 已是序列化后的 JSON 字符串。 */
export async function saveStoreDesign(
  db: D1Database,
  storeId: string,
  actor: StoreDesignActor,
  input: { expectedRevision: number; payload: string }
): Promise<SaveStoreDesignResult> {
  if (input.payload.length > DESIGN_MAX_PAYLOAD_CHARS) {
    return { ok: false, reason: 'too_large', limit: DESIGN_MAX_PAYLOAD_CHARS, size: input.payload.length }
  }
  const existing = await readStoreDesign(db, storeId)
  const currentRevision = existing ? existing.revision : 0
  if (input.expectedRevision !== currentRevision) {
    return {
      ok: false,
      reason: 'conflict',
      revision: currentRevision,
      updatedAt: existing ? existing.updatedAt : '',
      updatedByName: existing ? existing.updatedByName : ''
    }
  }
  const now = nowIso()
  if (!existing) {
    await db.prepare(
      'INSERT INTO store_designs (store_id, payload, revision, updated_at, updated_by, updated_by_name) VALUES (?, ?, 1, ?, ?, ?)'
    ).bind(storeId, input.payload, now, actor.userId, actor.displayName).run()
    return { ok: true, revision: 1, updatedAt: now, updatedByName: actor.displayName }
  }
  // WHERE revision = ? 是并发下的第二道闸：两个请求同时通过上面的比较时，
  // 只有先落库的那个能改到行（changes=0 的那个重新读一次并报冲突）。
  const result = await db.prepare(
    'UPDATE store_designs SET payload = ?, revision = revision + 1, updated_at = ?, updated_by = ?, updated_by_name = ? WHERE store_id = ? AND revision = ?'
  ).bind(input.payload, now, actor.userId, actor.displayName, storeId, input.expectedRevision).run()
  if (!result.meta.changes) {
    const latest = await readStoreDesign(db, storeId)
    return {
      ok: false,
      reason: 'conflict',
      revision: latest ? latest.revision : 0,
      updatedAt: latest ? latest.updatedAt : '',
      updatedByName: latest ? latest.updatedByName : ''
    }
  }
  return { ok: true, revision: input.expectedRevision + 1, updatedAt: now, updatedByName: actor.displayName }
}
