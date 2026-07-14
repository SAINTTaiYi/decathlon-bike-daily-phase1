import { createHash, createHmac } from 'node:crypto'
import type { AppConfig } from '../config.js'
import { ApiProblem } from '../services/idempotency.js'

interface R2Client {
  endpoint: URL
  accessKeyId: string
  secretAccessKey: string
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac('sha256', key).update(value).digest()
}

function encode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/gu, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
}

function objectPath(bucket: string, key: string): string {
  return `/${encode(bucket)}/${key.split('/').map(encode).join('/')}`
}

function timestamp(now = new Date()): { amzDate: string; dateStamp: string } {
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/gu, '')
  return { amzDate, dateStamp: amzDate.slice(0, 8) }
}

function signingKey(secret: string, dateStamp: string): Buffer {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, dateStamp), 'auto'), 's3'), 'aws4_request')
}

function canonicalQuery(values: Record<string, string>): string {
  return Object.entries(values).sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${encode(key)}=${encode(value)}`).join('&')
}

function presignedUrl(client: R2Client, bucket: string, key: string, method: 'GET' | 'PUT', expiresIn: number, headers: Record<string, string> = {}): string {
  const { amzDate, dateStamp } = timestamp()
  const scope = `${dateStamp}/auto/s3/aws4_request`
  const canonicalUri = objectPath(bucket, key)
  const normalizedHeaders = Object.fromEntries(Object.entries({ host: client.endpoint.host, ...headers }).map(([name, value]) => [name.toLowerCase(), value.trim()]))
  const signedHeaders = Object.keys(normalizedHeaders).sort().join(';')
  const headerBlock = Object.entries(normalizedHeaders).sort(([left], [right]) => left.localeCompare(right)).map(([name, value]) => `${name}:${value}\n`).join('')
  const query: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${client.accessKeyId}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresIn),
    'X-Amz-SignedHeaders': signedHeaders
  }
  const canonical = `${method}\n${canonicalUri}\n${canonicalQuery(query)}\n${headerBlock}\n${signedHeaders}\nUNSIGNED-PAYLOAD`
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${hash(canonical)}`
  query['X-Amz-Signature'] = createHmac('sha256', signingKey(client.secretAccessKey, dateStamp)).update(stringToSign).digest('hex')
  return new URL(`${canonicalUri}?${canonicalQuery(query)}`, client.endpoint).toString()
}

async function signedRequest(client: R2Client, bucket: string, key: string, method: 'HEAD' | 'DELETE'): Promise<Response> {
  const { amzDate, dateStamp } = timestamp()
  const scope = `${dateStamp}/auto/s3/aws4_request`
  const canonicalUri = objectPath(bucket, key)
  const payloadHash = hash('')
  const headers = {
    host: client.endpoint.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate
  }
  const signedHeaders = Object.keys(headers).sort().join(';')
  const headerBlock = Object.entries(headers).sort(([left], [right]) => left.localeCompare(right)).map(([name, value]) => `${name}:${value}\n`).join('')
  const canonical = `${method}\n${canonicalUri}\n\n${headerBlock}\n${signedHeaders}\n${payloadHash}`
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${hash(canonical)}`
  const signature = createHmac('sha256', signingKey(client.secretAccessKey, dateStamp)).update(stringToSign).digest('hex')
  const authorization = `AWS4-HMAC-SHA256 Credential=${client.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
  return fetch(new URL(canonicalUri, client.endpoint), {
    method,
    headers: {
      Authorization: authorization,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate
    }
  })
}

export function createR2(config: AppConfig): R2Client | null {
  if (!config.R2_ENDPOINT || !config.R2_ACCESS_KEY_ID || !config.R2_SECRET_ACCESS_KEY || !config.R2_BUCKET) return null
  return { endpoint: new URL(config.R2_ENDPOINT), accessKeyId: config.R2_ACCESS_KEY_ID, secretAccessKey: config.R2_SECRET_ACCESS_KEY }
}

export function requireR2(client: R2Client | null, config: AppConfig): { client: R2Client; bucket: string } {
  if (!client || !config.R2_BUCKET) throw new ApiProblem(503, 'MEDIA_NOT_CONFIGURED', '图片存储尚未配置。')
  return { client, bucket: config.R2_BUCKET }
}

export async function signUpload(client: R2Client, bucket: string, key: string, mimeType: string, _byteSize: number, sha256: string): Promise<string> {
  return presignedUrl(client, bucket, key, 'PUT', 300, { 'content-type': mimeType, 'x-amz-meta-sha256': sha256 })
}

export async function signDownload(client: R2Client, bucket: string, key: string): Promise<string> {
  return presignedUrl(client, bucket, key, 'GET', 300)
}

export async function verifyObject(client: R2Client, bucket: string, key: string, byteSize: number, sha256: string): Promise<void> {
  const response = await signedRequest(client, bucket, key, 'HEAD')
  if (!response.ok || Number(response.headers.get('content-length')) !== byteSize || response.headers.get('x-amz-meta-sha256') !== sha256) {
    throw new ApiProblem(422, 'MEDIA_VERIFICATION_FAILED', '上传文件大小或摘要校验失败。')
  }
}

export async function deleteObject(client: R2Client, bucket: string, key: string): Promise<void> {
  const response = await signedRequest(client, bucket, key, 'DELETE')
  if (!response.ok && response.status !== 404) throw new Error(`R2_DELETE_FAILED_${response.status}`)
}
