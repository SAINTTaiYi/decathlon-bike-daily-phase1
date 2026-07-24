export const semverPattern = /^\d+\.\d+\.\d+$/u
export const shaPattern = /^[0-9a-f]{40}$/u
export const firstFormalPreviewBaselineSha = 'dabe0ed8d1ba662840460837c88bf288fb3ffaaa'

export function parseNamedArgs(args) {
  const values = { change: [] }
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index]
    if (key === '--') continue
    if (!key.startsWith('--')) continue
    const name = key.slice(2)
    const value = args[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`${key} 缺少内容`)
    if (name === 'change') values.change.push(value)
    else values[name] = value
    index += 1
  }
  return values
}

export function assertPreviewManifest(manifest, { version, fingerprint, fileCount, gitSha }) {
  if (!manifest || manifest.kind !== 'preview-source') throw new Error('缺少 Preview 源码登记；请先运行 pnpm version:preview')
  if (manifest.publicVersion !== version) throw new Error(`Preview 登记版本 ${manifest.publicVersion} 与当前 V${version} 不一致`)
  if (manifest.fingerprint !== fingerprint) throw new Error('Preview 源码已变化；请重新运行 pnpm version:preview，禁止为 Preview 递增公开版本')
  if (manifest.fileCount !== fileCount) throw new Error(`Preview 文件数量已变化：登记 ${manifest.fileCount}，当前 ${fileCount}`)
  if (!shaPattern.test(manifest.gitSha || '')) throw new Error('Preview 源码登记缺少有效 Git SHA；请重新运行 pnpm version:preview')
  if (manifest.gitSha !== gitSha) throw new Error(`Preview 登记 SHA ${manifest.gitSha} 与当前源码 ${gitSha} 不一致`)
}

export function assertFormalReleaseInput(values) {
  if (values['formal-release'] !== 'true') throw new Error('公开版本递增仅允许正式 Production 发布准备：必须传入 --formal-release true')
  if (!values['preview-from'] || !shaPattern.test(values['preview-from'])) throw new Error('--preview-from 必须是 Preview 周期起点的 40 位小写 SHA')
  if (!values['preview-to'] || !shaPattern.test(values['preview-to'])) throw new Error('--preview-to 必须是已人工验收 Preview 的 40 位小写 SHA')
  if (!values.title || !values.summary || !values.change?.length) throw new Error('正式发布必须提供汇总更新公告：--title、--summary 和至少一项 --change')
}

export function assertFormalReleaseStartSha(previewFrom, previousFormalRelease) {
  const expected = previousFormalRelease || firstFormalPreviewBaselineSha
  if (previewFrom !== expected) {
    const label = previousFormalRelease ? '上一次正式发布提交' : '首次迁移基线 V5.7.8 Preview SHA'
    throw new Error(`--preview-from 必须等于${label}：${expected}`)
  }
}

export function buildPreviewManifest({ version, fingerprint, fileCount, gitSha, recordedAt }) {
  return {
    kind: 'preview-source',
    publicVersion: version,
    fingerprint,
    fileCount,
    gitSha,
    recordedAt
  }
}

export function assertPreviewCommitList(commits, previewFrom, previewTo) {
  if (!Array.isArray(commits) || commits.length === 0) throw new Error('formal-release.json 缺少完整 Preview 提交清单')
  const seen = new Set()
  for (const commit of commits) {
    if (!shaPattern.test(commit?.sha || '')) throw new Error('formal-release.json 的 Preview 提交清单包含无效 SHA')
    if (typeof commit.subject !== 'string' || !commit.subject.trim()) throw new Error('formal-release.json 的 Preview 提交清单包含空标题')
    if (commit.sha === previewFrom) throw new Error('formal-release.json 的 Preview 提交清单不能包含 Preview 起点 SHA')
    if (seen.has(commit.sha)) throw new Error('formal-release.json 的 Preview 提交清单包含重复 SHA')
    seen.add(commit.sha)
  }
  if (!seen.has(previewTo)) throw new Error('formal-release.json 的 Preview 提交清单未包含已验收 Preview SHA')
}

export function buildFormalReleaseManifest({ version, previewFrom, previewTo, previewCommits, title, summary, changes, preparedAt }) {
  assertPreviewCommitList(previewCommits, previewFrom, previewTo)
  return {
    kind: 'formal-production-release',
    version,
    previewRange: {
      fromExclusive: previewFrom,
      toInclusive: previewTo,
      commits: previewCommits
    },
    announcement: {
      title,
      summary,
      changes
    },
    preparedAt
  }
}

export function assertFormalReleaseManifest(manifest, version) {
  if (!manifest || manifest.kind !== 'formal-production-release') throw new Error('Production 缺少 formal-release.json；先在已验收 Preview 源码上运行 pnpm version:release')
  if (manifest.version !== version) throw new Error(`formal-release.json 版本 ${manifest.version} 与当前 V${version} 不一致`)
  if (!shaPattern.test(manifest.previewRange?.fromExclusive || '')) throw new Error('formal-release.json 缺少有效 Preview 起点 SHA')
  if (!shaPattern.test(manifest.previewRange?.toInclusive || '')) throw new Error('formal-release.json 缺少有效已验收 Preview SHA')
  assertPreviewCommitList(manifest.previewRange.commits, manifest.previewRange.fromExclusive, manifest.previewRange.toInclusive)
  if (!manifest.announcement?.title || !manifest.announcement?.summary || !Array.isArray(manifest.announcement?.changes) || manifest.announcement.changes.length === 0) {
    throw new Error('formal-release.json 缺少 Preview 周期汇总更新公告')
  }
}


const formalReleasePaths = new Set([
  'package.json',
  'apps/web/package.json',
  'apps/web/src/data/releaseNotes.js',
  'formal-release.json',
  'version-manifest.json'
])

export function assertFormalReleasePaths(paths) {
  if (!Array.isArray(paths) || paths.length === 0) throw new Error('正式发布提交必须包含版本化文件')
  for (const path of paths) {
    if (!formalReleasePaths.has(path)) throw new Error(`正式发布在已验收 Preview 后包含未验收改动：${path}`)
  }
  for (const path of formalReleasePaths) {
    if (!paths.includes(path)) throw new Error(`正式发布缺少必需版本化文件：${path}`)
  }
}

export function assertResolvedPreviewCommitList(manifest, commits) {
  const recorded = manifest.previewRange?.commits
  assertPreviewCommitList(recorded, manifest.previewRange?.fromExclusive, manifest.previewRange?.toInclusive)
  if (!Array.isArray(commits) || recorded.length !== commits.length) throw new Error('formal-release.json 的 Preview 提交清单与 Git 区间不一致')
  for (let index = 0; index < recorded.length; index += 1) {
    if (recorded[index].sha !== commits[index]?.sha || recorded[index].subject !== commits[index]?.subject) {
      throw new Error('formal-release.json 的 Preview 提交清单与 Git 区间不一致')
    }
  }
}
