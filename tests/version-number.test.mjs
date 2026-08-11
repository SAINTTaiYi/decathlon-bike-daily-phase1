import test from 'node:test'
import assert from 'node:assert/strict'
import { nextInterfaceVersion, resolveReleaseVersion } from '../scripts/version-number.mjs'
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

test('未传 --set-version 时正式发布沿用界面自然递增', () => {
  assert.equal(resolveReleaseVersion('5.8.3'), '5.8.4')
  assert.equal(resolveReleaseVersion('5.8.3', undefined), '5.8.4')
  assert.equal(resolveReleaseVersion('5.8.3', ''), '5.8.4')
  assert.equal(resolveReleaseVersion('5.8.10'), '5.9.0')
})

test('--set-version 可跳过被回滚烧掉的版本号', () => {
  assert.equal(resolveReleaseVersion('5.8.3', '5.9.0'), '5.9.0')
  assert.equal(resolveReleaseVersion('5.8.3', '5.8.6'), '5.8.6')
  assert.equal(resolveReleaseVersion('5.9.10', '5.10.0'), '5.10.0')
})

test('--set-version 拒绝非三段式版本号', () => {
  assert.throws(() => resolveReleaseVersion('5.8.3', '5.9'), /--set-version 必须是三段式版本号/u)
  assert.throws(() => resolveReleaseVersion('5.8.3', 'v5.9.0'), /--set-version 必须是三段式版本号/u)
  assert.throws(() => resolveReleaseVersion('5.8.3', '5.9.0-rc.1'), /--set-version 必须是三段式版本号/u)
})

test('--set-version 必须严格大于当前版本，禁止降级或重复发布', () => {
  assert.throws(() => resolveReleaseVersion('5.8.3', '5.8.3'), /必须严格大于当前版本/u)
  assert.throws(() => resolveReleaseVersion('5.8.3', '5.8.2'), /必须严格大于当前版本/u)
  assert.throws(() => resolveReleaseVersion('5.8.3', '5.7.9'), /必须严格大于当前版本/u)
  assert.throws(() => resolveReleaseVersion('5.10.0', '5.9.0'), /必须严格大于当前版本/u)
})

test('--set-version 不绕过正式发布门禁', () => {
  const result = spawnSync(process.execPath, ['scripts/bump-version.mjs', '--set-version', '5.9.0'], { cwd: process.cwd(), encoding: 'utf8' })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /正式 Production 发布准备/u)
})
