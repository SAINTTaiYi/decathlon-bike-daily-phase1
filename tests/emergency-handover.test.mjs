import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'

// 应急交接（2026-09-13）回归防线。覆盖四件事：
//   ① 后端限额事件 → 前端应急模式接线（client 广播 + App 横幅 + 对话框）；
//   ② 双端独立实现（memory 23）与样式落地（memory 26/27：每个类名都必须有样式）；
//   ③ 应急交接单行为：文字生成 / 拆分导入（单条 ≤ 500 字）/ 本机草稿 / 快照兜底；
//   ④ 静态应急页（离线可用、零网络请求）与 SW 预缓存。

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const readWeb = (path) => read(`apps/web/src/${path}`)

test('D1 应急接线：client 广播 D1_WRITE_LIMIT / D1_READ_LIMIT，App 渲染横幅与对话框', async () => {
  const [client, app] = await Promise.all([readWeb('api/client.js'), readWeb('App.jsx')])
  assert.match(client, /export function onD1Emergency/u, '必须导出 onD1Emergency')
  assert.match(client, /payload\?\.error === 'D1_WRITE_LIMIT' \|\| payload\?\.error === 'D1_READ_LIMIT'/u, '必须识别结构化限额错误码')
  assert.match(client, /kind: payload\.error === 'D1_WRITE_LIMIT' \? 'write' : 'read'/u, '必须区分写/读额度')
  assert.match(client, /export function getApiSessionStoreId/u, '必须提供门店 id（快照键）')
  assert.match(app, /onD1Emergency\(\(info\) =>/u, 'App 必须订阅应急事件')
  assert.match(app, /<EmergencyStatusBanner notice=\{emergencyNotice\}/u, 'App 必须渲染应急横幅')
  assert.match(app, /<EmergencyHandoverDialog/u, 'App 必须渲染应急交接对话框')
  assert.match(app, /onImport=\{\(record\) => workflow\.addRecord\('poster', \{ \.\.\.record, meta: '应急补录'/u, '导入必须写入「其它交接」并标记应急补录')
})

test('双端独立实现：桌面/移动各自组件 + 容器类 + 运行时择一挂载', async () => {
  const [chooser, desktop, mobile] = await Promise.all([
    readWeb('components/emergency/EmergencyHandoverDialog.jsx'),
    readWeb('components/emergency/EmergencyHandoverDesktop.jsx'),
    readWeb('components/emergency/EmergencyHandoverMobile.jsx')
  ])
  assert.match(chooser, /useViewportKind/u, '必须用运行时视口判定择一挂载')
  assert.match(chooser, /viewport === 'mobile' \? <EmergencyHandoverMobile/u, '移动视口必须挂移动实现')
  assert.match(desktop, /emergency-dialog-desktop/u, '桌面实现必须有独立容器类')
  assert.match(mobile, /emergency-dialog-mobile/u, '移动实现必须有独立容器类')
  // 两套实现都必须具备「生成 + 导入」两条路径
  for (const [label, source] of [['desktop', desktop], ['mobile', mobile]]) {
    assert.match(source, /生成交接单|交接单/u, `${label}: 必须能生成交接单`)
    assert.match(source, /导入补录|导入到系统/u, `${label}: 必须能导入补录`)
    assert.match(source, /导入到系统（/u, `${label}: 导入按钮必须显示条数`)
  }
})

test('样式落地：组件用到的每个 emergency-* 类名都在 emergency.css 有规则（注入缺失实测变红）', async () => {
  const [css, ...sources] = await Promise.all([
    readWeb('styles/emergency.css'),
    readWeb('components/emergency/EmergencyStatusBanner.jsx'),
    readWeb('components/emergency/EmergencyHandoverDesktop.jsx'),
    readWeb('components/emergency/EmergencyHandoverMobile.jsx'),
    readWeb('hooks/useEmergencyHandover.js')
  ])
  const used = new Set()
  for (const source of sources) {
    for (const [, value] of source.matchAll(/className="([^"]+)"/gu)) {
      for (const name of value.split(/\s+/u)) {
        if (name.startsWith('emergency-')) used.add(name)
      }
    }
  }
  // 变体类（通过选择名引用而非 className）也纳入：banner 的 kind、按钮 primary
  assert.ok(used.size >= 10, `应抽到应急类名，实际 ${used.size}`)
  const missing = [...used].filter((name) => !new RegExp(`\\.${name}[\\s,{:[]`, 'u').test(css))
  assert.deepEqual(missing, [], `以下类名缺少样式: ${missing.join(', ')}`)
  assert.match(css, /\.emergency-dialog-desktop \.emergency-body/u, '桌面布局规则必须挂桌面容器')
  assert.match(css, /\.emergency-dialog-mobile \.emergency-body/u, '移动布局规则必须挂移动容器')
  assert.match(await readWeb('styles/index.css'), /@import '\.\/emergency\.css';/u, 'emergency.css 必须被引入')
})

test('应急交接单文字：生成 → 编辑 → 拆分为 ≤500 字的多条导入记录', async () => {
  const mod = await import('../apps/web/src/utils/emergencyHandover.js')
  const groups = {
    pickup: [{ title: 'RC100 V3', contactValue: '13800138000', status: '待取', assigneeName: '小李' }],
    repair: [{ title: 'MTB 500', status: '维修中' }],
    poster: [{ title: '顾客头盔寄放', status: '继续跟进' }]
  }
  const text = mod.buildEmergencyHandoverText({ storeName: '五象店', generatedAt: new Date('2026-09-13T10:00:00'), groups })
  assert.match(text, /【应急交接单 · 未入账】/u)
  assert.match(text, /— 待取车辆（1）—/u)
  assert.match(text, /RC100 V3/u)
  assert.match(text, /@小李/u)

  // 单条拆分：长文本必须拆成多条且每条 ≤ 500 字（契约 schema 上限），行边界保留
  const long = Array.from({ length: 60 }, (_, index) => `${index + 1}. 这是一条比较长的交接说明-${'填充'.repeat(4)}`).join('\n')
  const records = mod.buildEmergencyImportRecords(long, { storeName: '五象店', date: new Date('2026-09-13T10:00:00') })
  assert.ok(records.length >= 2, `长文必须拆成多条，实际 ${records.length}`)
  for (const record of records) {
    assert.ok(record.detail.length <= 500, `单条不得超过 500 字：${record.detail.length}`)
    assert.ok(record.title.length <= 120, '标题不得超过 120 字')
  }
  assert.match(records[0].title, /（1\/\d+）/u, '多条时标题必须带序号')

  // 空文本 → 不产生记录
  assert.deepEqual(mod.buildEmergencyImportRecords('   ', {}), [])
  // 概览统计
  const summary = mod.parseEmergencyHandoverText(text)
  assert.ok(summary.chars > 20 && summary.contentLines >= 4, '概览必须统计字数与内容行')
})

test('本机草稿与快照：按门店隔离、坏数据安全降级', async () => {
  const drafts = await import('../apps/web/src/utils/emergencyHandover.js')
  const snapshots = await import('../apps/web/src/utils/workflowSnapshot.js')
  // 无 window 时安全降级（node 环境）
  assert.equal(drafts.loadEmergencyHandoverDraft('store-a'), null)
  assert.equal(snapshots.loadWorkflowSnapshot('store-a'), null)
  assert.equal(snapshots.saveWorkflowSnapshot('store-a', { records: [] }), false)

  // 注入最小 localStorage 假实现，验证读写与门店隔离
  const store = new Map()
  globalThis.window = { localStorage: { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)), removeItem: (key) => store.delete(key) } }
  try {
    const saved = drafts.saveEmergencyHandoverDraft('store-a', '编辑后的交接文字')
    assert.ok(saved?.savedAt, '必须返回保存时间')
    assert.equal(drafts.loadEmergencyHandoverDraft('store-a')?.text, '编辑后的交接文字')
    assert.equal(drafts.loadEmergencyHandoverDraft('store-b'), null, '不同门店不得互相读到草稿')

    const payload = { businessDate: '2026-09-13', day: { kpi: {} }, records: [{ id: 'r1', title: '测试车' }], store: { id: 'store-a' }, members: [] }
    assert.equal(snapshots.saveWorkflowSnapshot('store-a', payload), true)
    const loaded = snapshots.loadWorkflowSnapshot('store-a')
    assert.equal(loaded?.payload.records[0].title, '测试车')
    assert.ok(loaded?.savedAt, '快照必须带时间戳')
    assert.equal(snapshots.loadWorkflowSnapshot('store-b'), null, '快照按门店隔离')
    // 坏数据安全降级
    store.set('bike-ops:workflow-snapshot:store-a', '{bad json')
    assert.equal(snapshots.loadWorkflowSnapshot('store-a'), null)
  } finally {
    delete globalThis.window
  }
})

test('快照接入 workflow：成功写快照、首次失败退回快照、暴露 offlineSnapshotAt', async () => {
  const hook = await readWeb('hooks/useRemoteClosingWorkflow.js')
  assert.match(hook, /saveWorkflowSnapshot\(payload\?\.store\?\.id \|\| getApiSessionStoreId\(\), normalizedPayload\)/u, '成功加载必须写本机快照')
  assert.match(hook, /const snapshot = loadWorkflowSnapshot\(getApiSessionStoreId\(\)\)/u, '首次加载失败必须尝试退回快照')
  assert.match(hook, /setOfflineSnapshotAt\(snapshot\.savedAt\)/u, '必须记录快照时间供横幅展示')
  assert.match(hook, /offlineSnapshotAt,/u, '必须把 offlineSnapshotAt 暴露给界面')
  assert.match(hook, /setOfflineSnapshotAt\(''\)/u, '恢复成功必须清除快照态')
})

test('静态应急页：离线可用、零网络请求、被 SW 预缓存', async () => {
  const [html, sw] = await Promise.all([read('apps/web/public/emergency.html'), read('apps/web/public/sw.js')])
  assert.match(html, /应急交接/u)
  assert.match(html, /复制文字/u)
  assert.match(html, /下载图片/u)
  assert.doesNotMatch(html, /\bfetch\s*\(/u, '静态应急页不得发起任何网络请求')
  assert.doesNotMatch(html, /XMLHttpRequest/u, '静态应急页不得使用 XHR')
  assert.doesNotMatch(html, /https?:\/\/(?!www\.w3\.org)/u, '静态应急页不得引用外部资源')
  assert.match(sw, /cache\.addAll\(\['\/', '\/emergency\.html'\]\)/u, 'SW 必须预缓存静态应急页')
})

test('入口与通知：其它交接模块提供「应急交接」按钮', async () => {
  const [ledger, app] = await Promise.all([readWeb('components/pickup/PickupLedger.jsx'), readWeb('App.jsx')])
  assert.match(ledger, /onEmergencyHandover = null/u, 'PickupLedger 必须接受应急交接回调')
  assert.match(ledger, /handoverMode && onEmergencyHandover \?/u, '仅在「其它交接」页渲染应急入口')
  assert.match(ledger, /应急交接<\/button>/u, '入口文案必须是「应急交接」')
  assert.match(app, /onEmergencyHandover: \(\) => setEmergencyOpen\(true\)/u, 'App 必须把入口接到对话框')
  // App 的文件清单（防误删组件文件）
  const files = await readdir(new URL('../apps/web/src/components/emergency', import.meta.url))
  assert.deepEqual(files.sort(), ['EmergencyHandoverDesktop.jsx', 'EmergencyHandoverDialog.jsx', 'EmergencyHandoverMobile.jsx', 'EmergencyStatusBanner.jsx'])
})
