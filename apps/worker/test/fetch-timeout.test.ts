import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile, readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ShipHubConfig } from '../src/env.js'
import { UPSTREAM_TIMEOUT_MS, isTimeoutError } from '../src/lib/fetch-timeout.js'
import { refreshShipHubAccessToken } from '../src/lib/shiphub-token.js'
import { performShipHubProgrammaticLogin } from '../src/lib/shiphub-login.js'
import {
  performMasterDataLoginWithCredentials,
  type MasterDataClientConfig
} from '../src/lib/masterdata-login.js'

// ── 上游 fetch 超时护栏（2026-09-10）──────────────────────────────────────
// 事故：Shiphub 同步出现 3 段静默停摆（最长 2 小时 34 分），全部是「fetch 没有超时 →
// 上游静默不响应 → 整个同步 tick 挂死 → 平台回收」造成；业务表只留下悬挂的 running
// 记录，无失败、无告警。修复：所有上游 fetch 挂 AbortSignal.timeout，超时映射为明确
// 错误码，交给既有的失败计数 / 重试 / 自愈逻辑接管。
//
// 本文件两层验证：
//   ① 行为断言——用真实「挂起不响应」的本地 HTTP 服务（不是 mock 掉错误码），
//      证明每个链路会在超时后快速失败并给出预期错误码；
//   ② 结构断言——逐文件断言 fetch 数量与超时信号数量一一配对，且全目录不存在
//      无超时保护的上游 fetch（防止未来新增代码再漏）。

const TINY_TIMEOUT_MS = 250

function shiphubConfig(overrides: Partial<ShipHubConfig>): ShipHubConfig {
  return {
    enabled: true,
    mode: 'live',
    liveConfirmed: true,
    oauthScope: 'openid profile',
    requestTimeoutMs: TINY_TIMEOUT_MS,
    activeStartHour: 10,
    activeEndHour: 22,
    ...overrides
  }
}

function masterDataConfig(url: string): MasterDataClientConfig {
  return {
    authorizeUrl: `${url}/as/authorization.oauth2`,
    tokenUrl: `${url}/as/token.oauth2`,
    clientId: 'client-x',
    clientSecret: 'secret-y',
    redirectUri: 'com.decathlon.authentication://com.oxylane.android.cubeinstore',
    scope: 'openid profile',
    timeoutMs: TINY_TIMEOUT_MS
  }
}

// 本地真实 HTTP 服务：handler 决定响应行为；不响应的分支即「上游挂起」。
async function startServer(handler: (request: import('node:http').IncomingMessage, response: import('node:http').ServerResponse) => void): Promise<{ url: string; close: () => Promise<void> }> {
  const { createServer } = await import('node:http')
  const server = createServer(handler)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object', '测试服务必须监听成功')
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve) => {
      server.close(() => resolve())
      // 挂起的请求会占住 socket：直接销毁，否则 close() 回调永远不触发。
      server.closeAllConnections()
    })
  }
}

const LOGIN_FORM_HTML = '<html><body><form method="post" action="/resume"><input type="hidden" name="pf.adapterId" value="DataHtmlForm"></form></body></html>'

test('isTimeoutError：识别 TimeoutError/AbortError（含 cause 链），不误伤普通错误', () => {
  assert.equal(isTimeoutError(Object.assign(new Error('x'), { name: 'TimeoutError' })), true)
  assert.equal(isTimeoutError(Object.assign(new Error('x'), { name: 'AbortError' })), true)
  assert.equal(isTimeoutError(new TypeError('fetch failed', { cause: Object.assign(new Error('t'), { name: 'TimeoutError' }) })), true)
  assert.equal(isTimeoutError(new Error('boom')), false)
  assert.equal(isTimeoutError(null), false)
  assert.equal(isTimeoutError(undefined), false)
  assert.ok(UPSTREAM_TIMEOUT_MS > 0 && UPSTREAM_TIMEOUT_MS <= 30_000, '默认超时必须有限且不超过 30 秒')
})

// 挂起类用例的哨兵：若超时护栏被移除，用例会在 10 秒时干净地失败（而不是无声挂死 CI）。
const HANG_TEST_OPTIONS = { timeout: 10_000 }

test('Shiphub token 刷新：上游挂起 → OAUTH_TOKEN_TIMEOUT 快速失败（不再无限期挂死）', HANG_TEST_OPTIONS, async () => {
  const server = await startServer(() => { /* 永不响应 */ })
  try {
    const config = shiphubConfig({ oauthTokenUrl: `${server.url}/token`, oauthBasicToken: 'Basic x' })
    const started = Date.now()
    await assert.rejects(
      refreshShipHubAccessToken(config, 'refresh-token'),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, 'OAUTH_TOKEN_TIMEOUT')
        return true
      }
    )
    const elapsed = Date.now() - started
    assert.ok(elapsed < 5_000, `超时应快速失败，实测 ${elapsed}ms`)
  } finally {
    await server.close()
  }
})

test('Shiphub token 刷新：连接被拒仍是 OAUTH_TOKEN_NETWORK_ERROR（超时映射不误伤网络错误）', async () => {
  const server = await startServer(() => {})
  const url = `${server.url}/token`
  await server.close()
  const config = shiphubConfig({ oauthTokenUrl: url, oauthBasicToken: 'Basic x' })
  await assert.rejects(
    refreshShipHubAccessToken(config, 'refresh-token'),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'OAUTH_TOKEN_NETWORK_ERROR')
      return true
    }
  )
})

test('Shiphub token 刷新：正常响应不受超时护栏影响', async () => {
  const server = await startServer((request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ access_token: 'at-1', refresh_token: 'rt-2', expires_in: 3600 }))
  })
  try {
    const config = shiphubConfig({ oauthTokenUrl: `${server.url}/token`, oauthBasicToken: 'Basic x' })
    const token = await refreshShipHubAccessToken(config, 'refresh-token')
    assert.equal(token.accessToken, 'at-1')
    assert.equal(token.refreshToken, 'rt-2')
  } finally {
    await server.close()
  }
})

test('Shiphub 程序化登录：授权页挂起 → LOGIN_PAGE_TIMEOUT', HANG_TEST_OPTIONS, async () => {
  const server = await startServer(() => { /* 永不响应 */ })
  try {
    const config = shiphubConfig({
      oauthAuthorizeUrl: `${server.url}/as/authorization.oauth2`,
      oauthClientId: 'client-x',
      oauthRedirectUri: 'https://workshop.skin/auth/shiphub/callback'
    })
    await assert.rejects(
      performShipHubProgrammaticLogin(config, { username: 'store-user', password: 'store-pass' }),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, 'LOGIN_PAGE_TIMEOUT')
        return true
      }
    )
  } finally {
    await server.close()
  }
})

test('Shiphub 程序化登录：表单提交挂起 → LOGIN_SUBMIT_TIMEOUT', HANG_TEST_OPTIONS, async () => {
  const server = await startServer((request, response) => {
    if (request.method === 'GET') {
      response.writeHead(200, { 'content-type': 'text/html', 'set-cookie': 'PF=s' })
      response.end(LOGIN_FORM_HTML)
      return
    }
    /* POST：永不响应 */
  })
  try {
    const config = shiphubConfig({
      oauthAuthorizeUrl: `${server.url}/as/authorization.oauth2`,
      oauthClientId: 'client-x',
      oauthRedirectUri: 'https://workshop.skin/auth/shiphub/callback'
    })
    await assert.rejects(
      performShipHubProgrammaticLogin(config, { username: 'store-user', password: 'store-pass' }),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, 'LOGIN_SUBMIT_TIMEOUT')
        return true
      }
    )
  } finally {
    await server.close()
  }
})

test('Cube/masterdata 登录：授权页挂起 → LOGIN_PAGE_TIMEOUT（MasterDataUpstreamError）', HANG_TEST_OPTIONS, async () => {
  const server = await startServer(() => { /* 永不响应 */ })
  try {
    await assert.rejects(
      performMasterDataLoginWithCredentials(masterDataConfig(server.url), { username: 'u', password: 'p' }),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, 'LOGIN_PAGE_TIMEOUT')
        assert.equal((error as { name?: string }).name, 'MasterDataUpstreamError')
        return true
      }
    )
  } finally {
    await server.close()
  }
})

test('Cube/masterdata 登录：token 交换挂起 → OAUTH_TOKEN_TIMEOUT', HANG_TEST_OPTIONS, async () => {
  let state = ''
  const server = await startServer((request, response) => {
    const parsed = new URL(request.url ?? '/', 'http://placeholder')
    if (parsed.pathname === '/as/authorization.oauth2') {
      state = parsed.searchParams.get('state') ?? ''
      response.writeHead(200, { 'content-type': 'text/html', 'set-cookie': 'PF=s' })
      response.end(LOGIN_FORM_HTML)
      return
    }
    if (parsed.pathname === '/resume') {
      response.writeHead(302, { location: `com.decathlon.authentication://com.oxylane.android.cubeinstore?code=CD&state=${state}` })
      response.end()
      return
    }
    /* /as/token.oauth2：永不响应 */
  })
  try {
    await assert.rejects(
      performMasterDataLoginWithCredentials(masterDataConfig(server.url), { username: 'u', password: 'p' }),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, 'OAUTH_TOKEN_TIMEOUT')
        return true
      }
    )
  } finally {
    await server.close()
  }
})

// ── 结构护栏 ──────────────────────────────────────────────────────────────

const WORKER_SRC = fileURLToPath(new URL('../src', import.meta.url))

async function walkTypeScript(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...await walkTypeScript(full))
    else if (entry.name.endsWith('.ts')) files.push(full)
  }
  return files
}

test('结构护栏：修复清单内每个 fetch 与超时信号一一配对', async () => {
  // 改动这些文件的 fetch 数量时必须同步补信号并更新本清单（防止回归成无超时调用）。
  const patched: Array<[string, number]> = [
    ['lib/shiphub-token.ts', 1],
    ['lib/shiphub-login.ts', 2],
    ['lib/masterdata-login.ts', 3],
    ['services/bi-bikes.ts', 4],
    ['services/bi-sku-sync.ts', 1],
    ['services/shiphub-alert.ts', 1],
    ['services/registration.ts', 3]
  ]
  for (const [rel, expected] of patched) {
    const source = await readFile(join(WORKER_SRC, rel), 'utf8')
    const fetchCount = (source.match(/await fetch\(/gu) ?? []).length
    const signalCount = (source.match(/signal: AbortSignal\.timeout\(/gu) ?? []).length
    assert.equal(fetchCount, expected, `${rel}: fetch 调用数变化（更新清单或补齐信号）`)
    assert.equal(signalCount, expected, `${rel}: 每个 fetch 都必须挂 signal: AbortSignal.timeout`)
  }
})

test('结构护栏：worker 源码内不存在无超时保护的上游 fetch', async () => {
  const offenders: string[] = []
  for (const file of await walkTypeScript(WORKER_SRC)) {
    const source = await readFile(file, 'utf8')
    if (!source.includes('await fetch(')) continue
    // 超时机制二选一：AbortSignal.timeout（统一约定）或 AbortController（shiphub-client 既有实现）
    if (!source.includes('AbortSignal.timeout(') && !source.includes('AbortController')) {
      offenders.push(relative(WORKER_SRC, file))
    }
  }
  assert.deepEqual(offenders, [], `以下文件含无超时保护的上游 fetch：${offenders.join(', ')}`)
})
