import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import {
  createFoodBatch,
  foodOverview,
  listFoodBatches,
  listShelfLife,
  setFoodBatchStatus,
  upsertShelfLife
} from '../src/services/food-ledger.js'
import { migratedTestDatabase, type TestD1Database } from '../security/d1-test-adapter.js'

// 食品保质期台账（2026-09-13）。锚点与 packages/domain/test/food.test.mjs 一致，
// 全部取自门店 Excel 台账的真实行；today 一律显式传入，测试不依赖系统时间。

const STORE_A = 'food-store-a'
const STORE_B = 'food-store-b'
const ACTOR_A = { storeId: STORE_A, displayName: 'jingyi' }
const ACTOR_B = { storeId: STORE_B, displayName: 'anna' }
const TODAY = '2026-09-13'

async function database(): Promise<TestD1Database> {
  const db = await migratedTestDatabase()
  const stamp = '2026-09-01T00:00:00.000Z'
  db.exec(`
    INSERT INTO stores (id, code, name, timezone, status, created_at, updated_at) VALUES
      ('${STORE_A}', 'FODA', '测试店A', 'Asia/Shanghai', 'active', '${stamp}', '${stamp}'),
      ('${STORE_B}', 'FODB', '测试店B', 'Asia/Shanghai', 'active', '${stamp}', '${stamp}');
  `)
  return db
}

async function seedShelf(db: TestD1Database): Promise<void> {
  await upsertShelfLife(db, { itemCode: '2074681', name: '天然矿泉水500ML', shelfLifeMonths: 24, category: '饮料' })
  await upsertShelfLife(db, { itemCode: '5144573', name: '蛋白棒', shelfLifeMonths: 9, category: '蛋白棒' })
  await upsertShelfLife(db, { itemCode: '4885348', name: '防晒喷雾150ML', shelfLifeMonths: 36, category: '防晒' })
}

test('清单 upsert 幂等：同码改月数是被覆盖更新而不是新增', async () => {
  const db = await database()
  await upsertShelfLife(db, { itemCode: '2074681', name: '天然矿泉水500ML', shelfLifeMonths: 24, category: '饮料' })
  await upsertShelfLife(db, { itemCode: '2074681', name: '天然矿泉水 500ml', shelfLifeMonths: 18, category: '饮料' })
  const items = await listShelfLife(db)
  assert.equal(items.length, 1)
  assert.equal(items[0].shelfLifeMonths, 18)
  assert.equal(items[0].name, '天然矿泉水 500ml')
})

test('登记按清单月数落库预警日与到期日（食品 + 非食品两种日期口径）', async () => {
  const db = await database()
  await seedShelf(db)

  // 食品：生产 2025-09-11、24 个月 → 预警 2027-08-11 / 到期 2027-09-11（与 Excel 单元格一致）
  const food = await createFoodBatch(db, ACTOR_A, {
    itemCode: '2074681', kind: 'food', dateType: 'production',
    productionDate: '2025-09-11', receivedDate: '2026-01-03', quantity: 24, receiver: 'Anna'
  })
  assert.equal(food.batch.warnOn, '2027-08-11')
  assert.equal(food.batch.expiresOn, '2027-09-11')
  assert.equal(food.batch.status, 'open')
  assert.equal(food.batch.revision, 1)
  assert.equal(food.batch.receiver, 'Anna')

  // 非食品·生产日期：36 个月 → 预警 = 生产 + 35 月（Excel 非食品页同款公式）
  const nonFood = await createFoodBatch(db, ACTOR_A, {
    itemCode: '4885348', kind: 'nonfood', dateType: 'production',
    productionDate: '2025-03-10', receivedDate: '2025-04-27', quantity: 12, receiver: ''
  })
  assert.equal(nonFood.batch.warnOn, '2028-02-10')
  assert.equal(nonFood.batch.expiresOn, '2028-03-10')
  // receiver 缺省时落到当前登录人
  assert.equal(nonFood.batch.receiver, 'jingyi')

  // 非食品·限制使用日期：预警 = 限制日期 -1 月，到期即限制日期本身
  const restricted = await createFoodBatch(db, ACTOR_A, {
    itemCode: '4885348', kind: 'nonfood', dateType: 'restricted',
    restrictedDate: '2028-10-07', receivedDate: '2026-01-10', quantity: 6, receiver: 'lulu'
  })
  assert.equal(restricted.batch.warnOn, '2028-09-07')
  assert.equal(restricted.batch.expiresOn, '2028-10-07')
  assert.equal(restricted.batch.productionDate, null)
})

test('来货 45 天提醒按 SOP 第 8 条返回剩余天数', async () => {
  const db = await database()
  await seedShelf(db)
  await upsertShelfLife(db, { itemCode: '4688456', name: '柠泡泡', shelfLifeMonths: 9, category: '泡腾片' })
  // 生产 2025-10-26 + 9 月 = 2026-07-26 到期；2026-07-01 收货 → 剩 25 天 < 45，需要沟通
  const warn = await createFoodBatch(db, ACTOR_A, {
    itemCode: '4688456', kind: 'food', dateType: 'production',
    productionDate: '2025-10-26', receivedDate: '2026-07-01', quantity: 24, receiver: 'YI'
  })
  assert.equal(warn.receiptWarningDays, 25)

  const fine = await createFoodBatch(db, ACTOR_A, {
    itemCode: '2074681', kind: 'food', dateType: 'production',
    productionDate: '2026-07-23', receivedDate: '2026-09-12', quantity: 24, receiver: 'helen'
  })
  assert.equal(fine.receiptWarningDays, null)
})

test('清单缺码的商品拒绝登记，提示先补清单（与 Excel #N/A 流程一致）', async () => {
  const db = await database()
  await seedShelf(db)
  await assert.rejects(
    () => createFoodBatch(db, ACTOR_A, {
      itemCode: '9999999', kind: 'food', dateType: 'production',
      productionDate: '2026-01-01', receivedDate: '2026-01-02', quantity: 1, receiver: ''
    }),
    (error: unknown) => error instanceof Error && error.message.includes('不在保质期清单')
  )
})

test('overview 汇总红标 / 过期 / 近 45 天 / 在库数量', async () => {
  const db = await database()
  await seedShelf(db)
  // 红标但未过期：生产 2026-01-01 + 9 月 = 2026-10-01 到期，预警 2026-09-01（已过）→ flagged
  await createFoodBatch(db, ACTOR_A, {
    itemCode: '5144573', kind: 'food', dateType: 'production',
    productionDate: '2026-01-01', receivedDate: '2026-01-03', quantity: 20, receiver: 'Anna'
  })
  // 已过期：生产 2024-01-01 + 24 月 = 2026-01-01 到期
  await createFoodBatch(db, ACTOR_A, {
    itemCode: '2074681', kind: 'food', dateType: 'production',
    productionDate: '2024-01-01', receivedDate: '2024-01-02', quantity: 1, receiver: 'Anna'
  })
  // 正常：生产 2026-07-23 + 24 月 = 2028-07-23 到期
  await createFoodBatch(db, ACTOR_A, {
    itemCode: '2074681', kind: 'food', dateType: 'production',
    productionDate: '2026-07-23', receivedDate: '2026-09-12', quantity: 24, receiver: 'helen'
  })

  const overview = await foodOverview(db, STORE_A, TODAY)
  assert.equal(overview.today, TODAY)
  assert.equal(overview.counts.total, 3)
  assert.equal(overview.counts.open, 3)
  assert.equal(overview.counts.flagged, 2) // 红标 + 已过期（预警日都已过）
  assert.equal(overview.counts.expired, 1)
  assert.equal(overview.counts.soon, 0)
})

test('批次列表：flagged 只给未处理且已过预警日；处理后退出手办并可撤销回在库', async () => {
  const db = await database()
  await seedShelf(db)
  const flagged = await createFoodBatch(db, ACTOR_A, {
    itemCode: '5144573', kind: 'food', dateType: 'production',
    productionDate: '2025-10-27', receivedDate: '2026-01-03', quantity: 20, receiver: 'Anna'
  })
  const fresh = await createFoodBatch(db, ACTOR_A, {
    itemCode: '2074681', kind: 'food', dateType: 'production',
    productionDate: '2026-07-23', receivedDate: '2026-09-12', quantity: 24, receiver: 'helen'
  })

  const flaggedPage = await listFoodBatches(db, { storeId: STORE_A, today: TODAY, filter: 'flagged' })
  assert.equal(flaggedPage.batches.length, 1)
  assert.equal(flaggedPage.batches[0].id, flagged.batch.id)
  assert.equal(flaggedPage.hasMore, false)

  const allPage = await listFoodBatches(db, { storeId: STORE_A, today: TODAY, filter: 'all' })
  assert.equal(allPage.batches.length, 2)

  // 一键处理「已售罄」→ 记录检查人与时间，并退出红标待办
  const handled = await setFoodBatchStatus(db, ACTOR_A, flagged.batch.id, { expectedRevision: 1, status: 'sold_out' })
  assert.equal(handled.status, 'sold_out')
  assert.equal(handled.checkedBy, 'jingyi')
  assert.ok(handled.checkedAt)
  assert.equal(handled.revision, 2)
  const afterHandle = await listFoodBatches(db, { storeId: STORE_A, today: TODAY, filter: 'flagged' })
  assert.equal(afterHandle.batches.length, 0)

  // 撤销处理 → 回到在库，检查记录清空
  const reopened = await setFoodBatchStatus(db, ACTOR_A, flagged.batch.id, { expectedRevision: 2, status: 'open' })
  assert.equal(reopened.status, 'open')
  assert.equal(reopened.checkedBy, null)
  assert.equal(reopened.checkedAt, null)
  const afterReopen = await listFoodBatches(db, { storeId: STORE_A, today: TODAY, filter: 'flagged' })
  assert.equal(afterReopen.batches.length, 1)
  void fresh
})

test('处理时乐观锁：revision 过期返回 409，不覆盖他人结果', async () => {
  const db = await database()
  await seedShelf(db)
  const created = await createFoodBatch(db, ACTOR_A, {
    itemCode: '5144573', kind: 'food', dateType: 'production',
    productionDate: '2025-10-27', receivedDate: '2026-01-03', quantity: 20, receiver: 'Anna'
  })
  await setFoodBatchStatus(db, ACTOR_A, created.batch.id, { expectedRevision: 1, status: 'sold_out' })
  await assert.rejects(
    () => setFoodBatchStatus(db, ACTOR_A, created.batch.id, { expectedRevision: 1, status: 'isolated' }),
    (error: unknown) => error instanceof Error && error.message.includes('已被他人更新')
  )
})

test('门店边界铁律：批次列表与处理只认本店数据，跨店不可见也不可改', async () => {
  const db = await database()
  await seedShelf(db)
  const mine = await createFoodBatch(db, ACTOR_A, {
    itemCode: '5144573', kind: 'food', dateType: 'production',
    productionDate: '2025-10-27', receivedDate: '2026-01-03', quantity: 20, receiver: 'Anna'
  })

  // B 店看不到 A 店批次
  const otherStorePage = await listFoodBatches(db, { storeId: STORE_B, today: TODAY, filter: 'all' })
  assert.equal(otherStorePage.batches.length, 0)
  const otherOverview = await foodOverview(db, STORE_B, TODAY)
  assert.equal(otherOverview.counts.total, 0)

  // B 店不能处理 A 店批次（按 id 也不行）
  await assert.rejects(
    () => setFoodBatchStatus(db, ACTOR_B, mine.batch.id, { expectedRevision: 1, status: 'sold_out' }),
    (error: unknown) => error instanceof Error && error.message.includes('不属于本门店')
  )
})

test('批次列表排序：默认最新登记在前，可切换预警日排序（2026-09-14 用户反馈）', async () => {
  const db = await database()
  await seedShelf(db)
  // 三批不同收货日：09-01 / 09-05 / 09-10（生产日期相同，到期相同）
  for (const received of ['2026-09-01', '2026-09-05', '2026-09-10']) {
    await createFoodBatch(db, ACTOR_A, {
      itemCode: '2074681', kind: 'food', dateType: 'production',
      productionDate: '2026-07-23', receivedDate: received, quantity: 10, receiver: 'helen'
    })
  }
  const receivedDates = (page: { batches: Array<{ receivedDate: string }> }) => page.batches.map((item) => item.receivedDate)

  // 默认：最新登记在最前 —— 门店补货后第一眼要看刚登记了什么
  const defaultPage = await listFoodBatches(db, { storeId: STORE_A, today: TODAY, filter: 'open' })
  assert.deepEqual(receivedDates(defaultPage), ['2026-09-10', '2026-09-05', '2026-09-01'])
  // 显式传 received_desc 与默认一致
  const explicit = await listFoodBatches(db, { storeId: STORE_A, today: TODAY, filter: 'open', sort: 'received_desc' })
  assert.deepEqual(receivedDates(explicit), ['2026-09-10', '2026-09-05', '2026-09-01'])
  // 最早登记在前
  const asc = await listFoodBatches(db, { storeId: STORE_A, today: TODAY, filter: 'open', sort: 'received_asc' })
  assert.deepEqual(receivedDates(asc), ['2026-09-01', '2026-09-05', '2026-09-10'])
  // 未知排序值回落到默认，绝不把用户输入拼进 SQL
  const fallback = await listFoodBatches(db, { storeId: STORE_A, today: TODAY, filter: 'open', sort: 'DROP TABLE food_batches' })
  assert.deepEqual(receivedDates(fallback), ['2026-09-10', '2026-09-05', '2026-09-01'])
  const stillThere = await listFoodBatches(db, { storeId: STORE_A, today: TODAY, filter: 'open' })
  assert.equal(stillThere.batches.length, 3, '注入式排序值不得影响数据')
})

test('排序白名单是纯映射，不含任何拼接路径', async () => {
  const source = await readFile(new URL('../src/services/food-ledger.ts', import.meta.url), 'utf8')
  assert.match(source, /const FOOD_BATCH_ORDER: Record<string, string> = \{/u, '排序必须是白名单映射')
  assert.match(source, /export function foodBatchOrderBy/u)
  // ORDER BY 只能由白名单函数产出
  assert.match(source, /ORDER BY \$\{foodBatchOrderBy\(options\.sort\)\}/u, 'ORDER BY 必须走白名单函数')
})

test('「临期」筛选：预警日未到、但已进入 45 天沟通线的在库批次', async () => {
  // 口径说明（重要）：预警日 = 到期日 − 1 个月，所以「预警日已过」等价于
  // 「距到期 < 1 个月」。顶部三个数字必须互不重叠：
  //   红标 = 预警日已过（该清查）  → 距到期 < 1 个月
  //   临期 = 预警日未到但 45 天内到期 → 距到期 1～1.5 个月（即将变成红标）
  //   在库 = 全部未处理
  const db = await database()
  await seedShelf(db)
  const TODAY_LOCAL = '2026-09-13'

  // 临期：生产 2026-01-20 + 9 月 → 到期 2026-10-20（距今 37 天）；预警 2026-09-20（未到）
  const soon = await createFoodBatch(db, ACTOR_A, {
    itemCode: '5144573', kind: 'food', dateType: 'production',
    productionDate: '2026-01-20', receivedDate: '2026-01-25', quantity: 5, receiver: 'Anna'
  })
  assert.equal(soon.batch.warnOn, '2026-09-20', '前置：预警日必须未到')
  assert.equal(soon.batch.expiresOn, '2026-10-20', '前置：必须在 45 天窗口内')

  // 红标：生产 2026-01-01 + 9 月 → 到期 2026-10-01；预警 2026-09-01（已过）
  const flagged = await createFoodBatch(db, ACTOR_A, {
    itemCode: '5144573', kind: 'food', dateType: 'production',
    productionDate: '2026-01-01', receivedDate: '2026-01-03', quantity: 5, receiver: 'Anna'
  })
  // 正常：生产 2026-03-01 + 9 月 → 到期 2026-12-01；预警 2026-11-01（远）
  const normal = await createFoodBatch(db, ACTOR_A, {
    itemCode: '5144573', kind: 'food', dateType: 'production',
    productionDate: '2026-03-01', receivedDate: '2026-03-02', quantity: 5, receiver: 'Anna'
  })

  const soonPage = await listFoodBatches(db, { storeId: STORE_A, today: TODAY_LOCAL, filter: 'soon' })
  assert.deepEqual(soonPage.batches.map((item) => item.id), [soon.batch.id], '临期只应给出预警日未到且 45 天内到期的批次')

  const flaggedPage = await listFoodBatches(db, { storeId: STORE_A, today: TODAY_LOCAL, filter: 'flagged' })
  assert.deepEqual(flaggedPage.batches.map((item) => item.id), [flagged.batch.id], '红标只应给出预警日已过的批次')

  const openPage = await listFoodBatches(db, { storeId: STORE_A, today: TODAY_LOCAL, filter: 'open' })
  assert.equal(openPage.batches.length, 3, '在库应包含全部未处理批次')
  assert.ok(!openPage.batches.some((item) => item.id === normal.batch.id && item.warnOn <= TODAY_LOCAL))

  // 三个数字互不重叠：红标与临期的集合不相交
  const flaggedIds = new Set(flaggedPage.batches.map((item) => item.id))
  assert.ok(!soonPage.batches.some((item) => flaggedIds.has(item.id)), '红标与临期不得重叠')
})

test('批次列表支持分页 hasMore 与商品码 / 名称搜索', async () => {
  const db = await database()
  await seedShelf(db)
  for (let index = 0; index < 3; index += 1) {
    await createFoodBatch(db, ACTOR_A, {
      itemCode: '2074681', kind: 'food', dateType: 'production',
      productionDate: '2026-07-23', receivedDate: `2026-09-0${index + 1}`, quantity: 10 + index, receiver: 'helen'
    })
  }
  const firstPage = await listFoodBatches(db, { storeId: STORE_A, today: TODAY, filter: 'all', limit: 2 })
  assert.equal(firstPage.batches.length, 2)
  assert.equal(firstPage.hasMore, true)
  const secondPage = await listFoodBatches(db, { storeId: STORE_A, today: TODAY, filter: 'all', limit: 2, offset: 2 })
  assert.equal(secondPage.batches.length, 1)
  assert.equal(secondPage.hasMore, false)

  const byCode = await listFoodBatches(db, { storeId: STORE_A, today: TODAY, filter: 'all', query: '2074681' })
  assert.equal(byCode.batches.length, 3)
  const byName = await listFoodBatches(db, { storeId: STORE_A, today: TODAY, filter: 'all', query: '矿泉水' })
  assert.equal(byName.batches.length, 3)
  const noMatch = await listFoodBatches(db, { storeId: STORE_A, today: TODAY, filter: 'all', query: '能量胶' })
  assert.equal(noMatch.batches.length, 0)
})
