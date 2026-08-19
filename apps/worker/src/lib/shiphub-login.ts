import type { ShipHubConfig } from '../env.js'
import { decryptShipHubSecret } from './shiphub-crypto.js'
import { ShipHubUpstreamError } from './shiphub-client.js'
import { exchangeShipHubAuthorizationCode, type ShipHubToken } from './shiphub-token.js'

// 门店账号程序化登录：凭据以 AES-256-GCM 加密（密文+nonce）存于 CF secret，
// 仅在本模块解密并用于提交 PingFederate 登录表单；绝不进入日志、审计或响应。
const LOGIN_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const LOGIN_HTML_ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'

function splitEncryptedBlob(blob: string): { ciphertext: string; nonce: string } {
  const [ciphertext, nonce] = blob.split('.')
  if (!ciphertext || !nonce) throw new ShipHubUpstreamError('LOGIN_CREDENTIAL_MALFORMED')
  return { ciphertext, nonce }
}

export function parseLoginForm(html: string, baseUrl: string): { action: string; fields: Record<string, string> } {
  const form = /<form[^>]*action=["']([^"']+)["']/i.exec(html)
  const action = form?.[1]
  if (!action) throw new ShipHubUpstreamError('LOGIN_FORM_NOT_FOUND')
  const fields: Record<string, string> = {}
  for (const match of html.matchAll(/<input[^>]*name=["']([^"']+)["'][^>]*value=["']([^"']*)["']/gi)) {
    if (match[1]) fields[match[1]] = match[2] ?? ''
  }
  return { action: new URL(action, baseUrl).toString(), fields }
}

export function extractCodeFromUrl(url: string, state: string): string {
  const parsed = new URL(url)
  const code = parsed.searchParams.get('code')
  if (!code) throw new ShipHubUpstreamError('LOGIN_CODE_MISSING')
  if (parsed.searchParams.get('state') !== state) throw new ShipHubUpstreamError('LOGIN_STATE_MISMATCH')
  return code
}

async function readLoginCredentials(config: ShipHubConfig): Promise<{ username: string; password: string }> {
  if (!config.loginKey || !config.loginUsernameEnc || !config.loginPasswordEnc) {
    throw new ShipHubUpstreamError('LOGIN_CREDENTIALS_NOT_CONFIGURED')
  }
  const usernameBlob = splitEncryptedBlob(config.loginUsernameEnc)
  const passwordBlob = splitEncryptedBlob(config.loginPasswordEnc)
  const username = await decryptShipHubSecret(usernameBlob.ciphertext, usernameBlob.nonce, config.loginKey)
  const password = await decryptShipHubSecret(passwordBlob.ciphertext, passwordBlob.nonce, config.loginKey)
  return { username, password }
}

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const value of bytes) binary += String.fromCharCode(value)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '')
}

// 完整程序化登录：授权请求 → 提交 PingFederate 表单 → 捕获 code → PKCE 换 token。
// 依赖 Workers fetch 自动跟随重定向后 response.url 携带 ?code= 的行为（已实测）。
export async function performShipHubProgrammaticLogin(config: ShipHubConfig): Promise<ShipHubToken> {
  if (!config.oauthAuthorizeUrl || !config.oauthClientId || !config.oauthRedirectUri) {
    throw new ShipHubUpstreamError('OAUTH_CONFIG_INCOMPLETE')
  }
  const { username, password } = await readLoginCredentials(config)
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(48)))
  const challenge = base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))))
  const state = base64Url(crypto.getRandomValues(new Uint8Array(24)))
  const authorizeUrl = new URL(config.oauthAuthorizeUrl)
  authorizeUrl.searchParams.set('client_id', config.oauthClientId)
  authorizeUrl.searchParams.set('response_type', 'code')
  authorizeUrl.searchParams.set('redirect_uri', config.oauthRedirectUri)
  authorizeUrl.searchParams.set('scope', config.oauthScope ?? 'openid profile')
  authorizeUrl.searchParams.set('state', state)
  authorizeUrl.searchParams.set('code_challenge', challenge)
  authorizeUrl.searchParams.set('code_challenge_method', 'S256')

  const page = await fetch(authorizeUrl.toString(), {
    headers: { 'user-agent': LOGIN_USER_AGENT, accept: LOGIN_HTML_ACCEPT, 'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8' }
  })
  if (!page.ok) throw new ShipHubUpstreamError(`LOGIN_PAGE_HTTP_${page.status}`)
  const { action, fields } = parseLoginForm(await page.text(), page.url)
  const cookies = (page.headers.getSetCookie?.() ?? []).map((value) => value.split(';')[0]).join('; ')

  const body = new URLSearchParams(fields)
  body.set('pf.username', username)
  body.set('pf.pass', password)
  const submit = await fetch(action, {
    method: 'POST',
    headers: {
      'user-agent': LOGIN_USER_AGENT,
      accept: 'text/html,*/*',
      'accept-language': 'zh-CN,zh;q=0.9',
      'content-type': 'application/x-www-form-urlencoded',
      ...(cookies ? { cookie: cookies } : {})
    },
    body: body.toString()
  })
  const code = extractCodeFromUrl(submit.url, state)
  const token = await exchangeShipHubAuthorizationCode(config, code)
  if (!token.refreshToken) throw new ShipHubUpstreamError('OAUTH_REFRESH_TOKEN_MISSING')
  return token
}
