#!/usr/bin/env node
import { createRequire } from 'node:module'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const root = process.cwd()
const workflowDirectory = resolve(root, '.github/workflows')
const workflowNames = (await readdir(workflowDirectory)).filter((name) => /\.ya?ml$/u.test(name)).sort()
const workflows = Object.fromEntries(await Promise.all(workflowNames.map(async (name) => [name, await readFile(resolve(workflowDirectory, name), 'utf8')])))
const opsIndex = await readFile(resolve(root, 'scripts/ops/index.mjs'), 'utf8')
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
    if (index <= cursor) {
      failures.push(`${context}: ${label} is out of order`)
      return
    }
    cursor = index
  }
}

function functionBody(source, name) {
  const start = source.indexOf(`async function ${name}(`)
  if (start < 0) return ''
  const next = source.indexOf('\nasync function ', start + 1)
  return source.slice(start, next < 0 ? source.length : next)
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

for (const [name, source] of Object.entries(workflows)) {
  assert(!source.includes('\t'), `${name}: tabs are forbidden in YAML`)
  assert(/^name:\s+.+/mu.test(source), `${name}: name is required`)
  assert(/^on:/mu.test(source), `${name}: on trigger is required`)
  assert(/^jobs:/mu.test(source), `${name}: jobs are required`)
  assert(!/CLOUDFLARE_TOKEN_FACTORY_TOKEN/u.test(source), `${name}: invalid Cloudflare token-factory secret is forbidden`)
  assert(!/corepack enable\s*&&\s*corepack prepare/u.test(source), `${name}: dynamic corepack download must use network-guard`)
  if (/pnpm install/u.test(source)) assert(/network-guard\.mjs npm\/pnpm pnpm install --frozen-lockfile/u.test(source), `${name}: pnpm install must use network-guard`)
}

const actionReferences = Object.values(workflows).flatMap((source) => [...source.matchAll(/uses:\s+[^@\s]+@([^\s#]+)/gu)].map((match) => match[1]))
assert(actionReferences.length > 0 && actionReferences.every((reference) => /^[0-9a-f]{40}$/u.test(reference)), 'workflows: every external action must be pinned to a full commit SHA')

const bootstrap = workflows['bootstrap-infrastructure.yml'] || ''
assert(/environment: \$\{\{ inputs\.environment \}\}/u.test(bootstrap), 'bootstrap: selected GitHub Environment is required')
assert(/confirm_staging_acceptance:/u.test(bootstrap), 'bootstrap: production requires an explicit staging acceptance input')
assert(/staging_accepted_sha:/u.test(bootstrap), 'bootstrap: production requires the accepted staging SHA')
assert(/git diff --quiet "\$STAGING_ACCEPTED_SHA" HEAD/u.test(bootstrap), 'bootstrap: production source must match accepted staging source')
assert(/refs\/heads\/main/u.test(bootstrap) && /refs\/heads\/develop/u.test(bootstrap), 'bootstrap: environment branch gates are required')
assert(/Map only the selected environment secrets/u.test(bootstrap), 'bootstrap: selected-environment secret mapping step is required')
assert(/SUPABASE_DB_PASSWORD_\$\{suffix\}/u.test(bootstrap), 'bootstrap: dynamic environment suffix mapping is required')
assert(!/SUPABASE_DB_PASSWORD_STAGING:\s*\$\{\{ secrets\.SUPABASE_DB_PASSWORD \}\}/u.test(bootstrap), 'bootstrap: staging secret must not be mapped globally')
assert(!/SUPABASE_DB_PASSWORD_PRODUCTION:\s*\$\{\{ secrets\.SUPABASE_DB_PASSWORD \}\}/u.test(bootstrap), 'bootstrap: production secret must not be mapped globally')
assert(/gh pr create/u.test(bootstrap), 'bootstrap: resource state must be proposed through a pull request')
assert(!/git push origin "HEAD:\$\{?target_branch/u.test(bootstrap), 'bootstrap: direct push to protected environment branches is forbidden')
includesInOrder(bootstrap, ['Test, typecheck, and build before cloud mutation', 'Show infrastructure plan', 'Validate credentials and runtime', 'Apply infrastructure', 'Open pull request for non-sensitive resource state'], 'bootstrap')

const ci = workflows['ci.yml'] || ''
assert((ci.match(/pnpm --filter @bike-ops\/database migrate/gu) || []).length >= 2, 'ci: checksum migration runner must execute twice')
assert(/bike_ops_schema_migrations/u.test(ci), 'ci: migration history count must be verified')
assert(/GITLEAKS_VERSION: 8\.30\.1/u.test(ci), 'ci: Gitleaks version must be pinned')
assert(/551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb/u.test(ci), 'ci: Gitleaks linux_x64 archive checksum must be pinned')
assert(/--log-opts="--all --full-history --no-merges"/u.test(ci), 'ci: Gitleaks must scan the complete Git history')
assert(/persist-credentials: false/u.test(ci), 'ci: secret scan checkout must not persist GitHub credentials')

const staging = workflows['deploy-staging.yml'] || ''
assert(/branches: \[develop\]/u.test(staging), 'staging: push trigger must be develop')
assert(/environment: staging/u.test(staging), 'staging: GitHub Environment must be staging')
assert(/pnpm ops preflight staging --release/u.test(staging), 'staging: release preflight is required')
assert(/release-state-staging/u.test(staging), 'staging: release state artifact is required')
includesInOrder(staging, ['Test, typecheck, and build', 'Preflight release credentials', 'Release in safe order', 'Verify deployed API and web'], 'staging')

const production = workflows['deploy-production.yml'] || ''
for (const input of ['release_sha:', 'staging_accepted_sha:', 'approve_production:', 'confirm_backup:']) {
  assert(production.includes(input), `production: missing ${input} input`)
}
assert(!/^\s+push:/mu.test(production), 'production: automatic push deployment is forbidden')
assert(/environment: production/u.test(production), 'production: GitHub Environment must be production')
assert(/refs\/heads\/main/u.test(production), 'production: main branch gate is required')
assert(/git diff --quiet "\$STAGING_ACCEPTED_SHA" "\$actual_sha"/u.test(production), 'production: accepted staging source comparison is required')
assert(/git rev-parse origin\/main/u.test(production), 'production: release SHA must match the current remote main HEAD')
assert(/release-state-production/u.test(production), 'production: release state artifact is required')
assert(/pnpm ops release production --approve-production --confirm-backup/u.test(production), 'production: CLI approval and backup flags are required')
includesInOrder(production, ['Verify immutable release identity', 'Test, typecheck, and build', 'Preflight release credentials', 'Release in safe order', 'Verify deployed API and web'], 'production')

for (const functionName of ['apply', 'release']) {
  const body = functionBody(opsIndex, functionName)
  assert(body, `ops: ${functionName} function is required`)
  includesInOrder(body, ['migrateDatabase(', 'deployRailway(', 'verifyApi(', 'deployPages('], `ops ${functionName}`)
}
assert(/requireProductionApproval\(target, \{ backupRequired: true \}\)/u.test(functionBody(opsIndex, 'release')), 'ops release: production backup confirmation is required')

if (failures.length) {
  console.error(JSON.stringify({ ok: false, yamlParser, failures }, null, 2))
  process.exit(1)
}

console.log(JSON.stringify({ ok: true, yamlParser, workflows: workflowNames, policies: 39 }, null, 2))
