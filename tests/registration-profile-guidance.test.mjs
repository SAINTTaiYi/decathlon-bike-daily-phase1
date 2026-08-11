import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const registrationWizard = readFileSync(new URL('../apps/web/src/components/RegistrationWizard.jsx', import.meta.url), 'utf8')
const workshopStyles = readFileSync(new URL('../apps/web/src/styles/workshop-system.css', import.meta.url), 'utf8')

test('注册 Profile 字段明确要求填写真实公司 Profile，并说明治理流程影响', () => {
  assert.match(registrationWizard, /placeholder="请输入真实 Profile"/)
  assert.match(registrationWizard, /aria-describedby="registration-profile-help"/)
  assert.match(registrationWizard, /<small id="registration-store-help" className="registration-profile-help">门店编号必须是公司内部使用的唯一编号。该编号已存在时，门店与用户注册都会失败。<\/small>/)
  assert.doesNotMatch(registrationWizard, /例如：小王/)
})

test('Profile 辅助说明沿用注册界面的可读文本样式', () => {
  assert.match(workshopStyles, /\.registration-profile-help \{ color: var\(--ops-text-muted\); \}/)
})
