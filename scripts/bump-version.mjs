import { readFile, writeFile } from 'node:fs/promises'
import { formalReleaseManifestPath, projectRoot } from './version-files.mjs'
import { assertCleanGitWorktree, assertFormalReleaseStart, assertGitAncestor, currentGitSha, resolvePreviewCommits } from './version-git.mjs'
import { resolveReleaseVersion } from './version-number.mjs'
import { assertFormalReleaseInput, buildFormalReleaseManifest, parseNamedArgs } from './version-policy.mjs'

const values = parseNamedArgs(process.argv.slice(2))
assertFormalReleaseInput(values)

const packagePath = `${projectRoot}/package.json`
const releasePath = `${projectRoot}/apps/web/src/data/releaseNotes.js`
const webPackagePath = `${projectRoot}/apps/web/package.json`
const [packageJson, webPackageJson] = await Promise.all([
  readFile(packagePath, 'utf8').then(JSON.parse),
  readFile(webPackagePath, 'utf8').then(JSON.parse)
])
await assertCleanGitWorktree()
const currentHead = await currentGitSha()
if (currentHead !== values['preview-to']) throw new Error(`--preview-to 必须等于当前已验收 Preview 源码 HEAD：${currentHead}`)
await assertGitAncestor(values['preview-from'], values['preview-to'], '--preview-from 必须是 --preview-to 的祖先提交')
await assertFormalReleaseStart(values['preview-from'])
const previewCommits = await resolvePreviewCommits(values['preview-from'], values['preview-to'])

const nextVersion = resolveReleaseVersion(packageJson.version, values['set-version'])
const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).replaceAll('-', '.')
const quoted = (value) => JSON.stringify(String(value), null, 0)
const releaseSource = `export const APP_VERSION = ${quoted(nextVersion)}\n\nexport const currentRelease = {\n  version: APP_VERSION,\n  date: ${quoted(date)},\n  title: ${quoted(values.title)},\n  summary: ${quoted(values.summary)},\n  changes: [\n${values.change.map((change) => `    ${quoted(change)}`).join(',\n')}\n  ]\n}\n`
const formalManifest = buildFormalReleaseManifest({
  version: nextVersion,
  previewFrom: values['preview-from'],
  previewTo: values['preview-to'],
  previewCommits,
  title: values.title,
  summary: values.summary,
  changes: values.change,
  preparedAt: new Date().toISOString()
})

packageJson.version = nextVersion
webPackageJson.version = nextVersion
await Promise.all([
  writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`),
  writeFile(webPackagePath, `${JSON.stringify(webPackageJson, null, 2)}\n`),
  writeFile(releasePath, releaseSource),
  writeFile(formalReleaseManifestPath, `${JSON.stringify(formalManifest, null, 2)}\n`)
])
console.log(`FORMAL RELEASE VERSION BUMPED · V${nextVersion}`)
console.log('已汇总已验收 Preview 周期；现在运行 pnpm version:release:stamp，再进入 Staging/Production 正式发布门禁。')
