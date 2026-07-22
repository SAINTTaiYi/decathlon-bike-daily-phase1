import { useState } from 'react'
import { SignalAccessBrand, SignalAccessHeading } from './SignalAccessFrame.jsx'

export default function PasswordChangeGate({ userName, onChangePassword, onLogout, onComplete }) {
  const [form, setForm] = useState({ currentPassword: '', nextPassword: '', confirmPassword: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }))

  const submit = async (event) => {
    event.preventDefault()
    if (!form.currentPassword) return setError('请输入当前临时密码。')
    if (form.nextPassword.length < 10) return setError('新密码至少需要 10 个字符。')
    if (form.nextPassword === form.currentPassword) return setError('新密码不能与临时密码相同。')
    if (form.nextPassword !== form.confirmPassword) return setError('两次输入的新密码不一致。')
    setBusy(true)
    setError('')
    const result = await onChangePassword(form.currentPassword, form.nextPassword)
    setBusy(false)
    if (!result.ok) return setError(result.error)
    onComplete?.()
  }

  return (
    <main className="signal-access-shell signal-access-password">
      <div className="signal-access-brand-slot"><SignalAccessBrand mode="password" /></div>
      <form className="signal-access-panel signal-access-form" aria-labelledby="password-title" aria-describedby="password-description" onSubmit={submit} noValidate>
        <SignalAccessHeading
          eyebrow="FIRST SIGN-IN / 安全要求"
          title="修改临时密码"
          description={`账号 ${userName} 由管理员创建。进入业务台账前，必须把临时密码替换为你自己的密码。`}
          titleId="password-title"
          descriptionId="password-description"
        />
        <label className="signal-access-field"><span>当前临时密码</span><input autoFocus required type="password" maxLength="128" autoComplete="current-password" value={form.currentPassword} onChange={(event) => set('currentPassword', event.target.value)} /></label>
        <label className="signal-access-field"><span>新密码</span><input required type="password" minLength="10" maxLength="128" autoComplete="new-password" value={form.nextPassword} onChange={(event) => set('nextPassword', event.target.value)} /></label>
        <label className="signal-access-field"><span>确认新密码</span><input required type="password" minLength="10" maxLength="128" autoComplete="new-password" value={form.confirmPassword} onChange={(event) => set('confirmPassword', event.target.value)} /></label>
        {error ? <p className="signal-access-error" role="alert">{error}</p> : null}
        <div className="signal-access-actions"><button type="button" className="signal-access-secondary" onClick={() => void onLogout()} disabled={busy}>退出登录</button><button type="submit" className="signal-access-submit" disabled={busy}>{busy ? '正在更新…' : '更新密码并进入'}</button></div>
        <small>新密码仅以 Argon2id 哈希写入数据库。其它设备上的旧会话会被撤销。</small>
      </form>
    </main>
  )
}
