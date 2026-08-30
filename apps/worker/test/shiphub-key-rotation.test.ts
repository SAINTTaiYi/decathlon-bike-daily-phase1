import assert from 'node:assert/strict'
import test from 'node:test'
import type { AppConfig, WorkerEnv } from '../src/env.js'
import { encryptShipHubSecret } from '../src/lib/shiphub-crypto.js'
import { readRefreshToken } from '../src/lib/shiphub-oauth.js'
import { ShipHubUpstreamError } from '../src/lib/shiphub-client.js'
import { getShipHubConnection, syncStoreCategory } from '../src/services/shiphub-sync.js'
import { migratedTestDatabase, type TestD1Database } from '../security/d1-test-adapter.js'

// 2026-08-30 生产事故回归：SHIPHUB_LOGIN_KEY 轮换后，库里 refresh token 密文
// 仍是旧密钥加密的，解密必然失败。旧实现把该失败归入通用 SYNC_FAILED，既不标
// reauth_required 也不自愈，连接永久停在假 connected —— 状态绿、148 次同步全挂、
// 门店点「同步」毫无反应。本文件锁住三件事：可识别错误码、状态降级、UI 可见。

const STORE = 'key-rotation-store'
const LOCATION = '0070129901299'
const FINGERPRINT = 'a'.repeat(64)
const OLD_KEY = 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE'
const NEW_KEY = 'AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI'

const base: AppConfig = {
  APP_ENV: 'staging',
  APP_VERSION: '6.3.1',
  GIT_SHA: 'test',
  COOKIE_SECURE: true,
  SESSION_TTL_HOURS: 12,
  allowedOrigins: ['https://example.test'],
  SESSION_SECRET: 'x'.repeat(32),
  CSRF_SECRET: 'y'.repeat(32),
  PASSWORD_PEPPER: 'z'.repeat(32),
  SHIPHUB: {
    enabled: true,
    mode: 'live',
    liveConfirmed: true,
    requestTimeoutMs: 1000,
    activeStartHour: 10,
    activeEndHour: 22,
    tokenEncryptionKey: NEW_KEY
  }
} as unknown as AppConfig

async function database(): Promise<TestD1Database> {
  const db = await migratedTestDatabase()
  db.exec(`INSERT INTO stores (id, code, name, timezone, status, created_at, updated_at) VALUES ('${STORE}', 'ROT', 'Rotation Store', 'Asia/Shanghai', 'active', '2026-08-18T00:00:00.000Z', '2026-08-18T00:00:00.000Z')`)
  return db
}

// 用旧密钥真实加密写库，再用新密钥去读 —— 复刻生产状态，不是 mock 出来的失败。
async function seedStaleCiphertext(db: TestD1Database): Promise<void> {
  const stale = await encryptShipHubSecret('refresh-token-encrypted-with-old-key', OLD_KEY)
  db.exec(`INSERT INTO shiphub_connections (store_id, enabled, mode, refresh_token_ciphertext, refresh_token_nonce, refresh_token_key_version, location_num, identity_fingerprint, authorization_status, created_at, updated_at)
           VALUES ('${STORE}', 1, 'live', '${stale.ciphertext}', '${stale.nonce}', 'v1', '${LOCATION}', '${FINGERPRINT}', 'connected', '2026-08-18T00:00:00.000Z', '2026-08-18T00:00:00.000Z')`)
}

test('密钥轮换后解密失败必须抛 REFRESH_TOKEN_UNDECRYPTABLE，而不是沉默的通用错误', async () => {
  const db = await database()
  try {
    const stale = await encryptShipHubSecret('token', OLD_KEY)
    await assert.rejects(
      () => readRefreshToken(base, { refresh_token_ciphertext: stale.ciphertext, refresh_token_nonce: stale.nonce }),
      (error: unknown) => {
        assert.ok(error instanceof ShipHubUpstreamError, '必须是可识别的上游错误类型')
        assert.equal((error as ShipHubUpstreamError).code, 'REFRESH_TOKEN_UNDECRYPTABLE', '错误码必须可识别，否则无法触发自愈与降级')
        return true
      }
    )
    // 反证：用正确密钥必须能解出原值，确认失败来自密钥不匹配而非加密实现坏了
    const fresh = await encryptShipHubSecret('token', NEW_KEY)
    assert.equal(await readRefreshToken(base, { refresh_token_ciphertext: fresh.ciphertext, refresh_token_nonce: fresh.nonce }), 'token')
  } finally {
    db.close()
  }
})

test('解密失败的同步必须把连接标成 reauth_required 并落下错误码，不得留在假 connected', async () => {
  const db = await database()
  await seedStaleCiphertext(db)
  try {
    const result = await syncStoreCategory(db as unknown as D1Database, base, STORE, 'hand', {
      trigger: 'authorization',
      now: new Date('2026-08-19T04:00:00.000Z') // 北京 12:00，营业时间内
    })
    assert.equal(result.status, 'failed', '解密失败必须是 failed，不能报成 skipped 或 succeeded')
    assert.equal(result.reason, 'REFRESH_TOKEN_UNDECRYPTABLE', '失败原因必须透传可识别错误码')

    const connection = await getShipHubConnection(db as unknown as D1Database, STORE)
    assert.equal(connection?.authorizationStatus, 'reauth_required', '必须降级为 reauth_required，这是自愈与前端提示的前提')
    assert.equal(connection?.lastAuthErrorCode, 'REFRESH_TOKEN_UNDECRYPTABLE', '错误码必须持久化，前端据此判定 degraded')
  } finally {
    db.close()
  }
})

test('连接状态为 connected 但残留 last_auth_error_code 时，摘要必须暴露该错误码供前端降级', async () => {
  const db = await database()
  const stale = await encryptShipHubSecret('token', OLD_KEY)
  // 复刻事故现场：状态是 connected，但错误码还挂着（旧实现前端完全忽略它）
  db.exec(`INSERT INTO shiphub_connections (store_id, enabled, mode, refresh_token_ciphertext, refresh_token_nonce, refresh_token_key_version, location_num, identity_fingerprint, authorization_status, last_auth_error_code, created_at, updated_at)
           VALUES ('${STORE}', 1, 'live', '${stale.ciphertext}', '${stale.nonce}', 'v1', '${LOCATION}', '${FINGERPRINT}', 'connected', 'REFRESH_TOKEN_UNDECRYPTABLE', '2026-08-18T00:00:00.000Z', '2026-08-18T00:00:00.000Z')`)
  try {
    const connection = await getShipHubConnection(db as unknown as D1Database, STORE)
    assert.equal(connection?.authorizationStatus, 'connected')
    assert.equal(connection?.lastAuthErrorCode, 'REFRESH_TOKEN_UNDECRYPTABLE', '摘要必须把错误码带到前端，否则「假绿」无法被发现')
  } finally {
    db.close()
  }
})
