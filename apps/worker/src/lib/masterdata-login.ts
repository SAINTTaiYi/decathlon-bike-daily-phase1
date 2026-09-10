import { parseLoginForm } from './shiphub-login.js'
import { decryptShipHubSecret } from './shiphub-crypto.js'
import { isTimeoutError, UPSTREAM_TIMEOUT_MS } from './fetch-timeout.js'

// CubeInStore 原生受众 JWT 程序化登录（2026-09-02 逆向定案流程的 Worker 移植）：
// 全球 IdP PKCE 授权 → PingFederate 表单提交 → 302 Location 为
// com.decathlon.authentication://…?code=（自定义 scheme，必须 redirect:'manual'
// 手工截获，fetch 无法跟随）→ Basic(clientId:clientSecret) 换 token。
// 凭据 AES-256-GCM 加密存 CF secret；明文只在本模块内存中出现，绝不进日志。
export class MasterDataUpstreamError extends Error {
  constructor(
    readonly code: string,
    readonly status?: number,
    readonly retryable = false
  ) {
    super(code)
    this.name = 'MasterDataUpstreamError'
  }
}

const LOGIN_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
const LOGIN_HTML_ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const value of bytes) binary += String.fromCharCode(value)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '')
}

function splitEncryptedBlob(blob: string): { ciphertext: string; nonce: string } {
  const [ciphertext, nonce] = blob.split('.')
  if (!ciphertext || !nonce) throw new MasterDataUpstreamError('LOGIN_CREDENTIAL_MALFORMED')
  return { ciphertext, nonce }
}

export type MasterDataLoginConfig = {
  authorizeUrl: string
  tokenUrl: string
  clientId: string
  clientSecret: string
  redirectUri: string
  scope: string
  loginKey: string
  loginUsernameEnc: string
  loginPasswordEnc: string
}

async function readLoginCredentials(config: MasterDataLoginConfig): Promise<{ username: string; password: string }> {
  const usernameBlob = splitEncryptedBlob(config.loginUsernameEnc)
  const passwordBlob = splitEncryptedBlob(config.loginPasswordEnc)
  const username = await decryptShipHubSecret(usernameBlob.ciphertext, usernameBlob.nonce, config.loginKey)
  const password = await decryptShipHubSecret(passwordBlob.ciphertext, passwordBlob.nonce, config.loginKey)
  return { username, password }
}

// 从自定义 scheme 的 Location（com.decathlon.authentication://host?code=…&state=…）
// 提取 code/state。不用 URL 解析非 special scheme，直接截查询串最稳。
export function extractCodeFromCustomSchemeLocation(location: string, expectedState: string): string {
  const queryIndex = location.indexOf('?')
  if (queryIndex < 0) throw new MasterDataUpstreamError('LOGIN_CODE_MISSING')
  const params = new URLSearchParams(location.slice(queryIndex + 1))
  const code = params.get('code')
  const state = params.get('state')
  if (!code) throw new MasterDataUpstreamError('LOGIN_CODE_MISSING')
  if (state !== expectedState) throw new MasterDataUpstreamError('LOGIN_STATE_MISMATCH')
  return code
}

// CubeInStore 客户端配置（appId/secret 为应用级常量，非门店敏感）。
export type MasterDataClientConfig = {
  authorizeUrl: string
  tokenUrl: string
  clientId: string
  clientSecret: string
  redirectUri: string
  scope: string
  /** 单次上游调用超时；未提供时用 UPSTREAM_TIMEOUT_MS（测试可注入小值）。 */
  timeoutMs?: number
}

export async function performMasterDataLogin(config: MasterDataLoginConfig): Promise<{ accessToken: string; expiresIn: number }> {
  const { username, password } = await readLoginCredentials(config)
  return masterDataLoginFlow(config, username, password)
}

// 本店凭据直传（Cube 身份派生，2026-09-08）：调用方自 D1 连接行解密本店账密后
// 登录 oxylane IdP——凭据属于谁就只拉谁，绝不跨店复用。
export async function performMasterDataLoginWithCredentials(
  client: MasterDataClientConfig,
  credentials: { username: string; password: string }
): Promise<{ accessToken: string; expiresIn: number }> {
  return masterDataLoginFlow(client, credentials.username, credentials.password)
}

async function masterDataLoginFlow(
  config: MasterDataClientConfig,
  username: string,
  password: string
): Promise<{ accessToken: string; expiresIn: number }> {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(48)))
  const challenge = base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))))
  const state = base64Url(crypto.getRandomValues(new Uint8Array(24)))

  const authorizeUrl = new URL(config.authorizeUrl)
  authorizeUrl.searchParams.set('client_id', config.clientId)
  authorizeUrl.searchParams.set('response_type', 'code')
  authorizeUrl.searchParams.set('redirect_uri', config.redirectUri)
  authorizeUrl.searchParams.set('scope', config.scope)
  authorizeUrl.searchParams.set('state', state)
  authorizeUrl.searchParams.set('code_challenge', challenge)
  authorizeUrl.searchParams.set('code_challenge_method', 'S256')

  // 超时护栏（2026-09-10）：登录链路此前没有超时，IdP 静默不响应会把整个 tick 挂死
  // （与 Shiphub 同步同款事故，见 lib/fetch-timeout.ts 顶部说明）。
  let page: Response
  try {
    page = await fetch(authorizeUrl.toString(), {
      headers: { 'user-agent': LOGIN_USER_AGENT, accept: LOGIN_HTML_ACCEPT, 'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8' },
      signal: AbortSignal.timeout(config.timeoutMs ?? UPSTREAM_TIMEOUT_MS)
    })
  } catch (error) {
    if (isTimeoutError(error)) throw new MasterDataUpstreamError('LOGIN_PAGE_TIMEOUT', 504, true)
    throw error
  }
  if (!page.ok) throw new MasterDataUpstreamError(`LOGIN_PAGE_HTTP_${page.status}`, page.status, page.status >= 500)
  const { action, fields } = parseLoginForm(await page.text(), page.url)
  // 必须带会话 cookie 提交表单，否则 Page Expired（同 Shiphub 登录实测结论）。
  const cookies = (page.headers.getSetCookie?.() ?? []).map((value) => value.split(';')[0]).join('; ')

  const body = new URLSearchParams(fields)
  body.set('pf.username', username)
  body.set('pf.pass', password)
  // 登录表单提交后 IdP 直接 302 到自定义 scheme redirect（fetch 跟不了，手工截获）。
  let submit: Response
  try {
    submit = await fetch(action, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'user-agent': LOGIN_USER_AGENT,
        accept: 'text/html,*/*',
        'accept-language': 'zh-CN,zh;q=0.9',
        'content-type': 'application/x-www-form-urlencoded',
        ...(cookies ? { cookie: cookies } : {})
      },
      body: body.toString(),
      signal: AbortSignal.timeout(config.timeoutMs ?? UPSTREAM_TIMEOUT_MS)
    })
  } catch (error) {
    if (isTimeoutError(error)) throw new MasterDataUpstreamError('LOGIN_SUBMIT_TIMEOUT', 504, true)
    throw error
  }
  const location = submit.headers.get('location') ?? ''
  if (submit.status < 200 || submit.status >= 400 || !location) {
    throw new MasterDataUpstreamError(`LOGIN_CODE_MISSING`, submit.status, false)
  }
  const code = extractCodeFromCustomSchemeLocation(location, state)

  const basic = btoa(`${config.clientId}:${config.clientSecret}`)
  let tokenResponse: Response
  try {
    tokenResponse = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
        authorization: `Basic ${basic}`
      },
      signal: AbortSignal.timeout(config.timeoutMs ?? UPSTREAM_TIMEOUT_MS),
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: config.redirectUri,
        client_id: config.clientId,
        code_verifier: verifier
      }).toString()
    })
  } catch (error) {
    if (isTimeoutError(error)) throw new MasterDataUpstreamError('OAUTH_TOKEN_TIMEOUT', 504, true)
    throw error
  }
  if (!tokenResponse.ok) {
    throw new MasterDataUpstreamError(`OAUTH_TOKEN_HTTP_${tokenResponse.status}`, tokenResponse.status, tokenResponse.status >= 500)
  }
  const payload = await tokenResponse.json().catch(() => null)
  const accessToken = payload && typeof payload === 'object' && typeof (payload as Record<string, unknown>).access_token === 'string'
    ? (payload as Record<string, string>).access_token
    : ''
  if (!accessToken) throw new MasterDataUpstreamError('OAUTH_ACCESS_TOKEN_MISSING')
  const rawExpires = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).expires_in : undefined
  const expiresIn = typeof rawExpires === 'number' && Number.isFinite(rawExpires) && rawExpires > 0 ? rawExpires : 7200
  return { accessToken, expiresIn }
}
