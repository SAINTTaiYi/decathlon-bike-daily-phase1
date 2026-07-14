import { jsonFetch, required, waitFor } from './lib.mjs'

const endpoint = 'https://api.supabase.com/v1'

function headers() {
  return { authorization: `Bearer ${required('SUPABASE_ACCESS_TOKEN')}` }
}

export function connectionUrls(ref, region, password) {
  if (!ref || !region) throw new Error('SUPABASE_CONNECTION_METADATA_MISSING')
  const encodedPassword = encodeURIComponent(password)
  return {
    DATABASE_URL: `postgresql://postgres.${ref}:${encodedPassword}@aws-0-${region}.pooler.supabase.com:6543/postgres?sslmode=require`,
    DIRECT_DATABASE_URL: `postgresql://postgres:${encodedPassword}@db.${ref}.supabase.co:5432/postgres?sslmode=require`
  }
}

export function connectionUrlsFromState(environment, state) {
  const password = required(`SUPABASE_DB_PASSWORD_${environment.toUpperCase()}`)
  return connectionUrls(state.supabase?.projectRef, state.supabase?.region, password)
}

export async function ensureSupabase(environment, state, { onCheckpoint = async () => {} } = {}) {
  const suffix = environment.toUpperCase()
  const password = required(`SUPABASE_DB_PASSWORD_${suffix}`)
  let ref = state.supabase?.projectRef
  let region = state.supabase?.region
  if (!ref) {
    const created = await jsonFetch(`${endpoint}/projects`, {
      method: 'POST', headers: headers(), body: JSON.stringify({
        name: `bike-ops-${environment}`,
        organization_slug: required('SUPABASE_ORG_ID'),
        db_pass: password,
        region_selection: { type: 'smartGroup', code: 'apac' }
      })
    })
    ref = created.id || created.ref
    region = created.region
    if (!ref) throw new Error('SUPABASE_PROJECT_REF_MISSING')
    state = { ...state, supabase: { projectRef: ref, region: region || null, regionGroup: 'apac' } }
    await onCheckpoint(state)
  }
  await waitFor(`Supabase ${environment}`, async () => {
    const health = await jsonFetch(`${endpoint}/projects/${ref}/health`, { headers: headers() })
    const services = Array.isArray(health) ? health : health.result || []
    return services.some((service) => service.status === 'ACTIVE_HEALTHY') || health.status === 'ACTIVE_HEALTHY'
  }, { attempts: 120, delayMs: 5000 })
  if (!region) {
    const project = await jsonFetch(`${endpoint}/projects/${ref}`, { headers: headers() })
    region = project.region || project.result?.region
  }
  const urls = connectionUrls(ref, region, password)
  const next = { ...state, supabase: { projectRef: ref, region, regionGroup: 'apac' }, runtimeSecrets: { ...state.runtimeSecrets, ...urls } }
  await onCheckpoint(next)
  return next
}
