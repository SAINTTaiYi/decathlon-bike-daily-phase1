import { readFile } from 'node:fs/promises'
import { APP_VERSION, currentRelease } from '../apps/web/src/data/releaseNotes.js'
import { projectRoot, sourceFingerprint } from './version-files.mjs'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const webPackageJson = JSON.parse(await readFile(new URL('../apps/web/package.json', import.meta.url), 'utf8'))
const semver = /^\d+\.\d+\.\d+$/
const errors = []
let manifest = null

try {
  manifest = JSON.parse(await readFile(`${projectRoot}/version-manifest.json`, 'utf8'))
} catch {
  errors.push('缺少 version-manifest.json，请先运行 pnpm version:stamp')
}

if (!semver.test(APP_VERSION)) errors.push(`APP_VERSION 必须是三段式版本号，当前为 ${APP_VERSION}`)
if (packageJson.version !== APP_VERSION) errors.push(`package.json ${packageJson.version} 与 APP_VERSION ${APP_VERSION} 不一致`)
if (webPackageJson.version !== APP_VERSION) errors.push(`apps/web/package.json ${webPackageJson.version} 与 APP_VERSION ${APP_VERSION} 不一致`)
if (currentRelease.version !== APP_VERSION) errors.push(`currentRelease.version ${currentRelease.version} 与 APP_VERSION ${APP_VERSION} 不一致`)
if (!currentRelease.title || !currentRelease.summary || !currentRelease.date) errors.push('当前版本更新记录缺少标题、摘要或日期')
if (!Array.isArray(currentRelease.changes) || currentRelease.changes.length === 0) errors.push('当前版本必须写明至少一项更新内容')

const { fingerprint, fileCount } = await sourceFingerprint()
if (manifest && manifest.version !== APP_VERSION) errors.push(`版本指纹属于 V${manifest.version}，当前为 V${APP_VERSION}`)
if (manifest && manifest.fingerprint !== fingerprint) errors.push('源码、样式、资源或产品文档已修改，但当前版本尚未重新登记；请递增补丁版本、更新 releaseNotes，再运行 pnpm version:stamp')
if (manifest && manifest.fileCount !== fileCount) errors.push(`版本文件数量已变化：登记 ${manifest.fileCount}，当前 ${fileCount}`)

if (errors.length) {
  console.error(errors.map((error) => `VERSION ERROR · ${error}`).join('\n'))
  process.exit(1)
}

console.log(`VERSION OK · V${APP_VERSION} · ${currentRelease.changes.length} 项更新 · ${fileCount} files`)
