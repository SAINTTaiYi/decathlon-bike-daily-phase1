import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

// D1 is a network service: each awaited statement is a full round trip. The interactive
// write path had a fixed per-submission latency that was independent of data volume, which
// is why a single store with a handful of users still saw slow submissions. These contracts
// pin the round-trip reductions so they are not silently reverted.

test('internalSnapshot 并发读取五张明细表，而不是串行五次往返', async () => {
  const source = await readFile(new URL('../src/repositories/work-items.ts', import.meta.url), 'utf8')
  const body = source.slice(source.indexOf('export async function internalSnapshot'))
  const snapshot = body.slice(0, body.indexOf('\n}\n') + 3)

  assert.match(snapshot, /await Promise\.all\(\[/u, '五次明细读取必须并发发起')
  assert.equal(
    (snapshot.match(/await first\(/gu) || []).length,
    0,
    'internalSnapshot 内不得保留串行的 await first(...)'
  )
  // All five tables must still be read: dropping one would silently change audit payloads.
  for (const table of ['work_items', 'repair_details', 'pickup_details', 'resale_details', 'handover_details']) {
    assert.ok(snapshot.includes(table), `快照必须仍然读取 ${table}`)
  }
  // A missing work item must still short-circuit to null before the object is assembled.
  assert.match(snapshot, /if \(!workItem\) return null/u, '缺失主记录仍必须返回 null')
})

test('工单写入路径并发执行审计写入与记录回读', async () => {
  const source = await readFile(new URL('../src/routes/work-items.ts', import.meta.url), 'utf8')

  // Each interactive mutation should pair its audit insert with the read-back rather than
  // awaiting them one after the other.
  const paired = source.match(/const \[eventId, record\] = await Promise\.all\(\[/gu) || []
  assert.ok(paired.length >= 4, `至少四条交互写入路径应并发审计与回读，实际 ${paired.length}`)

  // The audit insert must remain inside the concurrent pair, never dropped.
  assert.ok(
    (source.match(/writeAudit\(db, \{/gu) || []).length >= 4,
    '审计写入不得在并发化过程中丢失'
  )
})

test('幂等收尾写入保持同步，双击提交仍返回缓存结果而不是 REQUEST_IN_PROGRESS', async () => {
  const source = await readFile(new URL('../src/services/idempotency.ts', import.meta.url), 'utf8')

  // Deliberately NOT optimized: making this write fire-and-forget would let a double click
  // observe response_status IS NULL and surface a 409 instead of the cached result.
  const tail = source.slice(source.indexOf('UPDATE idempotency_requests'))
  assert.match(source, /await c\.env\.DB\.prepare\(`\s*UPDATE idempotency_requests/u, '幂等响应写回必须保持 await')
  assert.doesNotMatch(tail, /waitUntil/u, '幂等响应写回不得改为 waitUntil')
})
