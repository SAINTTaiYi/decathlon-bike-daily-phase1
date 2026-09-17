// 门店设计实时协作 · 部署后 WebSocket 冒烟测试（2026-09-17）
//
// 由部署 workflow 在 GitHub runner 上执行（runner 网络可直达目标站点）。
// 覆盖链路：未带会话被拒 → 登录取会话 → 双连接对账 → 增量广播 → 在线名单。
// 「增量广播」用合法的空 Yjs 增量（[0,0] 的 base64），对房间数据零污染。
//
// 依赖：ws（脚本自行从 /tmp/ws-smoke 解析，避免污染仓库依赖）。
// 环境变量：SMOKE_BASE_URL / SMOKE_USERNAME / SMOKE_PASSWORD。
import { createRequire } from 'node:module'

const requireWs = createRequire('/tmp/ws-smoke/')
const WebSocket = requireWs('ws')

const base = (process.env.SMOKE_BASE_URL || '').replace(/\/$/u, '')
const username = process.env.SMOKE_USERNAME || ''
const password = process.env.SMOKE_PASSWORD || ''
const failures = []
const started = Date.now()

function log(...args){ console.log('[ws-smoke]', ...args) }
function pass(message){ log('ok ·', message) }
function fail(message){ failures.push(message); log('FAIL ·', message) }

function wsUrl(){ return base.replace(/^http/u, 'ws') + '/api/v1/design/ws' }

function openSocket(extraHeaders){
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl(), { headers: extraHeaders || {} })
    const timer = setTimeout(() => {
      try { socket.terminate() } catch (e) {}
      reject(new Error('connect timeout'))
    }, 12000)
    socket.on('open', () => { clearTimeout(timer); resolve(socket) })
    socket.on('error', (error) => { clearTimeout(timer); reject(error) })
  })
}

function waitMessage(socket, predicate, ms){
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.removeListener('message', onMessage); reject(new Error('message timeout')) }, ms)
    function onMessage(raw){
      let parsed = null
      try { parsed = JSON.parse(String(raw)) } catch (e) { return }
      if (!predicate(parsed)) return
      clearTimeout(timer)
      socket.removeListener('message', onMessage)
      resolve(parsed)
    }
    socket.on('message', onMessage)
  })
}

async function main(){
  if (!base || !username || !password){
    fail('缺少 SMOKE_BASE_URL / SMOKE_USERNAME / SMOKE_PASSWORD 环境变量')
    return
  }

  // 1) 未带会话：必须被拒绝（浏览器 WebSocket 不受同源策略约束，服务端必须自己拦）
  try {
    const anon = await openSocket({ origin: base })
    // 理论上不应打开；若打开且能通信说明鉴权缺口 —— 明确判失败。
    anon.close()
    fail('未登录连接被接受（预期 401 拒绝）')
  } catch (error) {
    const message = String(error && error.message ? error.message : error)
    if (/401/u.test(message)) pass('未登录连接被拒绝（401）')
    else fail('未登录连接失败原因异常：' + message)
  }

  // 2) 登录拿会话
  const loginResponse = await fetch(base + '/api/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ username, password })
  })
  if (!loginResponse.ok){
    fail('登录失败：HTTP ' + loginResponse.status)
    return
  }
  const cookies = (loginResponse.headers.getSetCookie ? loginResponse.headers.getSetCookie() : [])
    .map((value) => value.split(';')[0])
    .join('; ')
  if (!/bike_ops_session=/u.test(cookies)){
    fail('登录响应未携带会话 cookie')
    return
  }
  pass('登录成功并取得会话 cookie')

  // 3) 双连接 + hello 对账 + 增量广播
  const headers = { cookie: cookies, origin: base }
  const wsA = await openSocket(headers)
  wsA.send(JSON.stringify({ t: 'hello', sv: '' }))
  const sync = await waitMessage(wsA, (m) => m.t === 'sync', 10000)
  if (sync && typeof sync.u === 'string' && typeof sync.sv === 'string') pass('hello → sync 对账应答（含状态向量）')
  else fail('hello 未收到合法 sync 应答')

  const peersA = await waitMessage(wsA, (m) => m.t === 'peers', 8000).catch(() => null)
  if (peersA && Array.isArray(peersA.peers)) pass('收到在线名单广播（' + peersA.peers.length + ' 人）')
  else fail('未收到 peers 名单')

  const wsB = await openSocket(headers)
  wsB.send(JSON.stringify({ t: 'hello', sv: '' }))
  await waitMessage(wsB, (m) => m.t === 'sync', 10000).catch(() => null)

  const emptyUpdate = Buffer.from([0, 0]).toString('base64')
  const relayed = waitMessage(wsB, (m) => m.t === 'u' && m.u === emptyUpdate, 8000).catch(() => null)
  wsA.send(JSON.stringify({ t: 'u', u: emptyUpdate }))
  const broadcast = await relayed
  if (broadcast && typeof broadcast.from === 'string' && broadcast.from.length > 0) pass('增量广播送达另一连接（from=' + broadcast.from + '）')
  else if (broadcast) pass('增量广播送达另一连接（from 为空，展示名缺失可接受）')
  else fail('A 的增量未广播到 B')

  try { wsA.close() } catch (e) {}
  try { wsB.close() } catch (e) {}
}

const guard = setTimeout(() => {
  fail('整体超时（30s）')
  finish()
}, 30000)

function finish(){
  clearTimeout(guard)
  const ok = failures.length === 0
  console.log(JSON.stringify({ ok, failures, ms: Date.now() - started }))
  process.exit(ok ? 0 : 1)
}

main().then(finish).catch((error) => {
  fail('未捕获异常：' + String(error && error.message ? error.message : error))
  finish()
})
