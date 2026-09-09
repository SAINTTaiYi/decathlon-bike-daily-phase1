import { first, nowIso } from '../db.js'

// ── 门店变更版本号（2026-09-09 实时推送第一批）─────────────────────────
// 前端从「定时轮询」改为「长轮询 + 版本号」：页面不再需要手动刷新，
// 任何影响门店可见数据的写操作 bump 一次版本号，挂起中的长轮询立即返回，
// 前端收到「变了」信号后重新拉取权威数据。
//
// 设计纪律：
// ① bump 是**尽力而为**——失败绝不阻断业务写入（记日志后吞掉）。
//    漏推的代价只是「这次变更要等下一次变更或超时才被看到」，
//    比因为版本号写失败而让业务操作失败要好得多。
// ② 只 bump 版本号，不写变更详情——前端自己重新拉权威数据，
//    避免业务表与事件表双写不一致。
// ③ 版本号单调递增，前端用 since 比较，永不需要时钟同步。

/** 读取门店当前版本号（无记录时为 0）。 */
export async function readStoreVersion(db: D1Database, storeId: string): Promise<number> {
  const row = await first<{ version: number }>(
    db.prepare('SELECT version FROM store_change_log WHERE store_id = ?').bind(storeId)
  )
  return Number(row?.version ?? 0)
}

/**
 * 标记门店数据已变更（版本号 +1）。
 *
 * 必须在业务写入**成功之后**调用；失败只记日志不抛错（见模块头 ①）。
 * 调用方无需 await 等待业务成功，但建议 `await` 以保证同一请求内的
 * 长轮询能看到本次变更（否则可能出现「操作完自己页面不更新」）。
 */
export async function bumpStoreVersion(db: D1Database, storeId: string): Promise<void> {
  const stamp = nowIso()
  try {
    await db.prepare(`
      INSERT INTO store_change_log (store_id, version, updated_at)
      VALUES (?, 1, ?)
      ON CONFLICT(store_id) DO UPDATE SET
        version = store_change_log.version + 1,
        updated_at = excluded.updated_at
    `).bind(storeId, stamp).run()
  } catch (error) {
    console.error(`[changes] bump failed store=${storeId} err=${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * 批量 bump（Shiphub 同步一轮涉及多分类，合并成一次写）。
 */
export async function bumpStoreVersionMany(db: D1Database, storeIds: readonly string[]): Promise<void> {
  const unique = [...new Set(storeIds.filter(Boolean))]
  for (const storeId of unique) await bumpStoreVersion(db, storeId)
}
