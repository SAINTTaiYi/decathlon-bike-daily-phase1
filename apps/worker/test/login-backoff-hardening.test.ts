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
  assert.equal(loginBackoffMs(9), 16000)

  // Capped so a stuck client cannot hold a Worker invocation open indefinitely.
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

test('平台管理员仍然豁免锁定，退避不得退化为拒绝服务', async () => {
  const source = await readFile(new URL('../src/routes/auth.ts', import.meta.url), 'utf8')

  // Locking the platform admin would let anyone deny service to the only account that can
  // administer the platform. The exemption must survive this hardening.
  assert.match(source, /WHEN is_platform_admin = 1 THEN NULL/u, '平台管理员必须继续豁免锁定')
  assert.match(source, /user\?\.is_platform_admin !== 1 && Boolean\(user\?\.locked_until/u, '平台管理员不得因锁定被拒绝登录')
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

  // Unknown user and locked account must still short-circuit to the same generic failure, so the
  // backoff cannot be used to distinguish "account exists" from "account does not exist".
  assert.match(loginBlock, /if \(!user \|\| accountLockActive\) return c\.json\(genericFailure, 401\)/u)

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
