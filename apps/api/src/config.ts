import { z } from 'zod'

const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true')

const environmentSchema = z.object({
  APP_ENV: z.enum(['local', 'staging', 'production']).default('local'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().max(65535).default(8787),
  DATABASE_URL: z.string().min(1),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(10).default(1),
  DATABASE_IDLE_TIMEOUT_SECONDS: z.coerce.number().int().min(1).max(60).default(5),
  DATABASE_CONNECT_TIMEOUT_SECONDS: z.coerce.number().int().min(1).max(60).default(15),
  SESSION_SECRET: z.string().min(32),
  CSRF_SECRET: z.string().min(32),
  PASSWORD_PEPPER: z.string().min(32),
  CONTACT_ENCRYPTION_KEY: z.string().min(43).optional(),
  CORS_ALLOWED_ORIGINS: z.string().min(1),
  COOKIE_SECURE: booleanString.default('true'),
  COOKIE_DOMAIN: z.string().optional(),
  ADMIN_SETUP_TOKEN_HASH: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(12),
  TRUST_PROXY: booleanString.default('true'),
  APP_VERSION: z.string().default('0.0.0'),
  GIT_SHA: z.string().default('development'),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SECRET_KEY: z.string().min(32).optional(),
  SUPABASE_STORAGE_BUCKET: z.string().min(3).max(63).regex(/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/u).default('bike-ops-media')
})

export type AppConfig = z.infer<typeof environmentSchema> & { allowedOrigins: string[] }

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = environmentSchema.parse(env)
  const allowedOrigins = parsed.CORS_ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
  if (!allowedOrigins.length || allowedOrigins.some((origin) => origin === '*')) throw new Error('CORS_ALLOWED_ORIGINS must contain explicit origins and cannot use *')
  if (parsed.APP_ENV === 'production' && !parsed.COOKIE_SECURE) throw new Error('COOKIE_SECURE must be true in production')
  return { ...parsed, allowedOrigins }
}
