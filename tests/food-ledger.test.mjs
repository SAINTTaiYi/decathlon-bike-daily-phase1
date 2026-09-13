import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const read = (rel) => readFile(new URL(rel, import.meta.url), 'utf8')

const [
  app,
  appSelectJsx,
  appSelectMobile,
  appSelectDesktop,
  foodApp,
  foodMobile,
  foodDesktop,
  foodCss,
  styleIndex,
  workerIndex,
  workerRoute,
  workerService,
  domainFood,
  schemaVersion,
  migration
] = await Promise.all([
  read('../apps/web/src/App.jsx'),
  read('../apps/web/src/components/appselect/AppSelect.jsx'),
  read('../apps/web/src/components/appselect/AppSelectMobile.jsx'),
  read('../apps/web/src/components/appselect/AppSelectDesktop.jsx'),
  read('../apps/web/src/components/food/FoodApp.jsx'),
  read('../apps/web/src/components/food/FoodShellMobile.jsx'),
  read('../apps/web/src/components/food/FoodShellDesktop.jsx'),
  read('../apps/web/src/styles/food-ledger.css'),
  read('../apps/web/src/styles/index.css'),
  read('../apps/worker/src/index.ts'),
  read('../apps/worker/src/routes/food.ts'),
  read('../apps/worker/src/services/food-ledger.ts'),
  read('../packages/domain/src/food.js'),
  read('../apps/worker/src/schema-version.ts'),
  read('../migrations/d1/0035_food_ledger.sql')
])

// 提取类名：JSX 里静态 className 的类名 + 双端命名空间前缀过滤。
const classNamesIn = (source, prefixes) => {
  const names = new Set()
  for (const match of source.matchAll(/className="([^"]*)"/gu)) {
    for (const name of match[1].split(/\s+/u)) {
      if (prefixes.some((prefix) => name.startsWith(prefix))) names.add(name)
    }
  }
  return names
}

// 分析前先剥掉注释：块扫描正则会把前置注释当成选择器的一部分，导致规则被跳过。
const foodCssNoComments = foodCss.replace(/\/\*[\s\S]*?\*\//gu, '')

const APP_PREFIXES = ['appselect-d-', 'appselect-m-']
const FOOD_PREFIXES = ['food-d-', 'food-m-']

// -- 教训锚点（memory 26 / 27）：断言只查 JSX 结构不查 CSS，
// 九个类名样式完全缺失时测试依然全绿。凡新增 UI 组件，必须同时断言
// ①JSX 结构存在 ②每个类名都有真实样式落地 ③关键布局约束（轨道/定位上下文）。
test('食品台账：每个 JSX 类名都有样式落地（组件与样式不得脱节）', () => {
  const missing = []
  const sources = [
    [appSelectMobile, APP_PREFIXES],
    [appSelectDesktop, APP_PREFIXES],
    [foodMobile, FOOD_PREFIXES],
    [foodDesktop, FOOD_PREFIXES]
  ]
  for (const [source, prefixes] of sources) {
    for (const name of classNamesIn(source, prefixes)) {
      // 必须真的出现在选择器位置（类名之后到 { 之间只允许选择器字符），
      // 只在注释或属性值里出现不算落地。
      const selectorUse = new RegExp(`\\.${name}(?![\\w-])[^{}]*\\{`, 'u')
      if (!selectorUse.test(foodCssNoComments)) missing.push(name)
    }
  }
  assert.deepEqual(missing, [], `以下类名在 food-ledger.css 里没有任何声明：${missing.join(', ')}`)
})

test('食品台账：双端命名空间互斥（移动端不写桌面类名，反之亦然）', () => {
  assert.deepEqual([...classNamesIn(foodMobile, ['food-d-'])], [], '移动端组件不得使用桌面端类名')
  assert.deepEqual([...classNamesIn(foodDesktop, ['food-m-'])], [], '桌面端组件不得使用移动端类名')
  assert.deepEqual([...classNamesIn(appSelectMobile, ['appselect-d-'])], [], '应用选择屏移动端不得使用桌面端类名')
  assert.deepEqual([...classNamesIn(appSelectDesktop, ['appselect-m-'])], [], '应用选择屏桌面端不得使用移动端类名')
})

test('食品台账：声明列宽的类必须同时声明 display:grid（列宽规则不得形同虚设）', () => {
  // 2026-09-13 实测踩坑：.food-d-shelf-row 只写了 grid-template-columns、
  // 没写 display:grid，整行退化成行内流——名称/商品码/类别/保质期挤在一处，
  // 而冒烟脚本只查行数与文本，看不出布局垮掉。此断言覆盖这一整类错误。
  const blocks = foodCssNoComments.match(/[^{}]+\{[^}]*\}/gu) ?? []
  const problems = []
  for (const block of blocks) {
    const selector = block.slice(0, block.indexOf('{')).trim()
    const body = block.slice(block.indexOf('{'))
    if (!/grid-template-columns\s*:/u.test(body)) continue
    if (!/^\.[a-z0-9-]+$/u.test(selector)) continue
    if (/display\s*:\s*grid/u.test(body)) continue
    problems.push(selector)
  }
  assert.deepEqual(problems, [], `以下类声明了列宽却没有 display:grid：${problems.join(', ')}`)
})

test('食品台账：清单列宽单一真值，表头与数据行不得各写一份', () => {
  const tokenCount = (foodCssNoComments.match(/--food-shelf-cols\s*:/gu) ?? []).length
  assert.equal(tokenCount, 1, '清单列宽 token 只能定义一次')
  const sheetRow = foodCssNoComments.match(/\.food-d-shelf-row\s*\{[^}]*\}/u)?.[0] ?? ''
  assert.match(sheetRow, /display:\s*grid/u, '清单行必须是网格容器')
  assert.match(sheetRow, /grid-template-columns:\s*var\(--food-shelf-cols\)/u, '清单行必须引用列宽 token')
  const head = foodCssNoComments.match(/\.food-d-table\[data-kind='shelf'\]\s+\.food-d-row-head\s*\{[^}]*\}/u)?.[0] ?? ''
  assert.ok(head, '清单表头必须显式套用清单列宽（否则按通用 8 列排布、与数据行错位）')
  assert.match(head, /grid-template-columns:\s*var\(--food-shelf-cols\)/u, '表头必须引用同一 token')
  assert.match(foodDesktop, /className="food-d-row food-d-row-head"/u, '表头行需保留 .food-d-row 以继承网格显示类型')
})

test('食品台账：分段滑块有定位上下文（memory 27 回归）', () => {
  const track = foodCss.match(/\.food-m-segments\s*\{[^}]*\}/u)?.[0] ?? ''
  const pill = foodCss.match(/\.food-m-segment-pill\s*\{[^}]*\}/u)?.[0] ?? ''
  assert.match(track, /position:\s*relative/u, '.food-m-segments 必须是定位上下文')
  assert.match(pill, /position:\s*absolute/u, '.food-m-segment-pill 必须绝对定位在轨道内')
  // 选中态只改文字色——黄底由滑块承载，段自身不得再自绘背景（否则黄色原地闪现）
  const active = foodCss.match(/\.food-m-segments button\[data-active='true'\]\s*\{[^}]*\}/u)?.[0] ?? ''
  assert.ok(active, '必须存在选中段规则')
  assert.doesNotMatch(active, /background:\s*(?!transparent)/u, '选中段不得自绘背景（背景属于滑块）')
})

test('食品台账：双端组件与应用选择屏齐全，且样式表已被 index.css 引入', () => {
  assert.match(appSelectJsx, /useViewportKind/u, '应用选择屏必须按视口分流双端实现')
  assert.match(appSelectJsx, /AppSelectMobile/u)
  assert.match(appSelectJsx, /AppSelectDesktop/u)
  assert.match(foodApp, /FoodShellMobile/u)
  assert.match(foodApp, /FoodShellDesktop/u)
  assert.match(styleIndex, /@import '\.\/food-ledger\.css';/u, '样式必须在 index.css 注册')
})

test('应用选择：登录后先选应用，Ops 容器在选择屏与食品应用期间整体 inert', () => {
  assert.match(app, /const ACTIVE_APP_KEY = 'bike-ops-active-app'/u)
  assert.match(app, /const showAppSelect = introDone && !appChoice && !introLocked/u)
  assert.match(app, /const opsPlayable = introDone && appChoice === 'ops'/u)
  assert.match(app, /inert=\{!opsPlayable \|\| workspaceLaunching/u, 'Ops 容器必须在非 Ops 应用期间整体 inert')
  assert.match(app, /showAppSelect \? <AppSelect/u)
  assert.match(app, /appChoice === 'food' \? <FoodApp/u)
  // 装配动画只在真正进入 Ops 时播放
  assert.match(app, /workspaceLaunching = .*&& appChoice === 'ops'/u)
  // 退出登录清空选择，下次登录重新二选一
  assert.match(app, /clearAppChoice\(\)/u)
})

test('食品台账 API：端点封装齐全且写操作带幂等键由 client 统一注入', async () => {
  const api = await read('../apps/web/src/api/food.js')
  for (const fn of ['getFoodShelfLife', 'getFoodOverview', 'getFoodBatches', 'createFoodBatch', 'updateFoodBatchStatus', 'upsertFoodShelfLife']) {
    assert.match(api, new RegExp(`export const ${fn} =`, 'u'), `缺少 ${fn}`)
  }
  assert.match(api, /\/api\/v1\/food\/batches/u)
  assert.match(api, /\/api\/v1\/food\/shelf-life/u)
  assert.match(api, /\/api\/v1\/food\/overview/u)
})

test('Worker：food 路由已挂载，服务层门店边界（按 store_id 过滤）无处可绕', () => {
  assert.match(workerIndex, /import \{ foodRoutes \} from '\.\/routes\/food\.js'/u)
  assert.match(workerIndex, /app\.route\('\/', foodRoutes\(\)\)/u)
  // 批次表的每条读写都必须带 store_id；列表 / 统计 / 更新三处都要有
  const storeFilters = workerService.match(/store_id = \?/gu) ?? []
  assert.ok(storeFilters.length >= 4, `服务层必须处处按 store_id 过滤，实际 ${storeFilters.length} 处`)
  assert.match(workerService, /WHERE id = \? AND store_id = \?/u, '按 id 处理批次也必须带门店条件')
  // 清单是全局字典：不含 store_id 过滤是正确的（无门店数据）
  assert.doesNotMatch(workerRoute, /store_id/u)
})

test('Worker：批次写入显式列清单包含 store_id，且不写 audit_events（模块枚举未扩）', () => {
  assert.match(workerService, /INSERT INTO food_batches \(\s*id, store_id, item_code/u, '写入必须显式包含 store_id 列')
  // 只认真正的 SQL 语句，别被解释性注释命中（memory 64 教训：断言正则不能匹配注释）
  assert.doesNotMatch(workerService, /(?:INSERT INTO|FROM|UPDATE)\s+audit_events/iu, '食品台账不写 audit_events（audit_module CHECK 未扩列）')
  assert.match(workerService, /computeFoodDates/u, '预警日/到期日必须走共享口径函数')
})

test('数据层：迁移 0035 建两表两索引，schema 版本跟随最新迁移', () => {
  assert.match(migration, /CREATE TABLE food_shelf_life/u)
  assert.match(migration, /CREATE TABLE food_batches/u)
  assert.match(migration, /CREATE INDEX food_batches_store_status_warn_idx/u)
  assert.match(migration, /CREATE INDEX food_batches_store_item_idx/u)
  assert.match(migration, /store_id TEXT NOT NULL REFERENCES stores\(id\)/u, '批次表必须绑定门店外键')
  assert.match(schemaVersion, /'0035_food_ledger'/u)
  assert.match(domainFood, /export function computeFoodDates/u)
  assert.match(domainFood, /export function foodBatchStage/u)
})
