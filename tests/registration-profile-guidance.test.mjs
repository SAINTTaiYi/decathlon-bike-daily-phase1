import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const registrationWizard = readFileSync(new URL('../apps/web/src/components/RegistrationWizard.jsx', import.meta.url), 'utf8')
const endfieldStyles = readFileSync(new URL('../apps/web/src/styles/endfield.css', import.meta.url), 'utf8')

test('注册 Profile 字段明确要求填写真实公司 Profile，并说明治理流程影响', () => {
  assert.match(registrationWizard, /placeholder="请输入真实 Profile"/)
  assert.match(registrationWizard, /aria-describedby="registration-profile-help"/)
  assert.match(registrationWizard, /<small id="registration-profile-help" className="registration-profile-help">请填写你在公司系统中实际使用的 Profile。昵称或临时名称可能导致后续提权、门店转移等权限流程无法正常处理。<\/small>/)
  assert.doesNotMatch(registrationWizard, /例如：小王/)
})

test('Profile 辅助说明沿用注册界面的可读文本样式', () => {
  assert.match(endfieldStyles, /\.registration-profile-help \{ max-width: 52ch; color: var\(--ink-soft\); font-size: \.8125rem; line-height: 1\.55; text-wrap: pretty; \}/)
})
