import assert from 'node:assert/strict'
import test from 'node:test'
import { readdir, readFile } from 'node:fs/promises'
import { SCHEMA_VERSION } from '../src/schema-version.js'

test('公开 schema 版本与最新 D1 migration 保持一致', async () => {
  const migrations = (await readdir(new URL('../../../migrations/d1/', import.meta.url)))
    .filter((name) => /^\d+_.+\.sql$/u.test(name))
    .sort()
  const latest = migrations.at(-1)
  assert.ok(latest, 'D1 migration directory must contain at least one migration')
  assert.equal(SCHEMA_VERSION, latest.slice(0, -4))
})

test('公共 meta/version 端点不对外暴露 gitSha 与 schemaVersion', async () => {
  const source = await readFile(new URL('../src/routes/health.ts', import.meta.url), 'utf8')
  const metaHandler = source.slice(source.indexOf("app.get('/api/v1/meta/version'"))
  assert.doesNotMatch(metaHandler, /schemaVersion/u)
  assert.doesNotMatch(metaHandler, /gitSha/u)
  assert.match(metaHandler, /appVersion: config\.APP_VERSION/u)
  assert.match(metaHandler, /environment: config\.APP_ENV/u)
  // /health/* 保留 gitSha 供部署门禁与健康检查使用
  assert.match(source, /\/health\/live/u)
  assert.match(source, /gitSha: config\.GIT_SHA/u)
})
