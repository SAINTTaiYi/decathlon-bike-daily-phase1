import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const read = (rel) => readFile(new URL(rel, import.meta.url), 'utf8')

const [useAuth, app, styles, apiAuth, authRoute, middleware, bootstrap, closing, session] = await Promise.all([
  read('../apps/web/src/hooks/useAuth.js'),
  read('../apps/web/src/App.jsx'),
  read('../apps/web/src/styles/workshop-system.css'),
  read('../apps/web/src/api/auth.js'),
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


test('只读恢复：补签端点 + 自动重试循环 + 横幅手动入口', () => {
  // 服务端：只读会话补签为可写会话。不挂 requireCsrf——只读会话没有 CSRF 哈希。
  assert.match(authRoute, /app\.post\('\/api\/v1\/auth\/session\/upgrade', auth\.loadSession, async \(c\) =>/u, '必须提供补签端点，且不挂 requireCsrf')
  assert.match(authRoute, /if \(!context\.readOnly\) return c\.json\(\{ readOnly: false \}\)/u, '可写会话调用必须幂等零写入')
  assert.match(authRoute, /setSessionCookie\(c, secrets\.token, config\)/u, '补签成功必须换发正式会话 cookie')
  assert.match(authRoute, /throw new ApiProblem\(503, 'D1_WRITE_LIMIT'/u, '额度未恢复必须返回结构化 503（带 recoveryAt）')
  // 前端：自动重试 + 手动入口 + 状态清空
  assert.match(apiAuth, /upgradeReadOnlySession = \(\) => api\('\/api\/v1\/auth\/session\/upgrade'/u, '前端必须调用补签端点')
  assert.match(useAuth, /const upgrade = useCallback/u, 'useAuth 必须暴露补签动作')
  assert.match(useAuth, /apply\(payload, 'upgrade'\)/u, '补签成功必须换发新会话（CSRF 随之恢复）')
  assert.match(useAuth, /if \(state\.status !== 'authenticated' \|\| !state\.readOnly\) return undefined/u, '自动重试必须只在只读态启动')
  assert.match(useAuth, /window\.setTimeout\(attempt, READONLY_UPGRADE_RETRY_MS\)/u, '必须真的按固定节奏排下一次重试（不是只声明常量）')
  assert.match(useAuth, /document\.removeEventListener\('visibilitychange', onVisible\)/u, '必须清理监听与定时器（防泄漏）')
  assert.match(app, /workshop-global-alert-action/u, '横幅必须带「立即恢复」按钮')
  assert.match(app, /: '立即恢复'\}<\/button>/u, '按钮文案必须是真实的 JSX（不是注释里的字样）')
  assert.match(app, /const retryReadonly = useCallback/u, '按钮必须接到补签动作')
  assert.match(styles, /\.workshop-global-alert-action/u, '按钮必须有样式落地')
  // 运行时冒烟教训（2026-09-14，预览白屏实测）：依赖数组会在 useEffect 调用点"立即求值"，
  // 若引用的 const 声明在下方，就会 TDZ 崩溃（Cannot access 'upgrade' before initialization）。
  // 自动重试循环必须声明在 upgrade 之后。
  const upgradeIndex = useAuth.indexOf('const upgrade = useCallback')
  const loopIndex = useAuth.indexOf('只读模式自动恢复循环')
  assert.ok(upgradeIndex > -1 && loopIndex > -1, '必须能定位 upgrade 与自动重试循环')
  assert.ok(upgradeIndex < loopIndex, '自动重试循环必须声明在 upgrade 之后（依赖数组立即求值，否则 TDZ 白屏）')
})
