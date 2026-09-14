import type { Context } from 'hono'
import type { AppConfig } from '../env.js'
import { keyedHash, randomToken, safeEqualHex } from '../lib/crypto.js'

// 会话 cookie（2026-09-15 三站 SSO 定案）：
//
// 背景：原先用 `__Host-` 前缀。`__Host-` 强制 host-only（规范禁止它携带 Domain），
// 于是 workshop.skin / eat.workshop.skin / mass.workshop.skin 各自独立登录 ——
// 用户从 Ops 点进食品台账还要再登一次（2026-09-15 用户明确要求去掉这一步）。
//
// 现在改为 `__Secure-` 前缀 + **仅正式域名**带 `Domain=.workshop.skin`，一次登录
// 三站通用。取舍与护栏：
//   ① `__Secure-` 与 `__Host-` 同为浏览器强制的安全前缀（要求 Secure/HTTPS），
//      只是允许携带 Domain —— 这正是跨子域共享的前提；
//   ② Domain 只在 workshop.skin 及其子域启用：预览站（*.workers.dev）与本地仍是
//      host-only，不扩大暴露面；
//   ③ 会话令牌本身仍是服务端签名（keyedHash）+ 库内哈希比对，子域即使能覆写
//      cookie 也无法伪造有效会话，最坏情况只是把本人登出（DoS 级）；
//   ④ 三个子域当前都指向同一个 Worker，不存在「第三方子域拿到会话」的新面孔。
export const SESSION_COOKIE_BASE = 'bike_ops_session'
/** 旧 cookie 名（`__Host-` 前缀版）：仅用于过渡期读取与清理，不再签发。 */
export const LEGACY_SESSION_COOKIE = '__Host-bike_ops_session'
/** 跨子域共享的 cookie 作用域。 */
export const SHARED_COOKIE_DOMAIN = '.workshop.skin'

/** 当前部署应使用的会话 cookie 名：HTTPS 环境带 `__Secure-` 前缀。 */
export function sessionCookieName(config: Pick<AppConfig, 'COOKIE_SECURE'>): string {
  return config.COOKIE_SECURE ? `__Secure-${SESSION_COOKIE_BASE}` : SESSION_COOKIE_BASE
}

/**
 * 会话 cookie 的 Domain 属性（空串 = host-only）。
 * 只有正式域名（workshop.skin / www / eat / mass）才跨子域共享。
 */
export function sessionCookieDomainAttribute(hostname: string): string {
  const host = String(hostname || '').toLowerCase()
  if (!host) return ''
  const isProductionHost = host === 'workshop.skin' || host === 'www.workshop.skin' || host.endsWith(SHARED_COOKIE_DOMAIN)
  return isProductionHost ? `; Domain=${SHARED_COOKIE_DOMAIN}` : ''
}

export async function createSessionSecrets(config: AppConfig) {
  const token = randomToken()
  const csrfToken = randomToken()
  return {
    token,
    tokenHash: await keyedHash(token, config.SESSION_SECRET),
    csrfToken,
    csrfHash: await keyedHash(csrfToken, config.CSRF_SECRET)
  }
}

export async function sessionTokenHash(token: string, config: AppConfig): Promise<string> {
  return keyedHash(token, config.SESSION_SECRET)
}

export async function csrfTokenHash(token: string, config: AppConfig): Promise<string> {
  return keyedHash(token, config.CSRF_SECRET)
}

export function setSessionCookie(c: Context, token: string, config: AppConfig): void {
  const maxAge = config.SESSION_TTL_HOURS * 60 * 60
  const secure = config.COOKIE_SECURE ? '; Secure' : ''
  const domain = sessionCookieDomainAttribute(new URL(c.req.url).hostname)
  c.header(
    'Set-Cookie',
    `${sessionCookieName(config)}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${domain}${secure}`,
    { append: true }
  )
}

export function clearSessionCookie(c: Context, config: AppConfig): void {
  const secure = config.COOKIE_SECURE ? '; Secure' : ''
  const domain = sessionCookieDomainAttribute(new URL(c.req.url).hostname)
  c.header(
    'Set-Cookie',
    `${sessionCookieName(config)}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${domain}${secure}`,
    { append: true }
  )
  // 过渡期清理：旧版 `__Host-` 前缀 cookie（host-only，不能带 Domain）也要一并清掉，
  // 否则浏览器里会长期留着一份无效令牌（2026-09-15 换名前登录的会话）。
  c.header(
    'Set-Cookie',
    `${LEGACY_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`,
    { append: true }
  )
}

export function readCookie(c: Context, name: string): string | undefined {
  const header = c.req.header('cookie')
  if (!header) return undefined
  for (const part of header.split(';')) {
    const [rawKey, ...rest] = part.trim().split('=')
    if (rawKey === name) return rest.join('=')
  }
  return undefined
}

// ── 只读降级会话（2026-09-14 D1 写额度事故）────────────────────────────
//
// 事故：D1 免费层每日写额度耗尽后，**登录本身也写库**（auth_sessions 插入 +
// users 更新 + 审计事件），于是门店连「进去看数据」都做不到——V6.7.7-6 设计的
// 「结构化 503 + 仍然可查看数据」承诺落空。
//
// 现在：写额度过期时登录降级为**无状态只读会话**。令牌自带签名与过期时间，
// 不需要写任何一行数据库；中间件用签名验证 + 只读查询还原身份，并把该会话
// 标记为 readOnly —— 所有写操作由 requireCsrf 统一拦成结构化额度提示。
//
// 安全边界：
//   ① 只在「密码验证通过、但会话写入被额度拒绝」时签发，且仅签发给已有
//      有效门店成员关系的账号；
//   ② 令牌只用 SESSION_SECRET 签名，载荷不含任何凭据；
//   ③ 过期时间与普通会话一致（SESSION_TTL_HOURS），到期即失效；
//   ④ 身份与成员关系仍在每次请求时从库里**读**取校验，账号被停用/移出
//      门店即刻失效（恢复写额度后管理员即可撤销）；
//   ⑤ 该会话**不能执行任何写操作**（含改密、登出以外的所有 POST/PATCH/DELETE）。
const READONLY_PREFIX = 'ro1.'

interface ReadOnlySessionPayload {
  v: 1
  u: string
  s: string
  e: string
}

function base64UrlEncode(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '')
}

function base64UrlDecode(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  return atob(padded + '==='.slice((padded.length + 3) % 4))
}

export function isReadOnlySessionToken(token: string | undefined): boolean {
  return typeof token === 'string' && token.startsWith(READONLY_PREFIX)
}

export async function createReadOnlySessionToken(
  config: AppConfig,
  input: { userId: string; storeId: string }
): Promise<string> {
  const payload: ReadOnlySessionPayload = {
    v: 1,
    u: input.userId,
    s: input.storeId,
    e: new Date(Date.now() + config.SESSION_TTL_HOURS * 60 * 60 * 1000).toISOString()
  }
  const encoded = base64UrlEncode(JSON.stringify(payload))
  const signature = await keyedHash(encoded, config.SESSION_SECRET)
  return `${READONLY_PREFIX}${encoded}.${signature}`
}

export async function verifyReadOnlySessionToken(
  token: string,
  config: AppConfig
): Promise<{ userId: string; storeId: string; expiresAt: string } | null> {
  if (!isReadOnlySessionToken(token)) return null
  const rest = token.slice(READONLY_PREFIX.length)
  const separator = rest.lastIndexOf('.')
  if (separator <= 0) return null
  const encoded = rest.slice(0, separator)
  const signature = rest.slice(separator + 1)
  const expected = await keyedHash(encoded, config.SESSION_SECRET)
  if (!safeEqualHex(signature, expected)) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(base64UrlDecode(encoded))
  } catch {
    return null
  }
  const payload = parsed as Partial<ReadOnlySessionPayload> | null
  if (!payload || payload.v !== 1 || typeof payload.u !== 'string' || typeof payload.s !== 'string' || typeof payload.e !== 'string') return null
  const expires = Date.parse(payload.e)
  if (!Number.isFinite(expires) || expires <= Date.now()) return null
  return { userId: payload.u, storeId: payload.s, expiresAt: payload.e }
}
