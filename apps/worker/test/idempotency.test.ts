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

test('调用方可传入已安全派生的幂等指纹，服务层仍拒绝非法值', async () => {
  const source = await readFile(new URL('../src/services/idempotency.ts', import.meta.url), 'utf8')
  assert.match(source, /type IdempotencyOptions = \{ requestHash\?: string \}/u)
  assert.match(source, /options\.requestHash \?\? await sha256/u)
  assert.match(source, /INVALID_IDEMPOTENCY_REQUEST_HASH/u)
})

test('Worker 测试先构建共享契约产物，干净工作区不依赖忽略的 dist 残留', async () => {
  const packageJson = await readFile(new URL('../package.json', import.meta.url), 'utf8')
  assert.match(packageJson, /"pretest": "pnpm --filter @bike-ops\/contracts build"/u)
})
