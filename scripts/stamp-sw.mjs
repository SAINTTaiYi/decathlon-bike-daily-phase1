#!/usr/bin/env node
// 构建后给 dist/sw.js 注入缓存版本（版本 + 构建 SHA），保证每次部署 SW 字节变化，
// 浏览器自动升级 SW 并清理旧缓存，避免旧版页面滞留。
import { readFile, writeFile } from 'node:fs/promises'
import { execSync } from 'node:child_process'

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
const dist = new URL('../apps/web/dist/sw.js', import.meta.url)
let sw = await readFile(dist, 'utf8')
if (!sw.includes('__BUILD_SHA__')) throw new Error('dist/sw.js missing __BUILD_SHA__ placeholder; run vite build first')
sw = sw.replaceAll('__BUILD_SHA__', `${pkg.version}-${sha}`)
await writeFile(dist, sw)
console.log(`sw stamped: bike-ops-${pkg.version}-${sha}-static`)
