import { useState } from 'react'
import { setupAdminAccount } from '../api/auth.js'
import { normalizeLoginUsername } from '../data/userSession.js'

export default function InitialSetup({ token, onComplete }) {
  const [form, setForm] = useState({ username: '', displayName: '', password: '', confirmPassword: '', storeCode: 'BIKE', storeName: '自行车部门' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const submit = async (event) => {
    event.preventDefault()
    const username = normalizeLoginUsername(form.username)
    const displayName = normalizeLoginUsername(form.displayName || form.username)
    if (!username || !displayName) return setError('请填写管理员用户名。')
    if (form.password.length < 10) return setError('密码至少需要 10 个字符。')
    if (form.password !== form.confirmPassword) return setError('两次输入的密码不一致。')
    setBusy(true)
    setError('')
    try {
      await setupAdminAccount({ token, username, displayName, password: form.password, storeCode: form.storeCode.trim(), storeName: form.storeName.trim() })
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
      onComplete?.()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="initial-setup-shell">
      <form className="initial-setup-panel" onSubmit={submit} noValidate>
        <header><span>ONE-TIME SETUP · 一次性初始化</span><h1>创建首位管理员</h1><p>Setup Token 只存在当前地址 Fragment 中。创建完成后，该 Token 无法再创建第二位管理员。</p></header>
        <label className="field-row"><span>管理员用户名</span><input autoFocus required maxLength="24" autoComplete="username" value={form.username} onChange={(event) => set('username', event.target.value)} /></label>
        <label className="field-row"><span>界面显示名</span><input maxLength="24" autoComplete="name" value={form.displayName} onChange={(event) => set('displayName', event.target.value)} placeholder="留空时与用户名相同" /></label>
        <label className="field-row"><span>管理员密码</span><input required type="password" minLength="10" maxLength="128" autoComplete="new-password" value={form.password} onChange={(event) => set('password', event.target.value)} /></label>
        <label className="field-row"><span>确认密码</span><input required type="password" minLength="10" maxLength="128" autoComplete="new-password" value={form.confirmPassword} onChange={(event) => set('confirmPassword', event.target.value)} /></label>
        <div className="initial-setup-grid"><label className="field-row"><span>门店代码</span><input required maxLength="32" value={form.storeCode} onChange={(event) => set('storeCode', event.target.value)} /></label><label className="field-row"><span>门店名称</span><input required maxLength="120" value={form.storeName} onChange={(event) => set('storeName', event.target.value)} /></label></div>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button type="submit" className="primary-action" disabled={busy}>{busy ? '正在创建…' : '创建管理员并锁定初始化'}</button>
        <small>密码仅以 Argon2id 哈希写入数据库；明文不会进入日志、浏览器存储或部署状态文件。</small>
      </form>
    </main>
  )
}
