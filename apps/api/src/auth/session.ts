import type { FastifyReply } from 'fastify'
import { keyedHash, randomToken } from '../lib/crypto.js'
import type { AppConfig } from '../config.js'

export const SESSION_COOKIE = '__Host-bike_ops_session'

export function createSessionSecrets(config: AppConfig) {
  const token = randomToken()
  const csrfToken = randomToken()
  return {
    token,
    tokenHash: keyedHash(token, config.SESSION_SECRET),
    csrfToken,
    csrfHash: keyedHash(csrfToken, config.CSRF_SECRET)
  }
}

export function sessionTokenHash(token: string, config: AppConfig): string {
  return keyedHash(token, config.SESSION_SECRET)
}

export function csrfTokenHash(token: string, config: AppConfig): string {
  return keyedHash(token, config.CSRF_SECRET)
}

export function setSessionCookie(reply: FastifyReply, token: string, config: AppConfig): void {
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    secure: config.COOKIE_SECURE,
    sameSite: 'lax',
    maxAge: config.SESSION_TTL_HOURS * 60 * 60
  })
}

export function clearSessionCookie(reply: FastifyReply, config: AppConfig): void {
  reply.clearCookie(SESSION_COOKIE, {
    path: '/',
    httpOnly: true,
    secure: config.COOKIE_SECURE,
    sameSite: 'lax'
  })
}
