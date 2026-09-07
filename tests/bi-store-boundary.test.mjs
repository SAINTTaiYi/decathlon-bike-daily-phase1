import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const readWorker = (path) => readFile(new URL(`../apps/worker/src/${path}`, import.meta.url), 'utf8')

// ═══ 门店数据边界铁律（2026-09-08 用户定案）═══
// 每个门店只能显示自己的数据；快照/凭据/账号绝不跨店。此文件锁死边界实现，
// 注入回归（去掉门控）时以下断言必须变红。

test('快照归属门控：BI 面板只对数据归属门店渲染静态快照卡', async () => {
  for (const [file, panel] of [
    ['apps/web/src/components/overview/BiInsightCharts.jsx', 'BiInsightPanel'],
    ['apps/web/src/components/overview/BiSalesMobile.jsx', 'BiSalesMobile']
  ]) {
    const src = await read(file)
    // own 判定必须存在且以快照声明的归属门店为准
    assert.match(src, /const own = Boolean\(storeCode\) && storeCode === snapshot\.store\.code/u, `${panel} 必须按快照归属门店判定 own`)
    // 非归属分支必须存在且 data-bi-scope 标记（供 E2E 冒烟定位）
    assert.match(src, /if \(!own\) \{/u, `${panel} 必须有非归属门店分支`)
    assert.match(src, /data-bi-scope="store"/u, `${panel} 非归属分支必须带 data-bi-scope 标记`)
  }
})

test('非归属门店布局：只渲染本店动态 CIS 卡，不渲染任何快照卡', async () => {
  const desktop = await read('apps/web/src/components/overview/BiInsightCharts.jsx')
  const mobile = await read('apps/web/src/components/overview/BiSalesMobile.jsx')
  // 非归属分支的渲染范围：切出 if (!own) { ... return ( ... ) } 块
  const block = (src) => {
    const start = src.indexOf('if (!own) {')
    const end = src.indexOf('return (', start)
    return src.slice(start, src.indexOf(')\n  }', end) + 1)
  }
  const deskBlock = block(desktop)
  for (const banned of ['BiSourceCompare', 'BiOnlineGauge', 'BiRepairTrend', 'BiRepairStat', 'BiReviewCard', 'BI_SNAPSHOT.economic', 'snapshot.economic', 'snapshot.repair', 'snapshot.review']) {
    assert.ok(!deskBlock.includes(banned), `非归属桌面分支不得渲染 ${banned}`)
  }
  assert.ok(deskBlock.includes('BiStoreWeekTrend') && deskBlock.includes('BiModelRanking'), '非归属桌面分支必须保留本店动态卡')
  const mobBlock = block(mobile)
  for (const banned of ['BimCompare', 'BimGauge', 'BimRepair', 'BimReview']) {
    assert.ok(!mobBlock.includes(banned), `非归属移动分支不得渲染 ${banned}`)
  }
  assert.ok(mobBlock.includes('BimStoreWeekTrend') && mobBlock.includes('BimRanking'), '非归属移动分支必须保留本店动态卡')
})

test('车型榜快照回退：只允许数据归属门店（allowSnapshotFallback）', async () => {
  const hook = await read('apps/web/src/hooks/useBiBikesWeek.js')
  assert.match(hook, /allowSnapshotFallback = false/u, '回退参数必须默认关闭（fail-closed）')
  assert.match(hook, /allowSnapshotFallback \? fallbackModels\(\) : unavailableModels\(\)/u, '非归属门店不得回退快照数据')
  assert.match(hook, /source: 'NONE'/u, '非归属门店 CIS 不可用必须显式未开通态')
  for (const file of ['apps/web/src/components/overview/BiInsightCharts.jsx', 'apps/web/src/components/overview/BiSalesMobile.jsx']) {
    const src = await read(file)
    assert.match(src, /useBiBikesWeek\(\{ allowSnapshotFallback: own \}\)/u, `${file} 车型榜回退必须按归属门控`)
  }
})

test('storeCode 穿线：App → SalesScene → 双端面板', async () => {
  const app = await read('apps/web/src/App.jsx')
  const scene = await read('apps/web/src/scenes/SalesScene.jsx')
  assert.match(app, /<SalesScene[^>]*storeCode=\{currentStore\?\.storeCode \|\| ''\}/u, 'App 必须把当前门店码传给销售场景')
  assert.match(scene, /storeCode = '' \}/u, 'SalesScene 必须接收 storeCode')
  assert.match(scene, /<BiInsightPanel storeCode=\{storeCode\} \/>/u)
  assert.match(scene, /<BiSalesMobile storeCode=\{storeCode\} \/>/u)
})

test('worker 边界：部署级账密不再被门店数据路径读取', async () => {
  const env = await readWorker('env.ts')
  // ShipHub 部署级账密字段已删除（loginKey 保留用于本店凭据加解密）。
  // 注意 MasterDataConfig 的 BI_MASTERDATA_LOGIN_* 合法保留——只服务全局
  // 商品字典（SKU 名同步），门店数据函数已结构性禁用（jwtProvider 必传）。
  assert.doesNotMatch(env, /SHIPHUB_LOGIN_USERNAME_ENC|SHIPHUB_LOGIN_PASSWORD_ENC/u, 'ShipHub 部署级账密 env 必须移除')
  const shipCfg = env.slice(env.indexOf('export interface ShipHubConfig'), env.indexOf('export interface AppConfig'))
  assert.doesNotMatch(shipCfg, /loginUsernameEnc|loginPasswordEnc/u, 'ShipHubConfig 不得再有部署级账密字段')
  const login = await readWorker('lib/shiphub-login.ts')
  assert.doesNotMatch(login, /readLoginCredentials/u, '程序化登录不得读部署级共享 secret')
  assert.match(login, /LOGIN_CREDENTIALS_REQUIRED/u, '缺凭据必须显式报错（不回退）')
  const connect = await readWorker('routes/shiphub.ts')
  assert.doesNotMatch(connect, /config\.SHIPHUB\.loginUsernameEnc/u, 'connect 不得读部署级共享账密')
  const heal = await readWorker('services/shiphub-sync.ts')
  assert.doesNotMatch(heal, /config\.SHIPHUB\.loginUsernameEnc/u, '自愈不得读部署级共享账密')
})

test('快照数据自声明归属门店（1299），供前端门控比对', async () => {
  const { BI_SNAPSHOT } = await import('../apps/web/src/data/biSnapshot.js')
  assert.equal(BI_SNAPSHOT.store.code, '1299')
  assert.equal(typeof BI_SNAPSHOT.store.name, 'string')
})
