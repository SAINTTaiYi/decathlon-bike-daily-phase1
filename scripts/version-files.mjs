import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))

const roots = [
  '.github/workflows',
  'apps',
  'packages',
  'supabase',
  'infra/docker',
  'infra/state/example.json',
  'scripts',
  'tests',
  'docs',
  '.dockerignore',
  '.env.example',
  '.gitignore',
  '.npmrc',
  '.nvmrc',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tsconfig.base.json',
  'railway.json',
  'AUTOMATED-DEPLOYMENT.md',
  'PRODUCT.md',
  'DESIGN.md',
  'README.md',
  'deploy-summary.md'
]

const ignoredDirectories = new Set(['node_modules', 'dist', 'coverage', '.wrangler', '.railway', '.supabase'])

async function walk(path) {
  const info = await stat(path)
  if (info.isFile()) return [path]
  if (ignoredDirectories.has(basename(path))) return []
  const entries = await readdir(path)
  const nested = await Promise.all(entries.sort().map((entry) => walk(resolve(path, entry))))
  return nested.flat()
}

export async function versionedFiles() {
  const groups = await Promise.all(roots.map((entry) => walk(resolve(projectRoot, entry))))
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
