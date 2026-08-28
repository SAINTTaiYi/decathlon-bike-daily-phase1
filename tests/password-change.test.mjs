import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, validatePasswordChangeForm } from '../apps/web/src/data/passwordChange.js'

const validForm = {
  currentPassword: 'CurrentPassword!1',
  nextPassword: 'ReplacementPassword!2',
  confirmPassword: 'ReplacementPassword!2'
}

test('密码修改表单校验空值、长度、复用与两次输入一致性', () => {
  assert.equal(PASSWORD_MIN_LENGTH, 10)
  assert.equal(PASSWORD_MAX_LENGTH, 128)
  assert.equal(validatePasswordChangeForm({ ...validForm, currentPassword: '' }), '请输入当前密码。')
  assert.equal(validatePasswordChangeForm({ ...validForm, currentPassword: 'x'.repeat(129) }), '当前密码不能超过 128 个字符。')
  assert.equal(validatePasswordChangeForm({ ...validForm, nextPassword: 'short', confirmPassword: 'short' }), '新密码至少需要 10 个字符。')
  assert.equal(validatePasswordChangeForm({ ...validForm, nextPassword: 'x'.repeat(129), confirmPassword: 'x'.repeat(129) }), '新密码不能超过 128 个字符。')
  assert.equal(validatePasswordChangeForm({ ...validForm, nextPassword: validForm.currentPassword, confirmPassword: validForm.currentPassword }), '新密码不能与当前密码相同。')
  assert.equal(validatePasswordChangeForm({ ...validForm, confirmPassword: 'different-password' }), '两次输入的新密码不一致。')
  assert.equal(validatePasswordChangeForm(validForm), '')
})

test('首次登录改密沿用同一规则并保留临时密码语义', () => {
  assert.equal(validatePasswordChangeForm({ ...validForm, currentPassword: '' }, { temporary: true }), '请输入当前临时密码。')
  assert.equal(
    validatePasswordChangeForm({ ...validForm, nextPassword: validForm.currentPassword, confirmPassword: validForm.currentPassword }, { temporary: true }),
    '新密码不能与当前临时密码相同。'
  )
})

test('已登录用户可从日报菜单进入独立密码修改对话框', async () => {
  const [appSource, menuSource, dialogSource, gateSource, authSource, bootSource, adminSource, bootFormSource] = await Promise.all([
    readFile(new URL('../apps/web/src/App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../apps/web/src/components/dialogs/MenuDialog.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../apps/web/src/components/dialogs/PasswordChangeDialog.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../apps/web/src/components/PasswordChangeGate.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../apps/web/src/hooks/useAuth.js', import.meta.url), 'utf8'),
    readFile(new URL('../apps/web/src/components/BootLoader.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../apps/web/src/components/admin/PlatformAdminConsole.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../apps/web/src/hooks/useBootLoginForm.js', import.meta.url), 'utf8'),
  ])

  assert.match(menuSource, /<strong>修改密码<\/strong>/u)
  assert.match(menuSource, /onChangePassword/u)
  assert.match(appSource, /<PasswordChangeDialog/u)
  assert.match(appSource, /onChangePassword=\{auth\.changePassword\}/u)
  assert.match(appSource, /setPasswordChangeOpen\(true\)/u)
  assert.match(dialogSource, /autoComplete="current-password"/u)
  assert.equal((dialogSource.match(/autoComplete="new-password"/gu) || []).length, 2)
  assert.equal((dialogSource.match(/disabled=\{busy\}/gu) || []).length, 5, '日常和首次改密的全部密码字段应在请求飞行中锁定')
  assert.match(dialogSource, /其它设备上的会话会被撤销/u)
  assert.match(dialogSource, /requestKeyRef\.current = idempotencyKey\(\)/u)
  assert.match(dialogSource, /onChangePassword\(form\.currentPassword, form\.nextPassword, requestKeyRef\.current\)/u)
  assert.match(gateSource, /requestKeyRef\.current = idempotencyKey\(\)/u)
  assert.match(gateSource, /onChangePassword\(form\.currentPassword, form\.nextPassword, requestKeyRef\.current\)/u)
  assert.match(authSource, /changePasswordAccount\(currentPassword, nextPassword, idempotencyKey\)/u)
  assert.match(authSource, /error\?\.code === 'PASSWORD_CHANGE_CONFLICT'/u)
  assert.match(authSource, /clear\(message\)/u)
  assert.match(appSource, /<BootLoader initialError=\{auth\.error\}/u)
  assert.match(bootSource, /initialError = ''/u)
  // 表单状态机已收进 useBootLoginForm（双端共用），回填断言随之指向 hook
  assert.match(bootFormSource, /if \(initialError\) setError\(initialError\)/u)
  assert.match(adminSource, /admin-header-security/u)
  assert.match(adminSource, /onClick=\{onChangePassword\}/u)
})

test('密码修改在后台强制色彩模式下保留清晰操作边界', async () => {
  const cssSource = await readFile(new URL('../apps/web/src/styles/admin-console.css', import.meta.url), 'utf8')
  const forcedColors = cssSource.slice(cssSource.indexOf('@media (forced-colors: active)'))
  assert.match(forcedColors, /\.admin-header-security,[\s\S]*?\.admin-header-exit/u)
  assert.match(forcedColors, /border: 1px solid ButtonText/u)
})
