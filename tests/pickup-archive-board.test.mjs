import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const pickupScene = await readFile(new URL('../apps/web/src/scenes/PickupScene.jsx', import.meta.url), 'utf8')
const ledger = await readFile(new URL('../apps/web/src/components/lookbook/RecordLedger.jsx', import.meta.url), 'utf8')
const css = await readFile(new URL('../apps/web/src/styles/refinement.css', import.meta.url), 'utf8')
const app = await readFile(new URL('../apps/web/src/App.jsx', import.meta.url), 'utf8')

test('待取区使用独立的技术档案板头与真实待取统计', () => {
  assert.ok(pickupScene.includes('className="look-section pickup-look pickup-archive-board"'))
  assert.ok(pickupScene.includes('data-pickup-archive="true"'))
  assert.ok(pickupScene.includes('<h2 id="pickup-title">PICKUP BOARD</h2>'))
  assert.match(pickupScene, /待取车辆/u)
  assert.match(pickupScene, /VEHICLES · 等待取车/u)
  assert.match(pickupScene, /今天暂无取车记录/u)
})

test('待取档案版复用业务台账但显式应用档案变体', () => {
  assert.ok(pickupScene.includes('<RecordLedger {...props} config={sceneRecordConfig.pickup} variant="pickup-archive" />'))
  assert.match(ledger, /showAdd = true, variant = ''/u)
  assert.ok(ledger.includes('data-variant={variant || undefined}'))
  assert.ok(ledger.includes('className="record-edit-action"'))
  assert.match(ledger, /record\.scene === 'pickup' && !pickedUp/u)
})

test('待取档案版以抽象工程图层替代人体和浏览器 chrome，且不改全局导航', () => {
  assert.match(css, /V5\.7\.10 Pickup archive board/u)
  assert.match(css, /\.pickup-archive-board\[data-pickup-archive='true'\]/u)
  assert.match(css, /--pickup-signal: #ece000/u)
  assert.match(css, /radial-gradient\(circle at 101% 9\.5rem/u)
  assert.match(css, /record-ledger\[data-variant='pickup-archive'\]/u)
  assert.doesNotMatch(pickupScene, /anatom|人体|body illustration|look-dock/u)
  assert.ok(app.includes('<ActionDock activeScene={activeScene}'))
})

test('待取档案版为小屏保留并列业务操作与 Forced Colors 回退', () => {
  assert.match(css, /@media \(max-width: 639px\) \{[\s\S]*pickup-archive-board/u)
  assert.match(css, /record-actions\[data-has-primary='true'\] \.record-edit-action,[\s\S]*record-primary-action \{ flex: 1 1 calc\(50% - \.275rem\) !important; \}/u)
  assert.match(css, /@media \(forced-colors: active\) \{[\s\S]*pickup-archive-board/u)
})
