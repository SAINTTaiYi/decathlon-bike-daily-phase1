#!/usr/bin/env node
// 生成「管理后台验收种子数据」SQL（仅用于 Preview D1 bike-ops-preview）。
// - 确定性：固定 seed-* ID，重复执行会先清理再重插（幂等）
// - 日期相对运行日：今日 / 昨天 / 3 / 8 / 10 / 15 / 25 天前，保证今日、7 天、30 天统计均有值
// - FK 完整：区域→城市→门店→成员→工单/审批/审计
// - 不含任何真实数据；种子用户密码为占位符（不可登录，仅展示）
// 用法：node scripts/ops/seed-preview-admin.mjs > /tmp/seed-preview.sql

const DAY = 86400000
const now = new Date()
const businessDate = (offsetDays) => {
  const d = new Date(now.getTime() + offsetDays * DAY + 8 * 3600000)
  return d.toISOString().slice(0, 10)
}
// 时间戳按 Asia/Shanghai 业务日构建（09:00 本地），确保落在正确业务日窗口
const iso = (offsetDays, hour = 9) => new Date(`${businessDate(offsetDays)}T${String(hour).padStart(2, '0')}:00:00+08:00`).toISOString()

const lines = []
const q = (v) => v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`
const row = (cols, vals) => `INSERT INTO ${cols[0]} (${cols[1]}) VALUES (${cols[2].map(q).join(', ')});`

// ---- 清理（FK 安全顺序：子表先删）----
const CLEAN = [
  ['audit_events', "id LIKE 'seed-%'"],
  ['daily_closings', "id LIKE 'seed-%'"],
  ['role_change_requests', "id LIKE 'seed-%'"],
  ['store_transfer_requests', "id LIKE 'seed-%'"],
  ['work_items', "id LIKE 'seed-%'"],
  ['work_item_counters', "store_id LIKE 'seed-%'"],
  ['store_members', "id LIKE 'seed-%'"],
  ['users', "id LIKE 'seed-%'"],
  ['stores', "id LIKE 'seed-%'"]
]
for (const [table, predicate] of CLEAN) lines.push(`DELETE FROM ${table} WHERE ${predicate};`)

// ---- 门店：5 生效 / 1 停用（审核拒绝）/ 2 待审核 ----
const stores = [
  ['seed-st-01', 'BIKE-XH', '徐汇店', 'active', 0, iso(-25)],
  ['seed-st-02', 'BIKE-JA', '静安店', 'active', 0, iso(-10)],
  ['seed-st-03', 'BIKE-XZ', '西湖店', 'active', 0, iso(-3)],
  ['seed-st-04', 'BIKE-GZ', '天河店', 'active', 0, iso(-8)],
  ['seed-st-05', 'BIKE-SZ', '南山店', 'active', 0, iso(0, 8)],
  ['seed-st-06', 'BIKE-PD', '浦东店', 'disabled', 0, iso(-15)],
  ['seed-st-07', 'BIKE-BJ', '滨江店', 'disabled', 1, iso(-2)],
  ['seed-st-08', 'BIKE-PY', '番禺店', 'disabled', 1, iso(0, 7)]
]
for (const [id, code, name, status, pending, at] of stores) {
  lines.push(`INSERT INTO stores (id, code, name, timezone, status, pending_review, created_at, updated_at) VALUES (${[id, code, name, 'Asia/Shanghai', status, pending, at, at].map(q).join(', ')});`)
}

// ---- 用户 + 成员（5 家生效门店，共 15 人；密码占位不可登录）----
const members = [
  // [userId, username, displayName, storeId, role, createdAt]
  ['seed-u-01', 'seed.wanglm', '王立明', 'seed-st-01', 'admin', iso(-25)],
  ['seed-u-02', 'seed.chenxm', '陈晓曼', 'seed-st-01', 'manager', iso(-20)],
  ['seed-u-03', 'seed.liujg', '刘建国', 'seed-st-01', 'operator', iso(-18)],
  ['seed-u-04', 'seed.zhaoyq', '赵雅琴', 'seed-st-02', 'manager', iso(-10)],
  ['seed-u-05', 'seed.sunzq', '孙志强', 'seed-st-02', 'operator', iso(-9)],
  ['seed-u-06', 'seed.zhoulh', '周丽华', 'seed-st-03', 'admin', iso(-7)],
  ['seed-u-07', 'seed.wuyk', '吴永康', 'seed-st-03', 'operator', iso(-15)],
  ['seed-u-08', 'seed.zhengxl', '郑秀兰', 'seed-st-03', 'operator', iso(-5)],
  ['seed-u-09', 'seed.fengjj', '冯建军', 'seed-st-04', 'manager', iso(-8)],
  ['seed-u-10', 'seed.hexf', '何小芳', 'seed-st-04', 'operator', iso(-6)],
  ['seed-u-11', 'seed.huanggd', '黄国栋', 'seed-st-05', 'admin', iso(0, 8)],
  ['seed-u-12', 'seed.linwt', '林婉婷', 'seed-st-05', 'operator', iso(0, 8)],
  ['seed-u-13', 'seed.xuwj', '徐文杰', 'seed-st-05', 'operator', iso(0, 8)],
  ['seed-u-14', 'seed.liangxm', '梁雪梅', 'seed-st-01', 'operator', iso(-12)],
  ['seed-u-15', 'seed.jiangln', '蒋丽娜', 'seed-st-04', 'operator', iso(-4)]
]
const PH = 'seed-account-no-login'
for (const [id, username, name, storeId, role, at] of members) {
  lines.push(`INSERT INTO users (id, username_key, display_name, password_hash, status, must_change_password, failed_login_count, last_login_at, created_at, updated_at) VALUES (${[id, username, name, PH, 'active', 0, 0, iso(-1, 14), at, at].map(q).join(', ')});`)
  lines.push(`INSERT INTO store_members (id, store_id, user_id, role, status, effective_from, created_at) VALUES (${[`${id}-m`, storeId, id, role, 'active', at, at].map(q).join(', ')});`)
}

// ---- 工单（16 条：跨门店/类型/日期）+ 计数器 ----
const items = [
  ['seed-w-01', 'seed-st-01', 'pickup', '张先生 公路车保养取车', '公路车链传动保养完成待取', '待取', 'active', -1, 'seed-u-03'],
  ['seed-w-02', 'seed-st-01', 'repair', '李女士 碟刹异响', '更换刹车片并调试', '维修中', 'active', -3, 'seed-u-02'],
  ['seed-w-03', 'seed-st-01', 'handover', '交接：新品到货验收', '周末促销物料与新品到货交接', '继续跟进', 'active', 0, 'seed-u-01'],
  ['seed-w-04', 'seed-st-01', 'resale', '二手山地车（捷安特）', '2019 款 95 成新', '待售', 'active', -10, 'seed-u-03'],
  ['seed-w-05', 'seed-st-02', 'pickup', '王先生 整车交付', '线上购车到店交付', '已取', 'picked-up', -2, 'seed-u-05'],
  ['seed-w-06', 'seed-st-02', 'repair', '赵先生 变速器故障', '更换变速线', '已完成', 'completed', -8, 'seed-u-04'],
  ['seed-w-07', 'seed-st-02', 'handover', '交接：月度盘点', '月度库存盘点交接', '已处理', 'completed', -6, 'seed-u-04'],
  ['seed-w-08', 'seed-st-03', 'pickup', '刘女士 儿童车装配', '儿童车装配完成待取', '待取', 'active', 0, 'seed-u-08'],
  ['seed-w-09', 'seed-st-03', 'repair', '陈先生 补胎', '后轮补胎', '等待配件', 'active', -1, 'seed-u-07'],
  ['seed-w-10', 'seed-st-03', 'handover', '交接：活动物料', '周末骑行活动物料交接', '继续跟进', 'active', -4, 'seed-u-06'],
  ['seed-w-11', 'seed-st-04', 'pickup', '孙女士 保养取车', '整车保养完成', '待取', 'active', -1, 'seed-u-10'],
  ['seed-w-12', 'seed-st-04', 'repair', '何先生 链条更换', '更换链条飞轮', '维修中', 'active', 0, 'seed-u-09'],
  ['seed-w-13', 'seed-st-04', 'resale', '二手折叠车（大行）', '2021 款', '待售', 'active', -5, 'seed-u-10'],
  ['seed-w-14', 'seed-st-05', 'pickup', '黄先生 新车交付', '新店首单交付', '已取', 'picked-up', 0, 'seed-u-12'],
  ['seed-w-15', 'seed-st-05', 'repair', '林女士 车灯安装', '安装车灯与充电座', '维修中', 'active', 0, 'seed-u-13'],
  ['seed-w-16', 'seed-st-05', 'resale', '二手公路车（崔克）', '2020 款 车主置换', '待售', 'active', -2, 'seed-u-12']
]
// 每店 ticket_no 顺序编号
const ticketByStore = {}
const counters = new Set()
for (const [id, storeId, kind, title, detail, status, lifecycle, offset, creator] of items) {
  ticketByStore[storeId] = (ticketByStore[storeId] || 0) + 1
  const ticket = ticketByStore[storeId]
  counters.add(storeId)
  lines.push(`INSERT INTO work_items (id, store_id, kind, title, detail, meta, status, lifecycle, revision, ticket_no, created_by, updated_by, created_at, updated_at) VALUES (${[id, storeId, kind, title, detail, '', status, lifecycle, 1, ticket, creator, creator, iso(offset), iso(offset)].map(q).join(', ')});`)
}
for (const storeId of counters) {
  lines.push(`INSERT INTO work_item_counters (store_id, last_value) VALUES (${[storeId, ticketByStore[storeId]].map(q).join(', ')});`)
}

// ---- 角色提权申请：3 待审 / 1 过期 / 2 已处理 ----
const roleRequests = [
  ['seed-rr-01', 'seed-u-05', 'seed-st-02', 'operator', 'manager', '任职满一年，申请晋升门店经理', 'pending', null, null, iso(2), null, iso(-1)],
  ['seed-rr-02', 'seed-u-12', 'seed-st-05', 'operator', 'manager', '新店运营稳定，申请承担管理职责', 'pending', null, null, iso(3), null, iso(0, 9)],
  ['seed-rr-03', 'seed-u-08', 'seed-st-03', 'operator', 'admin', '长期负责门店事务，申请门店管理员', 'pending', null, null, iso(5), null, iso(-2)],
  ['seed-rr-04', 'seed-u-07', 'seed-st-03', 'operator', 'manager', '申请晋升（已超期）', 'pending', null, null, iso(-1), null, iso(-8)],
  ['seed-rr-05', 'seed-u-03', 'seed-st-01', 'operator', 'manager', '工作表现良好申请晋升', 'approved', '工作表现良好，予以提升', null, iso(1), iso(-5), iso(-6)],
  ['seed-rr-06', 'seed-u-10', 'seed-st-04', 'operator', 'manager', '申请担任门店经理', 'rejected', '入职时间不足，建议半年后再申请', null, iso(2), iso(-2), iso(-3)]
]
for (const [id, userId, storeId, fromRole, targetRole, reason, status, decisionReason, decidedBy, expiresAt, decidedAt, createdAt] of roleRequests) {
  lines.push(`INSERT INTO role_change_requests (id, user_id, store_id, requested_by, from_role, target_role, reason, status, decision_reason, decided_by, expires_at, decided_at, revision, created_at, updated_at) VALUES (${[id, userId, storeId, userId, fromRole, targetRole, reason, status, decisionReason, decidedBy, expiresAt, decidedAt, 1, createdAt, createdAt].map(q).join(', ')});`)
}

// ---- 调店申请：2 待审 / 1 过期 / 1 已处理 ----
const transfers = [
  ['seed-tr-01', 'seed-u-06', 'seed-st-03', 'seed-st-05', '家庭原因申请调往深圳门店', 'pending', null, null, iso(4), null, iso(-1)],
  ['seed-tr-02', 'seed-u-09', 'seed-st-04', 'seed-st-02', '公司安排支援静安店', 'pending', null, null, iso(6), null, iso(0, 9)],
  ['seed-tr-03', 'seed-u-04', 'seed-st-02', 'seed-st-04', '申请调店（已超期）', 'pending', null, null, iso(-1), null, iso(-9)],
  ['seed-tr-04', 'seed-u-01', 'seed-st-01', 'seed-st-03', '调往西湖店担任顾问', 'approved', '目标门店已接收', null, iso(2), iso(-3), iso(-4)]
]
for (const [id, userId, sourceStoreId, targetStoreId, reason, status, decisionReason, decidedBy, expiresAt, decidedAt, createdAt] of transfers) {
  lines.push(`INSERT INTO store_transfer_requests (id, user_id, source_store_id, target_store_id, reason, status, decision_reason, decided_by, expires_at, decided_at, revision, created_at, updated_at) VALUES (${[id, userId, sourceStoreId, targetStoreId, reason, status, decisionReason, decidedBy, expiresAt, decidedAt, 1, createdAt, createdAt].map(q).join(', ')});`)
}

// ---- 闭店记录（今日部分门店已闭店 / 未闭店）----
const closings = [
  ['seed-dc-01', 'seed-st-01', businessDate(0), 3, 5, 2, 1, 0, 'closed', 'seed-u-01', iso(0, 19)],
  ['seed-dc-02', 'seed-st-02', businessDate(0), 2, 4, 1, 0, 1, 'closed', 'seed-u-04', iso(0, 18)],
  ['seed-dc-03', 'seed-st-03', businessDate(0), 0, 0, 0, 0, 0, 'open', null, null],
  ['seed-dc-04', 'seed-st-04', businessDate(0), 0, 0, 0, 0, 0, 'open', null, null],
  ['seed-dc-05', 'seed-st-01', businessDate(-1), 4, 6, 3, 1, 1, 'closed', 'seed-u-01', iso(-1, 19)]
]
for (const [id, storeId, date, sales, checks, reviews, sold, received, status, closedBy, closedAt] of closings) {
  lines.push(`INSERT INTO daily_closings (id, store_id, business_date, sales_vehicles, safety_checks, valid_reviews, used_sold, used_received, sales_saved_at, sales_saved_by, closing_status, closed_at, closed_by, revision, created_at, updated_at) VALUES (${[id, storeId, date, sales, checks, reviews, sold, received, closedAt, closedBy, status, closedAt, closedBy, 1, closedAt || iso(-1), closedAt || iso(-1)].map(q).join(', ')});`)
}

// ---- 平台审计事件（变化流 / 最近事件）----
const audits = [
  ['seed-e-01', 'seed-st-05', 'seed-u-11', '黄国栋', 'admin-create-user', 'account', 'seed-u-11', businessDate(0), '平台创建账号：黄国栋（seed.huanggd @ BIKE-SZ，admin）', 'account', iso(0, 8)],
  ['seed-e-02', 'seed-st-05', 'seed-u-11', '黄国栋', 'admin-create-user', 'account', 'seed-u-12', businessDate(0), '平台创建账号：林婉婷（seed.linwt @ BIKE-SZ，operator）', 'account', iso(0, 8)],
  ['seed-e-03', 'seed-st-05', 'seed-u-11', '黄国栋', 'admin-create-user', 'account', 'seed-u-13', businessDate(0), '平台创建账号：徐文杰（seed.xuwj @ BIKE-SZ，operator）', 'account', iso(0, 8)],
  ['seed-e-04', 'seed-st-05', 'seed-u-11', '黄国栋', 'admin-approve-store', 'store', 'seed-st-05', businessDate(0), '批准门店审核：BIKE-SZ 南山店', 'system', iso(0, 8)],
  ['seed-e-05', 'seed-st-04', 'seed-u-11', '黄国栋', 'admin-approve-store', 'store', 'seed-st-04', businessDate(-8), '批准门店审核：BIKE-GZ 天河店', 'system', iso(-8)],
  ['seed-e-06', 'seed-st-06', 'seed-u-11', '黄国栋', 'admin-reject-store', 'store', 'seed-st-06', businessDate(-15), '拒绝门店审核：BIKE-PD 浦东店（区域规划调整）', 'system', iso(-15)],
  ['seed-e-07', 'seed-st-01', 'seed-u-11', '黄国栋', 'approve-role-elevation', 'role-change-request', 'seed-rr-05', businessDate(-5), '批准角色提权：operator → manager', 'account', iso(-5)],
  ['seed-e-08', 'seed-st-04', 'seed-u-11', '黄国栋', 'reject-role-elevation', 'role-change-request', 'seed-rr-06', businessDate(-2), '拒绝角色提权：operator → manager', 'account', iso(-2)],
  ['seed-e-09', 'seed-st-03', 'seed-u-11', '黄国栋', 'approve-store-transfer', 'store-transfer-request', 'seed-tr-04', businessDate(-3), '批准调店申请', 'account', iso(-3)],
  ['seed-e-10', 'seed-st-02', 'seed-u-02', '陈晓曼', 'self-register', 'account', 'seed-u-02', businessDate(-20), '自助注册账号：陈晓曼', 'account', iso(-20)],
  ['seed-e-11', 'seed-st-03', 'seed-u-07', '吴永康', 'self-register', 'account', 'seed-u-07', businessDate(-15), '自助注册账号：吴永康', 'account', iso(-15)],
  ['seed-e-12', 'seed-st-07', 'seed-u-11', '黄国栋', 'create-directory-store', 'store', 'seed-st-07', businessDate(-2), '新增门店（待审核）：BIKE-BJ 滨江店', 'system', iso(-2)],
  ['seed-e-13', 'seed-st-08', 'seed-u-11', '黄国栋', 'create-directory-store', 'store', 'seed-st-08', businessDate(0), '新增门店（待审核）：BIKE-PY 番禺店', 'system', iso(0, 7)]
]
for (const [id, storeId, actorId, actorName, action, entityType, entityId, date, summary, module, at] of audits) {
  lines.push(`INSERT INTO audit_events (id, store_id, actor_user_id, actor_name_snapshot, action, entity_type, entity_id, entity_revision, business_date, summary, before_state, after_state, reversible, reverted_event_id, request_id, audit_module, created_at) VALUES (${[id, storeId, actorId, actorName, action, entityType, entityId, null, date, summary, null, null, 0, null, `seed-req-${id}`, module, at].map(q).join(', ')});`)
}

console.log(`-- 管理后台验收种子数据（生成于 ${now.toISOString()}，仅限 Preview D1）`)
console.log(`-- 统计口径：今日=${businessDate(0)} / 7 天窗=${businessDate(-7)} / 30 天窗=${businessDate(-30)}`)
console.log(lines.join('\n'))
