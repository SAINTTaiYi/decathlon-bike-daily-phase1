import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const component = await readFile(new URL('../apps/web/src/components/pickup/PickupLedger.jsx', import.meta.url), 'utf8')
const scene = await readFile(new URL('../apps/web/src/scenes/PickupScene.jsx', import.meta.url), 'utf8')
const styles = await readFile(new URL('../apps/web/src/styles/pickup-ledger.css', import.meta.url), 'utf8')

test('待取场景使用图二专属静态台账与真实队列 Hero', () => {
  assert.match(scene, /PickupLedger/u)
  assert.doesNotMatch(scene, /RecordLedger/u)
  for (const marker of ['pickup-reference-hero','pickup-hero-ore','pickup-hero-status','pickup-chapter']) assert.match(scene, new RegExp(marker, 'u'))
  assert.match(scene, /records\.filter/u)
  assert.match(component, /className="pickup-card-grid"/u)
  assert.match(component, /className="pickup-filter-sheet"/u)
})

test('待取台账保留搜索筛选排序密度展开和全部收起能力', () => {
  for (const marker of [/aria-expanded=\{expanded\}/u,/setExpandedId/u,/pickup-search/u,/setSheet\('filter'\)/u,/setSheet\('sort'\)/u,/pickup-ledger-density/u,/setTimeout\(\(\) => setDebouncedQuery\(query\.trim\(\)\), 250\)/u,/className="pickup-collapse-all"/u,/className="pickup-hidden-match"/u]) assert.match(component, marker)
  assert.match(component, /waitingDefault\(records\)/u)
  assert.match(styles, /\.pickup-card-grid \{ display: grid; grid-template-columns: 1fr/u)
  assert.match(styles, /\.pickup-card\[data-expanded='true'\] \{ background: var\(--pickup-expanded\); \}/u)
})

test('图二工具条和卡片使用固定几何且移动端保持 44px 触摸目标', () => {
  assert.match(styles, /\.pickup-tool-row \{[\s\S]*grid-template-columns: minmax\(0,1fr\) repeat\(4,74px\);[\s\S]*min-height: 132px/u)
  assert.match(styles, /\.pickup-card-summary \{[\s\S]*min-height: 210px/u)
  assert.match(styles, /\.pickup-card-detail \{[\s\S]*grid-template-columns: repeat\(2/u)
  assert.match(styles, /@media \(max-width: 599px\)[\s\S]*\.pickup-tool-row > button \{ min-height: max\(15\.5cqw,48px\)/u)
  assert.match(styles, /\.pickup-notification-buttons button \{[\s\S]*min-height: 68px/u)
})

test('待取页面纯静态，不使用进入、滚动收起或取车覆盖动画', () => {
  assert.doesNotMatch(component, /IntersectionObserver|data-entering|lastScrollYRef|addEventListener\('scroll'/u)
  assert.doesNotMatch(styles, /@keyframes|animation\s*:|transition\s*:|transform\s*:/u)
  assert.match(styles, /\.pickup-complete-wash \{ display: none; \}/u)
  assert.match(component, /if \(pickupPixelFill\) onPickupPixelFillComplete/u)
})

test('筛选抽屉保留 body 滚动锁定、焦点恢复和 Escape 关闭', () => {
  assert.match(component, /createPortal/u)
  assert.match(component, /document\.body\.style\.position = 'fixed'/u)
  assert.match(component, /focus\(\{ preventScroll: true \}\)/u)
  assert.match(component, /event\.key === 'Escape'/u)
  assert.match(component, /window\.scrollTo\(\{ top: scrollY, behavior: 'auto' \}\)/u)
})
