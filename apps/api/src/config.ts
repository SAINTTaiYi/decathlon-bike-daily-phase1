import { z } from 'zod'

const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true')

const environmentSchema = z.object({
  APP_ENV: z.enum(['local', 'staging', 'production']).default('local'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().max(65535).default(8787),
  DATABASE_URL: z.string().min(1),
  DIRECT_DATABASE_URL: z.string().min(1).optional(),
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
  R2_ACCOUNT_ID: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_ENDPOINT: z.string().url().optional()
})

export type AppConfig = z.infer<typeof environmentSchema> & { allowedOrigins: string[] }

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = environmentSchema.parse(env)
  const allowedOrigins = parsed.CORS_ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
  if (!allowedOrigins.length || allowedOrigins.some((origin) => origin === '*')) throw new Error('CORS_ALLOWED_ORIGINS must contain explicit origins and cannot use *')
  if (parsed.APP_ENV === 'production' && !parsed.COOKIE_SECURE) throw new Error('COOKIE_SECURE must be true in production')
  return { ...parsed, allowedOrigins }
}
