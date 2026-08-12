import { useState } from 'react'
import { setupPlatformAdmin } from '../api/auth.js'

export default function PlatformAdminSetup({ token, onComplete }) {
  const [username, setUsername] = useState('CHU13')
  const [displayName, setDisplayName] = useState('CHU13')
  const [storeCode, setStoreCode] = useState('')
  const [storeName, setStoreName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event) => {
    event.preventDefault()
    if (!username.trim()) return setError('请输入用户名。')
    if (!displayName.trim()) return setError('请输入显示名称。')
    if (!storeCode.trim()) return setError('请输入门店编号。')
    if (!storeName.trim()) return setError('请输入门店名称。')
    if (password.length < 10) return setError('密码至少需要 10 个字符。')
    if (password !== confirmPassword) return setError('两次输入的密码不一致。')
    setBusy(true); setError('')
    try {
      await setupPlatformAdmin({ token, username, displayName, storeCode, storeName, password })
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
      onComplete?.()
    } catch (requestError) { setError(requestError.message || '平台管理员初始化失败。') } finally { setBusy(false) }
  }

  return (
    <main className="registration-shell">
      <form className="registration-panel" onSubmit={submit} noValidate>
        <header><span>ONE-TIME PLATFORM SETUP</span><h1>初始化首位管理员</h1><p>创建系统首位管理员账号及其所属门店。此链接只能成功执行一次。</p></header>
        <label className="field-row"><span>用户名</span><input required autoFocus type="text" maxLength="50" value={username} onChange={(e) => { setError(''); setUsername(e.target.value) }} /></label>
        <label className="field-row"><span>显示名称</span><input required type="text" maxLength="100" value={displayName} onChange={(e) => { setError(''); setDisplayName(e.target.value) }} /></label>
        <label className="field-row"><span>门店编号</span><input required type="text" maxLength="20" placeholder="例如：SH001" value={storeCode} onChange={(e) => { setError(''); setStoreCode(e.target.value) }} /></label>
        <label className="field-row"><span>门店名称</span><input required type="text" maxLength="100" placeholder="例如：上海徐汇店" value={storeName} onChange={(e) => { setError(''); setStoreName(e.target.value) }} /></label>
        <label className="field-row"><span>设置密码</span><input required type="password" minLength="10" maxLength="128" autoComplete="new-password" value={password} onChange={(e) => { setError(''); setPassword(e.target.value) }} /></label>
        <label className="field-row"><span>确认密码</span><input required type="password" minLength="10" maxLength="128" autoComplete="new-password" value={confirmPassword} onChange={(e) => { setError(''); setConfirmPassword(e.target.value) }} /></label>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button type="submit" className="primary-action" disabled={busy}>{busy ? '正在初始化…' : '创建管理员并锁定初始化'}</button>
        <small>初始化完成后，平台权限只能通过受审计的数据库记录判定，不能由前端文本绕过。</small>
      </form>
    </main>
  )
}
