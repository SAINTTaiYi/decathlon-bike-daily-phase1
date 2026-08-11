import { useRef, useState } from 'react'
import { idempotencyKey } from '../api/client.js'
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, validatePasswordChangeForm } from '../data/passwordChange.js'

export default function PasswordChangeGate({ userName, onChangePassword, onLogout, onComplete }) {
  const [form, setForm] = useState({ currentPassword: '', nextPassword: '', confirmPassword: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const requestKeyRef = useRef('')
  const set = (field, value) => {
    requestKeyRef.current = ''
    setError('')
    setForm((current) => ({ ...current, [field]: value }))
  }

  const submit = async (event) => {
    event.preventDefault()
    const validationError = validatePasswordChangeForm(form, { temporary: true })
    if (validationError) return setError(validationError)
    if (!requestKeyRef.current) requestKeyRef.current = idempotencyKey()
    setBusy(true)
    setError('')
    const result = await onChangePassword(form.currentPassword, form.nextPassword, requestKeyRef.current)
    setBusy(false)
    if (!result.ok) return setError(result.error)
    onComplete?.()
  }

  return (
    <main className="initial-setup-shell">
      <form className="initial-setup-panel password-change-panel" onSubmit={submit} noValidate>
        <header><span>FIRST SIGN-IN · 安全要求</span><h1>修改临时密码</h1><p>账号 {userName} 由管理员创建。进入业务台账前，必须把临时密码替换为你自己的密码。</p></header>
        <label className="field-row"><span>当前临时密码</span><input autoFocus required type="password" maxLength={PASSWORD_MAX_LENGTH} autoComplete="current-password" disabled={busy} value={form.currentPassword} onChange={(event) => set('currentPassword', event.target.value)} /></label>
        <label className="field-row"><span>新密码</span><input required type="password" minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} autoComplete="new-password" disabled={busy} value={form.nextPassword} onChange={(event) => set('nextPassword', event.target.value)} /></label>
        <label className="field-row"><span>确认新密码</span><input required type="password" minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} autoComplete="new-password" disabled={busy} value={form.confirmPassword} onChange={(event) => set('confirmPassword', event.target.value)} /></label>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="dialog-footer"><button type="button" className="secondary-action" onClick={() => void onLogout()} disabled={busy}>退出登录</button><button type="submit" className="primary-action" disabled={busy}>{busy ? '正在更新…' : '更新密码并进入'}</button></div>
        <small>新密码仅以单向密码哈希写入数据库；其它设备上的旧会话会被撤销。</small>
      </form>
    </main>
  )
}
