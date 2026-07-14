import { jsonFetch, optional, required } from './lib.mjs'

const endpoint = 'https://api.cloudflare.com/client/v4'

function headers(token) {
  return { authorization: `Bearer ${token}` }
}

export async function ensureCloudflare(environment, state, { apiOrigin, onCheckpoint = async () => {} }) {
  const accountId = required('CLOUDFLARE_ACCOUNT_ID')
  const token = required('CLOUDFLARE_API_TOKEN')
  const projectName = `bike-ops-${environment}`
  const bucketName = `bike-ops-${environment}-media`

  try {
    await jsonFetch(`${endpoint}/accounts/${accountId}/pages/projects/${projectName}`, { headers: headers(token) })
  } catch (error) {
    if (error.status !== 404) throw error
    await jsonFetch(`${endpoint}/accounts/${accountId}/pages/projects`, {
      method: 'POST', headers: headers(token), body: JSON.stringify({ name: projectName, production_branch: environment === 'production' ? 'main' : 'develop' })
    })
  }
  const pagesUrl = `https://${projectName}.pages.dev`
  state = { ...state, cloudflare: { ...(state.cloudflare || {}), accountId, pagesProject: projectName, pagesUrl } }
  await onCheckpoint(state)

  const buckets = await jsonFetch(`${endpoint}/accounts/${accountId}/r2/buckets`, { headers: headers(token) })
  if (!buckets.result?.buckets?.some((bucket) => bucket.name === bucketName) && !buckets.result?.some?.((bucket) => bucket.name === bucketName)) {
    await jsonFetch(`${endpoint}/accounts/${accountId}/r2/buckets`, {
      method: 'POST', headers: headers(token), body: JSON.stringify({ name: bucketName, locationHint: 'apac', storageClass: 'Standard' })
    })
  }
  state = { ...state, cloudflare: { ...state.cloudflare, r2Bucket: bucketName } }
  await onCheckpoint(state)

  const webOrigins = [pagesUrl, ...optional(`CUSTOM_WEB_ORIGINS_${environment.toUpperCase()}`).split(',').map((origin) => origin.trim()).filter(Boolean)]
  await jsonFetch(`${endpoint}/accounts/${accountId}/r2/buckets/${bucketName}/cors`, {
    method: 'PUT', headers: headers(token), body: JSON.stringify({ rules: [{
      id: `bike-ops-${environment}-browser`,
      allowed: { origins: webOrigins, methods: ['GET', 'PUT', 'HEAD'], headers: ['content-type', 'x-amz-meta-sha256'] },
      exposeHeaders: ['etag', 'content-length', 'x-amz-meta-sha256'], maxAgeSeconds: 3600
    }] })
  })

  const credentials = await ensureR2Credentials(environment, accountId, bucketName)
  return {
    ...state,
    cloudflare: { accountId, pagesProject: projectName, pagesUrl, r2Bucket: bucketName, webOrigins },
    runtimeSecrets: { ...state.runtimeSecrets, ...credentials, R2_ACCOUNT_ID: accountId, R2_BUCKET: bucketName, R2_ENDPOINT: `https://${accountId}.r2.cloudflarestorage.com` },
    apiOrigin
  }
}

async function ensureR2Credentials(environment, _accountId, _bucketName) {
  const suffix = environment.toUpperCase()
  const existingId = optional(`R2_ACCESS_KEY_ID_${suffix}`)
  const existingSecret = optional(`R2_SECRET_ACCESS_KEY_${suffix}`)
  if (existingId && existingSecret) return { R2_ACCESS_KEY_ID: existingId, R2_SECRET_ACCESS_KEY: existingSecret }

  throw new Error(`MISSING_R2_S3_CREDENTIALS · create a bucket-scoped R2 S3 credential and provide R2_ACCESS_KEY_ID_${suffix} plus R2_SECRET_ACCESS_KEY_${suffix}`)
}

export async function deployPages(environment, apiOrigin) {
  const projectName = `bike-ops-${environment}`
  const branch = environment === 'production' ? 'main' : 'develop'
  const env = { ...process.env, VITE_API_BASE_URL: apiOrigin, VITE_APP_ENV: environment, VITE_ENABLE_SERVICE_WORKER: optional('ENABLE_SERVICE_WORKER', 'false') }
  const { run } = await import('./lib.mjs')
  await run('pnpm', ['--filter', '@bike-ops/web', 'build'], { env })
  await run('node', ['scripts/prepare-pages-headers.mjs', 'apps/web/dist', apiOrigin, environment])
  await run('npx', ['--yes', 'wrangler@4.110.0', 'pages', 'deploy', 'apps/web/dist', '--project-name', projectName, '--branch', branch], { env, networkTarget: 'npm/Cloudflare Wrangler' })
}
