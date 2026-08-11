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
}

export function isAllowedOrigin(origin: string | undefined, allowedOrigins: readonly string[]): boolean {
  return Boolean(origin && allowedOrigins.includes(origin))
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
    RESEND_FROM: env.RESEND_FROM
  }
}
