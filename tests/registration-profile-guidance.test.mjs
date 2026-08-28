import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// 注册界面自 2026-08-29 起长在登录卡内（BootAuthStepFields，两端共用字段实现），
// 旧的 RegistrationWizard 独立页已删除。这里守住原来的两条产品意图：
// ①Profile 必须填公司真实 Profile；②门店编号唯一性对注册结果的影响要说清。
const stepFields = readFileSync(new URL('../apps/web/src/components/boot/BootAuthStepFields.jsx', import.meta.url), 'utf8')
const mobileStyles = readFileSync(new URL('../apps/web/src/styles/boot-mobile.css', import.meta.url), 'utf8')
const desktopStyles = readFileSync(new URL('../apps/web/src/styles/boot-desktop.css', import.meta.url), 'utf8')

test('注册 Profile 字段明确要求填写真实公司 Profile', () => {
  assert.match(stepFields, /placeholder="请输入真实 Profile"/u)
  assert.doesNotMatch(stepFields, /例如：小王/u)
})

test('门店编号唯一性的后果对用户明示', () => {
  assert.match(stepFields, /门店编号需为公司内部唯一编号，重复时注册会被拒绝。/u)
  // 辅助说明须挂在 Field 的 hint 通道上，保证与输入框有可读的视觉从属关系
  assert.match(stepFields, /hint="门店编号需为公司内部唯一编号[^"]*"/u)
})

test('辅助说明在两端各自的样式表里都有可读的弱化文本样式', () => {
  for (const [name, css, cls] of [['移动端', mobileStyles, 'bootm'], ['桌面端', desktopStyles, 'bootd']]) {
    assert.match(css, new RegExp('\\.' + cls + '-field-hint \\{', 'u'), name + '须定义字段辅助文案样式')
    assert.match(css, new RegExp('\\.' + cls + '-field-hint \\{[^}]*--ops-text-muted', 'u'), name + '辅助文案须用弱化前景色')
  }
})
