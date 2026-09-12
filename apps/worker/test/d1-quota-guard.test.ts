import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import type { WorkerEnv } from '../src/env.js'
import {
  detectD1LimitError,
  d1LimitProblemBody,
  errorChainText,
  nextD1QuotaReset
} from '../src/lib/d1-limits.js'
import {
  buildD1UsageAlertEmail,
  fetchD1DailyUsage,
  resetD1UsageAlertThrottleForTests,
  runD1UsageAlert,
  usageAlertLevel
} from '../src/services/d1-usage-alert.js'
import { migratedTestDatabase } from '../security/d1-test-adapter.js'

// ── D1 限额识别（2026-09-13）─────────────────────────────────────────
// 事故背景：2026-09-12 写额度被 preview 定时任务烧穿后，staging 全部写入被平台拒绝
// （7500），门店只看到通用 500。这些测试锁定两条防线：
//   ① 限额错误 → 结构化 503（D1_WRITE_LIMIT / D1_READ_LIMIT + recoveryAt）；
//   ② 用量达到 80% / 100% → 邮件预警（每天每指标每档最多一封）。

// 平台原文（写额度），与 2026-09-12 事故实测一致。
const REAL_WRITE_LIMIT_MESSAGE =
  "D1_ERROR: Your account has exceeded D1's free tier daily row write limit. Upgrade to a paid plan or wait until tomorrow (midnight UTC) to continue. [code: 7500]"
const REAL_READ_LIMIT_MESSAGE =
  "D1_ERROR: Your account has exceeded D1's free tier daily row read limit. Upgrade to a paid plan or wait until tomorrow (midnight UTC) to continue."

test('detectD1LimitError：识别写/读额度，普通错误不误伤', () => {
  assert.equal(detectD1LimitError(REAL_WRITE_LIMIT_MESSAGE), 'write')
  assert.equal(detectD1LimitError(REAL_READ_LIMIT_MESSAGE), 'read')
  assert.equal(detectD1LimitError('D1_ERROR: UNIQUE constraint failed'), null)
  assert.equal(detectD1LimitError('D1_RUN_FAILED'), null)
  assert.equal(detectD1LimitError(''), null)
  assert.equal(detectD1LimitError(undefined), null)
  assert.equal(detectD1LimitError(123), null)
})

test('errorChainText：错误链（含 cause）拼接，D1 包装错误也能识别', () => {
  const wrapped = new Error('D1_RUN_FAILED: generic wrapper', { cause: new Error(REAL_WRITE_LIMIT_MESSAGE) })
  assert.equal(detectD1LimitError(errorChainText(wrapped)), 'write')
  assert.match(errorChainText(wrapped), /daily row write limit/u)
})

test('nextD1QuotaReset：下一个 UTC 零点（北京时间 08:00 重置）', () => {
  assert.equal(nextD1QuotaReset(new Date('2026-09-12T09:50:26.000Z')), '2026-09-13T00:00:00.000Z')
  assert.equal(nextD1QuotaReset(new Date('2026-09-12T23:59:59.000Z')), '2026-09-13T00:00:00.000Z')
  assert.equal(nextD1QuotaReset(new Date('2026-09-13T00:00:00.000Z')), '2026-09-14T00:00:00.000Z')
})

test('d1LimitProblemBody：写/读各自的 503 结构与恢复时点', () => {
  const write = d1LimitProblemBody('write', new Date('2026-09-12T10:00:00Z'))
  assert.equal(write.error, 'D1_WRITE_LIMIT')
  assert.equal(write.recoveryAt, '2026-09-13T00:00:00.000Z')
  assert.match(write.message, /写入额度/u)
  assert.match(write.message, /应急交接/u)
  const read = d1LimitProblemBody('read', new Date('2026-09-12T10:00:00Z'))
  assert.equal(read.error, 'D1_READ_LIMIT')
  assert.match(read.message, /快照/u)
})

test('usageAlertLevel：80% 预警 / 100% 告急 / 未达阈值静默', () => {
  assert.equal(usageAlertLevel(0), null)
  assert.equal(usageAlertLevel(0.5), null)
  assert.equal(usageAlertLevel(0.799), null)
  assert.equal(usageAlertLevel(0.8), 'warning')
  assert.equal(usageAlertLevel(0.999), 'warning')
  assert.equal(usageAlertLevel(1), 'critical')
  assert.equal(usageAlertLevel(3.5), 'critical')
  assert.equal(usageAlertLevel(Number.NaN), null)
})

test('buildD1UsageAlertEmail：主题与正文包含指标 / 数量 / 恢复窗口', () => {
  const email = buildD1UsageAlertEmail({ metric: 'write', level: 'warning', value: 82_345, limit: 100_000, day: '2026-09-13' })
  assert.match(email.subject, /写入 82%/u)
  assert.match(email.subject, /82,345\/100,000/u)
  assert.match(email.text, /写入行数/u)
  assert.match(email.text, /北京时间每日 08:00 重置/u)
  assert.match(email.text, /7500/u)
  const critical = buildD1UsageAlertEmail({ metric: 'read', level: 'critical', value: 5_100_000, limit: 5_000_000, day: '2026-09-13' })
  assert.match(critical.subject, /告急/u)
  assert.match(critical.subject, /读取 102%/u)
})

test('fetchD1DailyUsage：解析 totals；非 200 / 缺数据 / 网络错误返回 null', async () => {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ data: { viewer: { accounts: [{ totals: [{ sum: { rowsRead: 411_570, rowsWritten: 34_632 } }] }] } } }), { status: 200 })) as any
    assert.deepEqual(await fetchD1DailyUsage({ D1_METRICS_TOKEN: 'tok' }, new Date('2026-09-13T10:00:00Z')), { rowsRead: 411_570, rowsWritten: 34_632 })

    globalThis.fetch = (async () => new Response('nope', { status: 500 })) as any
    assert.equal(await fetchD1DailyUsage({ D1_METRICS_TOKEN: 'tok' }), null)

    globalThis.fetch = (async () => { throw new Error('network down') }) as any
    assert.equal(await fetchD1DailyUsage({ D1_METRICS_TOKEN: 'tok' }), null)

    assert.equal(await fetchD1DailyUsage({}, new Date()), null, '未配置 token 不发起请求')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('runD1UsageAlert：80% 发预警、同档位当天不重复、100% 补告急', async () => {
  const db = await migratedTestDatabase()
  const originalFetch = globalThis.fetch
  const emails: Array<{ to: string[]; subject: string; text: string }> = []
  let rowsWritten = 82_000
  globalThis.fetch = (async (url: any, init?: any) => {
    const target = String(url)
    if (target.includes('graphql')) {
      return new Response(JSON.stringify({ data: { viewer: { accounts: [{ totals: [{ sum: { rowsRead: 1_234, rowsWritten } }] }] } } }), { status: 200 })
    }
    if (target.includes('resend.com')) {
      emails.push(JSON.parse(String(init?.body ?? '{}')))
      return new Response('{}', { status: 200 })
    }
    throw new Error(`unexpected fetch ${target}`)
  }) as any
  try {
    const env = {
      DB: db as unknown as D1Database,
      D1_METRICS_TOKEN: 'tok',
      D1_ALERT_EMAIL: '1710751219@qq.com',
      RESEND_API_KEY: 'rk',
      RESEND_FROM: 'ops@example.test'
    } as unknown as WorkerEnv

    resetD1UsageAlertThrottleForTests()
    await runD1UsageAlert(env, new Date('2026-09-13T10:00:00Z'))
    assert.equal(emails.length, 1, '跨过 80% 必须发一封预警')
    assert.deepEqual(emails[0].to, ['1710751219@qq.com'])
    assert.match(emails[0].subject, /写入 82%/u)

    // 16 分钟后仍是同一档位：不重复发（去重表生效）
    await runD1UsageAlert(env, new Date('2026-09-13T10:16:00Z'))
    assert.equal(emails.length, 1, '同一天同一档位不得重复发信')

    // 升到 100%：补一封告急
    rowsWritten = 100_000
    await runD1UsageAlert(env, new Date('2026-09-13T10:32:00Z'))
    assert.equal(emails.length, 2, '跨到 100% 必须补发告急')
    assert.match(emails[1].subject, /告急/u)

    // 去重状态已落库（每天每指标每档一行）
    const rows = db.query<{ dedupe_key: string }>('SELECT dedupe_key FROM d1_usage_alerts ORDER BY dedupe_key')
    assert.deepEqual(rows.map((row) => row.dedupe_key), ['2026-09-13:write:critical', '2026-09-13:write:warning'])
  } finally {
    globalThis.fetch = originalFetch
    db.close()
  }
})

test('runD1UsageAlert：低于阈值 / 未配置 / 上游失败 一律静默', async () => {
  const db = await migratedTestDatabase()
  const originalFetch = globalThis.fetch
  let resendCalls = 0
  let graphqlMode: 'ok' | 'down' = 'ok'
  globalThis.fetch = (async (url: any) => {
    const target = String(url)
    if (target.includes('graphql')) {
      if (graphqlMode === 'down') throw new Error('graphql down')
      return new Response(JSON.stringify({ data: { viewer: { accounts: [{ totals: [{ sum: { rowsRead: 10, rowsWritten: 50_000 } }] }] } } }), { status: 200 })
    }
    if (target.includes('resend.com')) { resendCalls += 1; return new Response('{}', { status: 200 }) }
    throw new Error(`unexpected fetch ${target}`)
  }) as any
  try {
    const env = {
      DB: db as unknown as D1Database,
      D1_METRICS_TOKEN: 'tok',
      D1_ALERT_EMAIL: '1710751219@qq.com',
      RESEND_API_KEY: 'rk',
      RESEND_FROM: 'ops@example.test'
    } as unknown as WorkerEnv
    resetD1UsageAlertThrottleForTests()
    await runD1UsageAlert(env, new Date('2026-09-13T10:00:00Z'))
    assert.equal(resendCalls, 0, '50% 不达到阈值不得发信')

    graphqlMode = 'down'
    await runD1UsageAlert(env, new Date('2026-09-13T10:16:00Z'))
    assert.equal(resendCalls, 0, '上游失败必须静默')

    graphqlMode = 'ok'
    const unconfigured = { DB: db as unknown as D1Database } as unknown as WorkerEnv
    await runD1UsageAlert(unconfigured, new Date('2026-09-13T10:32:00Z'))
    const configured = {
      DB: db as unknown as D1Database,
      D1_METRICS_TOKEN: 'tok',
      D1_ALERT_EMAIL: '1710751219@qq.com',
      RESEND_API_KEY: 'rk',
      RESEND_FROM: 'ops@example.test'
    } as unknown as WorkerEnv
    await runD1UsageAlert(configured, new Date('2026-09-13T10:48:00Z'))
    assert.equal(resendCalls, 0, '未配置时不得发信（10% 配额也不到阈值）')
  } finally {
    globalThis.fetch = originalFetch
    db.close()
  }
})

test('接线检查：onError 转换限额 503、cron 挂载预警、db.run 保留平台错误文本、staging 注入收件箱', async () => {
  const [indexSource, dbSource, stagingWorkflow] = await Promise.all([
    readFile(new URL('../src/index.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/db.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../../.github/workflows/deploy-cloudflare-staging.yml', import.meta.url), 'utf8')
  ])
  assert.match(indexSource, /detectD1LimitError\(errorChainText\(error\)\)/u, 'onError 必须识别 D1 限额')
  assert.match(indexSource, /c\.json\(d1LimitProblemBody\(limitKind\), 503\)/u, '限额必须转成 503 结构化响应')
  assert.match(indexSource, /runD1UsageAlert\(env, fireTime\)/u, 'cron 必须挂载用量预警')
  assert.match(dbSource, /D1_RUN_FAILED: \$\{result\.error\}/u, 'db.run 必须保留平台错误文本（否则限额无法识别）')
  assert.match(stagingWorkflow, /"D1_ALERT_EMAIL": "1710751219@qq\.com"/u, 'staging 必须注入预警收件邮箱')
})
