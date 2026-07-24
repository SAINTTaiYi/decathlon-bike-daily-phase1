import { readFile, writeFile } from 'node:fs/promises'
import { APP_VERSION } from '../apps/web/src/data/releaseNotes.js'
import { formalReleaseManifestPath, projectRoot, sourceFingerprint } from './version-files.mjs'
import { assertFormalReleaseManifest, parseNamedArgs } from './version-policy.mjs'

const values = parseNamedArgs(process.argv.slice(2))
if (values['formal-release'] !== 'true') throw new Error('公开版本指纹仅允许正式 Production 发布准备：使用 pnpm version:release:stamp')
const formalManifest = JSON.parse(await readFile(formalReleaseManifestPath, 'utf8'))
assertFormalReleaseManifest(formalManifest, APP_VERSION)
const { fingerprint, fileCount } = await sourceFingerprint()
const manifest = { version: APP_VERSION, fingerprint, fileCount, stampedAt: new Date().toISOString() }
await writeFile(`${projectRoot}/version-manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`FORMAL RELEASE VERSION STAMPED · V${APP_VERSION} · ${fileCount} files`)
