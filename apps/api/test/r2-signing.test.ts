import test from 'node:test'
import assert from 'node:assert/strict'
import { createR2, requireR2, signDownload, signUpload } from '../src/storage/r2.js'

const config = {
  R2_ENDPOINT: 'https://example.r2.cloudflarestorage.com',
  R2_ACCESS_KEY_ID: 'test-access-key',
  R2_SECRET_ACCESS_KEY: 'test-secret-key',
  R2_BUCKET: 'bike-ops-staging-media'
} as never

test('R2 PUT 预签名只授权指定对象、MIME 和 SHA-256 元数据', async () => {
  const storage = requireR2(createR2(config), config)
  const url = new URL(await signUpload(storage.client, storage.bucket, 'staging/store/item/photo.webp', 'image/webp', 1024, 'a'.repeat(64)))
  assert.equal(url.hostname, 'example.r2.cloudflarestorage.com')
  assert.match(url.pathname, /bike-ops-staging-media\/staging\/store\/item\/photo\.webp/u)
  assert.equal(url.searchParams.get('X-Amz-Algorithm'), 'AWS4-HMAC-SHA256')
  assert.equal(url.searchParams.get('X-Amz-Expires'), '300')
  assert.match(url.searchParams.get('X-Amz-SignedHeaders') ?? '', /content-type;host;x-amz-meta-sha256/u)
  assert.match(url.searchParams.get('X-Amz-Signature') ?? '', /^[a-f0-9]{64}$/u)
})

test('R2 GET 预签名不泄露 Secret Access Key', async () => {
  const storage = requireR2(createR2(config), config)
  const url = await signDownload(storage.client, storage.bucket, 'production/store/item/photo.jpg')
  assert.equal(url.includes('test-secret-key'), false)
})
