import { build } from 'esbuild'
import { mkdir } from 'node:fs/promises'

await mkdir('dist/worker', { recursive: true })
await build({
  entryPoints: ['apps/worker/src/index.ts'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  outfile: 'dist/worker/index.js',
  conditions: ['worker', 'browser', 'import'],
  mainFields: ['module', 'main'],
  logLevel: 'info'
})
console.log('worker bundle written to dist/worker/index.js')
