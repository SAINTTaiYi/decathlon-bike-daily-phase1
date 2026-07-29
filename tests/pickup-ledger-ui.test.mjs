import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const component = await readFile(new URL('../apps/web/src/components/pickup/PickupLedger.jsx', import.meta.url), 'utf8')
const scene = await readFile(new URL('../apps/web/src/scenes/PickupScene.jsx', import.meta.url), 'utf8')
const styles = await readFile(new URL('../apps/web/src/styles/pickup-ledger.css', import.meta.url), 'utf8')

test('待取场景使用专属 Pickup Operations Ledger，而不复用通用台账视觉', () => {
  assert.match(scene, /PickupLedger/u)
  assert.doesNotMatch(scene, /RecordLedger/u)
  assert.match(component, /className="pickup-module-header"/u)
  assert.match(component, /className="pickup-card-grid"/u)
  assert.match(component, /className="pickup-filter-sheet"/u)
})

test('待取台账支持单卡展开、双列跨栏、搜索筛选排序与密度切换', () => {
  assert.match(component, /aria-expanded=\{expanded\}/u)
  assert.match(component, /setExpandedId/u)
  assert.match(component, /pickup-search/u)
  assert.match(component, /setSheet\('filter'\)/u)
  assert.match(component, /setSheet\('sort'\)/u)
  assert.match(component, /pickup-ledger-density/u)
  assert.match(component, /setTimeout\(\(\) => setDebouncedQuery\(query\.trim\(\)\), 250\)/u)
  assert.match(component, /data-tools-visible/u)
  assert.match(component, /className="pickup-collapse-all"/u)
  assert.match(component, /className="pickup-card-more"/u)
  assert.match(component, /className="pickup-hidden-match"/u)
  assert.match(styles, /\.pickup-card-frame\[data-expanded='true'\] \{ grid-column: 1 \/ -1; \}/u)
  assert.match(styles, /@media \(min-width: 600px\)[\s\S]*\.pickup-card-grid \{ grid-template-columns: repeat\(2/u)
})

test('待取卡片遵循暖纸、黑色结构、黄色信号和浅橙展开态', () => {
  assert.match(styles, /--pickup-page: var\(--ops-page/u)
  assert.match(styles, /--pickup-yellow: var\(--ops-yellow/u)
  assert.match(styles, /--pickup-orange-wash: var\(--ops-pickup-expanded, #fff1dc\)/u)
  assert.match(styles, /\.pickup-card\[data-expanded='true'\] \{ background: var\(--pickup-orange-wash\); \}/u)
  assert.match(styles, /\.pickup-card-status b\[data-repair='true'\]/u)
})
