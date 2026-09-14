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
  migration,
  migration36,
  foodHook,
  foodApi,
  siteMode
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
  read('../migrations/d1/0035_food_ledger.sql'),
  read('../migrations/d1/0036_food_ledger_read_amplification.sql'),
  read('../apps/web/src/hooks/useFoodLedger.js'),
  read('../apps/web/src/api/food.js'),
  read('../apps/web/src/utils/siteMode.js')
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

test('应用选择：登录后先选应用，非 Ops 场景根本不渲染 Ops 容器（比 inert 更强的隔离）', () => {
  assert.match(app, /const ACTIVE_APP_KEY = 'bike-ops-active-app'/u)
  assert.match(app, /const showAppSelect = introDone && !effectiveApp && !introLocked/u)
  assert.match(app, /const renderOps = introDone && effectiveApp === 'ops'/u, 'Ops 容器必须由 renderOps 控制渲染')
  // 判据必须留在 hooks 区：下方有 8 个早期 return，hook 落到它们之后会让各次渲染的
  // hook 数量不一致 → React 抛错 → 整页 fatal-state（2026-09-14 实测踩过）。
  assert.ok(
    app.indexOf('const renderOps = introDone') < app.indexOf("if (auth.status === 'restoring')"),
    'renderOps 必须位于所有早期 return 之前（hooks 规则）'
  )
  assert.ok(
    app.indexOf('if (renderOps) return undefined') < app.indexOf("if (auth.status === 'restoring')"),
    '锁滚动 effect 必须位于所有早期 return 之前（hooks 规则）'
  )
  // 通用护栏：App() 里任何 hook 都不得出现在第一个早期 return 之后。
  // 2026-09-14 实测踩过：把锁滚动 effect 加到 return 之后，restoring 阶段少调用一个 hook，
  // 下一页渲染立刻抛 "Rendered more hooks than during the previous render"，
  // 整页落进错误边界（无头浏览器探针显示 bottomHit=other:fatal-state）。
  {
    const lines = app.split('\n')
    const isHook = (line) => {
      const text = line.trim()
      if (text.startsWith('//') || text.startsWith('*')) return false
      return /(?:^|[^\w.])(?:use(?:Effect|Memo|Callback|LayoutEffect|Ref|State)|use[A-Z]\w*)\(/u.test(text)
    }
    const firstReturn = lines.findIndex((line) => /^  if \(/u.test(line) && line.trim().endsWith('{'))
    assert.ok(firstReturn > 0, '必须能定位到 App 的早期 return')
    const offenders = lines
      .map((line, index) => ({ line, index }))
      .filter(({ line, index }) => index > firstReturn && isHook(line))
      .map(({ line, index }) => `${index + 1}: ${line.trim()}`)
    assert.deepEqual(offenders, [], 'hooks 不得出现在早期 return 之后（否则各次渲染 hook 数量不一致 → fatal）')
  }
  // 2026-09-14 用户定案：从「整层 inert」升级为「根本不渲染」。
  // inert 只挡交互，容器仍占据约 1500px 文档流（preview 实测 htmlScrollHeight=1499），
  // 页面因此可以滚动，手机上一滑就把 Ops 底栏拽出来 —— 这就是用户反复看到的「界面泄露」。
  assert.match(
    app,
    /\{renderOps \? <div ref=\{workspaceRootRef\} className="app-runtime workshop-runtime"/u,
    'Ops 容器必须条件渲染：非 Ops 场景页面上不得存在 Ops 节点'
  )
  assert.ok(
    !app.includes('inert={!opsPlayable || workspaceLaunching ?'),
    '不得回退到「整层 inert 遮挡」的旧写法 —— 容器在非 Ops 场景必须根本不存在'
  )
  assert.ok(app.includes('</div> : null}'), 'Ops 容器必须有条件闭合，否则 JSX 结构不成立')
  assert.match(app, /showAppSelect \? <AppSelect/u)
  assert.match(app, /effectiveApp === 'food' \? <FoodApp/u)
  // 装配动画只在真正进入 Ops 时播放
  assert.match(app, /workspaceLaunching = .*&& effectiveApp === 'ops'/u)
  // 退出登录清空选择，下次登录重新二选一
  assert.match(app, /clearAppChoice\(\)/u)
})

// 2026-09-13 用户实测三项故障的共同根因：选择屏与食品台账被渲染在 Ops 容器内部。
// 该容器在选择屏阶段 appChoice 为空 → opsPlayable 为 false → 整层 inert，
// 里面的按钮全部点不动（「应用点了没反应」）；容器还承载 GSAP 动效残留的
// transform，fixed 元素以容器为定位基准，高度不足就露出底部 Ops dock（截图确认）。
//
// 判据用「缩进 + DOM 顺序」而不是括号匹配：JSX 里含自闭合标签与表达式容器，
// 计数 <div 会错位；缩进能直接表达「是不是容器的子元素」。
test('应用选择屏与食品台账必须是 Ops 容器的兄弟节点，不得渲染进 Ops 容器内', () => {
  const lines = app.split('\n')
  const indentOf = (needle) => {
    const index = lines.findIndex((line) => line.includes(needle))
    assert.ok(index > -1, `找不到：${needle}`)
    return { index, indent: lines[index].length - lines[index].trimStart().length, text: lines[index].trim() }
  }

  const container = indentOf('className="app-runtime workshop-runtime"')
  const dock = indentOf('data-workspace-layer="dock"')
  const select = indentOf('{showAppSelect ? <AppSelect')
  const food = indentOf("effectiveApp === 'food' ? <FoodApp")

  // ① dock 是容器内的元素，缩进必须比容器深（确认缩进判据本身可信）
  assert.ok(dock.indent > container.indent, 'dock 应在容器内部（缩进更深）')
  // ② 选择屏与食品台账必须与容器同级（兄弟）——比容器更深就是被塞进了容器内
  assert.equal(select.indent, container.indent, 'AppSelect 必须与 Ops 容器同级（不得嵌进容器）')
  assert.equal(food.indent, container.indent, 'FoodApp 必须与 Ops 容器同级（不得嵌进容器）')
  // ③ 顺序上必须在 dock 之后（dock 是容器内最后的内容）
  assert.ok(select.index > dock.index, 'AppSelect 必须在 Ops 容器内容之后渲染')
  assert.ok(food.index > dock.index, 'FoodApp 必须在 Ops 容器内容之后渲染')
  // ④ 容器由 renderOps 条件渲染：非 Ops 场景它连节点都不存在（2026-09-14）
  assert.match(app, /\{renderOps \? <div ref=\{workspaceRootRef\}/u, 'Ops 容器必须条件渲染')
})

test('应用选择屏：跳转不依赖 GSAP 回调，入场动画不留隐藏态', async () => {
  const select = await read('../apps/web/src/components/appselect/AppSelect.jsx')
  // 跳转必须有定时器兜底：动画被打断时 onComplete 永不触发 = 用户「点了没反应」
  assert.match(select, /window\.setTimeout\(\(\) => onChoose\(appId\), delay\)/u, '跳转必须由定时器兜底')
  assert.doesNotMatch(select, /onComplete:\s*finish/u, '跳转不得挂在 GSAP 的 onComplete 上')
  assert.doesNotMatch(select, /gsap\.from\(/u, '入场动画不得用 gsap.from（revert 会把元素留在不可见初态）')
  assert.match(select, /clearProps: 'transform,opacity,visibility'/u, '入场动画收尾必须清内联样式')
  // effect 不得随视口变化重跑（重跑会把卡片重置回初始态）
  assert.match(select, /\n  \}, \[\]\)/u, '入场 effect 只能依赖空数组')
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
  assert.match(schemaVersion, /'0036_food_ledger_read_amplification'/u)
  assert.match(domainFood, /export function computeFoodDates/u)
  assert.match(domainFood, /export function foodBatchStage/u)
})


// ── 2026-09-14 用户反馈：排序错误 + 整页信息层级乱 ─────────────────────
// 原实现「全部批次」用 ORDER BY warn_on ASC，最新登记的沉在最后；且四个页签里
// 混着「动作」（登记）与「内容」（列表），顶部四个计数平铺无主次。
test('排序：默认最新登记在前，切红标自动改预警最近', () => {
  // 后端白名单
  assert.match(workerService, /received_desc: FOOD_BATCH_DEFAULT_ORDER/u, '默认排序必须是最新登记在前')
  assert.match(workerService, /warn_asc: 'warn_on ASC, id ASC'/u)
  assert.match(workerService, /ORDER BY \$\{foodBatchOrderBy\(options\.sort\)\}/u, 'ORDER BY 必须走白名单函数')
  assert.match(workerRoute, /foodBatchSorts as readonly string\[\]\)\.includes\(sortRaw\)/u, '路由必须校验排序取值')
  // 前端默认值与联动
  assert.match(foodHook, /const \[sort, setSort\] = useState\('received_desc'\)/u, '前端默认排序必须是最新登记')
  assert.match(foodHook, /if \(nextFilter === 'flagged'\) return 'warn_asc'/u, '切到红标必须自动改预警最近')
  assert.match(foodHook, /if \(current === 'warn_asc'\) return 'received_desc'/u, '切回其它筛选要还原默认排序')
  // 排序参数确实发到了后端
  assert.match(foodApi, /sort = 'received_desc'/u)
  assert.match(foodApi, /params = new URLSearchParams\(\{ filter, sort,/u)
})

test('排序 UI：两端都有排序菜单，四个选项齐全', () => {
  for (const [label, source, prefix] of [['移动端', foodMobile, 'food-m-sort'], ['桌面端', foodDesktop, 'food-d-sort']]) {
    assert.match(source, new RegExp(`className="${prefix}"`, 'u'), `${label}必须有排序容器`)
    assert.match(source, new RegExp(`className="${prefix}-trigger"`, 'u'), `${label}必须有排序触发按钮`)
    assert.match(source, new RegExp(`className="${prefix}-menu"`, 'u'), `${label}必须有排序菜单`)
    for (const option of ['最新登记', '最早登记', '预警最近', '预警最远']) {
      assert.ok(source.includes(option), `${label}缺少排序选项「${option}」`)
    }
  }
})

test('信息层级：顶部三个状态数字可点即筛选，登记是主按钮而非页签', () => {
  // 三个数字是按钮（可点即筛选），不是静态文本
  for (const [label, source, statClass] of [['移动端', foodMobile, 'food-m-stat'], ['桌面端', foodDesktop, 'food-d-stat']]) {
    const statButtons = source.match(new RegExp(`className="${statClass}"`, 'gu')) || []
    assert.equal(statButtons.length, 3, `${label}顶部必须是三个状态按钮`)
    assert.match(source, new RegExp(`className="${statClass}"[^>]*onClick`, 'u'), `${label}状态数字必须可点击筛选`)
  }
  // 登记改为按钮
  assert.match(foodMobile, /className="food-m-register"/u, '移动端必须有登记主按钮')
  assert.match(foodDesktop, /className="food-d-register"/u, '桌面端必须有登记主按钮')
  // 页签只剩「批次 / 清单」两个内容页
  assert.match(foodMobile, /const VIEWS = \[\s*\{ id: 'batches'[\s\S]{0,80}\{ id: 'shelf'/u, '页签必须只剩批次与清单')
  assert.doesNotMatch(foodMobile, /id: 'todo'/u, '待办不再是独立页签')
  assert.doesNotMatch(foodMobile, /id: 'entry'/u, '登记不再是页签（它是动作）')
  // 已废弃的待办卡类名不得残留
  assert.doesNotMatch(foodMobile, /food-m-todo/u, '待办卡组件必须已删除')
  assert.doesNotMatch(foodCss, /food-m-todo/u, '待办卡样式必须已删除（不留死代码）')
})

test('批次行：点开才出现处理按钮，红标显示「待处理」', () => {
  assert.match(foodMobile, /className="food-m-batch-tap"/u, '移动端整行可点')
  assert.match(foodMobile, /className="food-m-batch-actions"/u, '移动端展开后才出现处理按钮')
  assert.match(foodMobile, /needsAction \? <span className="food-m-batch-status" data-status="flagged">待处理<\/span>/u, '红标行必须标出待处理')
  assert.match(foodDesktop, /batch\.status === 'open' \? \(needsAction \? '待处理' : '在库'\)/u, '桌面端同样要标出待处理')
  // 行内动作只在展开态渲染（默认不渲染 = 列表保持紧凑）
  assert.match(foodMobile, /\{expanded \? <RowActions/u, '处理按钮必须受展开态控制')
})

// ── 站点分流（2026-09-14 用户定案）────────────────────────────────────────────
// 背景：食品台账此前与 ops 共用同一张页面，即使把食品层做成全屏 fixed，ops 的 DOM
// 依然占据文档流（实测约 1500px），手机上一滑动就能把 ops 底栏拽出来 —— 这是
// 「ops 界面泄露」的真正根源，靠 z-index / inert 遮挡治标不治本。
// 现在：eat.workshop.skin 是独立站点，页面上不存在任何 ops 节点。

test('站点分流：主机名判定表（运行时跑真实函数，非字符串匹配）', async () => {
  // 直接 import 真实模块跑 —— 比在源码里找字符串强得多：
  // 判定逻辑改坏了这里立刻红，而且能覆盖大小写、子串伪装等边界。
  const mod = await import('../apps/web/src/utils/siteMode.js')
  const { isFoodOnlySite, isOpsProductionSite, foodSiteUrl, opsSiteUrl } = mod

  // [hostname, 期望食品独立站, 期望 ops 生产站]
  const table = [
    ['eat.workshop.skin', true, false],
    ['EAT.WORKSHOP.SKIN', true, false],            // 大小写不敏感
    ['workshop.skin', false, true],
    ['www.workshop.skin', false, true],
    // ★ 安全边界：前缀判据 /^eat\./ 会让这个别人的域名也走进食品站分支（回归时发现）
    ['eat.workshop.skin.evil.com', false, false],
    ['workshop.skin.evil.com', false, false],
    ['evil-eat.workshop.skin', false, true],        // 本 zone 的子域，属 ops
    // 预览站与本地必须是单站（否则无法就地验收这套界面）
    ['bike-ops-preview.geeklightonefish.workers.dev', false, false],
    ['localhost', false, false],
    ['127.0.0.1', false, false]
  ]
  for (const [host, food, ops] of table) {
    assert.equal(isFoodOnlySite(host), food, `isFoodOnlySite(${host})`)
    assert.equal(isOpsProductionSite(host), ops, `isOpsProductionSite(${host})`)
  }
  // 两个判据必须互斥：不能有一个 host 同时命中两边
  for (const [host] of table) {
    assert.ok(!(isFoodOnlySite(host) && isOpsProductionSite(host)), `${host} 不得同时命中两个站点`)
  }
  assert.equal(foodSiteUrl(), 'https://eat.workshop.skin/', 'foodSiteUrl 必须指向独立站点')
  assert.equal(opsSiteUrl(), 'https://workshop.skin/', 'opsSiteUrl 必须指向 ops 站点')

  assert.ok(siteMode.includes('export function isFoodOnlySite'), 'siteMode 必须导出 isFoodOnlySite')
})

test('站点分流：生产站点击食品台账是整页跳转到独立站点，不就地打开', () => {
  const choose = app.slice(app.indexOf('const chooseApp = useCallback'))
  const body = choose.slice(0, choose.indexOf('}, ['))
  assert.ok(body.includes("appId === 'food' && opsProductionSite"), '生产双站环境下食品应用必须走跳转分支')
  assert.ok(body.includes('window.location.assign(foodSiteUrl())'), '跳转必须整页导航到 eat 站点')
  // 非生产站（预览 / 本地）保持就地打开，否则预览环境无法验收这套界面
  assert.ok(body.includes('storeAppChoice(appId)'), '单站环境仍应就地打开应用')

  const exit = app.slice(app.indexOf('const exitFoodApp = useCallback'))
  const exitBody = exit.slice(0, exit.indexOf('}, ['))
  assert.ok(exitBody.includes('opsSiteUrl()'), 'eat 站点上的退出按钮必须能回到 Ops 站点')
})

test('站点分流：双保险锁住文档滚动，防止将来重新撑出可滚动区域', () => {
  assert.ok(app.includes("root.style.overflow = 'hidden'"), '非 Ops 场景必须锁住文档滚动（双保险）')
  const lock = app.slice(app.indexOf('if (renderOps) return undefined'))
  assert.ok(lock.length > 0, '锁滚动必须在 renderOps 为真时提前返回（Ops 场景不锁）')
  assert.ok(lock.slice(0, 400).includes('}, [renderOps])'), '锁滚动必须随 renderOps 变化重算')
})

test('站点分流：eat 站点的退出按钮文案指向 Ops，单站仍是返回应用选择', () => {
  assert.ok(app.includes("exitLabel={foodOnlySite ? '去 Workshop Ops ↗' : '返回应用选择'}"), '退出文案必须按站点分流')
  for (const [name, shell] of [['移动端', foodMobile], ['桌面端', foodDesktop]]) {
    assert.ok(shell.includes('exitLabel'), `${name}食品 shell 必须接收 exitLabel`)
  }
  assert.ok(foodApp.includes('exitLabel'), 'FoodApp 必须透传 exitLabel')
})

// ── 2026-09-14 D1 读放大优化（0036）──────────────────────────────────
// 实测 staging（单店 1,405 条批次）：默认列表 2,810 读行/次、overview 1,405 读行/次、
// 临期筛选 1,325 读行/次，且都随历史线性增长。0036 补两个索引 + 一张计数表。
test('性能：0036 补排序索引与到期索引，overview 不再全店聚合', () => {
  assert.match(
    migration36,
    /food_batches_store_received_idx[\s\S]{0,90}received_date DESC, id DESC/u,
    '默认排序 received_date DESC, id DESC 必须有对应索引，否则退化为全店扫描 + TEMP B-TREE'
  )
  assert.match(
    migration36,
    /food_batches_store_status_expires_idx[\s\S]{0,90}status, expires_on/u,
    '过期 / 临期计数按 expires_on 过滤，既有索引第三列是 warn_on，用不上'
  )
  assert.match(migration36, /CREATE TABLE food_ledger_counters/u, '全店聚合计数必须落计数器表')
  assert.match(
    migration36,
    /INSERT INTO food_ledger_counters[\s\S]*?FROM food_batches\s*GROUP BY store_id/u,
    '迁移必须按现有批次回填计数，否则读路径会一直走昂贵的回退分支'
  )
  assert.match(migration36, /store_id TEXT PRIMARY KEY NOT NULL REFERENCES stores\(id\)/u, '计数器必须绑定门店，禁止跨店')
})

test('性能：overview 走计数器 + 三条索引化计数，写路径同步维护', () => {
  // 读路径：total / open 点查计数器，不得再聚合批次表
  assert.match(workerService, /SELECT total, open_total FROM food_ledger_counters WHERE store_id = \?/u,
    'overview 必须点查计数器')
  const overviewBody = workerService.split('export async function foodOverview')[1]?.split('\nexport ')[0] ?? ''
  assert.ok(overviewBody.length > 0, '必须能定位 foodOverview 函数体')
  assert.doesNotMatch(overviewBody, /COUNT\(\*\) AS total/u,
    'overview 不得直接聚合批次表总数（那是全店扫描，正是 0036 要消除的读放大）')
  // 三个日期口径各自可走覆盖索引
  assert.match(workerService, /status = 'open' AND warn_on <= \?/u, '红标计数走 (store_id,status,warn_on)')
  assert.match(workerService, /status = 'open' AND expires_on < \?/u, '过期计数走 (store_id,status,expires_on)')
  assert.match(workerService, /status = 'open' AND warn_on > \? AND expires_on <= \?/u, '临期计数走 expires_on 索引')
  // 写路径：登记同事务递增计数
  assert.match(workerService, /INSERT INTO food_ledger_counters \(store_id, total, open_total, updated_at\)[\s\S]{0,180}ON CONFLICT\(store_id\) DO UPDATE SET/u,
    '登记必须在同一事务里递增计数')
  assert.match(workerService, /UPDATE food_ledger_counters SET open_total = open_total \+ \?/u,
    '状态流转必须调整 open_total')
  // 漂移护栏：计数调整必须排在乐观锁校验之后
  const statusBody = workerService.split('export async function setFoodBatchStatus')[1] ?? ''
  const staleCheck = statusBody.indexOf('if (!updated.meta.changes) throw')
  const counterUpdate = statusBody.indexOf('UPDATE food_ledger_counters SET open_total')
  assert.ok(staleCheck !== -1 && counterUpdate !== -1, '必须能同时定位乐观锁校验与计数调整')
  assert.ok(staleCheck < counterUpdate,
    '计数调整必须在乐观锁校验之后：同批执行时 revision 失配会让批次没变、计数却动了')
})
