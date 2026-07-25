import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
export const previewManifestPath = `${projectRoot}/preview-manifest.json`
export const formalReleaseManifestPath = `${projectRoot}/formal-release.json`

const roots = [
  '.github/workflows',
  'apps',
  'packages',
  'supabase',
  'migrations',
  'cloud-functions',
  'edgeone.json',
  'scripts',
  'tests',
  'docs',
  '.env.example',
  '.gitignore',
  '.npmrc',
  '.nvmrc',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tsconfig.base.json',
  'AUTOMATED-DEPLOYMENT.md',
  'PRODUCT.md',
  'README.md',
  'deploy-summary.md',
  'formal-release.json'
]

const ignoredDirectories = new Set(['node_modules', 'dist', 'coverage', 'generated', '.supabase'])

async function walk(path) {
  const info = await stat(path)
  if (info.isFile()) return [path]
  if (ignoredDirectories.has(basename(path))) return []
  const entries = await readdir(path)
  const nested = await Promise.all(entries.sort().map((entry) => walk(resolve(path, entry))))
  return nested.flat()
}

async function walkIfPresent(path) {
  try { return await walk(path) } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
}

export async function versionedFiles() {
  const groups = await Promise.all(roots.map((entry) => walkIfPresent(resolve(projectRoot, entry))))
  return groups.flat().sort()
}

export async function sourceFingerprint() {
  const hash = createHash('sha256')
  const files = await versionedFiles()
  for (const file of files) {
    hash.update(relative(projectRoot, file))
    hash.update('\0')
    hash.update(await readFile(file))
    hash.update('\0')
  }
  return { fingerprint: hash.digest('hex'), fileCount: files.length }
}
