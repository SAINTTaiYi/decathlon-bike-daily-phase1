import type { AppConfig } from '../env.js'

const encoder = new TextEncoder()

export function normalizeCorporateEmail(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('en-US')
}

export function randomOtp(): string {
  const range = 1_000_000
  const limit = Math.floor(0x1_0000_0000 / range) * range
  const bytes = new Uint32Array(1)
  do crypto.getRandomValues(bytes)
  while ((bytes[0] ?? 0) >= limit)
  return String((bytes[0] ?? 0) % range).padStart(6, '0')
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char))
}

export function registrationReady(config: AppConfig): boolean {
  return Boolean(config.REGISTRATION_SECRET && config.RESEND_API_KEY && config.RESEND_FROM)
}

export async function sendRegistrationOtp(config: AppConfig, input: { email: string; displayName: string; otp: string; expiresAt: string }): Promise<void> {
  if (!registrationReady(config)) throw new Error('REGISTRATION_EMAIL_NOT_CONFIGURED')
  const expiry = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date(input.expiresAt))
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.RESEND_API_KEY}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      from: config.RESEND_FROM,
      to: [input.email],
      subject: 'Workshop Bike Ops 注册验证码',
      text: `${input.displayName}，你的 Workshop Bike Ops 注册验证码是：${input.otp}。验证码将在 ${expiry} 过期。若不是你本人操作，请忽略此邮件。`,
      html: `<p>${escapeHtml(input.displayName)}，你的 Workshop Bike Ops 注册验证码是：</p><p style="font-size:24px;font-weight:700;letter-spacing:0.12em">${input.otp}</p><p>验证码将在 ${escapeHtml(expiry)} 过期。若不是你本人操作，请忽略此邮件。</p>`
    })
  })
  if (!response.ok) throw new Error(`RESEND_DELIVERY_FAILED_${response.status}`)
}

export async function sendPasswordResetOtp(config: AppConfig, input: { email: string; displayName: string; otp: string; expiresAt: string }): Promise<void> {
  if (!registrationReady(config)) throw new Error('REGISTRATION_EMAIL_NOT_CONFIGURED')
  const expiry = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date(input.expiresAt))
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.RESEND_API_KEY}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      from: config.RESEND_FROM,
      to: [input.email],
      subject: 'Workshop Bike Ops 改密验证码',
      text: `${input.displayName}，你的 Workshop Bike Ops 改密验证码是：${input.otp}。验证码将在 ${expiry} 过期。若不是你本人操作，请忽略此邮件并尽快联系门店管理员。`,
      html: `<p>${escapeHtml(input.displayName)}，你的 Workshop Bike Ops 改密验证码是：</p><p style="font-size:24px;font-weight:700;letter-spacing:0.12em">${input.otp}</p><p>验证码将在 ${escapeHtml(expiry)} 过期。若不是你本人操作，请忽略此邮件并尽快联系门店管理员。</p>`
    })
  })
  if (!response.ok) throw new Error(`RESEND_DELIVERY_FAILED_${response.status}`)
}

export async function requestClientHash(request: Request, secret: string): Promise<string | null> {
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  if (!ip) return null
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(ip))
  return [...new Uint8Array(signature)].map((value) => value.toString(16).padStart(2, '0')).join('')
}
