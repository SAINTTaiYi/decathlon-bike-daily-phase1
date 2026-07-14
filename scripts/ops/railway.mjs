import { parseJsonOutput, required, run } from './lib.mjs'

const railway = ['--yes', '@railway/cli@5.26.1']

async function command(args, options = {}, accountRequired = true) {
  const env = { ...process.env }
  if (accountRequired) env.RAILWAY_API_TOKEN = required('RAILWAY_API_TOKEN')
  else if (!env.RAILWAY_TOKEN && !env.RAILWAY_API_TOKEN) throw new Error('MISSING_SECRET · RAILWAY_TOKEN or RAILWAY_API_TOKEN')
  return run('npx', [...railway, ...args], { ...options, env, networkTarget: 'npm/Railway CLI' })
}

function findId(value) {
  if (!value || typeof value !== 'object') return ''
  if (typeof value.id === 'string') return value.id
  for (const nested of Object.values(value)) {
    const id = findId(nested)
    if (id) return id
  }
  return ''
}

export async function ensureRailway(environment, state, runtimeSecrets, allowedWebOrigins, { onCheckpoint = async () => {} } = {}) {
  let projectId = state.railway?.projectId
  if (!projectId) {
    const created = await command(['init', '--name', `decathlon-bike-ops-${environment}`, '--workspace', required('RAILWAY_WORKSPACE_ID'), '--json'], { quiet: true })
    projectId = findId(parseJsonOutput(created.stdout))
    if (!projectId) throw new Error('RAILWAY_PROJECT_ID_MISSING')
    state = { ...state, railway: { ...(state.railway || {}), projectId } }
    await onCheckpoint(state)
  } else {
    await command(['link', '--project', projectId, '--json'], { quiet: true })
  }

  let serviceId = state.railway?.serviceId
  if (!serviceId) {
    const created = await command(['add', '--service', 'api', '--json'], { quiet: true })
    serviceId = findId(parseJsonOutput(created.stdout))
    if (!serviceId) throw new Error('RAILWAY_SERVICE_ID_MISSING')
    state = { ...state, railway: { ...(state.railway || {}), projectId, serviceId } }
    await onCheckpoint(state)
  }

  const environments = parseJsonOutput((await command(['environment', 'list', '--json'], { quiet: true })).stdout)
  const list = Array.isArray(environments) ? environments : environments.environments || []
  let target = list.find((item) => item.name === environment)
  if (!target && environment === 'staging') {
    target = parseJsonOutput((await command(['environment', 'new', 'staging', '--json'], { quiet: true })).stdout)
  }
  if (!target && environment === 'production') target = list.find((item) => item.name === 'production')
  const environmentId = target?.id || findId(target)
  if (!environmentId) throw new Error(`RAILWAY_ENVIRONMENT_ID_MISSING · ${environment}`)
  state = {
    ...state,
    railway: { ...(state.railway || {}), projectId, serviceId, environments: { ...(state.railway?.environments || {}), [environment]: environmentId } }
  }
  await onCheckpoint(state)

  await command(['link', '--project', projectId, '--environment', environmentId, '--service', serviceId, '--json'], { quiet: true })
  let domain = state.railway?.domains?.[environment]
  if (!domain) {
    const domainResult = parseJsonOutput((await command(['domain', '--project', projectId, '--environment', environmentId, '--service', serviceId, '--json'], { quiet: true })).stdout)
    domain = domainResult.domain || domainResult.url || domainResult.domainName || findDomain(domainResult)
  }
  if (!domain) throw new Error('RAILWAY_DOMAIN_MISSING')
  const apiOrigin = domain.startsWith('http') ? domain : `https://${domain}`
  state = {
    ...state,
    railway: {
      ...(state.railway || {}), projectId, serviceId,
      environments: { ...(state.railway?.environments || {}), [environment]: environmentId },
      domains: { ...(state.railway?.domains || {}), [environment]: apiOrigin }
    },
    apiOrigin
  }
  await onCheckpoint(state)

  const variables = {
    APP_ENV: environment,
    NODE_ENV: 'production',
    HOST: '0.0.0.0',
    PORT: '8787',
    SESSION_SECRET: runtimeSecrets.SESSION_SECRET,
    CSRF_SECRET: runtimeSecrets.CSRF_SECRET,
    PASSWORD_PEPPER: runtimeSecrets.PASSWORD_PEPPER,
    CONTACT_ENCRYPTION_KEY: runtimeSecrets.CONTACT_ENCRYPTION_KEY,
    CORS_ALLOWED_ORIGINS: allowedWebOrigins,
    COOKIE_SECURE: 'true',
    TRUST_PROXY: 'true',
    SESSION_TTL_HOURS: '12',
    APP_VERSION: process.env.APP_VERSION || process.env.npm_package_version || 'unknown',
    GIT_SHA: process.env.GITHUB_SHA || 'manual',
    DATABASE_URL: runtimeSecrets.DATABASE_URL,
    DIRECT_DATABASE_URL: runtimeSecrets.DIRECT_DATABASE_URL,
    R2_ACCOUNT_ID: runtimeSecrets.R2_ACCOUNT_ID,
    R2_BUCKET: runtimeSecrets.R2_BUCKET,
    R2_ACCESS_KEY_ID: runtimeSecrets.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: runtimeSecrets.R2_SECRET_ACCESS_KEY,
    R2_ENDPOINT: runtimeSecrets.R2_ENDPOINT,
    ADMIN_SETUP_TOKEN_HASH: runtimeSecrets.ADMIN_SETUP_TOKEN_HASH || ''
  }
  for (const [key, value] of Object.entries(variables)) {
    if (!value) continue
    await command(['variable', 'set', key, '--stdin', '--skip-deploys', '--environment', environmentId, '--service', serviceId], { input: String(value), quiet: true })
  }

  const next = {
    ...state,
    railway: { projectId, serviceId, environments: { ...(state.railway?.environments || {}), [environment]: environmentId }, domains: { ...(state.railway?.domains || {}), [environment]: apiOrigin } },
    runtimeSecrets: { ...runtimeSecrets, ...variables }, apiOrigin
  }
  await onCheckpoint(next)
  return next
}

function findDomain(value) {
  if (typeof value === 'string' && /(?:railway\.app|up\.railway\.app)$/u.test(value)) return value
  if (!value || typeof value !== 'object') return ''
  for (const nested of Object.values(value)) {
    const domain = findDomain(nested)
    if (domain) return domain
  }
  return ''
}

export async function deployRailway(environment, state) {
  const environmentId = state.railway.environments[environment]
  await command(['link', '--project', state.railway.projectId, '--environment', environmentId, '--service', state.railway.serviceId, '--json'], { quiet: true }, false)
  const version = process.env.APP_VERSION || process.env.npm_package_version || 'unknown'
  const sha = process.env.GITHUB_SHA || 'manual'
  for (const [key, value] of Object.entries({ APP_VERSION: version, GIT_SHA: sha })) {
    await command(['variable', 'set', key, '--stdin', '--skip-deploys', '--environment', environmentId, '--service', state.railway.serviceId], { input: value, quiet: true }, false)
  }
  await command(['up', '.', '--project', state.railway.projectId, '--environment', environmentId, '--service', state.railway.serviceId, '--ci', '--message', `bike-ops ${sha}`], {}, false)
}
