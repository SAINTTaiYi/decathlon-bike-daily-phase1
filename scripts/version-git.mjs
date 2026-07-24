import { execFile as execFileCallback } from 'node:child_process'
import { promisify } from 'node:util'
import { projectRoot } from './version-files.mjs'
import { assertFormalReleaseStartSha } from './version-policy.mjs'

const execFile = promisify(execFileCallback)

async function git(args) {
  const { stdout } = await execFile('git', args, { cwd: projectRoot })
  return stdout
}

export async function currentGitSha() {
  return (await git(['rev-parse', 'HEAD'])).trim()
}

export async function assertCleanGitWorktree() {
  const status = await git(['status', '--porcelain', '--untracked-files=all'])
  if (status.trim()) throw new Error('Preview 源码登记只能在无未提交改动的 Git 工作区运行')
}

export async function assertGitAncestor(ancestor, descendant, message) {
  try {
    await git(['merge-base', '--is-ancestor', ancestor, descendant])
  } catch {
    throw new Error(message)
  }
}

export async function resolvePreviewCommits(previewFrom, previewTo) {
  const output = await git(['log', '-z', '--reverse', '--topo-order', '--format=%H%x00%s', `${previewFrom}..${previewTo}`])
  const fields = output.split('\0').filter(Boolean)
  if (fields.length % 2 !== 0) throw new Error('无法解析 Preview Git 提交清单')
  const commits = []
  for (let index = 0; index < fields.length; index += 2) {
    commits.push({ sha: fields[index], subject: fields[index + 1] })
  }
  return commits
}

export async function readGitFile(ref, path) {
  return git(['show', `${ref}:${path}`])
}

export async function changedPathsSince(ref) {
  const [diff, untracked] = await Promise.all([
    git(['diff', '--name-only', ref]),
    git(['ls-files', '--others', '--exclude-standard'])
  ])
  return [...new Set([...diff.split('\n'), ...untracked.split('\n')].filter(Boolean))].sort()
}

export async function formalReleaseCommits(limit = 2) {
  const output = await git(['log', `-${limit}`, '--format=%H', '--', 'formal-release.json'])
  return output.split('\n').filter(Boolean)
}

export async function assertFormalReleaseStart(previewFrom) {
  const [previousFormalRelease] = await formalReleaseCommits(1)
  assertFormalReleaseStartSha(previewFrom, previousFormalRelease)
}

export async function assertFormalReleaseBaseline(manifest) {
  const [latestFormalRelease, previousFormalRelease] = await formalReleaseCommits(2)
  if (!latestFormalRelease) return
  const latestManifest = JSON.parse(await readGitFile(latestFormalRelease, 'formal-release.json'))
  const latestMatchesCurrent = JSON.stringify(latestManifest) === JSON.stringify(manifest)
  const expectedPreviousFormalRelease = latestMatchesCurrent ? previousFormalRelease : latestFormalRelease
  assertFormalReleaseStartSha(manifest.previewRange?.fromExclusive, expectedPreviousFormalRelease)
}
