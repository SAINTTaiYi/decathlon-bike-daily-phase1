import type { ShipHubConfig } from '../env.js'
import { ShipHubUpstreamError } from './shiphub-client.js'

export type ShipHubToken = {
  accessToken: string
  refreshToken?: string
  expiresAt: string
}

export async function refreshShipHubAccessToken(config: ShipHubConfig, refreshToken: string): Promise<ShipHubToken> {
  if (!config.oauthTokenUrl || !config.oauthClientId || !config.oauthRedirectUri) {
    throw new ShipHubUpstreamError('OAUTH_TOKEN_CONFIG_INCOMPLETE')
  }
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: config.oauthClientId,
    redirect_uri: config.oauthRedirectUri
  })
  if (config.oauthClientSecret) body.set('client_secret', config.oauthClientSecret)
  let response: Response
  try {
    response = await fetch(config.oauthTokenUrl, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
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
