import { build } from 'esbuild'
import { mkdir } from 'node:fs/promises'

await mkdir('dist/worker', { recursive: true })
const shared = {
  entryPoints: ['apps/worker/src/index.ts'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  conditions: ['worker', 'browser', 'import'],
  mainFields: ['module', 'main'],
  logLevel: 'info'
}
await Promise.all([
  build({ ...shared, outfile: 'dist/worker/index.js' }),
  build({ ...shared, minify: true, outfile: 'dist/worker/index.min.js' })
])
console.log('worker bundles written to dist/worker/index.js and dist/worker/index.min.js')
