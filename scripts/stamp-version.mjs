import { writeFile } from 'node:fs/promises'
import { APP_VERSION } from '../apps/web/src/data/releaseNotes.js'
import { projectRoot, sourceFingerprint } from './version-files.mjs'

const { fingerprint, fileCount } = await sourceFingerprint()
const manifest = {
  version: APP_VERSION,
  fingerprint,
  fileCount,
  stampedAt: new Date().toISOString()
}

await writeFile(`${projectRoot}/version-manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`VERSION STAMPED · V${APP_VERSION} · ${fileCount} files`)
