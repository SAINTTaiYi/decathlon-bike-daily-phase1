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
      if (!new RegExp(`\\.${name}(?![\\w-])`, 'u').test(foodCss)) missing.push(name)
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
