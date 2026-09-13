// 食品保质期台账：日期口径与状态判定（2026-09-13）。
//
// 口径来自门店现用的 Excel 台账《五象食品&产品台账登记本》：
//   食品类：            预警日 = EDATE(生产日期, 保质期月数 - 1)
//   非食品·生产日期：    预警日 = EDATE(生产日期, 保质期月数 - 1)
//   非食品·限制使用日期： 预警日 = EDATE(限制使用日期, -1)
// 到期日（保质期终点）：
//   生产日期口径：expires_on = EDATE(生产日期, 保质期月数)
//   限制使用日期口径：expires_on = 限制使用日期本身（限制使用日期即最后可用日）
//
// EDATE 语义与 Excel 一致：按自然月平移、日历日号不变；目标月没有该日号时取该月
// 最后一天（EDATE('2026-01-31', 1) → '2026-02-28'）。小数月份按 Excel 行为截断。

export const FOOD_KINDS = ['food', 'nonfood']
export const FOOD_DATE_TYPES = ['production', 'restricted']
export const FOOD_BATCH_STATUSES = ['open', 'sold_out', 'isolated']

// 门店 SOP（食品管理rules）：距保质期 <45 天来货需沟通、<30 天临期牌、<7 天下架。
export const FOOD_NEAR_SHELF_DAYS = 45
export const FOOD_DUE_SHELF_DAYS = 30
export const FOOD_PULL_SHELF_DAYS = 7

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function isIsoDate(value) {
  const match = DATE_PATTERN.exec(String(value ?? ''))
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1) return false
  return day <= daysInMonth(year, month)
}

// Excel EDATE 的等价实现。输入非法时返回 ''，调用方负责报错。
export function edate(isoDate, months) {
  const match = DATE_PATTERN.exec(String(isoDate ?? ''))
  if (!match) return ''
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const total = year * 12 + (month - 1) + Math.trunc(months)
  const targetYear = Math.floor(total / 12)
  const targetMonth = total - targetYear * 12 + 1
  const clampedDay = Math.min(day, daysInMonth(targetYear, targetMonth))
  return `${String(targetYear).padStart(4, '0')}-${String(targetMonth).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`
}

// ISO 日期平移天数（UTC 计算，不受时区影响）。
export function addDays(isoDate, days) {
  const match = DATE_PATTERN.exec(String(isoDate ?? ''))
  if (!match) return ''
  const stamp = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) + Math.trunc(days) * 86400000
  return new Date(stamp).toISOString().slice(0, 10)
}

// 两个 ISO 日期相差的天数（to - from）。用于「剩 N 天」展示与分级。
export function daysUntil(isoDate, today) {
  const from = DATE_PATTERN.exec(String(today ?? ''))
  const to = DATE_PATTERN.exec(String(isoDate ?? ''))
  if (!from || !to) return null
  const ms = Date.UTC(Number(to[1]), Number(to[2]) - 1, Number(to[3]))
    - Date.UTC(Number(from[1]), Number(from[2]) - 1, Number(from[3]))
  return Math.round(ms / 86400000)
}

// 由「品类 + 日期类型 + 基准日期 + 保质期月数」推出预警日与到期日。
// 服务端落库前必须调用，保证 Excel 公式口径在任何入口都一致。
export function computeFoodDates({ kind, dateType, productionDate, restrictedDate, shelfLifeMonths }) {
  const months = Number(shelfLifeMonths)
  if (!Number.isFinite(months) || months <= 0) return { ok: false, error: 'SHELF_LIFE_INVALID' }
  if (kind === 'nonfood' && dateType === 'restricted') {
    if (!isIsoDate(restrictedDate)) return { ok: false, error: 'DATE_INVALID' }
    return { ok: true, warnOn: edate(restrictedDate, -1), expiresOn: restrictedDate }
  }
  if (!isIsoDate(productionDate)) return { ok: false, error: 'DATE_INVALID' }
  return { ok: true, warnOn: edate(productionDate, months - 1), expiresOn: edate(productionDate, months) }
}

// 批次阶段（决定配色与排序权重）：
//   closed   已处理（已售罄 / 隔离）——不再提醒
//   expired  已过到期日——最高优先，需下架
//   flagged  已过预警日、仍未处理——「红标」，每周一清查对象
//   soon     距到期 ≤45 天（SOP 来货沟通线）——预警日是到期前 1 个月，因此
//            「距到期 ≤30 天」的批次必然已过预警日、落在 flagged 而不是独立一档
//   fresh    正常
// 剩余天数（≤30 临期牌 / ≤7 下架）由 UI 用 daysUntil 对 expiresOn 计算。
export function foodBatchStage(batch, today) {
  if (batch?.status && batch.status !== 'open') return 'closed'
  const toExpire = daysUntil(batch?.expiresOn ?? batch?.expires_on, today)
  if (toExpire !== null && toExpire < 0) return 'expired'
  const warnOn = batch?.warnOn ?? batch?.warn_on
  const toWarn = daysUntil(warnOn, today)
  if (toWarn !== null && toWarn <= 0) return 'flagged'
  if (toExpire !== null && toExpire <= FOOD_NEAR_SHELF_DAYS) return 'soon'
  return 'fresh'
}

// 「红标」判定与列表过滤共用：未处理且预警日已到。
export function isFoodBatchFlagged(batch, today) {
  if (batch?.status && batch.status !== 'open') return false
  const toWarn = daysUntil(batch?.warnOn ?? batch?.warn_on, today)
  return toWarn !== null && toWarn <= 0
}

// 来货登记时的 45 天沟通提醒：按收货日与到期日比较，与 SOP 第 8 条一致。
export function foodReceiptWarning(expiresOn, receivedDate) {
  const remaining = daysUntil(expiresOn, receivedDate)
  if (remaining === null) return null
  return remaining < FOOD_NEAR_SHELF_DAYS ? remaining : null
}
