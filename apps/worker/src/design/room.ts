import * as Y from 'yjs'
import type { WorkerEnv } from '../env.js'
import {
  base64ToBytes,
  bytesToBase64,
  MAX_UPDATE_BYTES,
  parseClientMessage,
  sanitizeName
} from './protocol.js'

// 每门店一间「设计房间」（Durable Object，2026-09-17）。
//
// 语义（用户拍板：常驻式）：
//   房间状态长期保留（SQLite 存储），任何人随时连上都能拿到最新工作区状态，
//   包括尚未「保存到云端」（D1 快照）的改动。D1 的 store_designs 仍然是
//   「发布快照」语义，与房间互不替代。
//
// 合并引擎是 Yjs：服务端持有权威 Y.Doc，客户端双向对账：
//   hello(sv) → sync(差量 + 服务端 sv) → 客户端回补（客户端有而服务端缺的）。
//
// 持久化：snapshot + 增量数组两级。
//   - 每条增量先入内存 doc 并立即落 ups 数组（保证 eviction 不丢改动）；
//   - ups 累计到阈值时压缩成单条全量 snapshot（apply 级 O(n) 但罕见）。
//   Durable Object 的输入门保证 await 存储操作期间新消息排队，无需显式锁。
//
// 广播与瞬态消息：
//   - u（增量）广播给其他连接，并落库；
//   - drag / dragend 是拖动中的预览，只转发不落库（最终一致性由紧随其后的
//     u 保证，预览丢失/乱序不会造成状态分叉）；
//   - peers 在连接建立/关闭时广播在线名单。
//
// 心跳走 setWebSocketAutoResponse（'ping' → 'pong'）：休眠中的房间不唤醒、
// 不计费；浏览器断网时客户端收不到 pong，据此触发重连。

const SNAP_KEY = 'snap'
const UPS_KEY = 'ups'
const COMPACT_THRESHOLD = 64

interface PeerAttachment {
  name: string
}

export class DesignRoom {
  private readonly state: DurableObjectState
  private readonly env: WorkerEnv
  private doc: Y.Doc | null = null
  private pending: string[] = []

  constructor(state: DurableObjectState, env: WorkerEnv) {
    this.state = state
    this.env = env
    this.state.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))
  }

  async fetch(request: Request): Promise<Response> {
    if ((request.headers.get('Upgrade') ?? '').toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 })
    }
    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    this.state.acceptWebSocket(server)
    // 展示名只信任 Worker 转发时写入的会话头（外部无法直连本对象）。
    const name = sanitizeName(request.headers.get('x-design-user-name') ?? '')
    server.serializeAttachment({ name } satisfies PeerAttachment)
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') return
    const msg = parseClientMessage(message)
    if (!msg) return

    if (msg.t === 'hello') {
      const doc = await this.ensureDoc()
      let diff: Uint8Array
      try {
        diff = msg.sv ? Y.encodeStateAsUpdate(doc, base64ToBytes(msg.sv)) : Y.encodeStateAsUpdate(doc)
      } catch {
        // 客户端的 sv 损坏时退化为全量，保证握手总能完成。
        diff = Y.encodeStateAsUpdate(doc)
      }
      const sv = Y.encodeStateVector(doc)
      this.send(ws, { t: 'sync', u: bytesToBase64(diff), sv: bytesToBase64(sv) })
      this.broadcastPeers()
      return
    }

    if (msg.t === 'u') {
      let update: Uint8Array
      try {
        update = base64ToBytes(msg.u)
      } catch {
        return
      }
      if (update.byteLength === 0 || update.byteLength > MAX_UPDATE_BYTES) return
      await this.appendUpdate(update)
      this.broadcast({ t: 'u', u: msg.u, from: this.nameOf(ws) }, ws)
      return
    }

    if (msg.t === 'drag' || msg.t === 'dragend') {
      this.broadcast({ ...msg, from: this.nameOf(ws) }, ws)
      return
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    try {
      ws.close()
    } catch {
      // 已断开时 close 会抛错，忽略。
    }
    this.broadcastPeers()
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    try {
      ws.close()
    } catch {
      // 同上。
    }
    this.broadcastPeers()
  }

  // ---------- 持久化 ----------

  private async ensureDoc(): Promise<Y.Doc> {
    if (this.doc) return this.doc
    const doc = new Y.Doc()
    const snap = await this.state.storage.get<string>(SNAP_KEY)
    if (typeof snap === 'string' && snap.length > 0) {
      try {
        Y.applyUpdate(doc, base64ToBytes(snap))
      } catch {
        // 快照损坏：从后续增量重建，宁可丢快照也不让房间永久 500。
      }
    }
    const ups = (await this.state.storage.get<string[]>(UPS_KEY)) ?? []
    for (const item of ups) {
      if (typeof item !== 'string') continue
      try {
        Y.applyUpdate(doc, base64ToBytes(item))
      } catch {
        // 单条增量损坏时跳过。
      }
    }
    this.pending = ups.slice()
    this.doc = doc
    return doc
  }

  private async appendUpdate(update: Uint8Array): Promise<void> {
    const doc = await this.ensureDoc()
    try {
      Y.applyUpdate(doc, update)
    } catch {
      return
    }
    this.pending.push(bytesToBase64(update))
    if (this.pending.length >= COMPACT_THRESHOLD) {
      await this.compact(doc)
      return
    }
    await this.state.storage.put(UPS_KEY, this.pending)
  }

  private async compact(doc: Y.Doc): Promise<void> {
    await this.state.storage.put(SNAP_KEY, bytesToBase64(Y.encodeStateAsUpdate(doc)))
    this.pending = []
    await this.state.storage.put(UPS_KEY, [])
  }

  // ---------- 连接工具 ----------

  private attachmentOf(ws: WebSocket): PeerAttachment | null {
    try {
      const value = ws.deserializeAttachment() as PeerAttachment | null
      return value && typeof value === 'object' ? value : null
    } catch {
      return null
    }
  }

  private nameOf(ws: WebSocket): string {
    return this.attachmentOf(ws)?.name ?? ''
  }

  private send(ws: WebSocket, payload: unknown): void {
    try {
      ws.send(JSON.stringify(payload))
    } catch {
      // 连接已关闭。
    }
  }

  private broadcast(payload: unknown, except: WebSocket | null): void {
    const raw = JSON.stringify(payload)
    for (const peer of this.state.getWebSockets()) {
      if (peer === except) continue
      try {
        peer.send(raw)
      } catch {
        // 单个连接发送失败不影响其他连接。
      }
    }
  }

  private broadcastPeers(): void {
    const names: string[] = []
    for (const peer of this.state.getWebSockets()) {
      const name = this.nameOf(peer)
      if (name) names.push(name)
    }
    this.broadcast({ t: 'peers', peers: names }, null)
  }
}
