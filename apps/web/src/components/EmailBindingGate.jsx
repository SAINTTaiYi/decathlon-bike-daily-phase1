import { useRef, useState } from 'react'
import { requestEmailBindingOtp } from '../api/auth.js'
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../data/passwordChange.js'

/**
 * 存量无邮箱账号的强制绑定门卡。
 *
 * 首次进入前必须绑定公司邮箱并重设密码（允许与旧密码一致）——绑定后
 * 才能使用公司邮箱自助找回密码。与 PasswordChangeGate 共用
 * initial-setup 外壳与 field-row 字段样式，属于账号引导门卡而非登录
 * 界面，因此维持单套实现（与既有 PasswordChangeGate 一致）。
 */
export default function EmailBindingGate({ userName, onVerify, onLogout, onComplete }) {
  const [email, setEmail] = useState('')
  const [challengeId, setChallengeId] = useState('')
  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [sending, setSending] = useState(false)
  const [busy, setBusy] = useState(false)
  const cooldownRef = useRef(0)

  const sendOtp = async (event) => {
    event.preventDefault()
    if (sending) return
    if (!/^[^@\s]+@[^@\s]+$/u.test(email.trim())) return setError('请输入有效的公司邮箱地址。')
    if (Date.now() < cooldownRef.current) return setError(`验证码发送冷却中，请 ${Math.ceil((cooldownRef.current - Date.now()) / 1000)} 秒后再试。`)
    setSending(true)
    setError('')
    setNotice('')
    try {
      const payload = await requestEmailBindingOtp({ email: email.trim() })
      setChallengeId(payload.challengeId)
      cooldownRef.current = Date.now() + (payload.retryAfterSeconds || 60) * 1000
      setNotice(payload.message || '验证码已发送，请查收公司邮箱。')
    } catch (requestError) {
      setError(requestError?.message || '验证码发送失败，请稍后重试。')
    } finally {
      setSending(false)
    }
  }

  const submit = async (event) => {
    event.preventDefault()
    if (busy) return
    if (!challengeId) return setError('请先获取邮箱验证码。')
    if (!/^\d{6}$/u.test(otp.trim())) return setError('验证码是 6 位数字。')
    if (password.length < PASSWORD_MIN_LENGTH) return setError(`新密码至少 ${PASSWORD_MIN_LENGTH} 位。`)
    if (password !== confirmPassword) return setError('两次输入的新密码不一致。')
    setBusy(true)
    setError('')
    const result = await onVerify({ challengeId, otp: otp.trim(), password })
    setBusy(false)
    if (!result.ok) return setError(result.error)
    onComplete?.()
  }

  return (
    <main className="initial-setup-shell">
      <form className="initial-setup-panel email-binding-panel" onSubmit={submit} noValidate>
        <header><span>ACCOUNT SETUP · 安全要求</span><h1>绑定公司邮箱</h1><p>账号 {userName} 尚未绑定公司邮箱。进入业务台账前，请绑定邮箱并重新设置密码（可以与当前密码相同）——绑定后即可自助找回密码。</p></header>
        <label className="field-row"><span>公司邮箱</span><input required type="email" maxLength={320} autoComplete="email" inputMode="email" disabled={sending || busy} value={email} onChange={(event) => { setEmail(event.target.value); setError(''); }} placeholder="姓名@decathlon.com" /></label>
        <div className="binding-otp-row">
          <button type="button" className="secondary-action" onClick={(event) => void sendOtp(event)} disabled={sending || busy || !email.trim()}>{sending ? '正在发送…' : challengeId ? '重新发送验证码' : '发送验证码'}</button>
          {notice ? <small className="binding-notice" role="status">{notice}</small> : null}
        </div>
        <label className="field-row"><span>邮箱验证码</span><input required type="text" inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="one-time-code" disabled={busy} value={otp} onChange={(event) => { setOtp(event.target.value); setError(''); }} placeholder="6 位数字验证码" /></label>
        <label className="field-row"><span>新密码</span><input required type="password" minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} autoComplete="new-password" disabled={busy} value={password} onChange={(event) => { setPassword(event.target.value); setError(''); }} /></label>
        <label className="field-row"><span>确认新密码</span><input required type="password" minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} autoComplete="new-password" disabled={busy} value={confirmPassword} onChange={(event) => { setConfirmPassword(event.target.value); setError(''); }} /></label>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="dialog-footer"><button type="button" className="secondary-action" onClick={() => void onLogout()} disabled={busy}>退出登录</button><button type="submit" className="primary-action" disabled={busy}>{busy ? '正在绑定…' : '绑定邮箱并进入'}</button></div>
        <small>邮箱仅以脱敏形式进入审计日志；验证码与密码绝不落库明文。绑定后其它设备上的旧会话会被撤销。</small>
      </form>
    </main>
  )
}
