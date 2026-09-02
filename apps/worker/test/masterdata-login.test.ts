import assert from 'node:assert/strict'
import test from 'node:test'
import { encryptShipHubSecret } from '../src/lib/shiphub-crypto.js'
import { extractCodeFromCustomSchemeLocation, performMasterDataLogin } from '../src/lib/masterdata-login.js'

const LOGIN_KEY = Buffer.from('m'.repeat(32)).toString('base64')

function blob(plain: string): Promise<string> {
  return encryptShipHubSecret(plain, LOGIN_KEY).then(({ ciphertext, nonce }) => `${ciphertext}.${nonce}`)
}

const FORM_HTML = `<html><body>
<form id="login" method="post" action="/as/mdata/resume/as/authorization.ping">
<input type="hidden" name="pf.adapterId" value="DataHtmlForm">
<input type="hidden" name="pf.cancel" value="Cancel">
<input type="hidden" name="pf.passwordreset" value="ForgotPassword">
<input type="text" name="pf.username">
<input type="password" name="pf.pass">
<input type="submit" name="pf.ok" value="Sign in">
</form>
</body></html>`

test('extractCodeFromCustomSchemeLocation 校验 state 并提取 code', () => {
  const location = 'com.decathlon.authentication://com.oxylane.android.cubeinstore?code=AbC_123&state=st456'
  assert.equal(extractCodeFromCustomSchemeLocation(location, 'st456'), 'AbC_123')
  assert.throws(() => extractCodeFromCustomSchemeLocation(location, 'other'), /LOGIN_STATE_MISMATCH/)
  assert.throws(() => extractCodeFromCustomSchemeLocation('com.decathlon.authentication://host', 'st'), /LOGIN_CODE_MISSING/)
  assert.throws(() => extractCodeFromCustomSchemeLocation('com.decathlon.authentication://host?state=st', 'st'), /LOGIN_CODE_MISSING/)
})

test('performMasterDataLogin：表单提交截获自定义 scheme 302 + Basic 交换', async () => {
  const config = {
    authorizeUrl: 'https://idpdecathlon.oxylane.com/as/authorization.oauth2',
    tokenUrl: 'https://idpdecathlon.oxylane.com/as/token.oauth2',
    clientId: 'cid-masterdata',
    clientSecret: 'sec-masterdata',
    redirectUri: 'com.decathlon.authentication://com.oxylane.android.cubeinstore',
    scope: 'openid profile',
    loginKey: LOGIN_KEY,
    loginUsernameEnc: await blob('CHU13'),
    loginPasswordEnc: await blob('Pass/123')
  }
  const calls: Array<{ url: string; init?: any }> = []
  const fakeResponse = (url: string, body: string, status = 200, headers: Record<string, string> = {}) => ({
    url, ok: status >= 200 && status < 300, status,
    text: async () => body,
    json: async () => JSON.parse(body),
    headers: new Headers(headers)
  }) as unknown as Response
  const originalFetch = globalThis.fetch
  let submittedBody = ''
  let tokenBody = ''
  let tokenAuth = ''
  globalThis.fetch = (async (url: any, init?: any) => {
    const u = String(url)
    calls.push({ url: u, init })
    if (u.includes('/as/authorization.oauth2')) {
      return fakeResponse(u, FORM_HTML, 200, { 'set-cookie': 'PF.PERSISTENT=sess; Path=/; Secure' })
    }
    if (u.includes('/resume/as/authorization.ping')) {
      submittedBody = String(init?.body ?? '')
      const state = new URL(calls[0].url).searchParams.get('state') ?? ''
      assert.equal(init?.redirect, 'manual', '登录表单提交必须 redirect:manual（fetch 无法跟随自定义 scheme）')
      assert.match(String(init?.headers?.cookie ?? ''), /PF\.PERSISTENT=sess/u, '提交必须携带会话 cookie')
      return fakeResponse(u, '', 302, { location: `${config.redirectUri}?code=CD_789&state=${state}` })
    }
    if (u.includes('/as/token.oauth2')) {
      tokenBody = String(init?.body ?? '')
      tokenAuth = String(init?.headers?.authorization ?? '')
      return fakeResponse(u, JSON.stringify({ access_token: 'jwt-abc', token_type: 'Bearer', expires_in: 7199 }), 200, { 'content-type': 'application/json' })
    }
    throw new Error(`unexpected fetch ${u}`)
  }) as typeof fetch
  try {
    const { accessToken } = await performMasterDataLogin(config)
    assert.equal(accessToken, 'jwt-abc')
    // 授权请求带 PKCE
    const authorize = calls[0].url
    assert.match(authorize, /client_id=cid-masterdata/u)
    assert.match(authorize, /code_challenge_method=S256/u)
    assert.match(authorize, /response_type=code/u)
    // 表单提交带凭据与隐藏字段
    const params = new URLSearchParams(submittedBody)
    assert.equal(params.get('pf.username'), 'CHU13')
    assert.equal(params.get('pf.pass'), 'Pass/123')
    assert.equal(params.get('pf.adapterId'), 'DataHtmlForm')
    // 交换：Basic 头 + code_verifier
    assert.equal(tokenAuth, `Basic ${btoa('cid-masterdata:sec-masterdata')}`)
    const exchange = new URLSearchParams(tokenBody)
    assert.equal(exchange.get('grant_type'), 'authorization_code')
    assert.equal(exchange.get('client_id'), 'cid-masterdata')
    assert.ok(exchange.get('code_verifier'))
    assert.equal(exchange.get('code'), 'CD_789')
    assert.equal(exchange.get('redirect_uri'), config.redirectUri)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('performMasterDataLogin：登录失败（无 Location）抛 LOGIN_CODE_MISSING', async () => {
  const config = {
    authorizeUrl: 'https://idpdecathlon.oxylane.com/as/authorization.oauth2',
    tokenUrl: 'https://idpdecathlon.oxylane.com/as/token.oauth2',
    clientId: 'c', clientSecret: 's',
    redirectUri: 'com.decathlon.authentication://com.oxylane.android.cubeinstore',
    scope: 'openid profile',
    loginKey: LOGIN_KEY,
    loginUsernameEnc: await blob('u'),
    loginPasswordEnc: await blob('p')
  }
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (url: any, init?: any) => {
    const u = String(url)
    if (u.includes('/as/authorization.oauth2')) {
      return { url: u, ok: true, status: 200, text: async () => FORM_HTML, json: async () => ({}), headers: new Headers() } as unknown as Response
    }
    // 密码错误：200 错误页，无 Location
    return { url: u, ok: true, status: 200, text: async () => '<html>invalid credentials</html>', json: async () => ({}), headers: new Headers() } as unknown as Response
  }) as typeof fetch
  try {
    await assert.rejects(() => performMasterDataLogin(config), /LOGIN_CODE_MISSING/)
  } finally {
    globalThis.fetch = originalFetch
  }
})
