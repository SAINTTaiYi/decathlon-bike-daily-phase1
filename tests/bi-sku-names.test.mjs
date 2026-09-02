// BI 车型名三层架构回归（2026-09-02 masterdata 官方确认后）：
// 静态精选(33) → /api/v1/bi/sku-names 兜底 → BI 原始 model。
// 任何码都不许裸显：全渠道行 model==code 时必须有静态或 API 层名称。
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
const root = new URL('../', import.meta.url)
const read = (file) => readFile(new URL(file, root), 'utf8')

test('静态映射：33 码全部为 masterdata 官方确认，值非空', async () => {
  const { ALLCHANNEL_NAMES } = await import('../apps/web/src/data/biSkuNames.js')
  const entries = Object.entries(ALLCHANNEL_NAMES)
  assert.equal(entries.length, 33, '快照车型码全集 33 码必须全部有精选名')
  for (const [code, name] of entries) {
    assert.match(code, /^\d{7,8}$/u, `码格式：${code}`)
    assert.equal(typeof name, 'string')
    assert.ok(name.trim().length > 0, `${code} 名称不得为空`)
  }
  // 2026-09-02 破案补全的 4 个原未确认码
  assert.equal(ALLCHANNEL_NAMES['9002783'], 'MTB EXPL 50 V2 LIGHT GREY CN')
  assert.equal(ALLCHANNEL_NAMES['8733846'], 'MOVE 900 KHAKI')
  assert.equal(ALLCHANNEL_NAMES['8987064'], 'TAAIEN SG GREY PHOTO')
  assert.equal(ALLCHANNEL_NAMES['8984793'], '26"EXPL 900 HD CN RED')
  // 用户人工确认的 3 个中文显示名保留
  assert.equal(ALLCHANNEL_NAMES['8640568'], 'Fit3 Jr 儿童轮滑鞋')
  assert.equal(ALLCHANNEL_NAMES['8984795'], 'EXPLORE 900 24" 青少年山地车')
  assert.equal(ALLCHANNEL_NAMES['8949264'], 'RCR 骑行服')
})

test('全渠道行零裸码：model==code 的行必须被静态映射命中', async () => {
  const { BI_SNAPSHOT } = await import('../apps/web/src/data/biSnapshot.js')
  const { ALLCHANNEL_NAMES } = await import('../apps/web/src/data/biSkuNames.js')
  for (const row of BI_SNAPSHOT.models.allChannel.rows) {
    if (row.model === row.code) {
      assert.ok(ALLCHANNEL_NAMES[row.code], `裸码行 ${row.code} 必须有精选名`)
    }
  }
  // top/flop 的码也应全部在映射内（masterdata 33 码全集覆盖）
  for (const row of [...BI_SNAPSHOT.models.top, ...BI_SNAPSHOT.models.flop]) {
    assert.ok(ALLCHANNEL_NAMES[row.code], `top/flop 码 ${row.code} 应在 33 码全集内`)
  }
})

test('名称解析链：静态 → API → model，桌面与移动两套实现一致', async () => {
  const charts = await read('apps/web/src/components/overview/BiInsightCharts.jsx')
  const mobile = await read('apps/web/src/components/overview/BiSalesMobile.jsx')
  for (const [label, source] of [['桌面', charts], ['移动', mobile]]) {
    assert.ok(source.includes("import { ALLCHANNEL_NAMES } from '../../data/biSkuNames.js'"), `${label} 必须用共享精选映射`)
    assert.ok(source.includes("import useBiSkuNames from '../../hooks/useBiSkuNames.js'"), `${label} 必须接 API 兜底 hook`)
    assert.match(source, /ALLCHANNEL_NAMES\[row\.code\] \|\| skuNames\[row\.code\]/u, `${label} 解析链：静态优先、API 兜底`)
    assert.match(source, /\|\| row\.model/u, `${label} 最终退回 BI 原始 model`)
  }
  // 旧本地 const 已删除（memory 23 ② 删旧不覆盖）
  assert.ok(!charts.includes('const ALLCHANNEL_NAMES = {'), '桌面不得残留本地映射')
  assert.ok(!mobile.includes('const ALLCHANNEL_NAMES = {'), '移动不得残留本地映射')
})

test('useBiSkuNames：模块级缓存 + 失败静默降级，不阻塞渲染', async () => {
  const hook = await read('apps/web/src/hooks/useBiSkuNames.js')
  assert.match(hook, /getBiSkuNames\(\)/u)
  assert.match(hook, /\.catch\(\(\) => null\)/u, '接口失败必须静默（不缓存失败）')
  const api = await read('apps/web/src/api/bi.js')
  assert.match(api, /\/api\/v1\/bi\/sku-names/u)
  // 组件失败态不得白屏：hook 返回空对象时退回 row.model（链上已断言）
})

test('Worker：GET 登录态可读，手动同步需 CSRF + 管理员；迁移与 schema 版本对齐', async () => {
  const route = await read('apps/worker/src/routes/bi.ts')
  assert.match(route, /app\.get\('\/api\/v1\/bi\/sku-names', \.\.\.read/u)
  assert.match(route, /app\.post\('\/api\/v1\/bi\/sku-names\/sync', requireJsonBody, \.\.\.managerWrite/u)
  const sync = await read('apps/worker/src/services/bi-sku-sync.ts')
  assert.match(sync, /MASTERDATA_NOT_CONFIGURED/u, '未配置必须优雅跳过')
  assert.match(sync, /STALE_MS = 24 \* 60 \* 60 \* 1000/u, '定时 24h 陈旧度守卫')
  assert.match(sync, /runScheduledBiSkuSync/u, '定时入口不抛错（记日志）')
  const login = await read('apps/worker/src/lib/masterdata-login.ts')
  assert.match(login, /redirect: 'manual'/u, '自定义 scheme 必须手工截获')
  assert.match(login, /code_verifier/u, 'PKCE 交换必须带 verifier（memory 13 ⑤）')
  const schema = await read('apps/worker/src/schema-version.ts')
  assert.match(schema, /'0021_bi_sku_names'/u)
  const migration = await read('migrations/d1/0021_bi_sku_names.sql')
  assert.match(migration, /CREATE TABLE bi_sku_names/u)
  assert.match(migration, /synced_at TEXT NOT NULL/u)
  const index = await read('apps/worker/src/index.ts')
  assert.match(index, /runScheduledBiSkuSync\(env\)/u, 'scheduled 挂 BI 同步')
})
