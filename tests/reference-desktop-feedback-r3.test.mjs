import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const css = await readFile(new URL('../apps/web/src/styles/desktop-workbench.css', import.meta.url), 'utf8')
const baseCss = await readFile(new URL('../apps/web/src/styles/workshop-system.css', import.meta.url), 'utf8')

test('desktop operations index uses full desktop line boxes', () => {
  assert.match(css, /\.ops-index button > span strong \{ font-size: 16px; line-height: 20px; \}/u)
  assert.match(css, /\.ops-index button > em \{[^}]*font-size: 13px; line-height: 18px;/u)
  assert.match(css, /\.ops-index button > b \{[^}]*font-size: 45px; line-height: 1;/u)
})

test('desktop rail sits below the global header and above the frosted layer', () => {
  assert.match(css, /--ops-header-height: 186px/u)
  // 2026-09-05 rail 上移：top 从 168 改到 100（90px 全局页头之下、模块条左侧
  // 空栏内）。进入导航层区域后必须靠基线 z-index 90 压在磨砂层(80)之上，
  // 否则第一个导航项会被背板遮住（旧 top:112 事故）。
  assert.match(css, /\.look-dock \{[\s\S]*?top: 100px !important;/u)
  assert.match(baseCss, /\.look-dock \{[^}]*z-index: 90 !important;/u)
  // 分隔线仍必须起于固定导航层之下（186px = 90 全局页头 + 96 模块条；
  // 2026-09-18 模块条内嵌队列工具后从 66 长到 96）。漏算模块条，线会穿过页头。
  assert.match(css, /\.look-dock::after \{[^}]*top: 186px;[^}]*left: 261px;/u)
  assert.doesNotMatch(css, /\.workshop-runtime > \[data-workspace-layer='navigation'\] \{[^}]*box-shadow: 0 1px 0/u)
})

test('queue metrics have independent number and label rows', () => {
  assert.match(css, /\.pickup-module-count span \{ grid-template-rows: 34px 16px;[^}]*line-height: 16px; \}/u)
  assert.match(css, /\.pickup-module-count b \{ display: block; font-size: 34px; line-height: 34px; \}/u)
})

test('shared desktop ledger cards use compact actions and a continuous collapsed-row frame', () => {
  assert.match(css, /\.pickup-card-frame:not\(\[data-expanded='true'\]\) \{ overflow: hidden; border: 1px solid[^}]*border-radius: var\(--ops-radius\); \}/u)
  assert.match(css, /\.pickup-card-frame:not\(\[data-expanded='true'\]\) \.pickup-card \{ height: auto; border: 0; border-radius: 0;/u)
  assert.match(css, /\.pickup-card-actions \{ display: flex; flex-wrap: nowrap;[^}]*justify-content: flex-start;/u)
  assert.ok(css.includes(".pickup-card-actions > .pickup-card-more { flex: 0 0 auto; width: auto; min-width: 148px; max-width: 220px; }"))
  assert.ok(css.includes(".pickup-card-actions .pickup-primary-action { margin-left: auto; min-width: 190px; }"))
  assert.match(css, /\.pickup-notification-buttons \{ grid-column: 3; display: flex; justify-content: flex-end;/u)
})
