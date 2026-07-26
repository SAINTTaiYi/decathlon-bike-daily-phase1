import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('D1 幂等 reservation 使用受控冲突、缓存业务错误并清理未知失败', async () => {
  const source = await readFile(new URL('../src/services/idempotency.ts', import.meta.url), 'utf8')
  assert.match(source, /INSERT OR IGNORE INTO idempotency_requests/u)
  assert.match(source, /error instanceof ApiProblem/u)
  assert.match(source, /body: \{ error: error\.code, message: error\.message \}/u)
  assert.match(source, /DELETE FROM idempotency_requests/u)
  assert.match(source, /response_status IS NULL/u)
})
