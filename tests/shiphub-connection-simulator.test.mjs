import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const [gate, hook, sim, board, ledger, palette, css] = await Promise.all([
  read('apps/web/src/utils/previewGate.js'),
  read('apps/web/src/hooks/useShipHub.js'),
  read('apps/web/src/components/shiphub/ShipHubConnectionSimulator.jsx'),
  read('apps/web/src/components/shiphub/ShipHubOrderBoard.jsx'),
  read('apps/web/src/components/pickup/PickupLedger.jsx'),
  read('apps/web/src/components/PaletteLab.jsx'),
  read('apps/web/src/styles/pickup-ledger.css')
])

test('模拟开关的宿主门控：仅 preview/localhost，且与 PaletteLab 共用同一判定', () => {
  // 门控只认 localhost / 127.0.0.1 / *.workers.dev，workshop.skin 不在其中
  assert.match(gate, /host === 'localhost'/u)
  assert.match(gate, /host === '127\.0\.0\.1'/u)
  assert.match(gate, /host\.endsWith\('\.workers\.dev'\)/u)
  // 放行条件里不得出现生产域名（注释提及不算，故先剥离注释再断言）
  const gateCode = gate.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/\/\/.*$/gmu, '')
  assert.doesNotMatch(gateCode, /workshop\.skin/u)
  // PaletteLab 不再自带一份主机判定，改为复用共享门控（避免两处漂移）
  assert.match(palette, /import \{ isPreviewHost \} from '\.\.\/utils\/previewGate\.js'/u)
  assert.match(palette, /export function isPaletteLabEnabled\(\) \{\s*return isPreviewHost\(\)/u)
  // hook 侧读写都过门控
  assert.match(hook, /export function readSimulatedStatus\(\) \{\s*if \(!isPreviewHost\(\)\) return ''/u)
  assert.match(hook, /export function writeSimulatedStatus\(status\) \{\s*if \(!isPreviewHost\(\)\) return ''/u)
  // 组件自身也守一道，available 为假直接不渲染
  assert.match(sim, /if \(!available\) return null/u)
})

test('模拟开关只覆盖展示层状态，不伪造后端数据也不改动作路径', () => {
  // 覆盖点只有 connectionStatus 一处
  assert.match(hook, /connectionStatus: simulatedStatus \|\| \(summary\?\.mode === 'fixture'/u)
  // 真实判定链保持完整：fixture 优先、其次 deriveConnectionStatus、兜底 disconnected。
  // 归一化搬进 deriveConnectionStatus，断言跟着搬（不把代码退回旧字面量）。
  assert.match(hook, /: deriveConnectionStatus\(summary\?\.connection\)/u)
  assert.match(hook, /const status = connection\.authorizationStatus \|\| 'disconnected'/u)
  // 「假绿」必须降级：状态 connected 但仍留着未清空的错误码 = degraded
  assert.match(hook, /if \(status === 'connected' && connection\.lastAuthErrorCode\) return 'degraded'/u)
  // 不得把模拟值写进 summary / orders，否则会污染业务数据与同步判断
  assert.doesNotMatch(hook, /setSummary\([^)]*simulated/u)
  assert.doesNotMatch(hook, /setOrders\([^)]*simulated/u)
  // sync 的重连前置判断必须读真实 summary，不能读被模拟的值
  assert.match(hook, /const status = summary\?\.connection\?\.authorizationStatus/u)
  assert.doesNotMatch(hook, /const status = simulatedStatus/u)
  // 模拟状态只落 localStorage，不产生任何请求
  assert.doesNotMatch(sim, /fetch\(|getShipHub|requestShipHub/u)
})

test('四种状态可从开关强制，未连接态仍给出手动重连入口', () => {
  assert.match(hook, /export const SIMULATED_STATUSES = \['fixture', 'connected', 'degraded', 'reauth_required', 'disconnected'\]/u)
  // 白名单校验：非法值一律落空串（回到真实状态），不得直接透传
  assert.match(hook, /SIMULATED_STATUSES\.includes\(raw\) \? raw : ''/u)
  assert.match(hook, /SIMULATED_STATUSES\.includes\(status\) \? status : ''/u)
  // 开关渲染四态 + 一个「真实状态」复位项
  assert.match(sim, /SIMULATED_STATUSES\.map\(/u)
  assert.match(sim, /onSimulate\?\.\(''\)/u)
  assert.match(sim, /reauth_required: '需重新授权'/u)
  assert.match(sim, /disconnected: '未连接'/u)
  // 状态条在 connected / fixture 之外都出现，并带手动重连按钮
  assert.match(board, /connectionStatus !== 'connected' && connectionStatus !== 'fixture'/u)
  assert.match(board, /去手动重连/u)
})

test('开关经 PickupLedger 透传，并有可辨识的 dev 工具样式', () => {
  assert.match(ledger, /simulationAvailable=\{Boolean\(shiphub\?\.simulationAvailable\)\}/u)
  assert.match(ledger, /simulatedStatus=\{shiphub\?\.simulatedStatus \|\| ''\}/u)
  assert.match(ledger, /onSimulateStatus=\{shiphub\?\.simulateStatus\}/u)
  assert.match(board, /<ShipHubConnectionSimulator available=\{simulationAvailable\}/u)
  // 虚线描边 + 静音配色，视觉上不能被当成业务组件
  assert.match(css, /\.shiphub-connection-sim \{[^}]*border: 1px dashed/u)
  assert.match(sim, /仅 Preview 可见，不影响真实连接/u)
})
