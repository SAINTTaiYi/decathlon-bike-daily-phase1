import type { Context } from 'hono'
import type { AppConfig } from '../env.js'
import { keyedHash, randomToken } from '../lib/crypto.js'

export const SESSION_COOKIE = '__Host-bike_ops_session'

export async function createSessionSecrets(config: AppConfig) {
  const token = randomToken()
  const csrfToken = randomToken()
  return {
    token,
    tokenHash: await keyedHash(token, config.SESSION_SECRET),
    csrfToken,
    csrfHash: await keyedHash(csrfToken, config.CSRF_SECRET)
  }
}

export async function sessionTokenHash(token: string, config: AppConfig): Promise<string> {
  return keyedHash(token, config.SESSION_SECRET)
}

export async function csrfTokenHash(token: string, config: AppConfig): Promise<string> {
  return keyedHash(token, config.CSRF_SECRET)
}

export function setSessionCookie(c: Context, token: string, config: AppConfig): void {
  const maxAge = config.SESSION_TTL_HOURS * 60 * 60
  const secure = config.COOKIE_SECURE ? '; Secure' : ''
  c.header(
    'Set-Cookie',
    `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`,
    { append: true }
  )
}

export function clearSessionCookie(c: Context, config: AppConfig): void {
  const secure = config.COOKIE_SECURE ? '; Secure' : ''
  c.header(
    'Set-Cookie',
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`,
    { append: true }
  )
}

export function readCookie(c: Context, name: string): string | undefined {
  const header = c.req.header('cookie')
  if (!header) return undefined
  for (const part of header.split(';')) {
    const [rawKey, ...rest] = part.trim().split('=')
    if (rawKey === name) return rest.join('=')
  }
  return undefined
}
