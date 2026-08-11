import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { ApiProblem } from '../src/services/idempotency.js'
import {
  deleteObject,
  signDownload,
  signUpload,
  verifyObject,
  type SupabaseMediaStorage,
  type SupabaseStorageBucketClient
} from '../src/storage/supabase.js'

const fileBody = Buffer.from('verified-image-body')
const fileSha256 = createHash('sha256').update(fileBody).digest('hex')

function storage(overrides: Partial<SupabaseStorageBucketClient> = {}): SupabaseMediaStorage {
  const bucketClient: SupabaseStorageBucketClient = {
    async createSignedUploadUrl() {
      return { data: { signedUrl: 'https://example.supabase.co/storage/v1/object/upload/sign/bike-ops-media/a.jpg?token=signed-token' }, error: null }
    },
    async createSignedUrl() {
      return { data: { signedUrl: 'https://example.supabase.co/storage/v1/object/sign/bike-ops-media/a.jpg?token=download-token' }, error: null }
    },
    async info() {
      return { data: { size: fileBody.byteLength, contentType: 'image/jpeg', metadata: { sha256: fileSha256 } }, error: null }
    },
    async download() {
      return { data: new Blob([fileBody], { type: 'image/jpeg' }), error: null }
    },
    async remove() {
      return { error: null }
    },
    ...overrides
  }
  return { bucket: 'bike-ops-media', bucketClient }
}

test('Supabase signed upload 只暴露对象级 URL、MIME、缓存与 SHA-256 元数据', async () => {
  const result = await signUpload(storage(), 'staging/store/item/a.jpg', 'image/jpeg', fileSha256)
  assert.match(result.uploadUrl, /object\/upload\/sign\/bike-ops-media/u)
  assert.equal(result.expiresIn, 7200)
  assert.equal(result.requiredHeaders['content-type'], 'image/jpeg')
  assert.equal(result.requiredHeaders['x-upsert'], 'false')
  const metadata = JSON.parse(Buffer.from(result.requiredHeaders['x-metadata']!, 'base64').toString('utf8'))
  assert.deepEqual(metadata, { sha256: fileSha256 })
  assert.doesNotMatch(result.uploadUrl, /sb_secret|service_role|SUPABASE_SECRET_KEY/u)
})

test('Supabase private download 使用短期签名 URL', async () => {
  const url = await signDownload(storage(), 'staging/store/item/a.jpg')
  assert.match(url, /object\/sign\/bike-ops-media/u)
  assert.match(url, /token=download-token/u)
})

test('Supabase 对象完成确认验证大小、MIME 与 SHA-256', async () => {
  await verifyObject(storage(), 'staging/store/item/a.jpg', fileBody.byteLength, 'image/jpeg', fileSha256)
  await assert.rejects(
    verifyObject(storage(), 'staging/store/item/a.jpg', fileBody.byteLength + 1, 'image/jpeg', fileSha256),
    (error: unknown) => error instanceof ApiProblem && error.code === 'MEDIA_VERIFICATION_FAILED'
  )
  await assert.rejects(
    verifyObject(storage({ async download() { return { data: new Blob(['tampered'], { type: 'image/jpeg' }), error: null } } }), 'staging/store/item/a.jpg', fileBody.byteLength, 'image/jpeg', fileSha256),
    (error: unknown) => error instanceof ApiProblem && error.code === 'MEDIA_VERIFICATION_FAILED'
  )
})

test('Supabase 删除只提交单个对象路径并传播错误', async () => {
  const removed: string[][] = []
  await deleteObject(storage({ async remove(paths) { removed.push(paths); return { error: null } } }), 'staging/store/item/a.jpg')
  assert.deepEqual(removed, [['staging/store/item/a.jpg']])
  await assert.rejects(
    deleteObject(storage({ async remove() { return { error: { message: 'denied' } } } }), 'staging/store/item/a.jpg'),
    /SUPABASE_STORAGE_DELETE_FAILED/u
  )
})
