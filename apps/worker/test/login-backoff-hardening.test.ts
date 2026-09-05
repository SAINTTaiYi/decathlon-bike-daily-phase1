import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { LOGIN_BACKOFF_MAX_MS, LOGIN_BACKOFF_THRESHOLD, loginBackoffMs, shouldAlertOnFailedLogin } from '../src/routes/auth.js'

test('登录退避在阈值前为零，之后指数增长并封顶', () => {
  // A legitimate user who mistypes a few times must not be slowed down at all.
  for (let count = 0; count < LOGIN_BACKOFF_THRESHOLD; count += 1) {
    assert.equal(loginBackoffMs(count), 0, `第 ${count} 次失败不应产生延迟`)
  }

  assert.equal(loginBackoffMs(5), 1000)
  assert.equal(loginBackoffMs(6), 2000)
  assert.equal(loginBackoffMs(7), 4000)
  assert.equal(loginBackoffMs(8), 8000)

  // Capped so a stuck client cannot hold a Worker invocation open indefinitely,
  // and so a legitimate mistyped password never looks like a frozen page.
  assert.equal(loginBackoffMs(9), LOGIN_BACKOFF_MAX_MS)
  assert.equal(loginBackoffMs(10), LOGIN_BACKOFF_MAX_MS)
  assert.equal(loginBackoffMs(50), LOGIN_BACKOFF_MAX_MS)
  assert.equal(loginBackoffMs(10_000), LOGIN_BACKOFF_MAX_MS)
})

test('失败告警在跨过阈值时触发一次，随后每十次一条', () => {
  assert.equal(shouldAlertOnFailedLogin(4), false)
  assert.equal(shouldAlertOnFailedLogin(5), true)
  assert.equal(shouldAlertOnFailedLogin(6), false)
  assert.equal(shouldAlertOnFailedLogin(15), true)
  assert.equal(shouldAlertOnFailedLogin(25), true)
  assert.equal(shouldAlertOnFailedLogin(26), false)
})

test('任何账号都不再被硬锁：锁定语句必须已从登录路径删除（渗透复测 2026-09-05）', async () => {
  const source = await readFile(new URL('../src/routes/auth.ts', import.meta.url), 'utf8')
  const loginBlock = source.slice(source.indexOf("app.post('/api/v1/auth/login'"), source.indexOf("app.get('/api/v1/auth/me'"))

  // 账号硬锁可被任何知道用户名的人武器化：五次错误密码就能反复把员工锁在门外。
  // 锁定写入、锁定拒绝分支、平台管理员豁免 CASE 都必须消失。
  assert.doesNotMatch(loginBlock, /locked_until = CASE/u, '失败路径不得再写锁定 CASE')
  assert.doesNotMatch(loginBlock, /WHEN failed_login_count \+ 1 >= 5/u, '旧的五次锁定阈值必须删除')
  assert.doesNotMatch(loginBlock, /accountLockActive/u, '不得存在按锁定拒绝登录的分支')
  assert.doesNotMatch(loginBlock, /is_platform_admin = 1 THEN NULL/u, '管理员豁免 CASE 已无存在必要')
  assert.doesNotMatch(loginBlock, /locked_until, is_platform_admin/u, '登录查询不得再取锁定字段')
  // 失败计数保持原子增量：退避与审计告警的输入
  assert.match(loginBlock, /failed_login_count = failed_login_count \+ 1/u, '失败计数仍保持原子增量')
  // 历史遗留的锁定时间戳必须被清掉，防止旧值复活语义
  assert.match(loginBlock, /failed_login_count = failed_login_count \+ 1,\s+locked_until = NULL/u, '失败路径应顺手清空历史锁定时间戳')
})

test('退避只作用于失败路径，且不引入用户名枚举侧信道', async () => {
  const source = await readFile(new URL('../src/routes/auth.ts', import.meta.url), 'utf8')
  const loginBlock = source.slice(source.indexOf("app.post('/api/v1/auth/login'"), source.indexOf("app.get('/api/v1/auth/me'"))

  // A correct password must never be delayed.
  const delayCalls = loginBlock.match(/await delay\(/gu) || []
  assert.equal(delayCalls.length, 1, '登录路径只应有一处退避调用')
  const delayIndex = loginBlock.indexOf('await delay(')
  const successIndex = loginBlock.indexOf('setSessionCookie')
  assert.ok(delayIndex < successIndex, '退避必须位于成功签发会话之前的失败分支中')

  // Unknown user must still answer the same generic failure. A dummy PBKDF2
  // equalizes latency so the backoff cannot be used to distinguish account existence.
  assert.match(loginBlock, /if \(!user\) \{[\s\S]*?await verifyPassword\(DUMMY_PASSWORD_HASH, input\.password, config\.PASSWORD_PEPPER\)[\s\S]*?return c\.json\(genericFailure, 401\)/u)

  // Alert bookkeeping must never turn a failed login into a 500.
  assert.match(loginBlock, /try \{ await alert\.statement\.run\(\) \} catch \{/u, '告警写入失败不得影响登录响应')
})

test('快照恢复语句全部限定门店范围', async () => {
  const source = await readFile(new URL('../src/services/restore.ts', import.meta.url), 'utf8')

  // Detail tables key off work_item_id only, so tenant scope must be asserted through the parent.
  assert.match(source, /const OWNED = 'EXISTS \(SELECT 1 FROM work_items WHERE id = \? AND store_id = \?\)'/u)
  assert.match(source, /if \(!storeId\) throw new Error\('MISSING_RESTORE_STORE_SCOPE'\)/u, '缺少门店范围必须直接失败而不是静默放行')

  // Every DELETE against a detail table must be guarded.
  const deletes = source.match(/DELETE FROM \w+_details WHERE work_item_id = \? AND \$\{OWNED\}/gu) || []
  assert.equal(deletes.length, 4, '四张明细表的删除都必须限定门店')

  // The parent update carries store_id directly.
  assert.match(source, /UPDATE work_items SET[\s\S]*?WHERE id = \? AND store_id = \?/u)

  // Callers must pass their authenticated store, never a value from the snapshot itself.
  const audit = await readFile(new URL('../src/routes/audit.ts', import.meta.url), 'utf8')
  const workItems = await readFile(new URL('../src/routes/work-items.ts', import.meta.url), 'utf8')
  assert.match(audit, /buildRestoreSnapshotStatements\(db, beforeState, context\.storeId\)/u)
  assert.match(workItems, /buildRestoreSnapshotStatements\(db, before, context\.storeId\)/u)
})
