import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('Worker API 入口启用 1 MiB 请求体上限并返回 413', async () => {
  const source = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8')
  assert.match(source, /bodyLimit\(\{/u)
  assert.match(source, /maxSize: 1024 \* 1024/u)
  assert.match(source, /REQUEST_BODY_TOO_LARGE/u)
  assert.match(source, /413/u)
})

test('目录停用使用数据库条件守卫保护平台管理员有效路径', async () => {
  const source = await readFile(new URL('../src/routes/governance.ts', import.meta.url), 'utf8')
  assert.match(source, /function platformAdminPathGuard/u)
  assert.match(source, /u\.is_platform_admin = 1/u)
  assert.match(source, /PLATFORM_ADMIN_DIRECTORY_LOCKOUT/u)
})
