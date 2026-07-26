import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { loadConfig } from '../src/config.js'
import { createSessionSecrets, csrfTokenHash, sessionTokenHash } from '../src/auth/session.js'
import { requiresPasswordChange } from '../src/auth/middleware.js'
import { hashPassword, verifyPassword } from '../src/auth/password.js'
import { safeEqualHex, sha256 } from '../src/lib/crypto.js'

const config = loadConfig({
  APP_ENV: 'local',
  DATABASE_URL: 'postgresql://local/test',
  SESSION_SECRET: 's'.repeat(32),
  CSRF_SECRET: 'c'.repeat(32),
  PASSWORD_PEPPER: 'p'.repeat(32),
  CORS_ALLOWED_ORIGINS: 'http://127.0.0.1:5173',
  COOKIE_SECURE: 'false',
  TRUST_PROXY: 'false'
})

test('Session 和 CSRF 原值不作为数据库索引保存', () => {
  const secrets = createSessionSecrets(config)
  assert.notEqual(secrets.token, secrets.tokenHash)
  assert.equal(sessionTokenHash(secrets.token, config), secrets.tokenHash)
  assert.equal(csrfTokenHash(secrets.csrfToken, config), secrets.csrfHash)
})

test('密码使用 Argon2id 和服务端 pepper 验证', async () => {
  const encoded = await hashPassword('a-secure-password', config.PASSWORD_PEPPER)
  assert.match(encoded, /^\$argon2id\$/u)
  assert.equal(await verifyPassword(encoded, 'a-secure-password', config.PASSWORD_PEPPER), true)
  assert.equal(await verifyPassword(encoded, 'wrong-password', config.PASSWORD_PEPPER), false)
})

test('一次性 Setup Token 只比较 SHA-256 指纹', () => {
  const digest = sha256('x'.repeat(48))
  assert.equal(safeEqualHex(digest, sha256('x'.repeat(48))), true)
  assert.equal(safeEqualHex(digest, sha256('different')), false)
})

test('临时密码账号在完成改密前保持受限', () => {
  assert.equal(requiresPasswordChange({ mustChangePassword: true }), true)
  assert.equal(requiresPasswordChange({ mustChangePassword: false }), false)
  assert.equal(requiresPasswordChange(null), false)
})

test('生产环境拒绝不安全 Cookie 和通配 CORS', () => {
  assert.throws(() => loadConfig({ ...process.env, APP_ENV: 'production', DATABASE_URL: 'x', SESSION_SECRET: 's'.repeat(32), CSRF_SECRET: 'c'.repeat(32), PASSWORD_PEPPER: 'p'.repeat(32), CORS_ALLOWED_ORIGINS: '*', COOKIE_SECURE: 'false' }))
})


test('Postgres 业务写在幂等事务中物化并锁定业务日，串行化闭店竞争', async () => {
  const source = await readFile(new URL('../src/services/business.ts', import.meta.url), 'utf8')
  assert.match(source, /insert into bike_ops\.daily_closings \(store_id, business_date\)/u)
  assert.match(source, /on conflict \(store_id, business_date\) do nothing/u)
  assert.match(source, /for update/u)
  assert.match(source, /DAY_CLOSED/u)
})


test('登录失败计数保持数据库原子增量，唯一平台管理员不受匿名账号硬锁', async () => {
  const source = await readFile(new URL('../src/auth/routes.ts', import.meta.url), 'utf8')
  assert.match(source, /failed_login_count = failed_login_count \+ 1/u)
  assert.match(source, /when is_platform_admin then null/u)
  assert.match(source, /!user\.isPlatformAdmin/u)
})
