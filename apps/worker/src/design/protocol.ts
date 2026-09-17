// 门店设计实时协作 · 线上协议（2026-09-17，随 V6.9.0 引入）。
//
// 传输走 WebSocket 文本帧 + JSON；Yjs 增量是任意二进制，统一 base64 编码。
// 消息面板：
//   C→S hello { sv }          握手：带上本地状态向量，触发双向对账
//   S→C sync  { u, sv }       服务端把「客户端缺的」发下来；sv 供客户端回补
//   C→S u     { u }           增量更新（客户端 → 服务端；含对账回补）
//   S→C u     { u, from }     增量广播（服务端 → 其他连接）
//   C→S/S→C drag { id, x, y } / dragend { id }  拖动中的瞬态预览（不落库）
//   S→C peers { peers }       在线成员名单变化
//
// 心跳：连接空闲时客户端发字符串 'ping'，由 Durable Object 的
// setWebSocketAutoResponse 直接回 'pong' —— 休眠中的房间不会被唤醒也不计费。
//
// 本文件只放「纯函数与常量」：解析、校验、位串编解码，不依赖任何 Workers
// 运行时对象，因此可以直接用 node:test 覆盖（见 test/design-room.test.ts）。

export const MAX_MESSAGE_CHARS = 1_600_000
export const MAX_UPDATE_BYTES = 1_048_576
export const MAX_DRAG_ID_CHARS = 64
export const MAX_NAME_CHARS = 32

export type ClientMessage =
  | { t: 'hello'; sv: string }
  | { t: 'u'; u: string }
  | { t: 'drag'; id: string; x: number; y: number }
  | { t: 'dragend'; id: string }

function isShortId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_DRAG_ID_CHARS
}

export function parseClientMessage(raw: string): ClientMessage | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_MESSAGE_CHARS) return null
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (!value || typeof value !== 'object') return null
  const m = value as Record<string, unknown>
  if (m.t === 'hello') {
    // sv 缺省 / 空串 = 客户端没有本地状态，服务端回全量；非法类型或超长则拒绝。
    if (m.sv === undefined || m.sv === null) return { t: 'hello', sv: '' }
    if (typeof m.sv !== 'string' || m.sv.length > MAX_MESSAGE_CHARS) return null
    return { t: 'hello', sv: m.sv }
  }
  if (m.t === 'u') {
    if (typeof m.u !== 'string' || m.u.length === 0 || m.u.length > MAX_MESSAGE_CHARS) return null
    return { t: 'u', u: m.u }
  }
  if (m.t === 'drag') {
    if (!isShortId(m.id)) return null
    if (typeof m.x !== 'number' || typeof m.y !== 'number') return null
    if (!Number.isFinite(m.x) || !Number.isFinite(m.y)) return null
    return { t: 'drag', id: m.id, x: m.x, y: m.y }
  }
  if (m.t === 'dragend') {
    if (!isShortId(m.id)) return null
    return { t: 'dragend', id: m.id }
  }
  return null
}

/** 展示名清理：折叠空白、限长；客户端自报的名字不可信，服务端以会话名为准。 */
export function sanitizeName(value: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim().replace(/\s+/gu, ' ')
  return trimmed.length > MAX_NAME_CHARS ? trimmed.slice(0, MAX_NAME_CHARS) : trimmed
}

/** Uint8Array → base64（分块避免超长 apply 参数导致栈溢出）。 */
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as unknown as number[])
  }
  return btoa(bin)
}

/** base64 → Uint8Array。 */
export function base64ToBytes(value: string): Uint8Array {
  const bin = atob(value)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i)
  return out
}
