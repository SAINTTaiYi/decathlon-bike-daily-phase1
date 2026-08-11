import test from 'node:test'
import assert from 'node:assert/strict'
import { isNetworkUnavailable, redactCommandArgs, run, waitFor } from '../scripts/ops/lib.mjs'

test('命令日志隐藏敏感 flag 后的参数', () => {
  assert.deepEqual(redactCommandArgs(['db', 'push', '--db-url', 'postgresql://user:secret@example/db']), ['db', 'push', '--db-url', '[REDACTED]'])
  assert.deepEqual(redactCommandArgs(['login', '--token', 'super-secret']), ['login', '--token', '[REDACTED]'])
})

test('识别境外 CLI/API 常见网络不可达错误', () => {
  assert.equal(isNetworkUnavailable(new Error('fetch failed', { cause: { code: 'ENETUNREACH' } })), true)
  assert.equal(isNetworkUnavailable('npm ERR! getaddrinfo EAI_AGAIN registry.npmjs.org'), true)
  assert.equal(isNetworkUnavailable('HTTP_403 · forbidden'), false)
})

test('网络守卫停止命令并给出 VPN 提示', async () => {
  await assert.rejects(
    run(process.execPath, ['-e', "process.stderr.write('getaddrinfo EAI_AGAIN registry.npmjs.org'); process.exit(1)"], { quiet: true, networkTarget: 'npm' }),
    /NETWORK_UNREACHABLE.*VPN/u
  )
})

test('waitFor 对明确网络不可达错误不盲目重试', async () => {
  let attempts = 0
  const error = new Error('NETWORK_UNREACHABLE')
  error.noRetry = true
  await assert.rejects(waitFor('external', async () => {
    attempts += 1
    throw error
  }, { attempts: 5, delayMs: 1 }), /NETWORK_UNREACHABLE/u)
  assert.equal(attempts, 1)
})

test('waitFor 在临时未就绪后返回最终结果', async () => {
  let attempts = 0
  const result = await waitFor('deployment', async () => {
    attempts += 1
    return attempts === 3 ? { ready: true } : false
  }, { attempts: 3, delayMs: 1 })
  assert.deepEqual(result, { ready: true })
})
