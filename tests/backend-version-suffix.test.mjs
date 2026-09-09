// 后端发布版本后缀回归（2026-09-09 用户定案）：
// 纯后端修复不递增公开版本、不触发前端刷新公告，但部署身份必须可追溯，
// 因此 package.json 采用「公开版本-N」形式，公开版本仍由 releaseNotes.js 单点持有。
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { APP_VERSION } from '../apps/web/src/data/releaseNotes.js'
import { assertBuildVersionMatchesPublic, backendBuildVersionPattern, parseBackendBuildVersion, semverPattern } from '../scripts/version-policy.mjs'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

const [packageJson, webPackageJson, script, releaseNotes] = await Promise.all([
  read('package.json').then(JSON.parse),
  read('apps/web/package.json').then(JSON.parse),
  read('scripts/backend-version.mjs'),
  read('apps/web/src/data/releaseNotes.js')
])

test('公开版本仍是三段式，后端构建版本允许带 -N 后缀', () => {
  assert.match(APP_VERSION, semverPattern)
  assert.ok(backendBuildVersionPattern.test(`${APP_VERSION}-1`))
  assert.equal(backendBuildVersionPattern.test(APP_VERSION), false, '纯三段式不应被误判为后端后缀版本')
  assert.equal(backendBuildVersionPattern.test(`${APP_VERSION}-0`), false, '序号必须从 1 起')
  assert.deepEqual(parseBackendBuildVersion(`${APP_VERSION}-3`), { publicVersion: APP_VERSION, sequence: 3 })
  assert.equal(parseBackendBuildVersion(`${APP_VERSION}-x`), null)
})

test('构建版本与公开版本必须匹配，禁止跨公开版本的后缀', () => {
  assert.doesNotThrow(() => assertBuildVersionMatchesPublic('6.7.6', '6.7.6'))
  assert.doesNotThrow(() => assertBuildVersionMatchesPublic('6.7.6', '6.7.6-1'))
  assert.throws(() => assertBuildVersionMatchesPublic('6.7.6', '6.7.5-1'), /必须等于公开版本/u)
  assert.throws(() => assertBuildVersionMatchesPublic('6.7.6', '6.7.7'), /必须等于公开版本/u)
})

test('仓库当前两个构建版本一致且与公开版本同源', () => {
  assert.equal(packageJson.version, webPackageJson.version)
  assert.doesNotThrow(() => assertBuildVersionMatchesPublic(APP_VERSION, packageJson.version))
  assert.doesNotThrow(() => assertBuildVersionMatchesPublic(APP_VERSION, webPackageJson.version))
})

test('后端版本递增脚本只改构建版本，绝不动公开版本与更新公告', () => {
  assert.match(script, /parseBackendBuildVersion/u)
  assert.match(script, /publicVersion !== APP_VERSION/u, '跨公开版本时序号必须归零')
  assert.match(script, /assertCleanGitWorktree/u)
  // 公开版本与公告必须原样保留：脚本只写 package.json 与 apps/web/package.json。
  assert.doesNotMatch(script, /writeFile\([^)]*releaseNotes/u, '后端递增不得改写 releaseNotes.js')
  const writtenPaths = [...script.matchAll(/writeFile\((\w+)/gu)].map((match) => match[1])
  assert.deepEqual(writtenPaths.sort(), ['packagePath', 'webPackagePath'])
})

test('npm 脚本暴露 version:backend，且 check:version 接受后缀构建版本', async () => {
  assert.equal(packageJson.scripts['version:backend'], 'node scripts/backend-version.mjs')
  const checkVersion = await read('scripts/check-version.mjs')
  assert.match(checkVersion, /assertBuildVersionMatchesPublic/u)
})

test('前端版本比较正则保持三段式：后端后缀不会触发「请刷新」公告', async () => {
  const dialog = await read('apps/web/src/components/dialogs/UpdateRefreshDialog.jsx')
  assert.match(dialog, /isValidVersion/u)
  // 源文件字面量：/^\d+\.\d+\.\d+$/u —— 只认三段式公开版本。
  assert.ok(dialog.includes('/^\\d+\\.\\d+\\.\\d+$/u'), '前端只认三段式公开版本')
  // 后端构建版本带后缀 → 前端判定为无效版本 → 静默忽略，不弹窗。
  assert.equal(/^\d+\.\d+\.\d+$/u.test(`${APP_VERSION}-1`), false)
})

test('发布规则文档记录后端后缀规则', async () => {
  const deployment = await read('AUTOMATED-DEPLOYMENT.md')
  assert.match(deployment, /version:backend/u, '发布规则必须写明后端版本递增命令')
  assert.match(deployment, /后端/u)
})
