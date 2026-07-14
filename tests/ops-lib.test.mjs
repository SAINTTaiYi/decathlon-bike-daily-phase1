import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isNetworkUnavailable, loadState, redactCommandArgs, run, saveState, waitFor } from '../scripts/ops/lib.mjs'

test('部署 state 缺失时为空，损坏 JSON 必须拒绝而不是当成新环境', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'bike-ops-state-'))
  const path = join(directory, 'staging.json')
  try {
    assert.deepEqual(await loadState(path), {})
    await writeFile(path, '{broken')
    await assert.rejects(loadState(path), /STATE_INVALID_JSON/u)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('部署 state 使用原子替换并保持可解析', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'bike-ops-state-'))
  const path = join(directory, 'staging.json')
  try {
    await saveState(path, { environment: 'staging', projectId: 'safe-id' })
    assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), { environment: 'staging', projectId: 'safe-id' })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

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
