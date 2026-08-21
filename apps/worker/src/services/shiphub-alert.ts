import type { AppConfig } from '../env.js'

// ShipHub 同步连续失败告警：首次跨过阈值（3 次）发一封邮件，之后每再失败 10 次补一封，
// 避免刷屏；未配置 SHIPHUB_ALERT_EMAIL 时静默降级（不发送、不抛错）。
export const SHIPHUB_ALERT_THRESHOLD = 3

export function shouldAlertOnShipHubFailure(consecutiveFailures: number): boolean {
  if (consecutiveFailures < SHIPHUB_ALERT_THRESHOLD) return false
  return consecutiveFailures === SHIPHUB_ALERT_THRESHOLD || (consecutiveFailures - SHIPHUB_ALERT_THRESHOLD) % 10 === 0
}

export async function sendShipHubFailureAlert(
  config: AppConfig,
  input: { storeCode: string; storeName: string; errorCode: string; consecutiveFailures: number }
): Promise<void> {
  const to = config.SHIPHUB.alertEmail
  if (!to || !config.RESEND_API_KEY || !config.RESEND_FROM) return
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${config.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: config.RESEND_FROM,
        to: [to],
        subject: `[Workshop] ShipHub 同步连续失败告警（${input.storeCode}）`,
        text: `门店 ${input.storeCode} ${input.storeName} 的 ShipHub 同步已连续失败 ${input.consecutiveFailures} 次，最近错误：${input.errorCode}。\n请检查该门店的 ShipHub 授权状态，必要时在控制台重新连接。`
      })
    })
  } catch {
    // 告警邮件失败不影响同步流程本身
  }
}
