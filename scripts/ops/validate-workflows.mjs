#!/usr/bin/env node
import { createRequire } from 'node:module'
import { access, readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const root = process.cwd()
const workflowDirectory = resolve(root, '.github/workflows')
const workflowNames = (await readdir(workflowDirectory)).filter((name) => /\.ya?ml$/u.test(name)).sort()
const workflows = Object.fromEntries(await Promise.all(workflowNames.map(async (name) => [name, await readFile(resolve(workflowDirectory, name), 'utf8')])))
const ci = workflows['ci.yml'] || ''
const staging = workflows['deploy-cloudflare-staging.yml'] || ''
const preview = workflows['deploy-cloudflare-preview.yml'] || ''
const production = workflows['deploy-production.yml'] || ''
const legacyStaging = workflows['deploy-staging.yml'] || ''
const legacyDomain = workflows['onboard-workshop-skin-staging.yml'] || ''
const envExample = await readFile(resolve(root, '.env.example'), 'utf8')
const schemaVersion = await readFile(resolve(root, 'apps/worker/src/schema-version.ts'), 'utf8')
const migrationNames = (await readdir(resolve(root, 'migrations/d1'))).filter((name) => /^\d+_.+\.sql$/u.test(name)).sort()
const verifyDeployment = await readFile(resolve(root, 'scripts/ops/verify-deployment.mjs'), 'utf8')
const failures = []

function assert(condition, message) { if (!condition) failures.push(message) }
function includesInOrder(source, labels, context) {
  let cursor = -1
  for (const label of labels) {
    const index = source.indexOf(label, cursor + 1)
    if (index < 0) { failures.push(`${context}: missing ${label}`); return }
    cursor = index
  }
}
async function missing(path) {
  try { await access(resolve(root, path)); return false } catch { return true }
}

let yamlParser = 'github-parser-only'
try {
  let yaml
  try { yaml = require('js-yaml') } catch { yaml = require('/usr/share/nodejs/js-yaml') }
  for (const [name, source] of Object.entries(workflows)) {
    const parsed = yaml.load(source)
    assert(parsed && typeof parsed === 'object', `${name}: YAML root must be an object`)
    assert(parsed?.jobs && typeof parsed.jobs === 'object', `${name}: jobs mapping is required`)
  }
  yamlParser = 'js-yaml'
} catch (error) {
  if (!/Cannot find module/u.test(String(error?.message || error))) failures.push(`YAML parse failed: ${error.message}`)
}

assert(workflowNames.join(',') === 'ci.yml,deploy-cloudflare-preview.yml,deploy-cloudflare-staging.yml,deploy-production.yml,deploy-staging.yml,onboard-workshop-skin-staging.yml,ops-pause-non-chu13-users.yml', 'workflows: expected workflow set is present')
for (const [name, source] of Object.entries(workflows)) {
  assert(!source.includes('\t'), `${name}: tabs are forbidden in YAML`)
  assert(/^name:\s+.+/mu.test(source), `${name}: name is required`)
  assert(/^on:/mu.test(source), `${name}: on trigger is required`)
  assert(/^jobs:/mu.test(source), `${name}: jobs are required`)
  assert(!/--force(?:-with-lease)?/u.test(source), `${name}: deployment workflows must never force-push`)
  assert(!/corepack enable\s*&&\s*corepack prepare/u.test(source), `${name}: dynamic corepack download must use network-guard`)
  if (/pnpm install/u.test(source)) assert(/network-guard\.mjs npm\/pnpm pnpm install --frozen-lockfile/u.test(source), `${name}: pnpm install must use network-guard`)
}
for (const sourceName of ['deploy-cloudflare-staging.yml', 'deploy-cloudflare-preview.yml', 'deploy-production.yml']) assert(!/(?:RAILWAY|R2_|EDGEONE_SITE_URL|MIGRATION_DATABASE_URL)/u.test(workflows[sourceName] || ''), `${sourceName}: legacy provider variables are forbidden`)
assert(/Retired legacy EdgeOne staging workflow/u.test(legacyStaging), 'legacy staging workflow must be inert and explicitly retired')
assert(/Retired workshop\.skin Staging onboarding/u.test(legacyDomain), 'legacy domain workflow must be inert and explicitly retired')

const actionReferences = Object.values(workflows).flatMap((source) => [...source.matchAll(/uses:\s+[^@\s]+@([^\s#]+)/gu)].map((match) => match[1]))
assert(actionReferences.length > 0 && actionReferences.every((reference) => /^[0-9a-f]{40}$/u.test(reference)), 'workflows: every external action must be pinned to a full commit SHA')
assert((ci.match(/pnpm --filter @bike-ops\/database migrate/gu) || []).length >= 2, 'ci: checksum migration runner must execute twice')
assert(/count\(\*\).*bike_ops_schema_migrations/u.test(ci), 'ci: migration history count must be verified')
assert(/= "8"/u.test(ci), 'ci: all eight PostgreSQL compatibility migrations must be recorded')
assert(/GITLEAKS_VERSION: 8\.30\.1/u.test(ci), 'ci: Gitleaks version must be pinned')
assert(/551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb/u.test(ci), 'ci: Gitleaks archive checksum must be pinned')
assert(/--log-opts="--all --full-history --no-merges"/u.test(ci), 'ci: Gitleaks must scan complete Git history')

assert(/^\s+workflow_dispatch:/mu.test(staging) && !/^\s+(?:push|pull_request):/mu.test(staging), 'cloudflare staging: deployment must be manual')
assert(/environment: staging/u.test(staging), 'cloudflare staging: GitHub Environment must be staging')
assert(/refs\/heads\/feature\/cloudflare-workers-d1/u.test(staging) && /refs\/heads\/develop/u.test(staging) && /refs\/heads\/main/u.test(staging), 'cloudflare staging: approved source branches are required')
for (const input of ['release_sha:', 'confirm_free_plan:', 'confirm_no_billing:', 'confirm_staging_only:']) assert(staging.includes(input), `cloudflare staging: missing ${input}`)
assert(/CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/u.test(staging), 'cloudflare staging: API token must come from the staging Environment')
assert(/STAGING_BASE_URL: \$\{\{ vars\.STAGING_BASE_URL \}\}/u.test(staging), 'cloudflare staging: site URL must come from the staging Environment')
assert(/database_id": "91e78387-9b24-4126-a5a1-27f9c1792975"/u.test(staging), 'cloudflare staging: D1 database must remain pinned')
assert(/wrangler@4\.112\.0/u.test(staging), 'cloudflare staging: Wrangler version must be pinned')
assert(/pnpm check:workflows && pnpm test && pnpm typecheck && pnpm build/u.test(staging), 'cloudflare staging: full validation is required')
assert(/wrangler d1 migrations apply bike-ops-staging --remote --config wrangler\.deploy\.jsonc/u.test(staging), 'cloudflare staging: D1 migrations must run before deployment')
includesInOrder(staging, ['Validate, test, typecheck, and build before Cloudflare deployment', 'Apply Staging D1 migrations', 'Deploy the Staging Worker with Static Assets and D1', 'Verify the deployed Staging API, release identity, and Web shell'], 'cloudflare staging')

assert(/^\s+workflow_dispatch:/mu.test(preview) && !/^\s+(?:push|pull_request):/mu.test(preview), 'cloudflare preview: deployment must be manual')
assert(/environment: preview/u.test(preview), 'cloudflare preview: GitHub Environment must be preview')
assert(/CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/u.test(preview), 'cloudflare preview: API token must come from the preview Environment')
assert(/database_id": "e40af8eb-6340-4b9e-8484-20247323fd84"/u.test(preview), 'cloudflare preview: D1 database must remain pinned')
assert(/"name": "bike-ops-preview"/u.test(preview), 'cloudflare preview: Worker name must remain pinned')
assert(/"SHIPHUB_ENABLED": "true"/u.test(preview), 'cloudflare preview: Shiphub must be enabled')
assert(/"SHIPHUB_MODE": "(fixture|live)"/u.test(preview), 'cloudflare preview: Shiphub mode must be fixture or live (live requires authorized secrets)')
assert(/wrangler@4\.112\.0/u.test(preview), 'cloudflare preview: Wrangler version must be pinned')

assert(/^\s+workflow_dispatch:/mu.test(production) && !/^\s+(?:push|pull_request):/mu.test(production), 'production: deployment must be manual')
assert(/environment: production/u.test(production), 'production: GitHub Environment must be production')
assert(/refs\/heads\/main/u.test(production), 'production: main branch gate is required')
for (const input of ['version:', 'release_sha:', 'staging_accepted_sha:', 'approve_production:', 'confirm_encrypted_backup:', 'confirm_restore_drill:', 'confirm_free_plan:', 'confirm_no_billing:', 'confirm_aggregated_preview_announcement:']) assert(production.includes(input), `production: missing ${input}`)
assert(/CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/u.test(production), 'production: API token must come from the production Environment')
assert(/STAGING_BASE_URL: \$\{\{ vars\.STAGING_BASE_URL \}\}/u.test(production), 'production: live Staging URL is required')
assert(/PRODUCTION_BASE_URL: \$\{\{ vars\.PRODUCTION_BASE_URL \}\}/u.test(production), 'production: site URL must come from the production Environment variable')
assert(/PRODUCTION_D1_DATABASE_ID: \$\{\{ vars\.PRODUCTION_D1_DATABASE_ID \}\}/u.test(production), 'production: D1 ID must come from the production Environment variable')
assert(/scripts-search\?name=bike-ops-production/u.test(production), 'production: Worker must be checked through the JSON search API')
assert(/ready\.gitSha !== process\.env\.STAGING_ACCEPTED_SHA/u.test(production), 'production: live Staging SHA (health/ready) must equal the accepted SHA')
assert(/meta\.environment !== 'staging'/u.test(production), 'production: live Staging environment must be checked')
assert(/wrangler d1 migrations apply bike-ops-production/u.test(production), 'production: D1 migrations must run before Worker deployment')
assert(/pnpm check:version -- --mode production/u.test(production), 'production: formal release version gate is required')
assert(/git merge-base --is-ancestor/u.test(production), 'production: accepted Staging ancestry must be checked')
assert(/git diff --quiet "\$STAGING_ACCEPTED_SHA" "\$RELEASE_SHA" -- \./u.test(production), 'production: accepted Staging source must match Production source')
assert(/wrangler@4\.112\.0/u.test(production), 'production: Wrangler version must be pinned')
includesInOrder(production, ['Validate, test, typecheck, and build before database mutation', 'Apply Production D1 migrations', 'Deploy the Production Worker with Static Assets and D1', 'Verify the deployed Production API, release identity, and Web shell'], 'production')

const latestMigration = migrationNames.at(-1)?.replace(/\.sql$/u, '') ?? ''
assert(latestMigration && schemaVersion.includes(latestMigration), 'schema version: latest D1 migration must be reflected in runtime metadata')
assert(latestMigration.startsWith('0021_'), 'schema version: latest committed D1 migration must be 0021 bi sku names')
for (const variable of ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'SUPABASE_STORAGE_BUCKET']) assert(envExample.includes(variable), `.env.example: missing ${variable}`)
assert(!/(?:CLOUDFLARE|RAILWAY|R2_)/u.test(envExample), '.env.example: retired provider variables are forbidden')
for (const path of ['.github/workflows/bootstrap-infrastructure.yml', 'railway.json', 'infra/docker/api.Dockerfile', 'scripts/ops/cloudflare.mjs', 'scripts/ops/railway.mjs', 'scripts/ops/supabase.mjs', 'scripts/ops/index.mjs', 'scripts/prepare-pages-headers.mjs']) assert(await missing(path), `cleanup: retired file must be deleted: ${path}`)
assert(/health\/ready/u.test(verifyDeployment) && /api\/v1\/meta\/version/u.test(verifyDeployment), 'verification: readiness and release identity must be checked')

if (failures.length) {
  console.error(JSON.stringify({ ok: false, yamlParser, failures }, null, 2))
  process.exit(1)
}
console.log(JSON.stringify({ ok: true, yamlParser, workflows: workflowNames, policies: 100 }, null, 2))
