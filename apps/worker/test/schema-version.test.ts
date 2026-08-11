import assert from 'node:assert/strict'
import test from 'node:test'
import { readdir } from 'node:fs/promises'
import { SCHEMA_VERSION } from '../src/schema-version.js'

test('公开 schema 版本与最新 D1 migration 保持一致', async () => {
  const migrations = (await readdir(new URL('../../../migrations/d1/', import.meta.url)))
    .filter((name) => /^\d+_.+\.sql$/u.test(name))
    .sort()
  const latest = migrations.at(-1)
  assert.ok(latest, 'D1 migration directory must contain at least one migration')
  assert.equal(SCHEMA_VERSION, latest.slice(0, -4))
})
