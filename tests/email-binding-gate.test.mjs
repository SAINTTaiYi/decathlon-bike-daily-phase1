import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const read = (rel) => readFile(new URL(rel, import.meta.url), 'utf8')

const [gate, app, useAuth, apiAuth, css] = await Promise.all([
  read('../apps/web/src/components/EmailBindingGate.jsx'),
  read('../apps/web/src/App.jsx'),
  read('../apps/web/src/hooks/useAuth.js'),
  read('../apps/web/src/api/auth.js'),
  read('../apps/web/src/styles/components.css')
])

test('绑定门卡 JSX 结构：邮箱 + 发码按钮 + 验证码 + 新密码 + 确认密码齐全', () => {
  assert.match(gate, /type="email"/u)
  assert.match(gate, /发送验证码|重新发送验证码/u)
  assert.match(gate, /inputMode="numeric"[\s\S]{0,120}maxLength=\{6\}/u)
  assert.match(gate, /autoComplete="new-password"/gu)
  assert.match(gate, /退出登录/u)
  assert.match(gate, /绑定邮箱并进入/u)
  // 门卡必须引导用户知道"可以与当前密码相同"。
  assert.match(gate, /可以与当前密码相同/u)
})

test('绑定门卡类名必须有样式落地（JSX 结构 + CSS 双断言）', () => {
  for (const className of ['binding-otp-row', 'binding-notice']) {
    assert.match(gate, new RegExp(className, 'u'), `JSX 中必须使用 ${className}`)
    assert.match(css, new RegExp(`\\.${className}`, 'u'), `components.css 必须为 ${className} 提供样式`)
  }
  assert.match(gate, /initial-setup-panel email-binding-panel/u, '复用 initial-setup 外壳')
  assert.match(css, /\.initial-setup-panel/u)
})

test('前端校验：验证码 6 位、密码最短长度、两次一致、无 challengeId 不得提交', () => {
  assert.match(gate, /\/\^\\d\{6\}\$\/u\.test\(otp\.trim\(\)\)/u)
  assert.match(gate, /password\.length < PASSWORD_MIN_LENGTH/u)
  assert.match(gate, /password !== confirmPassword/u)
  assert.match(gate, /if \(!challengeId\) return setError\('请先获取邮箱验证码。'\)/u)
})

test('API 层与 useAuth：绑定成功后本地立即解锁', () => {
  assert.match(apiAuth, /export const requestEmailBindingOtp = \(body\) => api\('\/api\/v1\/account\/binding\/otp', \{ method: 'POST', body \}\)/u)
  assert.match(apiAuth, /export const verifyEmailBinding = \(body\) => api\('\/api\/v1\/account\/binding\/verify', \{ method: 'POST', body \}\)/u)
  assert.match(useAuth, /emailBindingRequired: false, mustChangePassword: false/u)
})

test('App 门卡挂接：绑定门卡优先于改密门卡，业务钩子在锁定期间停用', () => {
  const bindingGate = app.indexOf('authenticated && emailBindingRequired && introDone')
  const passwordGate = app.indexOf('authenticated && mustChangePassword && introDone')
  assert.ok(bindingGate > -1, 'App 必须渲染绑定门卡')
  assert.ok(passwordGate > -1, '既有改密门卡保留')
  assert.ok(bindingGate < passwordGate, '绑定门卡必须先于改密门卡判定')
  assert.match(app, /const introLocked = mustChangePassword \|\| emailBindingRequired/u)
  assert.match(app, /useRemoteClosingWorkflow\(authenticated && !introLocked/u)
  assert.match(app, /useShipHub\(authenticated && !introLocked/u)
  // 食品台账（2026-09-13）：独立应用期间不挂 Ops 的 Shiphub 数据与门店实时长轮询，
  // 避免门店用户在食品台账里白白消耗 Ops 的请求与 D1 读额度。
  // 判据是 effectiveApp 而不是 appChoice（2026-09-14）：eat.workshop.skin 独立站点上
  // appChoice 始终为空（用户不经过选择屏），只有 effectiveApp 才是「真正在跑哪个应用」，
  // 否则食品站点会照常拉起 Shiphub 与门店长轮询。
  // 2026-09-15 门店设计接入后收敛为单一判据 opsDataNeeded（= 既不是食品台账也不是
  // 门店设计）；断言跟着实现搬家，但守的还是同一条规则：非 Ops 应用不得拉 Ops 数据。
  assert.match(app, /const opsDataNeeded = effectiveApp !== 'food' && effectiveApp !== 'mass'/u)
  assert.match(app, /useShipHub\(authenticated && !introLocked && opsDataNeeded\)/u)
  assert.match(app, /enabled: authenticated && !introLocked && opsDataNeeded/u)
  assert.match(app, /deferUpdatePrompt = auth\.source === 'login' && !introLocked/u)
})

// ── 2026-09-17：邮箱不再强制迪卡侬域名 ────────────────────────────────────

test('邮箱不再限定公司域名（文案与校验都不许再要求 @decathlon.com）', async () => {
  const [contracts, gate, stepFields, bootDesktop, bootMobile, useAuthPanel, middleware, authRoute, accountRoute] = await Promise.all([
    read('../packages/contracts/src/index.ts'),
    read('../apps/web/src/components/EmailBindingGate.jsx'),
    read('../apps/web/src/components/boot/BootAuthStepFields.jsx'),
    read('../apps/web/src/components/boot/BootLoaderDesktop.jsx'),
    read('../apps/web/src/components/boot/BootLoaderMobile.jsx'),
    read('../apps/web/src/hooks/useBootAuthPanel.js'),
    read('../apps/worker/src/auth/middleware.ts'),
    read('../apps/worker/src/routes/auth.ts'),
    read('../apps/worker/src/routes/account.ts')
  ])
  assert.ok(contracts.includes('const accountEmailSchema = z.string().trim().toLowerCase().email().max(320)'),
    '契约层必须是「任意有效邮箱」')
  assert.ok(!contracts.includes('corporateEmailSchema'), '旧的域名限定 schema 必须删除（删旧不覆盖）')
  assert.ok(!/endsWith\('@decathlon\.com'\)/u.test(contracts), '不得再按域名后缀校验')
  for (const [name, text] of [['绑定门卡', gate], ['注册字段', stepFields], ['桌面登录卡', bootDesktop], ['移动登录卡', bootMobile], ['登录卡逻辑', useAuthPanel]]) {
    assert.ok(!text.includes('公司邮箱'), `${name}不得再写「公司邮箱」`)
    assert.ok(!text.includes('decathlon.com'), `${name}不得再出现 decathlon.com 占位符`)
  }
  assert.ok(!middleware.includes('公司邮箱') && !authRoute.includes('公司邮箱') && !accountRoute.includes('公司邮箱'),
    'worker 侧提示语不得再写「公司邮箱」')
  assert.ok(accountRoute.includes('summary: `绑定邮箱并重设密码：${context.displayName}`'), '审计摘要用中性文案')
})
