import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const registrationSource = await readFile(new URL('../src/routes/registration.ts', import.meta.url), 'utf8')
const governanceSource = await readFile(new URL('../src/routes/governance.ts', import.meta.url), 'utf8')
const authSource = await readFile(new URL('../src/routes/auth.ts', import.meta.url), 'utf8')
const adminSource = await readFile(new URL('../src/routes/admin.ts', import.meta.url), 'utf8')
const schemaVersion = await readFile(new URL('../src/schema-version.ts', import.meta.url), 'utf8')
const adapter = await readFile(new URL('../security/d1-test-adapter.ts', import.meta.url), 'utf8')
const migration = await readFile(new URL('../../../migrations/d1/0026_store_join_requests.sql', import.meta.url), 'utf8')

// 加入分支的完整代码块（从 `if (joinIntent) {` 到其闭合），供局部断言使用。
const joinStart = registrationSource.indexOf('if (joinIntent) {')
const joinEnd = registrationSource.indexOf('      }, 201)', joinStart)
const joinBlock = joinStart > -1 && joinEnd > joinStart ? registrationSource.slice(joinStart, joinEnd) : ''

test('注册 OTP：join intent 命中已生效门店转入加入分支，不再 409', () => {
  assert.match(registrationSource, /const intent = input\.intent \?\? 'create'/u)
  assert.match(registrationSource, /if \(intent === 'join'\) \{[\s\S]{0,220}joinTarget = existingStore/u)
  // 409 只在"既不是占位店预约、也不是可加入门店"时抛出
  assert.match(registrationSource, /if \(existingStore && !ownsReservation && !joinTarget\) \{\s*\n\s*throw new ApiProblem\(409, 'STORE_ALREADY_EXISTS'/u)
  // 加入分支在 OTP 阶段不创建新店（joinTarget 非空时跳过占位店 INSERT）
  assert.match(registrationSource, /let store = existingStore\n\s*if \(!store\) \{/u)
})

test('注册 complete：加入分支创建账号 + 待审批申请，不下发成员关系与会话', () => {
  // 加入分支必须位于 create 分支的 audit 之前，且 context 已定义。
  const contextIdx = registrationSource.indexOf('const context = registrationAuditContext(userId, challenge.display_name, store)')
  assert.ok(joinStart > contextIdx, '加入分支必须在 context 定义之后')
  // 账号创建沿用注册 INSERT（邮箱已验证、密码已设置、must_change_password=0）
  assert.match(joinBlock, /INSERT INTO users \(id, username_key, display_name, email_key, password_hash, status, must_change_password, failed_login_count, created_at, updated_at\)/u)
  // 申请行：pending + 防重复守卫（同账号不重复提交、已有成员关系不受理）
  assert.match(joinBlock, /INSERT INTO store_join_requests \(id, user_id, store_id, status, revision, expires_at, created_at, updated_at\)/u)
  assert.match(joinBlock, /NOT EXISTS \(SELECT 1 FROM store_members WHERE user_id = \? AND status = 'active'\)/u)
  assert.match(joinBlock, /NOT EXISTS \(SELECT 1 FROM store_join_requests WHERE user_id = \? AND status = 'pending'\)/u)
  // 绝不创建会话：加入分支内不得出现 setSessionCookie（登录链路只认 active membership）
  assert.doesNotMatch(joinBlock, /setSessionCookie/u)
  assert.match(joinBlock, /joinPending: true/u)
  assert.match(joinBlock, /等待门店管理员审批/u)
  // 批量原子性校验：四个语句都要 changes === 1
  assert.match(joinBlock, /joinResult\[0\]\?\.meta\?\.changes !== 1 \|\| joinResult\[1\]\?\.meta\?\.changes !== 1 \|\| joinResult\[2\]\?\.meta\?\.changes !== 1 \|\| joinResult\[3\]\?\.meta\?\.changes !== 1/u)
})

test('发信失败清理：加入分支不得误删同店他人的待验证挑战', () => {
  // 创建店分支按 store_id 清理；加入分支（真实门店）只清理当前挑战。
  assert.match(registrationSource, /joinTarget\s*\n\s*\? c\.env\.DB\.prepare\(`DELETE FROM registration_challenges WHERE id = \? AND status <> 'completed'`\)/u)
})

test('加入申请 TTL 与审计：7 天窗口、动作与门店上下文齐备', () => {
  assert.match(registrationSource, /JOIN_REQUEST_TTL_MS = 7 \* 24 \* 60 \* 60 \* 1000/u)
  assert.match(registrationSource, /action: 'request-store-join', entityType: 'store-join-request'/u)
  assert.match(registrationSource, /EXISTS \(SELECT 1 FROM store_join_requests WHERE id = \? AND status = 'pending'\) AND EXISTS \(SELECT 1 FROM users WHERE id = \?\)/u)
})

test('governance overview：按权限下发 joinRequests（平台管理员全量 / 店长本店）', () => {
  assert.match(governanceSource, /const \[roleRequests, transferRequests, joinRequests, directory\] = await Promise\.all\(\[/u)
  assert.match(governanceSource, /WHERE jr\.status = 'pending' AND jr\.expires_at > \? AND \(\$\{context\.isPlatformAdmin \? '1 = 1' : 'jr\.store_id = \?'\}\)/u)
  assert.match(governanceSource, /joinRequests: camelRows\(joinRequests\)/u)
})

test('加入审批：目标门店管理员或平台管理员；成员关系先行插入，申请状态随后跟进', () => {
  assert.match(governanceSource, /'\/api\/v1\/governance\/join-requests\/:id\/decision'/u)
  // 审批人闸门：目标店 active admin，否则必须平台管理员
  assert.match(governanceSource, /SELECT id FROM store_members WHERE user_id = \? AND store_id = \? AND role = 'admin' AND status = 'active' LIMIT 1/u)
  assert.match(governanceSource, /if \(!approver && !context\.isPlatformAdmin\) throw new ApiProblem\(403, 'JOIN_APPROVER_REQUIRED'/u)
  // 先插成员（operator），后改申请状态；任一守卫失配两条都不落库
  const insertIdx = governanceSource.indexOf("INSERT INTO store_members (id, store_id, user_id, role, status, effective_from, created_at)\n      SELECT ?, ?, ?, 'operator', 'active', ?, ?")
  const updateIdx = governanceSource.indexOf('UPDATE store_join_requests\n      SET status = ?, decided_by = ?, decided_at = ?, decision_reason = ?, revision = revision + 1, updated_at = ?')
  assert.ok(insertIdx > -1 && updateIdx > insertIdx, '成员插入必须先于申请状态更新')
  assert.match(governanceSource, /AND NOT EXISTS \(SELECT 1 FROM store_members WHERE user_id = \? AND status = 'active'\)/u)
  // 申请状态更新在批准分支必须校验成员关系已落库
  assert.match(governanceSource, /\(\? = 'rejected' OR EXISTS \(SELECT 1 FROM store_members WHERE id = \? AND user_id = \? AND status = 'active'\)\)/u)
  // 批准与拒绝各自条件化审计
  assert.match(governanceSource, /action: input\.approve \? 'approve-store-join' : 'reject-store-join'/u)
  // 双重结果校验防中间态
  assert.match(governanceSource, /if \(input\.approve && result\[1\]\?\.meta\?\.changes !== 1\) throw new ApiProblem\(409, 'JOIN_REQUEST_CONFLICT'/u)
})

test('登录：无门店账号区分「加入审批中」与普通无门店', () => {
  const pendingIdx = authSource.indexOf('JOIN_PENDING')
  const genericIdx = authSource.indexOf("'账号尚未分配可访问门店。'")
  assert.ok(pendingIdx > -1, '必须存在 JOIN_PENDING 分支')
  assert.ok(pendingIdx < genericIdx, 'JOIN_PENDING 必须先于通用 NO_STORE_ACCESS 判断')
  assert.match(authSource, /WHERE jr\.user_id = \? AND jr\.status = 'pending' AND jr\.expires_at > \?/u)
})

test('pending-count：加入申请计入审批角标', () => {
  assert.match(adminSource, /SELECT COUNT\(\*\) AS n FROM store_join_requests WHERE status = 'pending' AND expires_at > \?/u)
  assert.match(adminSource, /joinRequests: joinRequests\?\.n \?\? 0/u)
})

test('迁移 0026 纯新增，schema 版本与测试适配器同步', () => {
  assert.match(migration, /CREATE TABLE store_join_requests/u)
  assert.match(migration, /status TEXT NOT NULL CHECK \(status IN \('pending', 'approved', 'rejected', 'cancelled'\)\)/u)
  assert.match(migration, /revision INTEGER NOT NULL DEFAULT 1 CHECK \(revision > 0\)/u, 'revision 从 1 起，与 revisionSchema(positive) 对齐')
  assert.match(migration, /CREATE INDEX store_join_requests_store_status_idx ON store_join_requests\(store_id, status, created_at ASC\)/u)
  assert.match(migration, /CREATE INDEX store_join_requests_user_idx ON store_join_requests\(user_id, status\)/u)
  // 非破坏性：不得触碰既有表。
  assert.doesNotMatch(migration, /ALTER TABLE|DROP TABLE|DROP INDEX/u)
  assert.match(schemaVersion, /'0028_shiphub_heal_cooldown'/u)
  assert.match(adapter, /'0027_shiphub_cube_identity\.sql'/u)
})

test('契约：intent 显式分流（join=下拉加入 / create=新店注册）', () => {
  // 2026-09-07 用户定案：注册页提供门店下拉选择（默认），下方提供"没有你的门店？"
  // 切换到新店注册（平台管理员审核）。
  assert.match(registrationSource, /const intent = input\.intent \?\? 'create'/u)
  assert.match(registrationSource, /if \(intent === 'join'\) \{[\s\S]{0,300}STORE_NOT_JOINABLE/u)
  // join 分支与 create 分支并存，均以 joinIntent/joinTarget 判定
  assert.match(registrationSource, /joinTarget = existingStore/u)
})
