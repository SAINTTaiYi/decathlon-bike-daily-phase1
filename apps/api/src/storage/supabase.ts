import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import type { AppConfig } from '../config.js'
import { ApiProblem } from '../services/idempotency.js'

interface StorageErrorLike {
  message?: string
}

interface StorageResult<T> {
  data: T | null
  error: StorageErrorLike | null
}

export interface SupabaseStorageBucketClient {
  createSignedUploadUrl(path: string, options: { upsert: boolean }): Promise<StorageResult<{ signedUrl: string }>>
  createSignedUrl(path: string, expiresIn: number): Promise<StorageResult<{ signedUrl: string }>>
  info(path: string): Promise<StorageResult<{
    size?: number
    contentType?: string
    metadata?: Record<string, unknown>
  }>>
  download(path: string): Promise<StorageResult<Blob>>
  remove(paths: string[]): Promise<{ error: StorageErrorLike | null }>
}

export interface SupabaseMediaStorage {
  bucket: string
  bucketClient: SupabaseStorageBucketClient
}

function storageFailure(operation: string, _error: StorageErrorLike | null): never {
  throw new ApiProblem(502, 'MEDIA_STORAGE_ERROR', `图片存储${operation}失败，请稍后重试。`)
}

export function createSupabaseStorage(config: AppConfig): SupabaseMediaStorage | null {
  if (!config.SUPABASE_URL || !config.SUPABASE_SECRET_KEY) return null
  const client = createClient(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  })
  return {
    bucket: config.SUPABASE_STORAGE_BUCKET,
    bucketClient: client.storage.from(config.SUPABASE_STORAGE_BUCKET) as unknown as SupabaseStorageBucketClient
  }
}

export function requireSupabaseStorage(storage: SupabaseMediaStorage | null): SupabaseMediaStorage {
  if (!storage) throw new ApiProblem(503, 'MEDIA_NOT_CONFIGURED', '图片存储尚未配置。')
  return storage
}

export async function signUpload(storage: SupabaseMediaStorage, key: string, mimeType: string, sha256: string): Promise<{
  uploadUrl: string
  expiresIn: number
  requiredHeaders: Record<string, string>
}> {
  const { data, error } = await storage.bucketClient.createSignedUploadUrl(key, { upsert: false })
  if (error || !data) storageFailure('签名', error)
  return {
    uploadUrl: data.signedUrl,
    expiresIn: 7200,
    requiredHeaders: {
      'content-type': mimeType,
      'cache-control': 'max-age=3600',
      'x-upsert': 'false',
      'x-metadata': Buffer.from(JSON.stringify({ sha256 }), 'utf8').toString('base64')
    }
  }
}

export async function signDownload(storage: SupabaseMediaStorage, key: string): Promise<string> {
  const { data, error } = await storage.bucketClient.createSignedUrl(key, 300)
  if (error || !data) storageFailure('下载签名', error)
  return data.signedUrl
}

export async function verifyObject(storage: SupabaseMediaStorage, key: string, byteSize: number, mimeType: string, sha256: string): Promise<void> {
  const { data, error } = await storage.bucketClient.info(key)
  if (error || !data) storageFailure('校验', error)
  const metadata = data.metadata ?? {}
  const actualSize = Number(data.size ?? metadata.size ?? metadata.contentLength ?? 0)
  const actualMime = String(data.contentType ?? metadata.mimetype ?? '')
  const declaredSha256 = String(metadata.sha256 ?? '')
  if (actualSize !== byteSize || actualMime !== mimeType || declaredSha256 !== sha256) {
    throw new ApiProblem(422, 'MEDIA_VERIFICATION_FAILED', '上传文件大小、类型或摘要校验失败。')
  }
  const downloaded = await storage.bucketClient.download(key)
  if (downloaded.error || !downloaded.data) storageFailure('摘要校验', downloaded.error)
  const actualSha256 = createHash('sha256').update(Buffer.from(await downloaded.data.arrayBuffer())).digest('hex')
  if (actualSha256 !== sha256) {
    throw new ApiProblem(422, 'MEDIA_VERIFICATION_FAILED', '上传文件摘要校验失败。')
  }
}

export async function deleteObject(storage: SupabaseMediaStorage, key: string): Promise<void> {
  const { error } = await storage.bucketClient.remove([key])
  if (error) throw new Error(`SUPABASE_STORAGE_DELETE_FAILED · ${error.message ?? 'unknown'}`)
}
