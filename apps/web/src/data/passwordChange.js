export const PASSWORD_MIN_LENGTH = 10
export const PASSWORD_MAX_LENGTH = 128

export function validatePasswordChangeForm(form, { temporary = false } = {}) {
  const currentPassword = String(form?.currentPassword ?? '')
  const nextPassword = String(form?.nextPassword ?? '')
  const confirmPassword = String(form?.confirmPassword ?? '')
  const currentLabel = temporary ? '当前临时密码' : '当前密码'

  if (!currentPassword) return `请输入${currentLabel}。`
  if (currentPassword.length > PASSWORD_MAX_LENGTH) return `${currentLabel}不能超过 ${PASSWORD_MAX_LENGTH} 个字符。`
  if (nextPassword.length < PASSWORD_MIN_LENGTH) return `新密码至少需要 ${PASSWORD_MIN_LENGTH} 个字符。`
  if (nextPassword.length > PASSWORD_MAX_LENGTH) return `新密码不能超过 ${PASSWORD_MAX_LENGTH} 个字符。`
  if (nextPassword === currentPassword) return `新密码不能与${currentLabel}相同。`
  if (nextPassword !== confirmPassword) return '两次输入的新密码不一致。'
  return ''
}
