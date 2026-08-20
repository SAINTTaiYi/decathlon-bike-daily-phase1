export type ShipHubMode = 'fixture' | 'live'

export interface WorkerEnv {
  DB: D1Database
  ASSETS: Fetcher
  APP_ENV: 'local' | 'staging' | 'production'
  APP_VERSION: string
  GIT_SHA?: string
  COOKIE_SECURE: string
  SESSION_TTL_HOURS: string
  CORS_ALLOWED_ORIGINS?: string
  SESSION_SECRET: string
  CSRF_SECRET: string
  PASSWORD_PEPPER: string
  CONTACT_ENCRYPTION_KEY?: string
  ADMIN_SETUP_TOKEN_HASH?: string
  PLATFORM_ADMIN_SETUP_TOKEN_HASH?: string
  REGISTRATION_SECRET?: string
  RESEND_API_KEY?: string
  RESEND_FROM?: string
  SHIPHUB_ENABLED?: string
  SHIPHUB_MODE?: string
  SHIPHUB_BASE_URL?: string
  SHIPHUB_FIXTURE_JSON?: string
  SHIPHUB_LIVE_CONFIRMED?: string
  SHIPHUB_OAUTH_AUTHORIZE_URL?: string
  SHIPHUB_OAUTH_TOKEN_URL?: string
  SHIPHUB_OAUTH_CLIENT_ID?: string
  SHIPHUB_OAUTH_CLIENT_SECRET?: string
  SHIPHUB_OAUTH_REDIRECT_URI?: string
  SHIPHUB_OAUTH_SCOPE?: string
  SHIPHUB_TOKEN_ENCRYPTION_KEY?: string
  SHIPHUB_REQUEST_TIMEOUT_MS?: string
  SHIPHUB_ACTIVE_START_HOUR?: string
  SHIPHUB_ACTIVE_END_HOUR?: string
  SHIPHUB_LOCATION_NUM?: string
  SHIPHUB_OAUTH_BASIC_TOKEN?: string
  SHIPHUB_BOOTSTRAP_REFRESH_TOKEN?: string
  SHIPHUB_LOGIN_KEY?: string
  SHIPHUB_LOGIN_USERNAME_ENC?: string
  SHIPHUB_LOGIN_PASSWORD_ENC?: string
  SHIPHUB_ALERT_EMAIL?: string
}

export interface ShipHubConfig {
  enabled: boolean
  mode: ShipHubMode
  baseUrl?: string
  fixtureJson?: string
  liveConfirmed: boolean
  oauthAuthorizeUrl?: string
  oauthTokenUrl?: string
  oauthClientId?: string
  oauthClientSecret?: string
  oauthRedirectUri?: string
  oauthScope: string
  tokenEncryptionKey?: string
  locationNum?: string
  oauthBasicToken?: string
  bootstrapRefreshToken?: string
  loginKey?: string
  loginUsernameEnc?: string
  loginPasswordEnc?: string
  alertEmail?: string
  requestTimeoutMs: number
  activeStartHour: number
  activeEndHour: number
}

export interface AppConfig {
  APP_ENV: 'local' | 'staging' | 'production'
  APP_VERSION: string
  GIT_SHA: string
  COOKIE_SECURE: boolean
  SESSION_TTL_HOURS: number
  allowedOrigins: string[]
  SESSION_SECRET: string
  CSRF_SECRET: string
  PASSWORD_PEPPER: string
  CONTACT_ENCRYPTION_KEY?: string
  ADMIN_SETUP_TOKEN_HASH?: string
  PLATFORM_ADMIN_SETUP_TOKEN_HASH?: string
  REGISTRATION_SECRET?: string
  RESEND_API_KEY?: string
  RESEND_FROM?: string
  SHIPHUB: ShipHubConfig
}

export function isAllowedOrigin(origin: string | undefined, allowedOrigins: readonly string[]): boolean {
  return Boolean(origin && allowedOrigins.includes(origin))
}

function parseHour(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback)
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 24 ? parsed : fallback
}

function loadShipHubConfig(env: WorkerEnv): ShipHubConfig {
  const mode: ShipHubMode = env.SHIPHUB_MODE === 'live' ? 'live' : 'fixture'
  return {
    enabled: env.SHIPHUB_ENABLED === 'true',
    mode,
    baseUrl: env.SHIPHUB_BASE_URL,
    fixtureJson: env.SHIPHUB_FIXTURE_JSON,
    liveConfirmed: env.SHIPHUB_LIVE_CONFIRMED === 'true',
    oauthAuthorizeUrl: env.SHIPHUB_OAUTH_AUTHORIZE_URL,
    oauthTokenUrl: env.SHIPHUB_OAUTH_TOKEN_URL,
    oauthClientId: env.SHIPHUB_OAUTH_CLIENT_ID,
    oauthClientSecret: env.SHIPHUB_OAUTH_CLIENT_SECRET,
    oauthRedirectUri: env.SHIPHUB_OAUTH_REDIRECT_URI,
    oauthScope: env.SHIPHUB_OAUTH_SCOPE ?? 'read',
    tokenEncryptionKey: env.SHIPHUB_TOKEN_ENCRYPTION_KEY,
    locationNum: env.SHIPHUB_LOCATION_NUM,
    oauthBasicToken: env.SHIPHUB_OAUTH_BASIC_TOKEN,
    bootstrapRefreshToken: env.SHIPHUB_BOOTSTRAP_REFRESH_TOKEN,
    loginKey: env.SHIPHUB_LOGIN_KEY,
    loginUsernameEnc: env.SHIPHUB_LOGIN_USERNAME_ENC,
    loginPasswordEnc: env.SHIPHUB_LOGIN_PASSWORD_ENC,
    alertEmail: env.SHIPHUB_ALERT_EMAIL,
    requestTimeoutMs: (() => { const value = Number(env.SHIPHUB_REQUEST_TIMEOUT_MS ?? 8000); return Number.isFinite(value) ? Math.min(Math.max(value, 1000), 30000) : 8000 })(),
    activeStartHour: parseHour(env.SHIPHUB_ACTIVE_START_HOUR, 10),
    activeEndHour: parseHour(env.SHIPHUB_ACTIVE_END_HOUR, 22)
  }
}

export function loadConfig(env: WorkerEnv): AppConfig {
  const required = ['SESSION_SECRET', 'CSRF_SECRET', 'PASSWORD_PEPPER'] as const
  for (const key of required) {
    if (!env[key] || env[key].length < 32) throw new Error(`MISSING_OR_SHORT_SECRET · ${key}`)
  }
  const origins = (env.CORS_ALLOWED_ORIGINS ?? 'https://bike-ops-staging.workers.dev')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  if (!origins.length || origins.includes('*')) throw new Error('CORS_ALLOWED_ORIGINS must be explicit')
  return {
    APP_ENV: env.APP_ENV ?? 'staging',
    APP_VERSION: env.APP_VERSION ?? '0.0.0',
    GIT_SHA: env.GIT_SHA ?? 'unknown',
    COOKIE_SECURE: (env.COOKIE_SECURE ?? 'true') === 'true',
    SESSION_TTL_HOURS: Number(env.SESSION_TTL_HOURS ?? '12'),
    allowedOrigins: origins,
    SESSION_SECRET: env.SESSION_SECRET,
    CSRF_SECRET: env.CSRF_SECRET,
    PASSWORD_PEPPER: env.PASSWORD_PEPPER,
    CONTACT_ENCRYPTION_KEY: env.CONTACT_ENCRYPTION_KEY,
    ADMIN_SETUP_TOKEN_HASH: env.ADMIN_SETUP_TOKEN_HASH,
    PLATFORM_ADMIN_SETUP_TOKEN_HASH: env.PLATFORM_ADMIN_SETUP_TOKEN_HASH,
    REGISTRATION_SECRET: env.REGISTRATION_SECRET,
    RESEND_API_KEY: env.RESEND_API_KEY,
    RESEND_FROM: env.RESEND_FROM,
    SHIPHUB: loadShipHubConfig(env)
  }
}
