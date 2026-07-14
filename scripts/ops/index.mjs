#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { deployPages, ensureCloudflare } from './cloudflare.mjs'
import { deployRailway, ensureRailway } from './railway.mjs'
import { connectionUrlsFromState, ensureSupabase } from './supabase.mjs'
import { fetchExternal, loadState, optional, required, saveState, sha256, run, waitFor } from './lib.mjs'

const packageJson = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'))
process.env.APP_VERSION ||= packageJson.version
const [command = 'help', environment = 'staging', ...flags] = process.argv.slice(2)
const allowedCommands = ['help', 'preflight', 'plan', 'apply', 'release', 'verify']
const allowedEnvironments = ['staging', 'production']
if (!allowedCommands.includes(command)) throw new Error(`INVALID_COMMAND · ${command}`)
if (command !== 'help' && !allowedEnvironments.includes(environment)) throw new Error(`INVALID_ENVIRONMENT · ${environment}`)
const statePath = `infra/state/${environment}.json`

function publicState(state) {
  const { runtimeSecrets, ...safe } = state
  return safe
}

async function preflight(target = environment, mode = 'apply') {
  const missing = []
  const suffix = target.toUpperCase()
  const names = mode === 'release'
    ? ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', `SUPABASE_DB_PASSWORD_${suffix}`]
    : [
        'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', 'RAILWAY_API_TOKEN', 'RAILWAY_WORKSPACE_ID',
        'SUPABASE_ACCESS_TOKEN', 'SUPABASE_ORG_ID', `SUPABASE_DB_PASSWORD_${suffix}`,
        `SESSION_SECRET_${suffix}`, `CSRF_SECRET_${suffix}`, `PASSWORD_PEPPER_${suffix}`,
        `CONTACT_ENCRYPTION_KEY_${suffix}`, `INITIAL_ADMIN_SETUP_TOKEN_${suffix}`,
        `R2_ACCESS_KEY_ID_${suffix}`, `R2_SECRET_ACCESS_KEY_${suffix}`
      ]
  for (const name of names) if (!process.env[name]?.trim()) missing.push(name)
  if (mode === 'release' && !process.env.RAILWAY_TOKEN?.trim() && !process.env.RAILWAY_API_TOKEN?.trim()) missing.push('RAILWAY_TOKEN or RAILWAY_API_TOKEN')
  const major = Number(process.versions.node.split('.')[0])
  const nodeSupported = major >= 22 && major < 25
  const result = { ok: !missing.length && nodeSupported, node: process.version, nodeRequired: '>=22 <25', missing, domainOptional: true, target, mode }
  console.log(JSON.stringify(result, null, 2))
  return result
}

async function plan(target = environment) {
  console.log(JSON.stringify({
    environment: target,
    resources: {
      cloudflarePages: `bike-ops-${target}`,
      cloudflareR2: `bike-ops-${target}-media`,
      railwayProject: `decathlon-bike-ops-${target}`,
      railwayEnvironment: target,
      railwayService: 'api',
      supabaseProject: `bike-ops-${target}`
    },
    generatedUrls: [`https://bike-ops-${target}.pages.dev`, 'Railway generated *.up.railway.app'],
    productionApprovalRequired: target === 'production'
  }, null, 2))
}

function requireProductionApproval(target, { backupRequired = false } = {}) {
  if (target !== 'production') return
  if (!flags.includes('--approve-production')) throw new Error('PRODUCTION_APPROVAL_REQUIRED · add --approve-production after staging verification')
  if (backupRequired && !flags.includes('--confirm-backup')) throw new Error('PRODUCTION_BACKUP_CONFIRMATION_REQUIRED · confirm the current database backup or recovery point with --confirm-backup')
}

function assertStateEnvironment(state, target) {
  if (state.environment && state.environment !== target) throw new Error(`STATE_ENVIRONMENT_MISMATCH · state=${state.environment} target=${target}`)
}

async function saveCheckpoint(target, state, phase) {
  await saveState(`infra/state/${target}.json`, { ...publicState(state), environment: target, phase, updatedAt: new Date().toISOString() })
}

async function migrateDatabase(database) {
  await run('pnpm', ['--filter', '@bike-ops/database', 'migrate'], {
    env: { ...process.env, DIRECT_DATABASE_URL: database.DIRECT_DATABASE_URL },
    networkTarget: 'Supabase PostgreSQL'
  })
}

async function apply(target) {
  requireProductionApproval(target)
  const check = await preflight(target, 'apply')
  if (!check.ok) throw new Error('PREFLIGHT_FAILED')
  let state = await loadState(statePath)
  assertStateEnvironment(state, target)
  state.environment = target
  state = await ensureSupabase(target, state, { onCheckpoint: (next) => saveCheckpoint(target, next, 'supabase') })
  await saveCheckpoint(target, state, 'supabase-ready')
  state = await ensureCloudflare(target, state, { apiOrigin: '', onCheckpoint: (next) => saveCheckpoint(target, next, 'cloudflare') })
  await saveCheckpoint(target, state, 'cloudflare-ready')
  const pagesOrigin = state.cloudflare.pagesUrl
  const allowedWebOrigins = (state.cloudflare.webOrigins || [pagesOrigin]).join(',')
  const suffix = target.toUpperCase()
  state.runtimeSecrets = {
    ...state.runtimeSecrets,
    SESSION_SECRET: required(`SESSION_SECRET_${suffix}`),
    CSRF_SECRET: required(`CSRF_SECRET_${suffix}`),
    PASSWORD_PEPPER: required(`PASSWORD_PEPPER_${suffix}`),
    CONTACT_ENCRYPTION_KEY: required(`CONTACT_ENCRYPTION_KEY_${suffix}`),
    ADMIN_SETUP_TOKEN_HASH: sha256(required(`INITIAL_ADMIN_SETUP_TOKEN_${suffix}`))
  }
  state = await ensureRailway(target, state, state.runtimeSecrets, allowedWebOrigins, { onCheckpoint: (next) => saveCheckpoint(target, next, 'railway') })
  await saveCheckpoint(target, state, 'railway-ready')
  await migrateDatabase(state.runtimeSecrets)
  await saveCheckpoint(target, state, 'schema-ready')
  await deployRailway(target, state)
  await verifyApi(state.apiOrigin)
  await deployPages(target, state.apiOrigin)
  await saveState(statePath, { ...publicState(state), deployedAt: new Date().toISOString(), gitSha: optional('GITHUB_SHA', 'manual') })
  console.log(JSON.stringify({ ok: true, environment: target, webUrl: pagesOrigin, apiUrl: state.apiOrigin, statePath }, null, 2))
}

async function release(target) {
  requireProductionApproval(target, { backupRequired: true })
  const check = await preflight(target, 'release')
  if (!check.ok) throw new Error('PREFLIGHT_FAILED')
  const state = await loadState(statePath)
  assertStateEnvironment(state, target)
  if (!state.supabase?.projectRef || !state.railway?.environments?.[target] || !state.railway?.domains?.[target] || !state.cloudflare?.pagesProject) {
    throw new Error(`BOOTSTRAP_REQUIRED · run apply ${target} first and commit ${statePath}`)
  }
  const database = connectionUrlsFromState(target, state)
  await migrateDatabase(database)
  await deployRailway(target, state)
  const apiOrigin = state.railway.domains[target]
  await verifyApi(apiOrigin)
  await deployPages(target, apiOrigin)
  await saveState(statePath, { ...state, deployedAt: new Date().toISOString(), gitSha: optional('GITHUB_SHA', 'manual') })
  console.log(JSON.stringify({ ok: true, environment: target, webUrl: state.cloudflare.pagesUrl, apiUrl: apiOrigin }, null, 2))
}

async function verifyApi(origin) {
  await waitFor(`API readiness ${origin}`, async () => {
    const health = await fetchExternal(`${origin}/health/ready`)
    if (!health.ok) return false
    const version = await fetchExternal(`${origin}/api/v1/meta/version`)
    return version.ok
  }, { attempts: 60, delayMs: 5000 })
}

async function verify(target) {
  const state = await loadState(statePath)
  assertStateEnvironment(state, target)
  const webUrl = state.cloudflare?.pagesUrl
  const apiUrl = state.railway?.domains?.[target]
  if (!webUrl || !apiUrl) throw new Error(`STATE_INCOMPLETE · ${statePath}`)
  await verifyApi(apiUrl)
  const web = await fetchExternal(webUrl)
  if (!web.ok) throw new Error(`WEB_HEALTH_FAILED · ${web.status}`)
  console.log(JSON.stringify({ ok: true, webUrl, apiUrl }, null, 2))
}

if (command === 'preflight') {
  const result = await preflight(environment, flags.includes('--release') ? 'release' : 'apply')
  if (!result.ok) process.exitCode = 1
}
else if (command === 'plan') await plan(environment)
else if (command === 'apply') await apply(environment)
else if (command === 'release') await release(environment)
else if (command === 'verify') await verify(environment)
else console.log('Usage: pnpm ops <preflight|plan|apply|release|verify> <staging|production> [--release] [--approve-production] [--confirm-backup]')
