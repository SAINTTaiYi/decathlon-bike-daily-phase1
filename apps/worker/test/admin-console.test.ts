import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
const source = await readFile(new URL('../src/routes/admin.ts', import.meta.url), 'utf8')

test('后台读写守卫：读取需平台管理员，写入再叠加 CSRF', () => {
  assert.match(source, /platformRead = \[auth\.loadSession, auth\.requirePasswordChanged, auth\.requirePlatformAdmin\]/u)
  assert.match(source, /platformWrite = \[auth\.loadSession, auth\.requirePasswordChanged, auth\.requireCsrf, auth\.requirePlatformAdmin\]/u)
})

test('总览口径互斥且待办排除过期，平台总数与 Top8 分开计算', () => {
  assert.match(source, /status = 'active' AND pending_review = 0/u); assert.match(source, /status = 'disabled' AND pending_review = 0/u)
  assert.match(source, /status = 'pending' AND expires_at > \?/u); assert.match(source, /roleTotal7d/u); assert.match(source, /total: roleTotal7d\?\.n/u)
  assert.match(source, /UNION ALL[\s\S]*ORDER BY at DESC, id DESC LIMIT 10/u)
})

test('用户先按用户游标分页，再批量加载成员，避免 JOIN 行截断', () => {
  assert.match(source, /limit \+ 1/u); assert.match(source, /nextCursor: hasMore/u); assert.match(source, /membershipsByUser/u)
  assert.match(source, /sm\.user_id IN/u); assert.doesNotMatch(source.match(/SELECT u\.id[\s\S]*?return c\.json\(\{ users: mapped/u)?.[0] || '', /password_hash/u)
})

test('账号和门店写入都使用共享契约、幂等和 updatedAt 乐观锁', () => {
  for (const schema of ['adminCreateUserSchema', 'adminUserStatusSchema', 'adminPasswordResetSchema', 'adminStoreDecisionSchema']) assert.match(source, new RegExp(`${schema}\\.parse`, 'u'))
  assert.ok((source.match(/await idempotent\(/gu) || []).length >= 4)
  assert.match(source, /status = \? AND updated_at = \?/u); assert.match(source, /pending_review = 1 AND updated_at = \?/u)
})

test('平台管理员禁止状态修改和普通密码重置，禁用与重置撤销会话', () => {
  assert.ok((source.match(/PLATFORM_ADMIN_PROTECTED/gu) || []).length >= 2)
  assert.ok((source.match(/UPDATE auth_sessions SET revoked_at/gu) || []).length >= 2)
  assert.match(source, /is_platform_admin = 0 AND updated_at = \?/u)
})

test('密码临时值由管理员/目标/幂等键确定，审计和幂等缓存正文不含临时值', () => {
  assert.match(source, /admin-reset:\$\{context\.userId\}:\$\{id\}:\$\{requestKey\}/u)
  const handlerBody = source.match(/app\.post\('\/api\/v1\/admin\/users\/:id\/reset-password'[\s\S]*?return c\.json/u)?.[0] || ''
  assert.match(handlerBody, /tempPassword/u); assert.doesNotMatch(handlerBody.match(/after: \{[^}]*\}/u)?.[0] || '', /tempPassword|passwordHash/u)
})

test('迁移 0008 仅加列和索引，不重建 stores 父表', async () => {
  const migration = await readFile(new URL('../../../migrations/d1/0008_store_pending_status.sql', import.meta.url), 'utf8')
  assert.match(migration, /ALTER TABLE stores ADD COLUMN pending_review/u); assert.match(migration, /stores_pending_review_idx/u); assert.doesNotMatch(migration, /RENAME TO/u)
})


// Preserved baseline coverage from the accepted admin-console implementation.
test('平台管理后台路由全部要求平台管理员身份；写端点走平台写守卫', async () => {
  const source = await readFile(new URL('../src/routes/admin.ts', import.meta.url), 'utf8')
  assert.match(source, /requirePlatformAdmin/u)
  for (const endpoint of ['/api/v1/admin/overview', '/api/v1/admin/users', '/api/v1/admin/audit-events', '/api/v1/admin/stores/:storeId', '/api/v1/admin/approvals', '/api/v1/admin/pending-count']) {
    assert.match(source, new RegExp(`app\\.get\\('${endpoint.replace(/\//g, '\\/')}'`, 'u'))
  }
  assert.match(source, /platformWrite/u)
  assert.doesNotMatch(source, /app\.put\(/u)
  assert.match(source, /app\.delete\('\/api\/v1\/admin\/stores\/:storeId\/members\/:userId'/u)
})

test('平台总览统计覆盖门店、账号、待审队列与当日工单', async () => {
  const source = await readFile(new URL('../src/routes/admin.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /FROM regions WHERE status = 'active'/u)
  assert.doesNotMatch(source, /FROM cities WHERE status = 'active'/u)
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
  for (const type of ['new-store', 'new-user', 'role-approved', 'transfer-approved']) assert.match(source, new RegExp(`SELECT '${type}'`, 'u'))
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
  assert.match(source, /const hasMore = page\.length > limit/u)
  assert.match(source, /nextCursor: hasMore && last/u)
})

test('轻量待审批计数端点存在', async () => {
  const source = await readFile(new URL('../src/routes/admin.ts', import.meta.url), 'utf8')
  assert.match(source, /app\.get\('\/api\/v1\/admin\/pending-count'/u)
  assert.match(source, /roleRequests: roleRequests\?\.n \?\? 0, transferRequests: transferRequests\?\.n \?\? 0, storesPending: storesPending\?\.n \?\? 0/u)
})

test('平台用户列表支持搜索与门店过滤，不返回密码字段', async () => {
  const source = await readFile(new URL('../src/routes/admin.ts', import.meta.url), 'utf8')
  assert.match(source, /WHERE sm\.status = 'active' AND sm\.user_id IN/u)
  assert.match(source, /username_key LIKE \?/u)
  assert.match(source, /sf\.store_id = \?/u)
  assert.match(source, /LIMIT \?/u)
  assert.match(source, /values\.push\(limit \+ 1\)/u)
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
  assert.match(source, /action: input\.status === 'disabled' \? 'admin-disable-user' : 'admin-enable-user'/u)
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
  assert.match(source, /action: input\.approve \? 'admin-approve-store' : 'admin-reject-store'/u)
  assert.match(source, /STORE_NOT_PENDING/u)
  assert.match(source, /pending_review = 1 AND updated_at = \?/u)
})

test('门店目录为平面列表，新建门店直接生效且可启停用', async () => {
  const governanceSource = await readFile(new URL('../src/routes/governance.ts', import.meta.url), 'utf8')
  assert.match(governanceSource, /INSERT INTO stores \(id, code, name, timezone, status, pending_review, created_at, updated_at\) VALUES \(\?, \?, \?, 'Asia\/Shanghai', 'active', 0, \?, \?\)/u)
  assert.match(governanceSource, /STORE_CODE_REQUIRED/u)
  assert.doesNotMatch(governanceSource, /FROM regions|FROM cities|FROM subregions/u)
})

test('迁移 0008 以 pending_review 列实现门店待审核（无父表重建）', async () => {
  const migration = await readFile(new URL('../../../migrations/d1/0008_store_pending_status.sql', import.meta.url), 'utf8')
  assert.match(migration, /ALTER TABLE stores ADD COLUMN pending_review INTEGER NOT NULL DEFAULT 0;/u)
  assert.match(migration, /CREATE INDEX stores_pending_review_idx ON stores\(pending_review, created_at DESC\) WHERE pending_review = 1;/u)
  assert.doesNotMatch(migration, /RENAME TO stores_legacy/u)
})

test('admin 路由所有静态 SQL 的占位符与 bind 参数数量一致（防 500 回归）', async () => {
  const source = await readFile(new URL('../src/routes/admin.ts', import.meta.url), 'utf8')
  const pattern = /prepare\((`[^`]*`|"[^"]*")\)\.bind\(([^)]*)\)/gu
  let match
  let checked = 0
  while ((match = pattern.exec(source))) {
    if ((match[2] ?? '').includes('...')) continue
    const sqlText = match[1].startsWith('`') ? match[1] : JSON.parse(match[1])
    const placeholders = (sqlText.match(/\?/gu) || []).length
    const bindArgs = match[2].split(',').map((part) => part.trim()).filter(Boolean)
    assert.equal(placeholders, bindArgs.length, `prepare().bind() 参数数量不匹配（?=${placeholders} bind=${bindArgs.length}）`)
    checked++
  }
  assert.ok(checked >= 10, `应至少扫描到 10 处静态查询（实际 ${checked}）`)
})
