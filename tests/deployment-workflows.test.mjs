import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'

const workflowDirectory = '.github/workflows'

async function workflow(name) {
  return readFile(`${workflowDirectory}/${name}`, 'utf8')
}

test('Workflow 静态策略验证器通过', () => {
  const result = spawnSync(process.execPath, ['scripts/ops/validate-workflows.mjs'], { cwd: process.cwd(), encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.match(result.stdout, /"ok": true/u)
})

test('Bootstrap 只将所选 GitHub Environment 的 Secret 映射到对应后缀', async () => {
  const source = await workflow('bootstrap-infrastructure.yml')
  assert.match(source, /environment: \$\{\{ inputs\.environment \}\}/u)
  assert.match(source, /Map only the selected environment secrets/u)
  assert.match(source, /SUPABASE_DB_PASSWORD_\$\{suffix\}/u)
  assert.doesNotMatch(source, /SUPABASE_DB_PASSWORD_STAGING:\s*\$\{\{ secrets\.SUPABASE_DB_PASSWORD \}\}/u)
  assert.doesNotMatch(source, /SUPABASE_DB_PASSWORD_PRODUCTION:\s*\$\{\{ secrets\.SUPABASE_DB_PASSWORD \}\}/u)
})

test('Production Workflow 仅手动触发且要求 main、staging 验收、批准与备份确认', async () => {
  const source = await workflow('deploy-production.yml')
  assert.doesNotMatch(source, /^\s+push:/mu)
  assert.match(source, /refs\/heads\/main/u)
  assert.match(source, /staging_accepted_sha:/u)
  assert.match(source, /approve_production:/u)
  assert.match(source, /confirm_backup:/u)
  assert.match(source, /pnpm ops release production --approve-production --confirm-backup/u)
  assert.match(source, /git rev-parse origin\/main/u)
  assert.match(source, /release-state-production/u)
})

test('Bootstrap 的 Production 源码必须匹配已验收 Staging，state 通过 PR 审核', async () => {
  const source = await workflow('bootstrap-infrastructure.yml')
  assert.match(source, /staging_accepted_sha:/u)
  assert.match(source, /git diff --quiet "\$STAGING_ACCEPTED_SHA" HEAD/u)
  assert.match(source, /gh pr create/u)
  assert.doesNotMatch(source, /git push origin "HEAD:\$target_branch"/u)
})

test('Docker context 排除环境文件、依赖、生成物和真实 state', async () => {
  const source = await readFile('.dockerignore', 'utf8')
  for (const pattern of ['.env', 'node_modules', '**/dist', 'infra/state/*.json', 'plan', 'code']) assert.match(source, new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'))
  assert.match(source, /!infra\/state\/example\.json/u)
})

test('CI 使用 checksum migration runner 连续执行两次', async () => {
  const source = await workflow('ci.yml')
  assert.ok((source.match(/pnpm --filter @bike-ops\/database migrate/gu) || []).length >= 2)
  assert.match(source, /bike_ops_schema_migrations/u)
})

test('Staging Workflow 固定 develop，先测试和 preflight，再发布与验证', async () => {
  const source = await workflow('deploy-staging.yml')
  const labels = ['Test, typecheck, and build', 'Preflight release credentials', 'Release in safe order', 'Verify deployed API and web']
  assert.match(source, /branches: \[develop\]/u)
  assert.match(source, /Check whether staging has been bootstrapped/u)
  assert.match(source, /needs\.readiness\.outputs\.ready == 'true'/u)
  assert.match(source, /app_version=\$\(node -p "require\('\.\/package\.json'\)\.version"\)/u)
  assert.equal(source.includes('node -p \\"require'), false)
  assert.match(source, /release-state-staging/u)
  let cursor = -1
  for (const label of labels) {
    const index = source.indexOf(label)
    assert.ok(index > cursor, `${label} must be present in safe order`)
    cursor = index
  }
})
