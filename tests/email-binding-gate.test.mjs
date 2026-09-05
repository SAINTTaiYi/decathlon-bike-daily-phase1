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
  assert.match(app, /useRemoteClosingWorkflow\(authenticated && !introLocked\)/u)
  assert.match(app, /useShipHub\(authenticated && !introLocked\)/u)
  assert.match(app, /deferUpdatePrompt = auth\.source === 'login' && !introLocked/u)
})
