import { performMasterDataLoginWithCredentials, type MasterDataClientConfig } from '../lib/masterdata-login.js'
import { decryptShipHubSecret } from '../lib/shiphub-crypto.js'
import { splitEncryptedBlob } from '../lib/shiphub-login.js'
import type { AppConfig, SnbConfig } from '../env.js'

// ── SNB（Stock'n Business）身份（2026-09-18）────────────────────────────────
// 食品自动登记影子系统的上游身份分两类，本模块只管 SNB 一类：
//   ① SNB JWT         → api.decathlon.net（RDS 效期查询 / stockcontrol-bff）
//   ② CubeInStore JWT → api-cn.decathlon.com.cn（stock-reception 收货单）
// 两者同为 oxylane IdP 的 PKCE 程序化登录（纯 HTTP、无 OTP），只是 client /
// redirect 各自注册：SNB 走 com.decathlon.inventory，Cube 走 cubeinstore
// （②复用 lib/masterdata-login 的部署级凭据链路）。
//
// 凭据纪律：CHU13 账密 AES-256-GCM 加密存 CF secret，明文只在登录瞬间存在
// 于内存，绝不进日志 / 审计 / D1。token 内存缓存（同 isolate 复用），
// 跨 isolate 各自登录一次——与 BI masterdata 同策略（实测每 isolate 一次登录，
// 不构成 IdP 压力）。
//
// 门店边界（铁律）：部署级凭据只服务绑定门店（FOOD_AUTO_BOUND_STORE=1299），
// 调用方路由在进入前校验 storeCode，本模块不感知门店。

const AUTHORIZE_URL = 'https://idpdecathlon.oxylane.com/as/authorization.oauth2'
const TOKEN_URL = 'https://idpdecathlon.oxylane.com/as/token.oauth2'
const REDIRECT_URI = 'com.decathlon.authentication://com.decathlon.inventory'
const SCOPE = 'openid profile'

// 提前 20 分钟刷新（JWT 实测 2h 过期），避免边界上拿到将失效 token。
const TOKEN_REFRESH_MARGIN_MS = 20 * 60 * 1000

type CachedToken = { token: string; expiresAt: number }

let snbTokenCache: CachedToken | null = null

/** SNB 链路最低配置：client 身份 + 账密密文 + RDS / 收货单网关 key。 */
export function isSnbConfigured(config: AppConfig): boolean {
  const snb = config.SNB
  return Boolean(
    snb.clientId &&
      snb.clientSecret &&
      snb.loginKey &&
      snb.loginUsernameEnc &&
      snb.loginPasswordEnc &&
      snb.rdsApiKey &&
      snb.receptionApiKey &&
      snb.movementsApiKey
  )
}

export function snbUpstreamError(code: string, status?: number, retryable = false): Error {
  const error = new Error(code) as Error & { code: string; status?: number; retryable: boolean }
  error.code = code
  error.status = status
  error.retryable = retryable
  return error
}

async function readSnbCredentials(snb: SnbConfig): Promise<{ username: string; password: string }> {
  const usernameBlob = splitEncryptedBlob(snb.loginUsernameEnc!)
  const passwordBlob = splitEncryptedBlob(snb.loginPasswordEnc!)
  const username = await decryptShipHubSecret(usernameBlob.ciphertext, usernameBlob.nonce, snb.loginKey!)
  const password = await decryptShipHubSecret(passwordBlob.ciphertext, passwordBlob.nonce, snb.loginKey!)
  return { username, password }
}

function snbClientConfig(snb: SnbConfig): MasterDataClientConfig {
  return {
    authorizeUrl: AUTHORIZE_URL,
    tokenUrl: TOKEN_URL,
    clientId: snb.clientId!,
    clientSecret: snb.clientSecret!,
    redirectUri: REDIRECT_URI,
    scope: SCOPE
  }
}

/**
 * 取 SNB access token（内存缓存，过期前 20 分钟刷新）。
 * force=true 时忽略缓存强制重登（token 被服务端提前失效时由调用方重试触发）。
 */
export async function getSnbToken(config: AppConfig, options: { force?: boolean } = {}): Promise<string> {
  const now = Date.now()
  if (!options.force && snbTokenCache && now < snbTokenCache.expiresAt - TOKEN_REFRESH_MARGIN_MS) {
    return snbTokenCache.token
  }
  const credentials = await readSnbCredentials(config.SNB)
  const { accessToken, expiresIn } = await performMasterDataLoginWithCredentials(snbClientConfig(config.SNB), credentials)
  snbTokenCache = { token: accessToken, expiresAt: now + expiresIn * 1000 }
  return accessToken
}

/** 测试辅助：清空内存 token 缓存。 */
export function resetSnbTokenCache(): void {
  snbTokenCache = null
}
