import assert from 'node:assert/strict'
import test from 'node:test'
import { fetchD1MetricsSnapshot, isD1MetricsConfigured, resetD1MetricsCacheForTests, D1MetricsUpstreamError } from '../src/services/d1-metrics.js'

// fetch mock：捕获请求体形态，返回固定 GraphQL 结构。
const NOW = new Date('2026-09-03T14:30:00Z')
const DAY = '2026-09-03'

function graphqlResponse(): Response {
  return new Response(JSON.stringify({
    data: {
      viewer: {
        accounts: [
          {
            totals: [{ count: 32, sum: { rowsRead: 411570, rowsWritten: 34632, readQueries: 18936, writeQueries: 21395 } }],
          perDb: [
              { sum: { rowsRead: 363546 }, dimensions: { databaseId: '91e78387-9b24-4126-a5a1-27f9c1792975' } },
              { sum: { rowsRead: 48024 }, dimensions: { databaseId: 'e40af8eb-6340-4b9e-8484-20247323fd84' } }
            ],
            hourly: [
              { sum: { rowsRead: 1029 }, dimensions: { datetimeHour: '2026-09-03T00:00:00Z' } },
              { sum: { rowsRead: 7134 }, dimensions: { datetimeHour: '2026-09-03T10:00:00Z' } },
              { sum: { rowsRead: 7134 }, dimensions: { datetimeHour: '2026-09-03T10:00:00Z' } }
            ],
            top: [
              { count: 213, sum: { rowsRead: 265824 }, dimensions: { query: '  SELECT e.id, e.action\n  FROM audit_events' } },
              { count: 3465, sum: { rowsRead: 10395 }, dimensions: { query: 'INSERT INTO shiphub_sync_runs' } },
              { count: 2, sum: { rowsRead: 5 }, dimensions: { query: '' } }
            ]
          }
        ]
      }
    }
  }), { status: 200 })
}

test.beforeEach(() => { resetD1MetricsCacheForTests() })

test('isD1MetricsConfigured：token 存在才启用', () => {
  assert.equal(isD1MetricsConfigured({}), false)
  assert.equal(isD1MetricsConfigured({ D1_METRICS_TOKEN: '' }), false)
  assert.equal(isD1MetricsConfigured({ D1_METRICS_TOKEN: 'tok' }), true)
})

test('fetchD1MetricsSnapshot：解析 totals/perDb/hourly/top + 投影 + 请求形态', async () => {
  const originalFetch = globalThis.fetch
  let body = ''
  let auth = ''
  globalThis.fetch = (async (_url: any, init?: any) => {
    body = String(init?.body ?? '')
    auth = String(init?.headers?.authorization ?? '')
    return graphqlResponse()
  }) as typeof fetch
  try {
    const snapshot = await fetchD1MetricsSnapshot({ D1_METRICS_TOKEN: 'tok' }, NOW)
    assert.ok(auth.startsWith('Bearer tok'))
    assert.match(body, /date_geq: \\?"2026-09-03\\?"/)
    assert.match(body, /datetimeHour_geq: \\?"2026-09-03T00:00:00Z\\?"/)
    assert.match(body, /sum_rowsRead_DESC/)
    assert.equal(snapshot.available, true)
    assert.equal(snapshot.limit, 5_000_000)
    assert.equal(snapshot.totals.rowsRead, 411570)
    assert.equal(snapshot.databases.length, 2)
    assert.equal(snapshot.databases[0].database, 'staging')
    assert.equal(snapshot.databases[0].rowsRead, 363546)
    assert.equal(snapshot.databases[1].database, 'preview')
    // datetimeHour 聚合：两条 10 时桶合并为 14268
    assert.deepEqual(snapshot.series, [{ hour: 0, rowsRead: 1029 }, { hour: 10, rowsRead: 14268 }])
    // SQL 压空白 + 空 query 剔除
    assert.equal(snapshot.top.length, 2)
    assert.equal(snapshot.top[0].query, 'SELECT e.id, e.action FROM audit_events')
    assert.equal(snapshot.top[0].count, 213)
    // 14.5h 已过 → 投影 = 411570/14.5*24
    assert.equal(snapshot.projectedFullDay, Math.round(411570 / 14.5 * 24))
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('fetchD1MetricsSnapshot：60 秒模块缓存生效（同日两次只 fetch 一次）', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = (async () => { calls += 1; return graphqlResponse() }) as typeof fetch
  try {
    const first = await fetchD1MetricsSnapshot({ D1_METRICS_TOKEN: 'tok' }, NOW)
    const second = await fetchD1MetricsSnapshot({ D1_METRICS_TOKEN: 'tok' }, new Date('2026-09-03T14:30:30Z'))
    assert.equal(calls, 1)
    assert.equal(second, first)
    // 超过 TTL 重新拉取
    await fetchD1MetricsSnapshot({ D1_METRICS_TOKEN: 'tok' }, new Date('2026-09-03T14:31:01Z'))
    assert.equal(calls, 2)
    // 跨日窗口：换 UTC 日必重拉
    await fetchD1MetricsSnapshot({ D1_METRICS_TOKEN: 'tok' }, new Date('2026-09-04T00:00:30Z'))
    assert.equal(calls, 3)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('fetchD1MetricsSnapshot：未配置 token 直接抛错（路由层负责 available:false）', async () => {
  await assert.rejects(() => fetchD1MetricsSnapshot({}, NOW))
})

test('fetchD1MetricsSnapshot：上游 HTTP 非 200 / GraphQL errors / 网络失败 → D1MetricsUpstreamError', async () => {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async () => new Response('nope', { status: 500 })) as typeof fetch
    await assert.rejects(() => fetchD1MetricsSnapshot({ D1_METRICS_TOKEN: 'tok' }, NOW), D1MetricsUpstreamError)
    resetD1MetricsCacheForTests()
    globalThis.fetch = (async () => new Response(JSON.stringify({ data: null, errors: [{ message: 'bad enum' }] }), { status: 200 })) as typeof fetch
    await assert.rejects(() => fetchD1MetricsSnapshot({ D1_METRICS_TOKEN: 'tok' }, NOW), D1MetricsUpstreamError)
    resetD1MetricsCacheForTests()
    globalThis.fetch = (async () => { throw new Error('network down') }) as typeof fetch
    await assert.rejects(() => fetchD1MetricsSnapshot({ D1_METRICS_TOKEN: 'tok' }, NOW), D1MetricsUpstreamError)
  } finally {
    globalThis.fetch = originalFetch
  }
})
