#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { fetchExternal, waitFor } from './lib.mjs'

const [rawOrigin, expectedSha, expectedEnvironment] = process.argv.slice(2)
if (!rawOrigin) throw new Error('MISSING_DEPLOYMENT_ORIGIN')
if (!/^[0-9a-f]{40}$/u.test(expectedSha || '')) throw new Error('INVALID_EXPECTED_SHA')
if (!['staging', 'production'].includes(expectedEnvironment)) throw new Error('INVALID_EXPECTED_ENVIRONMENT')

const origin = new URL(rawOrigin).origin
const packageJson = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'))

async function json(path) {
  const response = await fetchExternal(`${origin}${path}`, { redirect: 'error' })
  if (!response.ok) return null
  return response.json().catch(() => null)
}

const result = await waitFor(`EdgeOne ${expectedEnvironment} deployment ${expectedSha}`, async () => {
  const [health, version, web] = await Promise.all([
    json('/health/ready'),
    json('/api/v1/meta/version'),
    fetchExternal(origin, { redirect: 'follow' })
  ])
  if (!web.ok) return false
  if (health?.status !== 'ready' || health?.gitSha !== expectedSha || health?.version !== packageJson.version) return false
  if (version?.gitSha !== expectedSha || version?.appVersion !== packageJson.version || version?.environment !== expectedEnvironment) return false
  return { origin, health, version, webStatus: web.status }
}, { attempts: 120, delayMs: 5000 })

console.log(JSON.stringify({ ok: true, expectedSha, expectedEnvironment, expectedVersion: packageJson.version, ...result }, null, 2))
