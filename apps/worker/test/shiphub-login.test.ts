import assert from 'node:assert/strict'
import test from 'node:test'
import { encryptShipHubSecret } from '../src/lib/shiphub-crypto.js'
import { extractCodeFromUrl, parseLoginForm, performShipHubProgrammaticLogin } from '../src/lib/shiphub-login.js'
import type { ShipHubConfig } from '../src/env.js'

const LOGIN_KEY = Buffer.from('k'.repeat(32)).toString('base64') // 32 字节 base64 密钥

function blob(plain: string): Promise<string> {
  return encryptShipHubSecret(plain, LOGIN_KEY).then(({ ciphertext, nonce }) => `${ciphertext}.${nonce}`)
}

const FORM_HTML = `<html><body>
<form id="login" method="post" action="/as/abc123/resume/as/authorization.ping">
<input type="hidden" name="pf.adapterId" value="idpAdapter">
<input type="hidden" name="pf.cancel" value="Cancel">
<input type="hidden" name="pf.passwordreset" value="ForgotPassword">
<input type="text" name="pf.username">
<input type="password" name="pf.pass">
<input type="submit" name="pf.ok" value="Sign in">
</form>
</body></html>`

test('parseLoginForm 提取表单 action 与隐藏字段', () => {
  const { action, fields } = parseLoginForm(FORM_HTML, 'https://idpdecathlon.decathlon.com.cn/as/authorization.oauth2?client_id=x')
  assert.equal(action, 'https://idpdecathlon.decathlon.com.cn/as/abc123/resume/as/authorization.ping')
  assert.deepEqual(fields, { 'pf.adapterId': 'idpAdapter', 'pf.cancel': 'Cancel', 'pf.passwordreset': 'ForgotPassword', 'pf.ok': 'Sign in' })
})

test('parseLoginForm 缺表单时抛错', () => {
  assert.throws(() => parseLoginForm('<html>no form</html>', 'https://x.test/'), /LOGIN_FORM_NOT_FOUND/)
})

test('extractCodeFromUrl 校验 state 并提取 code', () => {
  const code = extractCodeFromUrl('https://shiphub-asia-cn.decathlon.com.cn/?code=AbC123_xYz&state=st123', 'st123')
  assert.equal(code, 'AbC123_xYz')
  assert.throws(() => extractCodeFromUrl('https://shiphub-asia-cn.decathlon.com.cn/?code=abc&state=other', 'st123'), /LOGIN_STATE_MISMATCH/)
  assert.throws(() => extractCodeFromUrl('https://shiphub-asia-cn.decathlon.com.cn/dashboard', 'st123'), /LOGIN_CODE_MISSING/)
})

test('performShipHubProgrammaticLogin 全流程：表单提交、code 捕获、PKCE 交换', async () => {
  const config: ShipHubConfig = {
    enabled: true,
    mode: 'live',
    liveConfirmed: true,
    oauthScope: 'openid profile',
    requestTimeoutMs: 8000,
    activeStartHour: 10,
    activeEndHour: 22,
    oauthAuthorizeUrl: 'https://idpdecathlon.decathlon.com.cn/as/authorization.oauth2',
    oauthTokenUrl: 'https://idpdecathlon.decathlon.com.cn/as/token.oauth2',
    oauthClientId: 'test-client',
    oauthRedirectUri: 'https://shiphub-asia-cn.decathlon.com.cn',
    oauthBasicToken: 'tb1',
    loginKey: LOGIN_KEY,
    loginUsernameEnc: await blob('testuser'),
    loginPasswordEnc: await blob('TestPass@1234')
  }

  const calls: Array<{ url: string; init?: RequestInit }> = []
  let submittedBody = ''
  const fakeResponse = (url: string, body: string, status = 200, headers: Record<string, string> = {}) => ({
    url, ok: status >= 200 && status < 300, status,
    text: async () => body,
    json: async () => JSON.parse(body),
    headers: new Headers(headers)
  }) as unknown as Response
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (url: any, init?: any) => {
    const u = String(url)
    calls.push({ url: u, init })
    if (u.includes('/authorization.oauth2')) {
      return fakeResponse('https://idpdecathlon.decathlon.com.cn/as/authorization.oauth2?client_id=test-client', FORM_HTML, 200, { 'set-cookie': 'PF.PERSISTENT=abc123; Path=/; Secure' })
    }
    if (u.includes('/token.oauth2')) {
      return fakeResponse('https://idpdecathlon.decathlon.com.cn/as/token.oauth2', JSON.stringify({ access_token: 'at-123', refresh_token: 'rt-456', expires_in: 7199 }), 200, { 'content-type': 'application/json' })
    }
    if (u.includes('/resume/as/authorization.ping')) {
      submittedBody = String(init?.body ?? '')
      const state = new URL(calls[0].url).searchParams.get('state') ?? ''
      return fakeResponse(`https://shiphub-asia-cn.decathlon.com.cn/?code=code-ok&state=${encodeURIComponent(state)}`, '', 200)
    }
    return originalFetch(url, init) // 非本流程请求委托原实现，避免干扰并行测试
  }) as typeof fetch

  try {
    const token = await performShipHubProgrammaticLogin(config)
    assert.equal(token.accessToken, 'at-123')
    assert.equal(token.refreshToken, 'rt-456')
    const params = new URLSearchParams(submittedBody)
    assert.equal(params.get('pf.username'), 'testuser')
    assert.equal(params.get('pf.pass'), 'TestPass@1234')
    assert.equal(params.get('pf.adapterId'), 'idpAdapter')
    assert.equal(calls.length, 3)
    // token 交换请求必须携带 PKCE code_verifier（线上事故回归断言）
    const tokenBody = new URLSearchParams(calls[2].init?.body as string)
    assert.ok(tokenBody.get('code_verifier'), 'token 交换必须携带 code_verifier')
    assert.equal(tokenBody.get('grant_type'), 'authorization_code')
    assert.equal(tokenBody.get('code'), 'code-ok')
    // 登录 POST 携带了授权页下发的 cookie
    assert.equal((calls[1].init?.headers as Record<string, string>)?.cookie, 'PF.PERSISTENT=abc123')
    // 授权请求包含 PKCE
    const authUrl = new URL(calls[0].url)
    assert.equal(authUrl.searchParams.get('code_challenge_method'), 'S256')
    assert.ok(authUrl.searchParams.get('code_challenge'))
    assert.ok(authUrl.searchParams.get('state'))
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('performShipHubProgrammaticLogin 支持显式本店凭据（无需部署级共享 secret）', async () => {
  const config: ShipHubConfig = {
    enabled: true,
    mode: 'live',
    liveConfirmed: true,
    oauthScope: 'openid profile',
    requestTimeoutMs: 8000,
    activeStartHour: 10,
    activeEndHour: 22,
    oauthAuthorizeUrl: 'https://idpdecathlon.decathlon.com.cn/as/authorization.oauth2',
    oauthTokenUrl: 'https://idpdecathlon.decathlon.com.cn/as/token.oauth2',
    oauthClientId: 'test-client',
    oauthRedirectUri: 'https://shiphub-asia-cn.decathlon.com.cn',
    oauthBasicToken: 'tb1'
    // 故意不配置 loginKey/loginUsernameEnc/loginPasswordEnc
  }
  let submittedBody = ''
  let authUrlState = ''
  const fakeResponse = (url: string, body: string, status = 200) => ({
    url, ok: status >= 200 && status < 300, status,
    text: async () => body,
    json: async () => JSON.parse(body),
    headers: new Headers()
  }) as unknown as Response
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (url: any, init?: any) => {
    const u = String(url)
    if (u.includes('/token.oauth2')) {
      return fakeResponse(u, JSON.stringify({ access_token: 'at-store', refresh_token: 'rt-store', expires_in: 7199 }))
    }
    if (u.includes('/authorization.oauth2')) {
      authUrlState = new URL(u).searchParams.get('state') ?? ''
      return fakeResponse(u, FORM_HTML)
    }
    if (u.includes('/resume/as/authorization.ping')) {
      submittedBody = String(init?.body ?? '')
      return fakeResponse(`https://shiphub-asia-cn.decathlon.com.cn/?code=code-store&state=${encodeURIComponent(authUrlState)}`, '')
    }
    return originalFetch(url, init)
  }) as typeof fetch
  try {
    const token = await performShipHubProgrammaticLogin(config, { username: 'store-1299', password: 'StorePass!1299' })
    assert.equal(token.accessToken, 'at-store')
    const params = new URLSearchParams(submittedBody)
    assert.equal(params.get('pf.username'), 'store-1299')
    assert.equal(params.get('pf.pass'), 'StorePass!1299')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('显式凭据为空时回退到部署级共享 secret（缺配置则抛 LOGIN_CREDENTIALS_NOT_CONFIGURED）', async () => {
  const config: ShipHubConfig = {
    enabled: true,
    mode: 'live',
    liveConfirmed: true,
    oauthScope: 'openid profile',
    requestTimeoutMs: 8000,
    activeStartHour: 10,
    activeEndHour: 22,
    oauthAuthorizeUrl: 'https://idpdecathlon.decathlon.com.cn/as/authorization.oauth2',
    oauthTokenUrl: 'https://idpdecathlon.decathlon.com.cn/as/token.oauth2',
    oauthClientId: 'test-client',
    oauthRedirectUri: 'https://shiphub-asia-cn.decathlon.com.cn',
    oauthBasicToken: 'tb1'
  }
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => { throw new Error('不应发起任何请求') }) as typeof fetch
  try {
    await assert.rejects(() => performShipHubProgrammaticLogin(config), /LOGIN_CREDENTIALS_NOT_CONFIGURED/)
  } finally {
    globalThis.fetch = originalFetch
  }
})
