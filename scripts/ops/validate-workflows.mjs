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
const staging = workflows['deploy-staging.yml'] || ''
const production = workflows['deploy-production.yml'] || ''
const cloudflareStaging = workflows['deploy-cloudflare-staging.yml'] || ''
const cloudflarePreview = workflows['deploy-cloudflare-preview.yml'] || ''
const promoteBranch = await readFile(resolve(root, 'scripts/ops/promote-branch.mjs'), 'utf8')
const verifyDeployment = await readFile(resolve(root, 'scripts/ops/verify-deployment.mjs'), 'utf8')
const edgeOneConfig = JSON.parse(await readFile(resolve(root, 'edgeone.json'), 'utf8'))
const envExample = await readFile(resolve(root, '.env.example'), 'utf8')
const migrationRunner = await readFile(resolve(root, 'packages/database/scripts/migrate.mjs'), 'utf8')
const failures = []

function assert(condition, message) {
  if (!condition) failures.push(message)
}

function includesInOrder(source, labels, context) {
  let cursor = -1
  for (const label of labels) {
    const index = source.indexOf(label, cursor + 1)
    if (index < 0) {
      failures.push(`${context}: missing ${label}`)
      return
    }
    cursor = index
  }
}

async function missing(path) {
  try {
    await access(resolve(root, path))
    return false
  } catch {
    return true
  }
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

assert(workflowNames.join(',') === 'ci.yml,deploy-cloudflare-preview.yml,deploy-cloudflare-staging.yml,deploy-production.yml,deploy-staging.yml', 'workflows: only CI, the legacy release workflows, Cloudflare Preview, and Cloudflare Staging may remain')
for (const [name, source] of Object.entries(workflows)) {
  assert(!source.includes('\t'), `${name}: tabs are forbidden in YAML`)
  assert(/^name:\s+.+/mu.test(source), `${name}: name is required`)
  assert(/^on:/mu.test(source), `${name}: on trigger is required`)
  assert(/^jobs:/mu.test(source), `${name}: jobs are required`)
  if (name === 'deploy-cloudflare-staging.yml' || name === 'deploy-cloudflare-preview.yml') {
    assert(!/(?:RAILWAY|R2_)/u.test(source), `${name}: Railway and R2 variables are forbidden`)
  } else {
    assert(!/(?:CLOUDFLARE|RAILWAY|R2_)/u.test(source), `${name}: retired provider variables are forbidden`)
  }
  assert(!/--force(?:-with-lease)?/u.test(source), `${name}: deployment workflows must never force-push`)
  assert(!/corepack enable\s*&&\s*corepack prepare/u.test(source), `${name}: dynamic corepack download must use network-guard`)
  if (/pnpm install/u.test(source)) assert(/network-guard\.mjs npm\/pnpm pnpm install --frozen-lockfile/u.test(source), `${name}: pnpm install must use network-guard`)
}

const actionReferences = Object.values(workflows).flatMap((source) => [...source.matchAll(/uses:\s+[^@\s]+@([^\s#]+)/gu)].map((match) => match[1]))
assert(actionReferences.length > 0 && actionReferences.every((reference) => /^[0-9a-f]{40}$/u.test(reference)), 'workflows: every external action must be pinned to a full commit SHA')

assert((ci.match(/pnpm --filter @bike-ops\/database migrate/gu) || []).length >= 2, 'ci: checksum migration runner must execute twice')
assert(/count\(\*\).*bike_ops_schema_migrations/u.test(ci), 'ci: migration history count must be verified')
assert(/= "4"/u.test(ci), 'ci: all committed migrations must be recorded')
assert(/GITLEAKS_VERSION: 8\.30\.1/u.test(ci), 'ci: Gitleaks version must be pinned')
assert(/551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb/u.test(ci), 'ci: Gitleaks archive checksum must be pinned')
assert(/--log-opts="--all --full-history --no-merges"/u.test(ci), 'ci: Gitleaks must scan complete Git history')
assert(/persist-credentials: false/u.test(ci), 'ci: secret scan checkout must not persist GitHub credentials')


assert(/^\s+workflow_dispatch:/mu.test(cloudflareStaging) && !/^\s+(?:push|pull_request):/mu.test(cloudflareStaging), 'cloudflare staging: deployment must be manual')
assert(/environment: staging/u.test(cloudflareStaging), 'cloudflare staging: GitHub Environment must be staging')
assert(/refs\/heads\/feature\/cloudflare-workers-d1/u.test(cloudflareStaging) && /refs\/heads\/develop/u.test(cloudflareStaging), 'cloudflare staging: only the migration feature branch or develop may run')
for (const input of ['release_sha:', 'confirm_free_plan:', 'confirm_no_billing:', 'confirm_staging_only:']) assert(cloudflareStaging.includes(input), `cloudflare staging: missing ${input}`)
assert(/CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/u.test(cloudflareStaging), 'cloudflare staging: API token must come from the staging Environment')
assert(/CLOUDFLARE_ACCOUNT_ID: \$\{\{ vars\.CLOUDFLARE_ACCOUNT_ID \}\}/u.test(cloudflareStaging), 'cloudflare staging: account ID must come from the staging Environment variable')
assert(/STAGING_BASE_URL: \$\{\{ vars\.STAGING_BASE_URL \}\}/u.test(cloudflareStaging), 'cloudflare staging: site URL must come from the staging Environment variable')
assert(/STAGING_BASE_URL/u.test(cloudflareStaging) && /CORS_ALLOWED_ORIGINS/u.test(cloudflareStaging), 'cloudflare staging: deploy config must use STAGING_BASE_URL for CORS and verification')
assert(/'https:\/\/workshop\.skin'/u.test(cloudflareStaging) && /'https:\/\/www\.workshop\.skin'/u.test(cloudflareStaging), 'cloudflare staging: exact apex and www production origins must be allowed')
assert(/\^\[0-9a-f\]\{40\}\$/u.test(cloudflareStaging), 'cloudflare staging: release SHA must be a full lowercase commit SHA')
assert(/git rev-parse "origin\/\$BRANCH"/u.test(cloudflareStaging), 'cloudflare staging: release SHA must equal the selected remote branch head')
assert(/database_id": "91e78387-9b24-4126-a5a1-27f9c1792975"/u.test(cloudflareStaging), 'cloudflare staging: the Staging D1 database must remain pinned')
assert(/directory": "apps\/web\/dist"/u.test(cloudflareStaging) && /run_worker_first/u.test(cloudflareStaging), 'cloudflare staging: Static Assets and API-first routing are required')
assert(/wrangler@4\.112\.0/u.test(cloudflareStaging), 'cloudflare staging: Wrangler version must be pinned')
assert(/network-guard\.mjs npm\/pnpm npm install --global wrangler@4\.112\.0/u.test(cloudflareStaging), 'cloudflare staging: Wrangler install must use network-guard')
assert(/pnpm check:workflows && pnpm test && pnpm typecheck && pnpm build/u.test(cloudflareStaging), 'cloudflare staging: full validation is required before deployment')
assert(/pnpm build:worker-bundle/u.test(cloudflareStaging) && /dist\/worker\/index\.min\.js/u.test(cloudflareStaging), 'cloudflare staging: minified Worker must be generated from validated source')
assert(/wrangler d1 migrations apply bike-ops-staging --remote --config wrangler\.deploy\.jsonc/u.test(cloudflareStaging), 'cloudflare staging: D1 migrations must run before deployment')
assert(!/environment: production|bike-ops-production|R2_/u.test(cloudflareStaging), 'cloudflare staging: Production and R2 are forbidden')
includesInOrder(cloudflareStaging, [
  'Validate, test, typecheck, and build before Cloudflare deployment',
  'Generate minified Worker bundle from the validated source',
  'Apply Staging D1 migrations',
  'Deploy the Staging Worker with Static Assets and D1',
  'Verify the deployed Staging API, release identity, and Web shell'
], 'cloudflare staging')


assert(/^\s+workflow_dispatch:/mu.test(cloudflarePreview) && !/^\s+(?:push|pull_request):/mu.test(cloudflarePreview), 'cloudflare preview: deployment must be manual')
assert(/environment: preview/u.test(cloudflarePreview), 'cloudflare preview: GitHub Environment must be preview')
assert(/refs\/heads\/feature\/cloudflare-workers-d1/u.test(cloudflarePreview) && /refs\/heads\/develop/u.test(cloudflarePreview), 'cloudflare preview: only the migration feature branch or develop may run')
for (const input of ['release_sha:', 'confirm_free_plan:', 'confirm_no_billing:', 'confirm_preview_only:']) assert(cloudflarePreview.includes(input), `cloudflare preview: missing ${input}`)
assert(/CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/u.test(cloudflarePreview), 'cloudflare preview: API token must come from the preview Environment')
assert(/CLOUDFLARE_ACCOUNT_ID: \$\{\{ vars\.CLOUDFLARE_ACCOUNT_ID \}\}/u.test(cloudflarePreview), 'cloudflare preview: account ID must come from the preview Environment variable')
assert(/PREVIEW_BASE_URL: \$\{\{ vars\.PREVIEW_BASE_URL \}\}/u.test(cloudflarePreview), 'cloudflare preview: site URL must come from the preview Environment variable')
assert(/database_id": "e40af8eb-6340-4b9e-8484-20247323fd84"/u.test(cloudflarePreview), 'cloudflare preview: the Preview D1 database must remain pinned')
assert(/"name": "bike-ops-preview"/u.test(cloudflarePreview), 'cloudflare preview: Worker name must remain bike-ops-preview')
assert(/wrangler@4\.112\.0/u.test(cloudflarePreview), 'cloudflare preview: Wrangler version must be pinned')
assert(/pnpm check:workflows && pnpm test && pnpm typecheck && pnpm build/u.test(cloudflarePreview), 'cloudflare preview: full validation is required before deployment')
assert(!/environment: production|bike-ops-production|bike-ops-staging|R2_/u.test(cloudflarePreview), 'cloudflare preview: Production, Staging Worker, and R2 are forbidden')
includesInOrder(cloudflarePreview, [
  'Validate, test, typecheck, and build before Cloudflare Preview deployment',
  'Generate minified Worker bundle from the validated source',
  'Deploy the Preview Worker with Static Assets and D1',
  'Verify the deployed Preview API, release identity, and Web shell'
], 'cloudflare preview')

assert(/^\s+workflow_dispatch:/mu.test(staging) && !/^\s+(?:push|pull_request):/mu.test(staging), 'staging: deployment must be manual, never every develop push')
assert(/environment: staging/u.test(staging), 'staging: GitHub Environment must be staging')
assert(/refs\/heads\/develop/u.test(staging), 'staging: develop branch gate is required')
for (const input of ['release_sha:', 'confirm_free_plan:', 'confirm_no_billing:', 'confirm_staging_only:', 'database_only_bootstrap:']) assert(staging.includes(input), `staging: missing ${input}`)
assert(/MIGRATION_DATABASE_URL: \$\{\{ secrets\.MIGRATION_DATABASE_URL \}\}/u.test(staging), 'staging: migration URL must come from the selected GitHub Environment')
assert(/EDGEONE_SITE_URL: \$\{\{ vars\.EDGEONE_SITE_URL \}\}/u.test(staging), 'staging: non-sensitive EdgeOne site URL must be an Environment variable')
assert(/git rev-parse origin\/develop/u.test(staging), 'staging: release SHA must equal current remote develop')
assert(/edgeone-staging/u.test(staging), 'staging: dedicated EdgeOne deployment branch is required')
includesInOrder(staging, [
  'Validate, test, typecheck, and build before database mutation',
  'Apply checksum-locked Supabase migrations',
  'Fast-forward the EdgeOne Staging deployment branch',
  'Verify the deployed SHA, environment, API, database, and Web'
], 'staging')

assert(/^\s+workflow_dispatch:/mu.test(production) && !/^\s+(?:push|pull_request):/mu.test(production), 'production: deployment must be manual')
assert(/environment: production/u.test(production), 'production: GitHub Environment must be production')
assert(/refs\/heads\/main/u.test(production), 'production: main branch gate is required')
for (const input of ['version:', 'release_sha:', 'staging_accepted_sha:', 'approve_production:', 'confirm_encrypted_backup:', 'confirm_restore_drill:', 'confirm_free_plan:', 'confirm_no_billing:', 'database_only_bootstrap:', 'confirm_aggregated_preview_announcement:']) assert(production.includes(input), `production: missing ${input}`)
assert(/confirm_aggregated_preview_announcement=true/u.test(production), 'production: aggregated Preview announcement confirmation is required')
assert(/pnpm check:version -- --mode production/u.test(production), 'production: formal Preview-cycle announcement and public version validation is required before mutation')
assert(/git rev-parse origin\/edgeone-staging/u.test(production), 'production: accepted SHA must equal the current EdgeOne Staging branch')
assert(/git merge-base --is-ancestor/u.test(production), 'production: accepted Staging SHA must be an ancestor')
assert(/git diff --quiet "\$STAGING_ACCEPTED_SHA" "\$EXPECTED_SHA" -- \./u.test(production), 'production: source tree must exactly match accepted Staging')
assert(/edgeone-production/u.test(production), 'production: dedicated EdgeOne deployment branch is required')
includesInOrder(production, [
  'Validate, test, typecheck, and build before database mutation',
  'Apply checksum-locked Supabase migrations',
  'Fast-forward the EdgeOne Production deployment branch',
  'Verify the deployed SHA, environment, API, database, and Web'
], 'production')

assert(edgeOneConfig.installCommand === 'corepack pnpm@9.15.9 install --frozen-lockfile', 'edgeone.json: install command must remain frozen and pinned without global shim writes')
assert(edgeOneConfig.buildCommand === 'corepack pnpm@9.15.9 build:edgeone', 'edgeone.json: build command must remain pinned and must not mutate Supabase')
assert(edgeOneConfig.outputDirectory === 'apps/web/dist', 'edgeone.json: output directory must remain apps/web/dist')
assert(edgeOneConfig.nodeVersion === '22.11.0', 'edgeone.json: Node version must remain pinned')

assert(/\['edgeone-staging', 'edgeone-production'\]/u.test(promoteBranch), 'promotion: only dedicated deployment branches are allowed')
assert(/git\(\['ls-remote'/u.test(promoteBranch), 'promotion: remote deployment branch must be read before push')
assert(/merge-base.*--is-ancestor/u.test(promoteBranch), 'promotion: non-fast-forward changes must be rejected')
assert(/git\(\['push', 'origin'/u.test(promoteBranch), 'promotion: ordinary git push is required')
assert(!/--force/u.test(promoteBranch), 'promotion: force push is forbidden')
assert(/health\/ready/u.test(verifyDeployment) && /api\/v1\/meta\/version/u.test(verifyDeployment), 'verification: API readiness and immutable release identity must be checked')
assert(/expectedSha/u.test(verifyDeployment) && /expectedEnvironment/u.test(verifyDeployment), 'verification: deployed SHA and environment must be checked')

assert(/MIGRATION_DATABASE_URL/u.test(migrationRunner) && !/DIRECT_DATABASE_URL/u.test(migrationRunner), 'migration runner: explicit migration-only URL is required')
assert(/pg_advisory_lock/u.test(migrationRunner) && /MIGRATION_CHECKSUM_MISMATCH/u.test(migrationRunner), 'migration runner: lock and checksum protection are required')
for (const variable of ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'SUPABASE_STORAGE_BUCKET']) assert(envExample.includes(variable), `.env.example: missing ${variable}`)
assert(!/(?:CLOUDFLARE|RAILWAY|R2_)/u.test(envExample), '.env.example: retired provider variables are forbidden')

for (const path of [
  '.github/workflows/bootstrap-infrastructure.yml',
  'railway.json',
  'infra/docker/api.Dockerfile',
  'scripts/ops/cloudflare.mjs',
  'scripts/ops/railway.mjs',
  'scripts/ops/supabase.mjs',
  'scripts/ops/index.mjs',
  'scripts/prepare-pages-headers.mjs'
]) assert(await missing(path), `cleanup: retired file must be deleted: ${path}`)

if (failures.length) {
  console.error(JSON.stringify({ ok: false, yamlParser, failures }, null, 2))
  process.exit(1)
}

console.log(JSON.stringify({ ok: true, yamlParser, workflows: workflowNames, policies: 88 }, null, 2))
