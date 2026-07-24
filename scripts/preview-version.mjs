import { writeFile } from 'node:fs/promises'
import { APP_VERSION } from '../apps/web/src/data/releaseNotes.js'
import { previewManifestPath, sourceFingerprint } from './version-files.mjs'
import { assertCleanGitWorktree, currentGitSha } from './version-git.mjs'
import { buildPreviewManifest } from './version-policy.mjs'

await assertCleanGitWorktree()
const gitSha = await currentGitSha()
const { fingerprint, fileCount } = await sourceFingerprint()
const manifest = buildPreviewManifest({
  version: APP_VERSION,
  fingerprint,
  fileCount,
  gitSha,
  recordedAt: new Date().toISOString()
})
await writeFile(previewManifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`PREVIEW VERSION RECORDED · public V${APP_VERSION} unchanged · ${fileCount} files`)
