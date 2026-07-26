import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { auditModuleFor } from '../src/services/business.js'

test('审计模块分类覆盖销售、闭店、业务模块、账号和系统清理', () => {
  const base = { entityType: 'work-item', before: null, after: null }
  assert.equal(auditModuleFor({ ...base, action: 'save-kpi' }), 'sales')
  assert.equal(auditModuleFor({ ...base, action: 'close-day' }), 'closing')
  assert.equal(auditModuleFor({ ...base, action: 'complete-pickup' }), 'pickup')
  assert.equal(auditModuleFor({ ...base, action: 'complete-repair' }), 'repair')
  assert.equal(auditModuleFor({ ...base, action: 'sell-resale' }), 'resale')
  assert.equal(auditModuleFor({ ...base, action: 'complete-handover' }), 'handover')
  assert.equal(auditModuleFor({ ...base, action: 'create-user', entityType: 'account' }), 'account')
  assert.equal(auditModuleFor({ ...base, action: 'auto-cleanup' }), 'system')
})

test('永久历史路由在服务端过滤日期和模块，并限制每次读取量', async () => {
  const source = await readFile(new URL('../src/routes/audit.ts', import.meta.url), 'utf8')
  assert.match(source, /app\.get\('\/api\/v1\/audit-events\/history'/u)
  assert.match(source, /e\.audit_module = \?/u)
  assert.match(source, /e\.business_date = \?/u)
  assert.match(source, /Math\.min\(Math\.max\(limitRaw, 1\), 100\)/u)
  assert.match(source, /ORDER BY e\.created_at DESC, e\.id DESC/u)
})

test('自助注册、平台初始化、登录、退出和改密均写入永久账号审计，且不写入密码', async () => {
  const source = await readFile(new URL('../src/routes/auth.ts', import.meta.url), 'utf8')
  for (const action of ['login', 'logout', 'change-password']) {
    assert.match(source, new RegExp(`action: '${action}'`, 'u'))
  }
  const registrationSource = await readFile(new URL('../src/routes/registration.ts', import.meta.url), 'utf8')
  for (const action of ['self-register', 'platform-admin-setup']) {
    assert.match(registrationSource, new RegExp(`action: '${action}'`, 'u'))
  }
  assert.doesNotMatch(source + registrationSource, /after:\s*\{[^}]*password/u)
})


test('D1 业务写在同一事务中拒绝已闭店日期，避免检查后并发闭店', async () => {
  const [business, workItems, audit] = await Promise.all([
    readFile(new URL('../src/services/business.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/routes/work-items.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/routes/audit.ts', import.meta.url), 'utf8')
  ])
  assert.match(business, /INSERT INTO daily_closings \(id, store_id, business_date, created_at, updated_at\)/u)
  assert.match(business, /closing_status = 'closed'/u)
  assert.match(business, /await db\.batch\(\[dayClosedGuard\(db, context, businessDate\), \.\.\.statements\]\)/u)
  assert.match(workItems, /batchWhileDayOpen\(db, context, businessDate/u)
  assert.match(workItems, /buildRestoreSnapshotStatements\(db, before\)/u)
  assert.match(audit, /batchWhileDayOpen\(db, context, businessDate, \[\.\.\.restoreStatements, audit\.statement\]\)/u)
})
