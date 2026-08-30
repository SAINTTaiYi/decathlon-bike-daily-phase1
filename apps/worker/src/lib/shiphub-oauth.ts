import type { AuthContext } from '../auth/types.js'
import type { AppConfig, WorkerEnv } from '../env.js'
import { first, nowIso } from '../db.js'
import { randomToken, sha256 } from './crypto.js'
import { decryptShipHubSecret, encryptShipHubSecret } from './shiphub-crypto.js'
import { exchangeShipHubAuthorizationCode, refreshShipHubAccessToken, type ShipHubToken } from './shiphub-token.js'
import { ShipHubUpstreamError } from './shiphub-client.js'

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const value of bytes) binary += String.fromCharCode(value)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '')
}

async function pkceChallenge(verifier: string): Promise<string> {
  return base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))))
}

function requireOAuthConfig(config: AppConfig): { authorizeUrl: string; clientId: string; redirectUri: string; key: string } {
  const authorizeUrl = config.SHIPHUB.oauthAuthorizeUrl
  const clientId = config.SHIPHUB.oauthClientId
  const redirectUri = config.SHIPHUB.oauthRedirectUri
  const key = config.SHIPHUB.tokenEncryptionKey
  if (!authorizeUrl || !clientId || !redirectUri || !key) throw new ShipHubUpstreamError('OAUTH_CONFIG_INCOMPLETE')
  return { authorizeUrl, clientId, redirectUri, key }
}

export async function createShipHubAuthorization(
  db: D1Database,
  config: AppConfig,
  context: AuthContext,
  returnTo = '/'
): Promise<string> {
  const { authorizeUrl, clientId, redirectUri, key } = requireOAuthConfig(config)
  if (!/^\/(?!\/)/u.test(returnTo)) returnTo = '/'
  const state = randomToken(32)
  const verifier = randomToken(48)
  const stateHash = await sha256(state)
  const encryptedVerifier = await encryptShipHubSecret(verifier, key)
  const stamp = nowIso()
  await db.batch([
    db.prepare('DELETE FROM shiphub_oauth_states WHERE expires_at <= ? OR consumed_at IS NOT NULL').bind(stamp),
    db.prepare(`
      INSERT INTO shiphub_oauth_states (
        state_hash, store_id, user_id, session_token_hash, pkce_verifier_ciphertext, pkce_verifier_nonce,
        return_to, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(stateHash, context.storeId, context.userId, context.sessionTokenHash, encryptedVerifier.ciphertext, encryptedVerifier.nonce, returnTo, stamp, new Date(Date.now() + 10 * 60 * 1000).toISOString())
  ])
  const url = new URL(authorizeUrl)
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('scope', config.SHIPHUB.oauthScope)
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge', await pkceChallenge(verifier))
  url.searchParams.set('code_challenge_method', 'S256')
  return url.toString()
}

type OAuthState = {
  state_hash: string
  store_id: string
  user_id: string
  session_token_hash: string
  pkce_verifier_ciphertext: string
  pkce_verifier_nonce: string
  return_to: string
}

export async function completeShipHubAuthorization(
  db: D1Database,
  config: AppConfig,
  context: AuthContext,
  state: string,
  code: string
): Promise<{ returnTo: string; token: ShipHubToken }> {
  if (!state || !code || state.length > 256 || code.length > 4096) throw new ShipHubUpstreamError('INVALID_OAUTH_CALLBACK')
  const row = await first<OAuthState>(db.prepare(`
    SELECT state_hash, store_id, user_id, session_token_hash, pkce_verifier_ciphertext, pkce_verifier_nonce, return_to
    FROM shiphub_oauth_states
    WHERE state_hash = ? AND expires_at > ? AND consumed_at IS NULL
  `).bind(await sha256(state), nowIso()))
  if (!row || row.store_id !== context.storeId || row.user_id !== context.userId || row.session_token_hash !== context.sessionTokenHash) {
    throw new ShipHubUpstreamError('OAUTH_STATE_INVALID')
  }
  const key = config.SHIPHUB.tokenEncryptionKey
  if (!key) throw new ShipHubUpstreamError('OAUTH_CONFIG_INCOMPLETE')
  await db.prepare('UPDATE shiphub_oauth_states SET consumed_at = ? WHERE state_hash = ? AND consumed_at IS NULL')
    .bind(nowIso(), row.state_hash).run()
  const codeVerifier = await decryptShipHubSecret(row.pkce_verifier_ciphertext, row.pkce_verifier_nonce, key)
  const token = await exchangeAuthorizationCode(config, code, codeVerifier)
  if (!token.refreshToken) throw new ShipHubUpstreamError('OAUTH_REFRESH_TOKEN_MISSING')
  const encrypted = await encryptShipHubSecret(token.refreshToken, key)
  const stamp = nowIso()
  await db.prepare(`
    INSERT INTO shiphub_connections (
      store_id, enabled, mode, refresh_token_ciphertext, refresh_token_nonce, refresh_token_key_version,
      token_expires_at, token_updated_at, authorization_status, last_auth_error_code, created_at, updated_at
    ) VALUES (?, 1, 'live', ?, ?, 'v1', ?, ?, 'connected', NULL, ?, ?)
    ON CONFLICT(store_id) DO UPDATE SET
      enabled = 1, mode = 'live', refresh_token_ciphertext = excluded.refresh_token_ciphertext,
      refresh_token_nonce = excluded.refresh_token_nonce, refresh_token_key_version = excluded.refresh_token_key_version,
      token_expires_at = excluded.token_expires_at, token_updated_at = excluded.token_updated_at,
      authorization_status = 'connected', last_auth_error_code = NULL, updated_at = excluded.updated_at
  `).bind(context.storeId, encrypted.ciphertext, encrypted.nonce, token.expiresAt, stamp, stamp, stamp).run()
  return { returnTo: row.return_to, token }
}

async function exchangeAuthorizationCode(config: AppConfig, code: string, codeVerifier?: string): Promise<ShipHubToken> {
  return exchangeShipHubAuthorizationCode(config.SHIPHUB, code, codeVerifier)
}

export async function readRefreshToken(config: AppConfig, row: { refresh_token_ciphertext: string; refresh_token_nonce: string }): Promise<string> {
  if (!config.SHIPHUB.tokenEncryptionKey) throw new ShipHubUpstreamError('TOKEN_ENCRYPTION_NOT_CONFIGURED')
  try {
    return await decryptShipHubSecret(row.refresh_token_ciphertext, row.refresh_token_nonce, config.SHIPHUB.tokenEncryptionKey)
  } catch {
    // 解密失败说明库里的密文与当前 tokenEncryptionKey 不匹配（换密钥或写入端用错密钥）。
    // 必须抛可识别错误码，否则会被归入通用 SYNC_FAILED、既不触发 reauth_required
    // 也无法自愈，连接将永久卡在假 connected 状态（2026-08-30 事故）。
    throw new ShipHubUpstreamError('REFRESH_TOKEN_UNDECRYPTABLE')
  }
}

export async function rotateRefreshToken(
  db: D1Database,
  config: AppConfig,
  storeId: string,
  previousCiphertext: string,
  previousNonce: string,
  token: ShipHubToken
): Promise<void> {
  if (!token.refreshToken || !config.SHIPHUB.tokenEncryptionKey) return
  const encrypted = await encryptShipHubSecret(token.refreshToken, config.SHIPHUB.tokenEncryptionKey)
  await db.prepare(`
    UPDATE shiphub_connections
    SET refresh_token_ciphertext = ?, refresh_token_nonce = ?, refresh_token_key_version = 'v1',
        token_expires_at = ?, token_updated_at = ?, updated_at = ?
    WHERE store_id = ? AND refresh_token_ciphertext = ? AND refresh_token_nonce = ?
  `).bind(encrypted.ciphertext, encrypted.nonce, token.expiresAt, nowIso(), nowIso(), storeId, previousCiphertext, previousNonce).run()
}

// 同一上游身份 = location_num + 登录账号。返回 sha256 hex；无 location 时无法判定身份。
// 无显式账号时按 legacy 规则（部署级共享凭据）计算，保证存量连接与增量连接口径一致。
export async function shipHubIdentityFingerprint(locationNum: string | null | undefined, username?: string): Promise<string | null> {
  const normalized = locationNum?.trim()
  if (!normalized) return null
  if (username) return sha256(`${normalized}\u0000${username}`)
  return sha256(`legacy:${normalized}`)
}
