import test from 'node:test'
import assert from 'node:assert/strict'
import { assertFormalReleaseInput, assertFormalReleaseManifest, assertFormalReleasePaths, assertFormalReleaseStartSha, assertPreviewManifest, assertResolvedPreviewCommitList, buildFormalReleaseManifest, buildPreviewManifest, firstFormalPreviewBaselineSha, parseNamedArgs } from '../scripts/version-policy.mjs'

const from = '1111111111111111111111111111111111111111'
const middle = '3333333333333333333333333333333333333333'
const to = '2222222222222222222222222222222222222222'
const previewCommits = [
  { sha: middle, subject: 'Preview cycle change' },
  { sha: to, subject: 'Accepted Preview source' }
]

test('首次正式发布固定从既有 V5.7.8 Preview 基线开始，后续连续衔接', () => {
  assert.doesNotThrow(() => assertFormalReleaseStartSha(firstFormalPreviewBaselineSha, undefined))
  assert.throws(() => assertFormalReleaseStartSha(from, undefined), /首次迁移基线/u)
  assert.doesNotThrow(() => assertFormalReleaseStartSha(from, from))
  assert.throws(() => assertFormalReleaseStartSha(to, from), /上一次正式发布提交/u)
})

test('Preview 源码登记保持公开版本并锁定当前指纹', () => {
  const manifest = buildPreviewManifest({ version: '5.7.8', fingerprint: 'abc', fileCount: 12, gitSha: to, recordedAt: '2026-07-24T00:00:00.000Z' })
  assert.equal(manifest.publicVersion, '5.7.8')
  assertPreviewManifest(manifest, { version: '5.7.8', fingerprint: 'abc', fileCount: 12, gitSha: to })
  assert.throws(() => assertPreviewManifest(manifest, { version: '5.7.9', fingerprint: 'abc', fileCount: 12, gitSha: to }), /不一致/u)
  assert.throws(() => assertPreviewManifest(manifest, { version: '5.7.8', fingerprint: 'changed', fileCount: 12, gitSha: to }), /禁止为 Preview 递增公开版本/u)
  assert.throws(() => assertPreviewManifest(manifest, { version: '5.7.8', fingerprint: 'abc', fileCount: 12, gitSha: from }), /SHA/u)
})

test('公开版本递增只接受正式发布、已验收 Preview 区间和汇总公告', () => {
  const valid = parseNamedArgs(['--formal-release', 'true', '--preview-from', from, '--preview-to', to, '--title', '正式发布', '--summary', '汇总公告', '--change', '变更一'])
  assert.doesNotThrow(() => assertFormalReleaseInput(valid))
  assert.throws(() => assertFormalReleaseInput({ ...valid, 'formal-release': 'false' }), /正式 Production 发布准备/u)
  assert.throws(() => assertFormalReleaseInput({ ...valid, 'preview-to': 'bad' }), /preview-to/u)
  assert.throws(() => assertFormalReleaseInput({ ...valid, change: [] }), /汇总更新公告/u)
})

test('正式发布不能在已验收 Preview 后夹带功能改动', () => {
  const formalPaths = [
    'package.json',
    'apps/web/package.json',
    'apps/web/src/data/releaseNotes.js',
    'formal-release.json',
    'version-manifest.json'
  ]
  assert.doesNotThrow(() => assertFormalReleasePaths(formalPaths))
  assert.throws(() => assertFormalReleasePaths([...formalPaths, 'apps/web/src/App.jsx']), /未验收改动/u)
  assert.throws(() => assertFormalReleasePaths(formalPaths.filter((path) => path !== 'version-manifest.json')), /缺少必需/u)
})

test('正式发布标记保存完整 Preview 周期公告并要求版本一致', () => {
  const manifest = buildFormalReleaseManifest({ version: '5.7.9', previewFrom: from, previewTo: to, previewCommits, title: '正式发布', summary: '汇总 Preview', changes: ['变更一', '变更二'], preparedAt: '2026-07-24T00:00:00.000Z' })
  assertFormalReleaseManifest(manifest, '5.7.9')
  assert.throws(() => assertFormalReleaseManifest(manifest, '5.8.0'), /不一致/u)
  assert.throws(() => assertFormalReleaseManifest({ ...manifest, announcement: { ...manifest.announcement, changes: [] } }, '5.7.9'), /汇总更新公告/u)
  assert.throws(() => assertFormalReleaseManifest({ ...manifest, previewRange: { ...manifest.previewRange, commits: [previewCommits[0]] } }, '5.7.9'), /未包含已验收/u)
  assert.throws(() => assertFormalReleaseManifest({ ...manifest, previewRange: { ...manifest.previewRange, commits: [{ sha: from, subject: 'Boundary' }, ...previewCommits] } }, '5.7.9'), /不能包含 Preview 起点/u)
  assert.doesNotThrow(() => assertResolvedPreviewCommitList(manifest, previewCommits))
  assert.throws(() => assertResolvedPreviewCommitList(manifest, [...previewCommits].reverse()), /Git 区间不一致/u)
})
