import { first, nowIso } from '../db.js'
import { loadConfig, type AppConfig, type WorkerEnv } from '../env.js'
import { decryptShipHubSecret, encryptShipHubSecret } from '../lib/shiphub-crypto.js'
import { splitEncryptedBlob } from '../lib/shiphub-login.js'
import { MasterDataUpstreamError, performMasterDataLoginWithCredentials, type MasterDataClientConfig } from '../lib/masterdata-login.js'
import type { JwtProvider } from './bi-bikes.js'

// ── 门店 Cube 身份派生（2026-09-08）────────────────────────────────────
// 设计：门店在 Shiphub 设置里提交的本店账密是唯一凭据入口。同一账号在
// oxylane IdP（CubeInStore 原生受众）登录取得 JWT，驱动 perfeco/masterdata
// 门店数据链路——凭据属于谁就只拉谁，绝不跨店复用。
//
// 密钥职责（与 shiphub-sync 自愈注释同一纪律，绝不混用）：
//   loginKey            解密门店登录凭据（用户名/密码）
//   tokenEncryptionKey  加解密 cube token（写入与读取均用它）
//
// Token 生命周期：90 分钟有效（IdP 友好），失败后 10 分钟内不重试
// （防错误凭据反复打 IdP）。JWT 实际 2h 过期，预留 30 分钟刷新窗口。

const CUBE_TOKEN_TTL_MS = 90 * 60 * 1000
const CUBE_TOKEN_REFRESH_MARGIN_MS = 30 * 60 * 1000
const CUBE_FAILURE_COOLDOWN_MS = 10 * 60 * 1000

export type CubeAuthStatus = 'available' | 'pending' | 'unavailable'

export type CubeIdentityInfo = {
  status: CubeAuthStatus
  hasCredentials: boolean
  errorCode: string | null
  checkedAt: string | null
}

type CubeConnectionRow = {
  login_username_enc: string | null
  login_password_enc: string | null
  cube_token_ciphertext: string | null
  cube_token_nonce: string | null
  cube_token_expires_at: string | null
  cube_auth_status: string | null
  cube_auth_error_code: string | null
  cube_auth_checked_at: string | null
}

// CubeInStore 客户端配置（从 AppConfig 提取；appId/secret 为应用级常量）。
export function cubeClientConfig(config: AppConfig): MasterDataClientConfig {
  const md = config.MASTERDATA
  return {
    authorizeUrl: md.authorizeUrl,
    tokenUrl: md.tokenUrl,
    clientId: md.clientId!,
    clientSecret: md.clientSecret!,
    redirectUri: md.redirectUri,
    scope: md.scope
  }
}

// Cube 登录链路最低配置：CubeInStore client appId/secret + 两把密钥。
export function isCubeIdentityConfigured(config: AppConfig): boolean {
  return Boolean(
    config.MASTERDATA.clientId &&
    config.MASTERDATA.clientSecret &&
    config.SHIPHUB.loginKey &&
    config.SHIPHUB.tokenEncryptionKey
  )
}

async function readCubeConnection(db: D1Database, storeId: string): Promise<CubeConnectionRow | null> {
  return first(db.prepare(`
    SELECT login_username_enc, login_password_enc,
           cube_token_ciphertext, cube_token_nonce, cube_token_expires_at,
           cube_auth_status, cube_auth_error_code, cube_auth_checked_at
    FROM shiphub_connections
    WHERE store_id = ? AND enabled = 1
  `).bind(storeId))
}

function tokenUsable(row: CubeConnectionRow, now: Date): boolean {
  if (!row.cube_token_ciphertext || !row.cube_token_nonce || !row.cube_token_expires_at) return false
  const expires = Date.parse(row.cube_token_expires_at)
  if (!Number.isFinite(expires)) return false
  // 剩余寿命低于刷新窗口就当不可用，现场重登。
  return expires - now.getTime() > CUBE_TOKEN_REFRESH_MARGIN_MS
}

async function storeCubeToken(db: D1Database, config: AppConfig, storeId: string, accessToken: string, expiresAt: string): Promise<void> {
  const encrypted = await encryptShipHubSecret(accessToken, config.SHIPHUB.tokenEncryptionKey!)
  const stamp = nowIso()
  // 不写 updated_at（2026-09-08 事故）：该列曾被 Shiphub 自愈复用做冷却判定，
  // cube token 每小时刷新会把自愈冷却一再推后。cube 状态自有 cube_auth_checked_at。
  await db.prepare(`
    UPDATE shiphub_connections
    SET cube_token_ciphertext = ?, cube_token_nonce = ?, cube_token_key_version = 'v1',
        cube_token_expires_at = ?, cube_auth_status = 'available',
        cube_auth_error_code = NULL, cube_auth_checked_at = ?
    WHERE store_id = ?
  `).bind(encrypted.ciphertext, encrypted.nonce, expiresAt, stamp, storeId).run()
}

async function storeCubeFailure(db: D1Database, storeId: string, errorCode: string): Promise<void> {
  const stamp = nowIso()
  // 同上：不写 updated_at，冷却/业务时间戳解耦。
  await db.prepare(`
    UPDATE shiphub_connections
    SET cube_auth_status = 'unavailable', cube_auth_error_code = ?, cube_auth_checked_at = ?
    WHERE store_id = ?
  `).bind(errorCode, stamp, storeId).run()
}

// 读取本店 Cube 身份的公开状态（供连接卡/BI 面板展示；不含任何密文）。
export async function getCubeIdentityInfo(db: D1Database, storeId: string): Promise<CubeIdentityInfo> {
  const row = await readCubeConnection(db, storeId)
  if (!row) {
    return { status: 'unavailable', hasCredentials: false, errorCode: null, checkedAt: null }
  }
  const hasCredentials = Boolean(row.login_username_enc && row.login_password_enc)
  if (!hasCredentials) {
    return { status: 'unavailable', hasCredentials: false, errorCode: null, checkedAt: null }
  }
  const status = row.cube_auth_status === 'available' && tokenUsable(row, new Date())
    ? 'available'
    : row.cube_auth_error_code
      ? 'unavailable'
      : 'pending'
  return { status, hasCredentials: true, errorCode: row.cube_auth_error_code ?? null, checkedAt: row.cube_auth_checked_at ?? null }
}

// 本店凭据解密（loginKey）；连接行缺失/列缺失时返回 null。
async function readStoreCredentials(config: AppConfig, row: CubeConnectionRow): Promise<{ username: string; password: string } | null> {
  if (!row.login_username_enc || !row.login_password_enc || !config.SHIPHUB.loginKey) return null
  try {
    const usernameBlob = splitEncryptedBlob(row.login_username_enc)
    const passwordBlob = splitEncryptedBlob(row.login_password_enc)
    return {
      username: await decryptShipHubSecret(usernameBlob.ciphertext, usernameBlob.nonce, config.SHIPHUB.loginKey),
      password: await decryptShipHubSecret(passwordBlob.ciphertext, passwordBlob.nonce, config.SHIPHUB.loginKey)
    }
  } catch {
    // 密文损坏（旧版 loginKey 写入的历史行）：标记不可用，绝不重试打 IdP。
    return null
  }
}

// 门店 Cube JWT：优先命中缓存 token；否则用本店账密现场登录并落库。
// 失败（凭据错误/IdP 拒绝/损坏密文）→ 写 unavailable + 错误码，返回 null。
export async function ensureStoreCubeJwt(
  env: WorkerEnv,
  storeId: string,
  options: { now?: Date; skipFailureCooldown?: boolean } = {}
): Promise<string | null> {
  const config = loadConfig(env)
  if (!isCubeIdentityConfigured(config)) return null
  const now = options.now ?? new Date()
  const row = await readCubeConnection(env.DB, storeId)
  if (!row) return null
  // 凭据列存在性检查（不解密）：列缺失 = 门店没配账密，登录/刷新都无从谈起。
  // 2026-09-12 CPU 优化：旧实现无条件先解密 username+password（2 次 AES-GCM），
  // 但 token 可用时那两份明文根本用不上——cron tick 每分钟白烧 ~0.5ms。
  if (!row.login_username_enc || !row.login_password_enc) {
    await storeCubeFailure(env.DB, storeId, 'CUBE_CREDENTIALS_MISSING')
    return null
  }
  if (tokenUsable(row, now)) {
    try {
      return await decryptShipHubSecret(row.cube_token_ciphertext!, row.cube_token_nonce!, config.SHIPHUB.tokenEncryptionKey!)
    } catch {
      // 缓存密文损坏 → 走现场重登
    }
  }
  // 走到这里才需要登录：此时才解密本店凭据。
  const credentials = await readStoreCredentials(config, row)
  if (!credentials) {
    await storeCubeFailure(env.DB, storeId, 'CUBE_CREDENTIALS_MISSING')
    return null
  }
  // 失败冷却：10 分钟内不重试同一错误凭据（防 IdP 压力）。
  if (!options.skipFailureCooldown && row.cube_auth_checked_at && row.cube_auth_status === 'unavailable') {
    const lastAttempt = Date.parse(row.cube_auth_checked_at)
    if (Number.isFinite(lastAttempt) && now.getTime() - lastAttempt < CUBE_FAILURE_COOLDOWN_MS) return null
  }
  try {
    const { accessToken, expiresIn } = await performMasterDataLoginWithCredentials(cubeClientConfig(config), credentials)
    const expiresAt = new Date(now.getTime() + Math.min(expiresIn * 1000, CUBE_TOKEN_TTL_MS)).toISOString()
    await storeCubeToken(env.DB, config, storeId, accessToken, expiresAt)
    return accessToken
  } catch (error) {
    const code = error instanceof MasterDataUpstreamError ? error.code : 'CUBE_LOGIN_FAILED'
    // 失败必须留痕（2026-09-08 事故：cube 登录失败静默返回 null，端点 available:false，
    // 零日志零 DB 痕迹，「BI 同步暂不可用」排障无从下手）。Workers Logs 可查。
    const detail = error instanceof Error ? String(error.message).slice(0, 160) : String(error).slice(0, 160)
    console.error(`[cube] login failed store=${storeId} code=${code} err=${detail}`)
    await storeCubeFailure(env.DB, storeId, code)
    return null
  }
}

// 惰性 provider（同 lazyLoginJwt 的 promise 级 memoize）：单请求内多段链路
// 共享一次登录；失败清空允许下一次重试。返回 null 的 provider 会让上层
// 按可降级处理（available:false），绝不把 null token 打给上游。
export function lazyStoreCubeJwt(env: WorkerEnv, storeId: string): JwtProvider {
  let inflight: Promise<string | null> | null = null
  return () => {
    if (!inflight) {
      inflight = ensureStoreCubeJwt(env, storeId)
      inflight.catch(() => { inflight = null })
    }
    return inflight
  }
}

// 连接成功后的主动探测（waitUntil 异步）：跳过失败冷却（新凭据刚提交，
// 上一次失败的冷却不该挡住首次探测），探测完返回最新公开状态。
export async function probeStoreCubeIdentity(env: WorkerEnv, storeId: string): Promise<CubeIdentityInfo> {
  await ensureStoreCubeJwt(env, storeId, { skipFailureCooldown: true })
  return getCubeIdentityInfo(env.DB, storeId)
}
