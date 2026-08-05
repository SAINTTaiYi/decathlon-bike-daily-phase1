import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('平台管理后台路由全部要求平台管理员身份；写端点走平台写守卫', async () => {
  const source = await readFile(new URL('../src/routes/admin.ts', import.meta.url), 'utf8')
  assert.match(source, /requirePlatformAdmin/u)
  for (const endpoint of ['/api/v1/admin/overview', '/api/v1/admin/users', '/api/v1/admin/audit-events', '/api/v1/admin/stores/:storeId', '/api/v1/admin/approvals', '/api/v1/admin/pending-count']) {
    assert.match(source, new RegExp(`app\\.get\\('${endpoint.replace(/\//g, '\\/')}'`, 'u'))
  }
  assert.match(source, /platformWrite/u)
  assert.doesNotMatch(source, /app\.(put|delete)\(/u)
})

test('平台总览统计覆盖目录、账号、待审队列与当日工单', async () => {
  const source = await readFile(new URL('../src/routes/admin.ts', import.meta.url), 'utf8')
  assert.match(source, /SELECT COUNT\(\*\) AS n FROM regions WHERE status = 'active'/u)
  assert.match(source, /SELECT COUNT\(\*\) AS n FROM stores WHERE status = 'disabled'/u)
  assert.match(source, /SELECT COUNT\(\*\) AS n FROM stores WHERE pending_review = 1/u)
  assert.match(source, /FROM users WHERE status = 'active'/u)
  assert.match(source, /FROM store_members WHERE status = 'active' GROUP BY role/u)
  assert.match(source, /FROM role_change_requests WHERE status = 'pending'/u)
  assert.match(source, /FROM store_transfer_requests WHERE status = 'pending'/u)
  assert.match(source, /FROM work_items WHERE created_at >= \? AND created_at < \? AND deleted_at IS NULL GROUP BY kind/u)
})

test('平台总览 v2 覆盖今日、周期统计与变化流，支持点击跳转', async () => {
  const source = await readFile(new URL('../src/routes/admin.ts', import.meta.url), 'utf8')
  assert.match(source, /todayNewStores/u)
  assert.match(source, /todayNewUsers/u)
  assert.match(source, /todayRoleApproved/u)
  assert.match(source, /todayTransferApproved/u)
  assert.match(source, /items: Object\.fromEntries\(\(todayItems \|\| \[\]\)/u)
  assert.match(source, /newStores7d|newStores30d/u)
  assert.match(source, /initiated: number; approved: number; rejected: number/u)
  assert.match(source, /SUM\(CASE WHEN rr\.status = 'approved' AND rr\.decided_at >= \?/u)
  assert.match(source, /recentChanges/u)
  assert.match(source, /type: 'new-store'/u)
  assert.match(source, /type: 'new-user'/u)
  assert.match(source, /type: 'role-approved'/u)
  assert.match(source, /type: 'transfer-approved'/u)
  assert.match(source, /pending: \{ roleRequests: pendingRoles\?\.n \?\? 0, transferRequests: pendingTransfers\?\.n \?\? 0, stores: storePendingCount\?\.n \?\? 0 \}/u)
})

test('门店详情返回组织路径、成员与业务概览', async () => {
  const source = await readFile(new URL('../src/routes/admin.ts', import.meta.url), 'utf8')
  assert.match(source, /app\.get\('\/api\/v1\/admin\/stores\/:storeId'/u)
  assert.match(source, /STORE_NOT_FOUND/u)
  assert.match(source, /closedToday/u)
  assert.match(source, /todayItems: Object\.fromEntries\(todayItems\.map/u)
  assert.match(source, /memberCount/u)
})

test('审批列表按类型与分组查询，过期按 expires_at 判定', async () => {
  const source = await readFile(new URL('../src/routes/admin.ts', import.meta.url), 'utf8')
  assert.match(source, /app\.get\('\/api\/v1\/admin\/approvals'/u)
  assert.match(source, /parseApprovalFilters/u)
  assert.match(source, /r\.expires_at > \?/u)
  assert.match(source, /r\.expires_at <= \?/u)
  assert.match(source, /IN \('approved', 'rejected', 'cancelled'\)/u)
  assert.match(source, /ORDER BY r\.created_at DESC, r\.id DESC/u)
  assert.match(source, /nextCursor: rows\.length === limit/u)
})

test('轻量待审批计数端点存在', async () => {
  const source = await readFile(new URL('../src/routes/admin.ts', import.meta.url), 'utf8')
  assert.match(source, /app\.get\('\/api\/v1\/admin\/pending-count'/u)
  assert.match(source, /roleRequests: roleRequests\?\.n \?\? 0, transferRequests: transferRequests\?\.n \?\? 0, storesPending: storesPending\?\.n \?\? 0/u)
})

test('平台用户列表支持搜索与门店过滤，不返回密码字段', async () => {
  const source = await readFile(new URL('../src/routes/admin.ts', import.meta.url), 'utf8')
  assert.match(source, /LEFT JOIN store_members sm ON sm\.user_id = u\.id AND sm\.status = 'active'/u)
  assert.match(source, /username_key LIKE \?/u)
  assert.match(source, /sm\.store_id = \?/u)
  assert.match(source, /LIMIT \?/u)
  assert.match(source, /values\.push\(200\)/u)
  const selectBlock = source.match(/SELECT u\.id, u\.username_key,[\s\S]*?LIMIT \?/u)?.[0] || ''
  assert.doesNotMatch(selectBlock, /password_hash/u)
})

test('平台审计为全平台默认，支持门店/操作人/动作类型可选筛选', async () => {
  const source = await readFile(new URL('../src/routes/admin.ts', import.meta.url), 'utf8')
  assert.match(source, /FROM audit_events e\n\s+LEFT JOIN stores st ON st\.id = e\.store_id/u)
  assert.match(source, /const storeId = \(c\.req\.query\('storeId'\) \?\? ''\)\.trim\(\)/u)
  assert.match(source, /const actor = \(c\.req\.query\('actor'\) \?\? ''\)\.trim\(\)/u)
  assert.match(source, /const action = \(c\.req\.query\('action'\) \?\? ''\)\.trim\(\)/u)
  assert.match(source, /if \(storeId\) \{ clauses\.push\('e\.store_id = \?'\)/u)
  assert.match(source, /if \(actor\) \{ clauses\.push\('e\.actor_name_snapshot LIKE \?'\)/u)
  assert.match(source, /if \(action\) \{ clauses\.push\('e\.action LIKE \?'\)/u)
  assert.match(source, /ORDER BY e\.created_at DESC, e\.id DESC/u)
  assert.match(source, /Math\.min\(Math\.max\(limitRaw, 1\), 100\)/u)
})

test('用户写操作受审计、保护平台管理员并即时撤销会话', async () => {
  const source = await readFile(new URL('../src/routes/admin.ts', import.meta.url), 'utf8')
  assert.match(source, /app\.post\('\/api\/v1\/admin\/users', \.\.\.platformWrite/u)
  assert.match(source, /app\.patch\('\/api\/v1\/admin\/users\/:id', \.\.\.platformWrite/u)
  assert.match(source, /app\.post\('\/api\/v1\/admin\/users\/:id\/reset-password', \.\.\.platformWrite/u)
  assert.match(source, /action: 'admin-create-user'/u)
  assert.match(source, /action: status === 'disabled' \? 'admin-disable-user' : 'admin-enable-user'/u)
  assert.match(source, /action: 'admin-reset-password'/u)
  assert.match(source, /PLATFORM_ADMIN_PROTECTED/u)
  assert.match(source, /is_platform_admin = 0/u)
  assert.match(source, /UPDATE auth_sessions SET revoked_at = \? WHERE user_id = \? AND revoked_at IS NULL/u)
  assert.match(source, /tempPassword/u)
  const afterBlocks = [...source.matchAll(/after: \{([^}]*)\}/gu)].map((match) => match[1])
  assert.ok(afterBlocks.every((block) => !/(passwordHash|tempPassword|password\s*:)/u.test(block)), '审计 after 不得包含密码明文/哈希')
})

test('门店审核端点只处理待审核门店且受审计', async () => {
  const source = await readFile(new URL('../src/routes/admin.ts', import.meta.url), 'utf8')
  assert.match(source, /app\.post\('\/api\/v1\/admin\/stores\/:id\/decision', \.\.\.platformWrite/u)
  assert.match(source, /action: approve \? 'admin-approve-store' : 'admin-reject-store'/u)
  assert.match(source, /STORE_NOT_PENDING/u)
  assert.match(source, /AND pending_review = 1'\)\.bind\(nextStatus, stamp, id\)/u)
})

test('门店创建进入待审核，待审核门店不可被目录开关绕过', async () => {
  const governanceSource = await readFile(new URL('../src/routes/governance.ts', import.meta.url), 'utf8')
  assert.match(governanceSource, /VALUES \(\?, \?, \?, \?, 'Asia\/Shanghai', 'disabled', 1, \?, \?\)`\)\n\s*\.bind\(id, input\.parentId, input\.code, input\.name, stamp, stamp\)/u)
  assert.match(governanceSource, /新增门店（待审核）/u)
  assert.match(governanceSource, /PENDING_STORE_REVIEW_REQUIRED/u)
  assert.match(governanceSource, /待审核门店必须由平台管理员在审批队列中处理/u)
})

test('迁移 0008 以 pending_review 列实现门店待审核（无父表重建）', async () => {
  const migration = await readFile(new URL('../../../migrations/d1/0008_store_pending_status.sql', import.meta.url), 'utf8')
  assert.match(migration, /ALTER TABLE stores ADD COLUMN pending_review INTEGER NOT NULL DEFAULT 0;/u)
  assert.match(migration, /CREATE INDEX stores_pending_review_idx ON stores\(pending_review, created_at DESC\) WHERE pending_review = 1;/u)
  assert.doesNotMatch(migration, /RENAME TO stores_legacy/u)
})
