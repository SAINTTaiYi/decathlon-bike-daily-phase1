import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const read = (rel) => readFile(new URL(rel, import.meta.url), 'utf8')

const [useAuth, app, styles, authRoute, middleware, bootstrap, closing, session] = await Promise.all([
  read('../apps/web/src/hooks/useAuth.js'),
  read('../apps/web/src/App.jsx'),
  read('../apps/web/src/styles/workshop-system.css'),
  read('../apps/worker/src/routes/auth.ts'),
  read('../apps/worker/src/auth/middleware.ts'),
  read('../apps/worker/src/routes/bootstrap.ts'),
  read('../apps/worker/src/services/closing.ts'),
  read('../apps/worker/src/auth/session.ts')
])

// 2026-09-14 事故：写额度耗尽后登录本身也写库（会话行 + 用户表 + 审计），
// 门店连「进去看数据」都做不到——「期间可正常查看数据」的承诺是假的。
// 修复 = 只读降级：写被拒时签发无状态只读会话，读写各走各的路。

test('只读令牌：无状态签名 + 前缀识别 + 过期校验', () => {
  assert.match(session, /const READONLY_PREFIX = 'ro1\.'/u, '只读令牌必须有可识别前缀')
  assert.match(session, /export async function createReadOnlySessionToken/u)
  assert.match(session, /export async function verifyReadOnlySessionToken/u)
  assert.match(session, /if \(!safeEqualHex\(signature, expected\)\) return null/u, '必须做签名校验')
  assert.match(session, /if \(!Number\.isFinite\(expires\) \|\| expires <= Date\.now\(\)\) return null/u, '必须做过期校验')
  // 令牌只能由密码验证通过后的登录路径签发
  assert.match(authRoute, /const readOnlyToken = await createReadOnlySessionToken/u)
  assert.match(authRoute, /if \(limitKind !== 'write'\) throw error/u, '只有写额度错误才降级，其它错误照常抛出')
})

test('中间件：只读会话走独立分支，且不写 last_seen_at', () => {
  assert.match(middleware, /if \(isReadOnlySessionToken\(token\)\)/u, '必须识别只读令牌')
  assert.match(middleware, /readOnly: true/u)
  // 只读分支必须在写 last_seen_at 之前返回。
  // 注意匹配带引号的完整 SQL 语句：裸片段会被文件头的注释命中（memory 64 教训）。
  const roIndex = middleware.indexOf('if (isReadOnlySessionToken(token))')
  const touchIndex = middleware.indexOf("'UPDATE auth_sessions SET last_seen_at = ? WHERE token_hash = ?'")
  assert.ok(roIndex > -1, '必须存在只读分支')
  assert.ok(touchIndex > -1, '必须能定位真实的会话写入语句')
  assert.ok(roIndex < touchIndex, '只读分支必须在写会话之前短路返回')
  // 只读分支内不得出现任何写语句
  const roBlock = middleware.slice(roIndex, middleware.indexOf('const tokenHash', roIndex) > -1 ? middleware.indexOf('const tokenHash', roIndex) : touchIndex)
  assert.doesNotMatch(roBlock, /(?:INSERT|UPDATE|DELETE)\s/iu, '只读分支内不得有任何写语句')
})

test('中间件：只读会话的写操作拦成结构化额度提示（登出例外）', () => {
  assert.match(middleware, /if \(auth\.readOnly\)/u, 'requireCsrf 必须拦住只读会话的写操作')
  assert.match(middleware, /=== '\/api\/v1\/auth\/logout'/u, '登出必须放行（只需清 cookie）')
  // 错误码由 d1LimitProblemBody 统一给出（避免在两处硬编码同一个码）
  assert.match(middleware, /d1LimitProblemBody\('write'\)/u, '必须复用统一的限额响应体')
  assert.match(middleware, /throw new ApiProblem\(503, body\.error/u, '必须抛 503 且带上限额错误码')
  assert.match(middleware, /只读模式/u, '提示必须说明当前是只读模式')
})

test('错误处理器：限额类错误必须带 recoveryAt（门店要知道还要等多久）', async () => {
  const index = await read('../apps/worker/src/index.ts')
  assert.match(index, /error\.code === 'D1_WRITE_LIMIT' \|\| error\.code === 'D1_READ_LIMIT'/u, 'ApiProblem 分支必须识别限额码')
  assert.match(index, /d1LimitProblemBody\(error\.code === 'D1_WRITE_LIMIT' \? 'write' : 'read'\)/u)
})

test('读路径不因写额度耗尽而失败：当日行用内存默认值顶替', () => {
  assert.match(closing, /options: \{ allowWrite\?: boolean \} = \{\}/u, 'getOrCreateDay 必须支持只写开关')
  assert.match(closing, /if \(options\.allowWrite === false\)/u)
  assert.match(bootstrap, /allowWrite: !context\.readOnly/u, 'bootstrap 必须把只读状态传下去')
})

test('前端：只读状态透传到界面并显示横幅', () => {
  assert.match(useAuth, /readOnly: Boolean\(payload\.readOnly\)/u, 'useAuth 必须携带只读状态')
  assert.match(useAuth, /recoveryAt: payload\.recoveryAt/u, '必须携带恢复时间')
  assert.match(app, /auth\.readOnly \? <p className="workshop-global-alert" data-tone="readonly"/u, 'App 必须显示只读横幅')
  assert.match(styles, /\.workshop-global-alert\[data-tone='readonly'\]/u, '只读横幅必须有样式落地')
})
