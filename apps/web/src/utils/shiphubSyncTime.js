/**
 * Shiphub 同步时间的人话化。
 *
 * 口径（用户 2026-08-29 指定）：
 * - 1 小时以内：「X 分钟前同步」
 * - 超过 1 小时：「X 小时前同步」
 * 边界补充（口径之外的必要兜底，避免出现「0 分钟前」这种读起来别扭的文案）：
 * - 不足 1 分钟：「刚刚同步」
 * - 超过 24 小时：按天说，「X 天前同步」比「37 小时前」易读
 * - 无成功记录：「尚未同步」
 *
 * 时间一律用「已过去多久」表达而不是绝对时刻：门店看这块只关心新鲜度。
 */

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export function formatSyncAge(lastSuccessAt, now = Date.now()) {
  if (!lastSuccessAt) return '尚未同步'
  const stamp = typeof lastSuccessAt === 'number' ? lastSuccessAt : Date.parse(lastSuccessAt)
  if (!Number.isFinite(stamp)) return '尚未同步'

  const elapsed = now - stamp
  // 时钟偏移（服务端时间略快于本地）不该显示成负数
  if (elapsed < MINUTE) return '刚刚同步'
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} 分钟前同步`
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)} 小时前同步`
  return `${Math.floor(elapsed / DAY)} 天前同步`
}

/**
 * 从 summary 的分类数组里取最近一次成功同步时间。
 * 同步是三类一起跑的，所以取最大值代表这块看板的整体新鲜度。
 */
export function pickLatestSuccess(categories = []) {
  let latest = null
  for (const entry of categories) {
    const raw = entry && (entry.lastSuccessAt ?? entry.last_success_at)
    if (!raw) continue
    const stamp = typeof raw === 'number' ? raw : Date.parse(raw)
    if (!Number.isFinite(stamp)) continue
    if (latest === null || stamp > latest) latest = stamp
  }
  return latest
}

export function describeSyncState(categories = [], now = Date.now()) {
  const latest = pickLatestSuccess(categories)
  return { lastSuccessAt: latest, label: formatSyncAge(latest, now) }
}

export default describeSyncState
