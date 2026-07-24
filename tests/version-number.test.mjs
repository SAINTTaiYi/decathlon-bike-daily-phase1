import test from 'node:test'
import assert from 'node:assert/strict'
import { nextInterfaceVersion } from '../scripts/version-number.mjs'
import { spawnSync } from 'node:child_process'

test('界面补丁版本正常递增到 10', () => {
  assert.equal(nextInterfaceVersion('5.1.9'), '5.1.10')
})

test('末尾版本号为 10 时自动推进中间版本并归零', () => {
  assert.equal(nextInterfaceVersion('5.1.10'), '5.2.0')
  assert.equal(nextInterfaceVersion('5.2.10'), '5.3.0')
})

test('版本递增拒绝非三段式版本号', () => {
  assert.throws(() => nextInterfaceVersion('5.1'), /三段式版本号/)
})

test('版本脚本接受 pnpm 传入的独立参数分隔符', () => {
  const result = spawnSync(process.execPath, ['scripts/bump-version.mjs', '--'], { cwd: process.cwd(), encoding: 'utf8' })
  assert.notEqual(result.status, 0)
  assert.doesNotMatch(result.stderr, /-- 缺少内容/u)
  assert.match(result.stderr, /正式 Production 发布准备/u)
})
