import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const component = await readFile(new URL('../apps/web/src/components/pickup/PickupLedger.jsx', import.meta.url), 'utf8')
const scene = await readFile(new URL('../apps/web/src/scenes/PickupScene.jsx', import.meta.url), 'utf8')
const styles = await readFile(new URL('../apps/web/src/styles/pickup-ledger.css', import.meta.url), 'utf8')

test('待取场景使用专属 Pickup Operations Ledger，而不复用通用台账视觉', () => {
  assert.match(scene, /PickupLedger/u)
  assert.doesNotMatch(scene, /RecordLedger/u)
  assert.match(component, /className="pickup-queue-controls"/u)
  assert.match(component, /className="pickup-card-grid"/u)
  assert.match(component, /className="pickup-filter-sheet"/u)
})

test('待取台账支持单卡展开、双列跨栏、搜索筛选排序与密度切换', () => {
  assert.match(component, /aria-expanded=\{expanded\}/u)
  assert.match(component, /setExpandedId/u)
  assert.match(component, /pickup-search/u)
  assert.match(component, /setSheet\('filter'\)/u)
  assert.match(component, /setSheet\('sort'\)/u)
  assert.match(component, /storageKey = repairMode \? 'repair-ledger' : 'pickup-ledger'/u)
  assert.match(component, /localStorage\?\.setItem\(`\$\{storageKey\}-density`/u)
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

test('Preview 反馈修复保留 body 抽屉和滚动锁定，并让卡片只执行一次进入动效', () => {
  assert.match(component, /createPortal/u)
  assert.match(component, /document\.body\.style\.position = 'fixed'/u)
  assert.match(component, /focus\(\{ preventScroll: true \}\)/u)
  assert.match(component, /className="pickup-queue-controls"/u)
  assert.doesNotMatch(component, /pickup-sticky-slot|data-pinned/u)
  assert.match(component, /new IntersectionObserver/u)
  assert.match(component, /frame\.setAttribute\('data-entering', ''\)/u)
  assert.match(component, /observer\.unobserve\(frame\)/u)
  assert.doesNotMatch(styles, /pickup-sticky-shell|data-pinned/u)
  assert.match(styles, /\.pickup-card-frame\[data-entering\]/u)
  assert.match(styles, /@keyframes pickup-card-enter/u)
})

test('Preview 反馈视觉取消容器描边并采用局部橙黄弥散柔光和紧凑展开', () => {
  assert.match(styles, /--pickup-glow:/u)
  assert.match(styles, /\.pickup-ledger :is\([^)]+\),[\s\S]*\.pickup-queue-controls :is\([^)]+\),[\s\S]*\.pickup-filter-sheet :is\([^)]+\) \{ border: 0; \}/u)
  assert.match(styles, /\.pickup-queue-summary/u)
  assert.match(styles, /\.pickup-card\[data-expanded='true'\][\s\S]*radial-gradient/u)
  assert.match(styles, /\.pickup-card\[data-expanded='true'\] \.pickup-card-summary \{ min-height: 88px/u)
  assert.match(styles, /\.pickup-card-detail \{[\s\S]*grid-template-columns: repeat\(2/u)
})
