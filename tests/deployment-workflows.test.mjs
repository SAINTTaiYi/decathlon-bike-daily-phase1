import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { access, readFile } from 'node:fs/promises'

const workflowDirectory = '.github/workflows'

async function workflow(name) {
  return readFile(`${workflowDirectory}/${name}`, 'utf8')
}

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

test('免费栈 Workflow 静态策略验证器通过', () => {
  const result = spawnSync(process.execPath, ['scripts/ops/validate-workflows.mjs'], { cwd: process.cwd(), encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.match(result.stdout, /"ok": true/u)
  assert.match(result.stdout, /"policies": (?:7[6-9]|8[0-9]|9[0-9])/u)
})



test('Cloudflare Staging 仅手动部署固定 SHA 到 Worker Static Assets 和 D1', async () => {
  const source = await workflow('deploy-cloudflare-staging.yml')
  assert.match(source, /^\s+workflow_dispatch:/mu)
  assert.doesNotMatch(source, /^\s+(?:push|pull_request):/mu)
  assert.match(source, /environment: staging/u)
  for (const input of ['release_sha:', 'confirm_free_plan:', 'confirm_no_billing:', 'confirm_staging_only:']) assert.match(source, new RegExp(input, 'u'))
  assert.match(source, /refs\/heads\/feature\/cloudflare-workers-d1/u)
  assert.match(source, /refs\/heads\/develop/u)
  assert.match(source, /git rev-parse "origin\/\$BRANCH"/u)
  assert.match(source, /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/u)
  assert.match(source, /CLOUDFLARE_ACCOUNT_ID: \$\{\{ vars\.CLOUDFLARE_ACCOUNT_ID \}\}/u)
  assert.match(source, /STAGING_BASE_URL: \$\{\{ vars\.STAGING_BASE_URL \}\}/u)
  assert.match(source, /STAGING_BASE_URL/u)

  assert.match(source, /database_id": "91e78387-9b24-4126-a5a1-27f9c1792975"/u)
  assert.match(source, /directory": "apps\/web\/dist"/u)
  assert.match(source, /run_worker_first/u)
  assert.match(source, /wrangler@4\.112\.0/u)
  assert.match(source, /pnpm check:workflows && pnpm test && pnpm typecheck && pnpm build/u)
  assert.match(source, /pnpm build:worker-bundle/u)
  assert.match(source, /dist\/worker\/index\.min\.js/u)
  assert.match(source, /wrangler d1 migrations apply bike-ops-staging --remote --config wrangler\.deploy\.jsonc/u)
  assert.doesNotMatch(source, /environment: production|bike-ops-production|R2_/u)
})

test('Cloudflare Preview 仅手动部署固定 SHA 到独立 Preview Worker 和 D1', async () => {
  const source = await workflow('deploy-cloudflare-preview.yml')
  assert.match(source, /^\s+workflow_dispatch:/mu)
  assert.doesNotMatch(source, /^\s+(?:push|pull_request):/mu)
  assert.match(source, /environment: preview/u)
  for (const input of ['release_sha:', 'confirm_free_plan:', 'confirm_no_billing:', 'confirm_preview_only:']) assert.match(source, new RegExp(input, 'u'))
  assert.match(source, /refs\/heads\/feature\/cloudflare-workers-d1/u)
  assert.match(source, /refs\/heads\/develop/u)
  assert.match(source, /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/u)
  assert.match(source, /PREVIEW_BASE_URL: \$\{\{ vars\.PREVIEW_BASE_URL \}\}/u)
  assert.match(source, /database_id": "e40af8eb-6340-4b9e-8484-20247323fd84"/u)
  assert.match(source, /"name": "bike-ops-preview"/u)
  assert.match(source, /wrangler@4\.112\.0/u)
  assert.doesNotMatch(source, /environment: production|bike-ops-production|bike-ops-staging|R2_/u)
})

test('Staging 只允许手动从 develop 迁移后快进 EdgeOne 部署分支', async () => {
  const source = await workflow('deploy-staging.yml')
  assert.match(source, /^\s+workflow_dispatch:/mu)
  assert.doesNotMatch(source, /^\s+(?:push|pull_request):/mu)
  assert.match(source, /refs\/heads\/develop/u)
  assert.match(source, /confirm_free_plan:/u)
  assert.match(source, /confirm_no_billing:/u)
  assert.match(source, /confirm_staging_only:/u)
  assert.match(source, /database_only_bootstrap:/u)
  assert.match(source, /MIGRATION_DATABASE_URL: \$\{\{ secrets\.MIGRATION_DATABASE_URL \}\}/u)
  assert.match(source, /Apply checksum-locked Supabase migrations/u)
  assert.match(source, /edgeone-staging/u)
  assert.doesNotMatch(source, /--force/u)
})

test('Production 仅手动触发并要求已验收 Staging、加密备份、恢复演练和免费计划确认', async () => {
  const source = await workflow('deploy-production.yml')
  assert.match(source, /^\s+workflow_dispatch:/mu)
  assert.doesNotMatch(source, /^\s+(?:push|pull_request):/mu)
  assert.match(source, /refs\/heads\/main/u)
  for (const input of ['staging_accepted_sha:', 'approve_production:', 'confirm_encrypted_backup:', 'confirm_restore_drill:', 'confirm_free_plan:', 'confirm_no_billing:', 'database_only_bootstrap:']) {
    assert.match(source, new RegExp(input, 'u'))
  }
  assert.match(source, /git rev-parse origin\/edgeone-staging/u)
  assert.match(source, /git diff --quiet "\$STAGING_ACCEPTED_SHA" "\$EXPECTED_SHA" -- \./u)
  assert.match(source, /edgeone-production/u)
  assert.doesNotMatch(source, /--force/u)
})

test('发布顺序固定为全量验证、数据库迁移、普通快进 push、部署验收', async () => {
  for (const name of ['deploy-staging.yml', 'deploy-production.yml']) {
    const source = await workflow(name)
    const labels = [
      'Validate, test, typecheck, and build before database mutation',
      'Apply checksum-locked Supabase migrations',
      'Fast-forward the EdgeOne',
      'Verify the deployed SHA, environment, API, database, and Web'
    ]
    let cursor = -1
    for (const label of labels) {
      const index = source.indexOf(label, cursor + 1)
      assert.ok(index > cursor, `${name}: ${label} must be present in safe order`)
      cursor = index
    }
  }
})

test('EdgeOne 配置只负责冻结安装和构建，不在构建期间修改数据库', async () => {
  const config = JSON.parse(await readFile('edgeone.json', 'utf8'))
  assert.equal(config.installCommand, 'corepack pnpm@9.15.9 install --frozen-lockfile')
  assert.equal(config.buildCommand, 'corepack pnpm@9.15.9 build:edgeone')
  assert.equal(config.outputDirectory, 'apps/web/dist')
  assert.equal(config.nodeVersion, '22.11.0')
  assert.doesNotMatch(config.buildCommand, /migrate|supabase|database/u)
})

test('旧 Railway、Cloudflare Pages/R2 bootstrap 与容器发布文件已删除', async () => {
  for (const path of [
    '.github/workflows/bootstrap-infrastructure.yml',
    'railway.json',
    'infra/docker/api.Dockerfile',
    'scripts/ops/cloudflare.mjs',
    'scripts/ops/railway.mjs',
    'scripts/ops/supabase.mjs',
    'scripts/ops/index.mjs',
    'scripts/prepare-pages-headers.mjs'
  ]) assert.equal(await exists(path), false, `${path} must be deleted`)
})

test('部署分支提升脚本仅允许专用分支、拒绝非快进且禁止 force push', async () => {
  const source = await readFile('scripts/ops/promote-branch.mjs', 'utf8')
  assert.match(source, /\['edgeone-staging', 'edgeone-production'\]/u)
  assert.match(source, /ls-remote/u)
  assert.match(source, /merge-base.*--is-ancestor/u)
  assert.match(source, /NON_FAST_FORWARD_DEPLOYMENT_FORBIDDEN/u)
  assert.doesNotMatch(source, /--force/u)

  const invalid = spawnSync(process.execPath, ['scripts/ops/promote-branch.mjs', 'bad-sha', 'edgeone-staging'], { cwd: process.cwd(), encoding: 'utf8' })
  assert.notEqual(invalid.status, 0)
  assert.match(invalid.stderr, /INVALID_SOURCE_SHA/u)
})

test('部署验收同时核对 HTTPS Web、数据库 readiness、版本、SHA 和环境', async () => {
  const source = await readFile('scripts/ops/verify-deployment.mjs', 'utf8')
  assert.match(source, /health\/ready/u)
  assert.match(source, /api\/v1\/meta\/version/u)
  assert.match(source, /health\?\.gitSha !== expectedSha/u)
  assert.match(source, /version\?\.environment !== expectedEnvironment/u)
  assert.match(source, /packageJson\.version/u)
})
