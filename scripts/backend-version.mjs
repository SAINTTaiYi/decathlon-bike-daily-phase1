/**
 * 后端发布版本递增（2026-09-09 用户定案）：
 *
 * 纯后端修复不改变界面，因此不递增公开版本（releaseNotes.js 的 APP_VERSION 保持不动）、
 * 不触发前端「请刷新」公告；但每次部署必须有可追溯的部署身份，所以 package.json 与
 * apps/web/package.json 采用「公开版本-序号」形式（6.7.6-1、6.7.6-2…）。
 *
 * 序号在同一公开版本内累加，跨公开版本归零：前端发布 6.7.7 后，后端首次发布即 6.7.7-1。
 * 前端动代码的改动仍走 pnpm version:release 的正式发布流程。
 */
import { readFile, writeFile } from 'node:fs/promises'
import { projectRoot } from './version-files.mjs'
import { assertCleanGitWorktree } from './version-git.mjs'
import { parseBackendBuildVersion, semverPattern } from './version-policy.mjs'

const packagePath = `${projectRoot}/package.json`
const webPackagePath = `${projectRoot}/apps/web/package.json`
const [packageJson, webPackageJson] = await Promise.all([
  readFile(packagePath, 'utf8').then(JSON.parse),
  readFile(webPackagePath, 'utf8').then(JSON.parse)
])
await assertCleanGitWorktree()

const { APP_VERSION } = await import(`${projectRoot}/apps/web/src/data/releaseNotes.js`)
if (!semverPattern.test(APP_VERSION)) throw new Error(`releaseNotes.js 的 APP_VERSION 必须是三段式版本号：${APP_VERSION}`)

const current = packageJson.version
const parsed = parseBackendBuildVersion(current)
let nextVersion
if (parsed) {
  if (parsed.publicVersion !== APP_VERSION) {
    // 公开版本已推进（前端正式发布），后端序号从 -1 重新起算。
    nextVersion = `${APP_VERSION}-1`
  } else {
    nextVersion = `${parsed.publicVersion}-${parsed.sequence + 1}`
  }
} else if (current === APP_VERSION) {
  nextVersion = `${APP_VERSION}-1`
} else {
  throw new Error(`package.json 当前版本 ${current} 既不是公开版本 ${APP_VERSION}，也不是其后缀形式，请先修正版本基线`)
}
if (webPackageJson.version !== current) {
  throw new Error(`apps/web/package.json ${webPackageJson.version} 与 package.json ${current} 不一致，请先对齐版本基线`)
}

packageJson.version = nextVersion
webPackageJson.version = nextVersion
await Promise.all([
  writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`),
  writeFile(webPackagePath, `${JSON.stringify(webPackageJson, null, 2)}\n`)
])
console.log(`BACKEND BUILD VERSION BUMPED · ${current} -> ${nextVersion} · public V${APP_VERSION} unchanged`)
console.log('公开版本与更新公告保持不动；提交后按 Staging 部署流程发布。')
