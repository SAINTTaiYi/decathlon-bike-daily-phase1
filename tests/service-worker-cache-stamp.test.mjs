import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const sw = readFileSync(new URL('../apps/web/public/sw.js', import.meta.url), 'utf8')
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const webBuild = readFileSync(new URL('../apps/web/package.json', import.meta.url), 'utf8')

test('sw.js 缓存版本由构建注入版本+SHA，杜绝旧版滞留', () => {
  assert.match(sw, /__BUILD_SHA__/u)
  assert.match(webBuild, /vite build && node ..\/..\/scripts\/stamp-sw\.mjs/u)
  assert.ok(pkg.version, 'package.json version must exist for the stamp')
})

test('stamp-sw.mjs 存在且会把占位符替换为版本-SHA', () => {
  const stamp = readFileSync(new URL('../scripts/stamp-sw.mjs', import.meta.url), 'utf8')
  assert.match(stamp, /__BUILD_SHA__/u)
  assert.match(stamp, /git rev-parse --short HEAD/u)
  assert.match(stamp, /replaceAll\('__BUILD_SHA__'/u)
})
