import type { ShipHubConfig } from '../env.js'
import { ShipHubUpstreamError } from './shiphub-client.js'

export type ShipHubToken = {
  accessToken: string
  refreshToken?: string
  expiresAt: string
}

function basicHeader(config: ShipHubConfig): string {
  const basic = config.oauthBasicToken ?? (config.oauthClientId && config.oauthClientSecret ? btoa(`${config.oauthClientId}:${config.oauthClientSecret}`) : '')
  if (!basic) throw new ShipHubUpstreamError('OAUTH_BASIC_TOKEN_MISSING')
  return `Basic ${basic}`
}

function requireTokenConfig(config: ShipHubConfig): string {
  if (!config.oauthTokenUrl) throw new ShipHubUpstreamError('OAUTH_TOKEN_CONFIG_INCOMPLETE')
  return config.oauthTokenUrl
}

async function exchange(config: ShipHubConfig, params: Record<string, string>): Promise<ShipHubToken> {
  const tokenUrl = requireTokenConfig(config)
  const body = new URLSearchParams(params)
  let response: Response
  try {
    response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { accept: 'application/json', authorization: basicHeader(config), 'content-type': 'application/x-www-form-urlencoded' },
      body
    })
  } catch {
    throw new ShipHubUpstreamError('OAUTH_TOKEN_NETWORK_ERROR', undefined, true)
  }
  if (!response.ok) throw new ShipHubUpstreamError(`OAUTH_TOKEN_HTTP_${response.status}`, response.status, response.status >= 500)
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new ShipHubUpstreamError('OAUTH_TOKEN_INVALID_JSON')
  }
  if (!payload || typeof payload !== 'object') throw new ShipHubUpstreamError('OAUTH_TOKEN_INVALID_RESPONSE')
  const row = payload as Record<string, unknown>
  const accessToken = typeof row.access_token === 'string' ? row.access_token : ''
  if (!accessToken) throw new ShipHubUpstreamError('OAUTH_ACCESS_TOKEN_MISSING')
  const expiresIn = Number(row.expires_in ?? 3600)
  return {
    accessToken,
    refreshToken: typeof row.refresh_token === 'string' ? row.refresh_token : undefined,
    expiresAt: new Date(Date.now() + Math.max(Number.isFinite(expiresIn) ? expiresIn : 3600, 60) * 1000).toISOString()
  }
}

export async function refreshShipHubAccessToken(config: ShipHubConfig, refreshToken: string): Promise<ShipHubToken> {
  return exchange(config, { grant_type: 'refresh_token', refresh_token: refreshToken })
}

export async function exchangeShipHubAuthorizationCode(config: ShipHubConfig, code: string): Promise<ShipHubToken> {
  const params: Record<string, string> = { grant_type: 'authorization_code', code }
  if (config.oauthRedirectUri) params.redirect_uri = config.oauthRedirectUri
  return exchange(config, params)
}
