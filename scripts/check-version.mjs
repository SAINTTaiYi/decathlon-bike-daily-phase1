import { readFile } from 'node:fs/promises'
import { APP_VERSION, currentRelease } from '../apps/web/src/data/releaseNotes.js'
import { formalReleaseManifestPath, previewManifestPath, projectRoot, sourceFingerprint } from './version-files.mjs'
import { assertFormalReleaseBaseline, assertGitAncestor, changedPathsSince, currentGitSha, resolvePreviewCommits } from './version-git.mjs'
import { assertFormalReleaseManifest, assertFormalReleasePaths, assertPreviewManifest, assertResolvedPreviewCommitList, parseNamedArgs, semverPattern } from './version-policy.mjs'

const values = parseNamedArgs(process.argv.slice(2))
const mode = values.mode || 'standard'
if (!['standard', 'production'].includes(mode)) throw new Error('--mode 只支持 standard 或 production')
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const webPackageJson = JSON.parse(await readFile(new URL('../apps/web/package.json', import.meta.url), 'utf8'))
const errors = []
let manifest = null
let previewManifest = null
let formalManifest = null

for (const [label, path, assign] of [
  ['version-manifest.json', `${projectRoot}/version-manifest.json`, (value) => { manifest = value }],
  ['preview-manifest.json', previewManifestPath, (value) => { previewManifest = value }],
  ['formal-release.json', formalReleaseManifestPath, (value) => { formalManifest = value }]
]) {
  try { assign(JSON.parse(await readFile(path, 'utf8'))) } catch (error) {
    if (label === 'version-manifest.json') errors.push('缺少 version-manifest.json；正式发布后请运行 pnpm version:release:stamp')
    else if (error?.code !== 'ENOENT') errors.push(`${label} 不是有效 JSON`)
  }
}

try {
  const generatedReleaseInfo = await readFile(`${projectRoot}/apps/worker/src/generated/release-info.ts`, 'utf8')
  const generatedVersion = generatedReleaseInfo.match(/version: "([^"]+)"/u)?.[1]
  if (generatedVersion && generatedVersion !== APP_VERSION) {
    errors.push(`apps/worker/src/generated/release-info.ts (${generatedVersion}) 与 releaseNotes.js APP_VERSION (${APP_VERSION}) 不一致；请运行 pnpm generate:build-metadata`)
  }
} catch {
  // 生成文件缺失时由 prebuild 钩子重建，这里不视为版本错误。
}
if (!semverPattern.test(APP_VERSION)) errors.push(`APP_VERSION 必须是三段式版本号，当前为 ${APP_VERSION}`)
if (packageJson.version !== APP_VERSION) errors.push(`package.json ${packageJson.version} 与 APP_VERSION ${APP_VERSION} 不一致`)
if (webPackageJson.version !== APP_VERSION) errors.push(`apps/web/package.json ${webPackageJson.version} 与 APP_VERSION ${APP_VERSION} 不一致`)
if (currentRelease.version !== APP_VERSION) errors.push(`currentRelease.version ${currentRelease.version} 与 APP_VERSION ${APP_VERSION} 不一致`)
if (!currentRelease.title || !currentRelease.summary || !currentRelease.date) errors.push('当前版本更新记录缺少标题、摘要或日期')
if (!Array.isArray(currentRelease.changes) || currentRelease.changes.length === 0) errors.push('当前版本必须写明至少一项更新内容')

const currentHead = await currentGitSha()
const source = await sourceFingerprint()
const publicFingerprintMatches = Boolean(manifest && manifest.version === APP_VERSION && manifest.fingerprint === source.fingerprint && manifest.fileCount === source.fileCount)
let sourceState = publicFingerprintMatches ? 'formal' : 'preview'
if (!publicFingerprintMatches) {
  try { assertPreviewManifest(previewManifest, { version: APP_VERSION, gitSha: currentHead, ...source }) } catch (error) { errors.push(error.message) }
}
if (mode === 'production') {
  if (!publicFingerprintMatches) errors.push('Production 不能使用 Preview 源码登记；必须先运行 pnpm version:release 与 pnpm version:release:stamp')
  try {
    assertFormalReleaseManifest(formalManifest, APP_VERSION)
    await assertFormalReleaseBaseline(formalManifest)
    await assertGitAncestor(formalManifest.previewRange.fromExclusive, formalManifest.previewRange.toInclusive, 'formal-release.json 的 Preview 起点不是已验收 Preview SHA 的祖先提交')
    await assertGitAncestor(formalManifest.previewRange.toInclusive, currentHead, '已验收 Preview SHA 不是当前正式发布源码的祖先提交')
    const resolvedCommits = await resolvePreviewCommits(formalManifest.previewRange.fromExclusive, formalManifest.previewRange.toInclusive)
    assertResolvedPreviewCommitList(formalManifest, resolvedCommits)
    assertFormalReleasePaths(await changedPathsSince(formalManifest.previewRange.toInclusive))
  } catch (error) { errors.push(error.message) }
  sourceState = 'production-ready'
}

if (errors.length) {
  console.error(errors.map((error) => `VERSION ERROR · ${error}`).join('\n'))
  process.exit(1)
}
console.log(`VERSION OK · V${APP_VERSION} · ${currentRelease.changes.length} 项更新 · ${source.fileCount} files · ${sourceState}`)
