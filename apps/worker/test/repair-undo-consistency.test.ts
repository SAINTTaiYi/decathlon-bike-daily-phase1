import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { restoreSnapshot } from '../src/services/restore.js'

type CapturedStatement = { sql: string; values: unknown[] }

function fakeDatabase() {
  const statements: CapturedStatement[] = []
  return {
    statements,
    db: {
      prepare(sql: string) {
        return {
          bind(...values: unknown[]) {
            return { sql, values }
          }
        }
      },
      async batch(next: CapturedStatement[]) {
        statements.push(...next)
        return []
      }
    } as unknown as D1Database
  }
}

const repairSnapshot = {
  workItem: {
    id: 'repair-1', kind: 'repair', title: 'RC520', detail: '保养', meta: '付费',
    status: '维修中', lifecycle: 'active', revision: 1, updatedBy: 'user-1'
  },
  repair: {
    contactType: 'phone', contactCiphertext: 'cipher', contactFingerprint: 'fingerprint',
    repairType: '付费', repairProject: '保养', repairStatus: '维修中'
  },
  pickup: null,
  resale: null,
  handover: null
}

test('撤回非店修转待取时，快照恢复会原子删除不属于维修态的待取明细', async () => {
  const { db, statements } = fakeDatabase()
  await restoreSnapshot(db, repairSnapshot)

  assert.equal(statements.length, 5)
  assert.match(statements[0]?.sql ?? '', /UPDATE work_items SET/u)
  assert.match(statements[1]?.sql ?? '', /INSERT INTO repair_details/u)
  assert.match(statements[2]?.sql ?? '', /DELETE FROM pickup_details WHERE work_item_id = \?/u)
  assert.match(statements[3]?.sql ?? '', /DELETE FROM resale_details WHERE work_item_id = \?/u)
  assert.match(statements[4]?.sql ?? '', /DELETE FROM handover_details WHERE work_item_id = \?/u)
})

test('非店修二次完成会替换遗留待取明细，且撤回与审计记录走同一个 D1 批处理', async () => {
  const workItems = await readFile(new URL('../src/routes/work-items.ts', import.meta.url), 'utf8')
  const audit = await readFile(new URL('../src/routes/audit.ts', import.meta.url), 'utf8')

  assert.match(workItems, /const \[updated\] = await db\.batch\(\[/u)
  assert.match(workItems, /DELETE FROM pickup_details/u)
  assert.match(workItems, /INSERT INTO pickup_details[\s\S]*SELECT \?, 'repair'/u)
  assert.match(workItems, /UPDATE repair_details SET repair_completed_at = \?/u)
  assert.doesNotMatch(workItems, /UPDATE repair_details SET repair_status = '维修完成'/u)
  assert.match(workItems, /completedRepairPickup/u)
  assert.match(workItems, /repair\?\.repairStatus \?\? repair\?\.repair_status/u)
  assert.match(workItems, /status = completedRepairPickup \? '维修完成' : fields\.status/u)
  assert.match(workItems, /if \(!updated\?\.meta\.changes\)/u)
  assert.match(workItems, /let stateChanged = false/u)
  assert.match(workItems, /stateChanged = true/u)
  assert.match(workItems, /if \(stateChanged\) await restoreSnapshot\(db, before\)/u)
  assert.match(audit, /buildRestoreSnapshotStatements/u)
  assert.match(audit, /prepareAudit\(db/u)
  assert.match(audit, /await db\.batch\(\[\.\.\.restoreStatements, audit\.statement\]\)/u)
})


test('二手车售出转换在 Worker 与 API 中保留售出明细，并原子重建二手车待取明细', async () => {
  const [worker, api] = await Promise.all([
    readFile(new URL('../src/routes/work-items.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../api/src/routes/work-items.ts', import.meta.url), 'utf8')
  ])

  assert.match(worker, /actionRoute\('\/api\/v1\/work-items\/:id\/sell-resale', 'sell-resale'/u)
  assert.match(worker, /UPDATE work_items SET kind = 'pickup', status = '等待取车', lifecycle = 'active'/u)
  assert.match(worker, /UPDATE resale_details SET resale_stage = 'sold', sold_at = \?/u)
  assert.match(worker, /DELETE FROM pickup_details/u)
  assert.match(worker, /INSERT INTO pickup_details[\s\S]*SELECT \?, 'used-car', NULL, 'pending'/u)
  assert.match(worker, /store_id = \? AND kind = 'pickup' AND revision = \?/u)
  assert.match(worker, /extra: \{ route: 'pickup' \}/u)
  assert.match(worker, /USED_CAR_SOURCE_LOCKED/u)

  assert.match(api, /set kind = 'pickup', status = '等待取车', lifecycle = 'active'/u)
  assert.match(api, /update bike_ops\.resale_details set resale_stage = 'sold'/u)
  assert.match(api, /insert into bike_ops\.pickup_details[\s\S]*'used-car', null, 'pending'/u)
  assert.match(api, /USED_CAR_SOURCE_LOCKED/u)
})
