import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import {
  base64ToBytes,
  bytesToBase64,
  MAX_DRAG_ID_CHARS,
  MAX_MESSAGE_CHARS,
  parseClientMessage,
  sanitizeName
} from '../src/design/protocol.js'

test('设计协作协议：hello 解析与宽松缺省', () => {
  assert.deepEqual(parseClientMessage('{"t":"hello","sv":"AQID"}'), { t: 'hello', sv: 'AQID' })
  assert.deepEqual(parseClientMessage('{"t":"hello","sv":""}'), { t: 'hello', sv: '' })
  assert.deepEqual(parseClientMessage('{"t":"hello"}'), { t: 'hello', sv: '' })
  assert.equal(parseClientMessage('{"t":"hello","sv":42}'), null)
  assert.equal(parseClientMessage(`{"t":"hello","sv":"${'a'.repeat(MAX_MESSAGE_CHARS + 1)}"}`), null)
})

test('设计协作协议：u 增量消息校验', () => {
  assert.deepEqual(parseClientMessage('{"t":"u","u":"AQID"}'), { t: 'u', u: 'AQID' })
  assert.equal(parseClientMessage('{"t":"u"}'), null)
  assert.equal(parseClientMessage('{"t":"u","u":""}'), null)
  assert.equal(parseClientMessage('{"t":"u","u":123}'), null)
})

test('设计协作协议：drag / dragend 校验（含 Infinity 与超长 id）', () => {
  assert.deepEqual(parseClientMessage('{"t":"drag","id":"sh:x1","x":1.5,"y":2}'), {
    t: 'drag',
    id: 'sh:x1',
    x: 1.5,
    y: 2
  })
  assert.deepEqual(parseClientMessage('{"t":"dragend","id":"sh:x1"}'), { t: 'dragend', id: 'sh:x1' })
  assert.equal(parseClientMessage('{"t":"drag","id":"sh:x1","x":null,"y":2}'), null)
  assert.equal(parseClientMessage('{"t":"drag","id":"sh:x1","x":1,"y":"2"}'), null)
  // JSON 里的溢出数（1e999）会解析成 Infinity，必须拒绝。
  assert.equal(parseClientMessage('{"t":"drag","id":"sh:x1","x":1e999,"y":2}'), null)
  assert.equal(
    parseClientMessage(`{"t":"drag","id":"${'a'.repeat(MAX_DRAG_ID_CHARS + 1)}","x":1,"y":2}`),
    null
  )
  assert.equal(parseClientMessage('{"t":"dragend","id":""}'), null)
})

test('设计协作协议：垃圾输入整体拒绝', () => {
  assert.equal(parseClientMessage(''), null)
  assert.equal(parseClientMessage('not json'), null)
  assert.equal(parseClientMessage('[]'), null)
  assert.equal(parseClientMessage('null'), null)
  assert.equal(parseClientMessage('{"t":"unknown"}'), null)
  assert.equal(parseClientMessage('x'.repeat(MAX_MESSAGE_CHARS + 1)), null)
})

test('设计协作协议：sanitizeName 折叠空白并限长', () => {
  assert.equal(sanitizeName('  张三  '), '张三')
  assert.equal(sanitizeName('张  三\n李四'), '张 三 李四')
  assert.equal(sanitizeName('x'.repeat(40)).length, 32)
  assert.equal(sanitizeName(123), '')
  assert.equal(sanitizeName(undefined), '')
  assert.equal(sanitizeName(''), '')
})

test('设计协作协议：base64 编解码往返（含跨分块大数据）', () => {
  const small = new Uint8Array([0, 1, 2, 253, 254, 255])
  assert.deepEqual(Array.from(base64ToBytes(bytesToBase64(small))), Array.from(small))
  const big = new Uint8Array(100_000)
  for (let i = 0; i < big.length; i += 1) big[i] = i % 256
  const round = base64ToBytes(bytesToBase64(big))
  assert.equal(round.length, big.length)
  assert.deepEqual(Array.from(round.subarray(99_990)), Array.from(big.subarray(99_990)))
})

test('DesignRoom：Hibernation 自动应答 + 持久化纪律（结构断言）', async () => {
  const source = await readFile(new URL('../src/design/room.ts', import.meta.url), 'utf8')
  // 心跳必须走 auto-response（休眠不唤醒、不计费）。
  assert.match(source, /setWebSocketAutoResponse\(new WebSocketRequestResponsePair\('ping', 'pong'\)\)/u)
  // Hibernation API：接受 + attachment 存展示名。
  assert.match(source, /acceptWebSocket\(server\)/u)
  assert.match(source, /serializeAttachment\(\{ name \}/u)
  // 两级持久化：增量先落 ups，阈值触发 compact。
  assert.match(source, /COMPACT_THRESHOLD = 64/u)
  assert.match(source, /storage\.put\(UPS_KEY, this\.pending\)/u)
  assert.match(source, /SNAP_KEY, bytesToBase64\(Y\.encodeStateAsUpdate\(doc\)\)/u)
  // 双向对账：sync 带服务端 sv。
  assert.match(source, /t: 'sync', u: bytesToBase64\(diff\), sv: bytesToBase64\(sv\)/u)
})

test('design 路由：WS 端点有只读拦截与 Origin 白名单（结构断言）', async () => {
  const source = await readFile(new URL('../src/routes/design.ts', import.meta.url), 'utf8')
  assert.match(source, /app\.get\('\/api\/v1\/design\/ws', \.\.\.read/u)
  assert.match(source, /READONLY_SESSION/u)
  assert.match(source, /REALTIME_UNAVAILABLE/u)
  assert.match(source, /isAllowedOrigin\(c\.req\.header\('origin'\), c\.get\('config'\)\.allowedOrigins\)/u)
  assert.match(source, /idFromName\(`store:\$\{context\.storeId\}`\)/u)
  assert.match(source, /forwardUrl\.searchParams\.set\('x-design-user', context\.displayName\)/u)
  // 转发必须用「原始 Request 作模板」构造（保留 WebSocket 升级语义）
  assert.match(source, /new Request\(forwardUrl, c\.req\.raw\)/u)
})
