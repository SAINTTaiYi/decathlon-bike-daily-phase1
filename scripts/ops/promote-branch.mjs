#!/usr/bin/env node
import { execFileSync } from 'node:child_process'

const [sourceSha, targetBranch] = process.argv.slice(2)
if (!/^[0-9a-f]{40}$/u.test(sourceSha || '')) throw new Error('INVALID_SOURCE_SHA · expected a full lowercase 40-character commit SHA')
if (!['edgeone-staging', 'edgeone-production'].includes(targetBranch)) throw new Error(`INVALID_DEPLOYMENT_BRANCH · ${targetBranch || '(missing)'}`)

function git(args, options = {}) {
  const output = execFileSync('git', args, { encoding: 'utf8', stdio: options.quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit' })
  return typeof output === 'string' ? output.trim() : ''
}

git(['cat-file', '-e', `${sourceSha}^{commit}`])
const remoteLine = git(['ls-remote', '--refs', 'origin', `refs/heads/${targetBranch}`], { quiet: true })
const remoteTarget = remoteLine.split(/\s+/u)[0] || ''
if (remoteTarget) git(['fetch', '--no-tags', 'origin', `refs/heads/${targetBranch}:refs/remotes/origin/${targetBranch}`])

if (!remoteTarget && targetBranch === 'edgeone-production') {
  throw new Error('PRODUCTION_DEPLOYMENT_BRANCH_MISSING · bootstrap production only after staging acceptance and explicit production approval')
}
if (remoteTarget) {
  try {
    git(['merge-base', '--is-ancestor', remoteTarget, sourceSha])
  } catch {
    throw new Error(`NON_FAST_FORWARD_DEPLOYMENT_FORBIDDEN · ${targetBranch} ${remoteTarget} -> ${sourceSha}`)
  }
}

git(['push', 'origin', `${sourceSha}:refs/heads/${targetBranch}`])
console.log(JSON.stringify({ ok: true, sourceSha, targetBranch, previousSha: remoteTarget || null, forcePush: false }))
