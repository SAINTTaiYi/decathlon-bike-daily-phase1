import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('平台管理后台路由全部要求平台管理员身份且为只读', async () => {
  const source = await readFile(new URL('../src/routes/admin.ts', import.meta.url), 'utf8')
  assert.match(source, /requirePlatformAdmin/u)
  for (const endpoint of ['/api/v1/admin/overview', '/api/v1/admin/users', '/api/v1/admin/audit-events']) {
    assert.match(source, new RegExp(`app\\.get\\('${endpoint.replace(/\//g, '\\/')}'`, 'u'))
  }
  assert.doesNotMatch(source, /app\.(post|put|patch|delete)\(/u)
})

test('平台总览统计覆盖目录、账号、待审队列与当日工单', async () => {
  const source = await readFile(new URL('../src/routes/admin.ts', import.meta.url), 'utf8')
  assert.match(source, /SELECT COUNT\(\*\) AS n FROM regions WHERE status = 'active'/u)
  assert.match(source, /SELECT COUNT\(\*\) AS n FROM stores WHERE status = 'disabled'/u)
  assert.match(source, /FROM users WHERE status = 'active'/u)
  assert.match(source, /FROM store_members WHERE status = 'active' GROUP BY role/u)
  assert.match(source, /FROM role_change_requests WHERE status = 'pending'/u)
  assert.match(source, /FROM store_transfer_requests WHERE status = 'pending'/u)
  assert.match(source, /FROM work_items WHERE business_date = \? AND deleted_at IS NULL GROUP BY kind/u)
  assert.match(source, /recentAudit: camelRows\(recentAudit\)/u)
})

test('平台用户列表关联有效门店成员且不返回密码字段', async () => {
  const source = await readFile(new URL('../src/routes/admin.ts', import.meta.url), 'utf8')
  assert.match(source, /LEFT JOIN store_members sm ON sm\.user_id = u\.id AND sm\.status = 'active'/u)
  assert.match(source, /username_key LIKE \?/u)
  assert.match(source, /LIMIT 200/u)
  assert.doesNotMatch(source, /password_hash/u)
})

test('平台审计日志为全平台范围并复用既有游标分页规则', async () => {
  const source = await readFile(new URL('../src/routes/admin.ts', import.meta.url), 'utf8')
  assert.match(source, /FROM audit_events e\n\s+LEFT JOIN stores st ON st\.id = e\.store_id/u)
  assert.doesNotMatch(source, /e\.store_id = \?/u)
  assert.match(source, /ORDER BY e\.created_at DESC, e\.id DESC/u)
  assert.match(source, /Math\.min\(Math\.max\(limitRaw, 1\), 100\)/u)
  assert.match(source, /nextCursor: rows\.length === limit/u)
})
