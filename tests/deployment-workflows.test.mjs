import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { access, readFile } from 'node:fs/promises'

const workflowDirectory = '.github/workflows'
async function workflow(name) { return readFile(`${workflowDirectory}/${name}`, 'utf8') }
async function exists(path) { try { await access(path); return true } catch { return false } }

test('Cloudflare 统一发布策略验证器通过', () => {
  const result = spawnSync(process.execPath, ['scripts/ops/validate-workflows.mjs'], { cwd: process.cwd(), encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.match(result.stdout, /"ok": true/u)
  assert.match(result.stdout, /"policies": 100/u)
})

test('Cloudflare Staging 仅手动部署固定 SHA 到 Worker、Static Assets 和 D1', async () => {
  const source = await workflow('deploy-cloudflare-staging.yml')
  assert.match(source, /^\s+workflow_dispatch:/mu)
  assert.doesNotMatch(source, /^\s+(?:push|pull_request):/mu)
  for (const branch of ['feature/cloudflare-workers-d1', 'develop', 'main']) assert.ok(source.includes(`refs/heads/${branch}`))
  assert.match(source, /environment: staging/u)
  assert.match(source, /database_id": "91e78387-9b24-4126-a5a1-27f9c1792975"/u)
  assert.match(source, /wrangler d1 migrations apply bike-ops-staging --remote/u)
  assert.match(source, /grep -Fq .*environment.*staging/u)
})

test('Cloudflare Preview 使用独立 Worker 和 D1', async () => {
  const source = await workflow('deploy-cloudflare-preview.yml')
  assert.match(source, /environment: preview/u)
  assert.match(source, /database_id": "e40af8eb-6340-4b9e-8484-20247323fd84"/u)
  assert.match(source, /"name": "bike-ops-preview"/u)
})

test('旧 EdgeOne 和域名接入工作流只保留失败即停的审计标记', async () => {
  const staging = await workflow('deploy-staging.yml')
  const domain = await workflow('onboard-workshop-skin-staging.yml')
  assert.match(staging, /Retired legacy EdgeOne staging workflow/u)
  assert.match(domain, /Retired workshop\.skin Staging onboarding/u)
  assert.match(staging, /exit 1/u)
  assert.match(domain, /exit 1/u)
  assert.doesNotMatch(staging, /MIGRATION_DATABASE_URL|EDGEONE_SITE_URL|edgeone-staging/u)
  assert.doesNotMatch(domain, /CLOUDFLARE_API_TOKEN|workers\/domains/u)
})

test('Production 验证线上 Staging 身份后才允许迁移和部署', async () => {
  const source = await workflow('deploy-production.yml')
  assert.match(source, /environment: production/u)
  assert.match(source, /STAGING_BASE_URL: \$\{\{ vars\.STAGING_BASE_URL \}\}/u)
  assert.match(source, /meta\.gitSha !== process\.env\.STAGING_ACCEPTED_SHA/u)
  assert.match(source, /meta\.environment !== 'staging'/u)
  assert.match(source, /scripts-search\?name=bike-ops-production/u)
  assert.match(source, /PRODUCTION_D1_DATABASE_ID: \$\{\{ vars\.PRODUCTION_D1_DATABASE_ID \}\}/u)
  assert.match(source, /wrangler d1 migrations apply bike-ops-production/u)
  assert.match(source, /pnpm check:version -- --mode production/u)
  assert.match(source, /grep -Fq .*environment.*production/u)
  assert.doesNotMatch(source, /--force/u)
})

test('发布顺序固定为全量验证、数据库迁移、Worker 部署、线上验收', async () => {
  const source = await workflow('deploy-production.yml')
  const labels = ['Validate, test, typecheck, and build before database mutation', 'Apply Production D1 migrations', 'Deploy the Production Worker with Static Assets and D1', 'Verify the deployed Production API, release identity, and Web shell']
  let cursor = -1
  for (const label of labels) {
    const index = source.indexOf(label, cursor + 1)
    assert.ok(index > cursor, `${label} must be present in safe order`)
    cursor = index
  }
})

test('D1 schema identity is tied to the latest committed migration', async () => {
  const source = await readFile('apps/worker/src/schema-version.ts', 'utf8')
  assert.match(source, /SCHEMA_VERSION = '0012_flat_store_self_registration'/u)
})

test('旧基础设施文件仍被删除', async () => {
  for (const path of ['.github/workflows/bootstrap-infrastructure.yml', 'railway.json', 'infra/docker/api.Dockerfile', 'scripts/ops/cloudflare.mjs', 'scripts/ops/railway.mjs', 'scripts/ops/supabase.mjs', 'scripts/ops/index.mjs', 'scripts/prepare-pages-headers.mjs']) assert.equal(await exists(path), false, `${path} must be deleted`)
})
