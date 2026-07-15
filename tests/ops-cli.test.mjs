import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { connectionUrls } from '../scripts/ops/supabase.mjs'

function ops(...args) {
  return spawnSync(process.execPath, ['scripts/ops/index.mjs', ...args], { cwd: process.cwd(), encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME } })
}

test('部署 CLI 拒绝非法环境，不静默回退到 staging', () => {
  const result = ops('plan', 'typo')
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /INVALID_ENVIRONMENT/u)
})

test('Production release 在读取凭证或 state 前要求显式批准与备份确认', () => {
  const approval = ops('release', 'production')
  assert.notEqual(approval.status, 0)
  assert.match(approval.stderr, /PRODUCTION_APPROVAL_REQUIRED/u)

  const backup = ops('release', 'production', '--approve-production')
  assert.notEqual(backup.status, 0)
  assert.match(backup.stderr, /PRODUCTION_BACKUP_CONFIRMATION_REQUIRED/u)
})

test('部署 preflight 的 Node 支持范围与 package engines 一致', () => {
  const result = ops('preflight', 'staging')
  assert.match(result.stdout, /"nodeRequired": ">=22 <25"/u)
})

test('Supabase 运行时使用 transaction pooler，migration 使用 IPv4 session pooler', () => {
  const urls = connectionUrls('projectref', 'ap-southeast-1', 'p@ss word')
  assert.match(urls.DATABASE_URL, /pooler\.supabase\.com:6543/u)
  assert.match(urls.MIGRATION_DATABASE_URL, /postgres\.projectref:.*@aws-0-ap-southeast-1\.pooler\.supabase\.com:5432/u)
  assert.doesNotMatch(urls.MIGRATION_DATABASE_URL, /@db\.projectref\.supabase\.co/u)
  assert.notEqual(urls.DATABASE_URL, urls.MIGRATION_DATABASE_URL)
  assert.ok(!urls.DATABASE_URL.includes('p@ss word'))
})
