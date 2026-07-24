import { useState } from 'react'
import AppDialog from './AppDialog.jsx'
import { createUserAccount } from '../../api/auth.js'

const roleOptions = [
  { value: 'operator', label: '操作员' },
  { value: 'manager', label: '经理' },
  { value: 'admin', label: '管理员' }
]

function randomTempPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join('')
}

export default function CreateUserDialog({ open, onClose, onNotify }) {
  const [form, setForm] = useState({ username: '', displayName: '', password: '', role: 'operator' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState(null)
  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }))

  const close = () => {
    if (busy) return
    setError('')
    setCreated(null)
    setForm({ username: '', displayName: '', password: '', role: 'operator' })
    onClose()
  }

  const generatePassword = () => set('password', randomTempPassword())

  const submit = async (event) => {
    event.preventDefault()
    if (!form.username.trim()) return setError('请输入用户名。')
    if (form.password.length < 10) return setError('临时密码至少需要 10 个字符。')
    setBusy(true)
    setError('')
    try {
      const result = await createUserAccount({
        username: form.username.trim(),
        displayName: (form.displayName || form.username).trim(),
        password: form.password,
        role: form.role
      })
      setCreated({
        username: form.username.trim(),
        displayName: result.user?.displayName || form.displayName || form.username,
        password: form.password,
        role: result.user?.role || form.role
      })
      onNotify?.('新账号已创建，请把临时密码交给同事。')
    } catch (err) {
      setError(err.message || '创建账号失败。')
    } finally {
      setBusy(false)
    }
  }

  const copyCredentials = async () => {
    if (!created) return
    const text = [
      `用户名：${created.username}`,
      `显示名：${created.displayName}`,
      `角色：${roleOptions.find((item) => item.value === created.role)?.label || created.role}`,
      `临时密码：${created.password}`,
      '首次登录后需要修改临时密码。'
    ].join('\n')
    try {
      await navigator.clipboard.writeText(text)
      onNotify?.('账号信息已复制')
    } catch {
      onNotify?.({ message: '复制失败，请手动抄写临时密码。', tone: 'error' })
    }
  }

  return (
    <AppDialog open={open} onClose={close} title="添加用户" eyebrow="ADMIN · 账号管理" description="为当前门店创建同事账号。同事首次登录时必须修改临时密码。">
      {created ? (
        <div className="identity-confirm" role="status">
          <strong>账号已创建</strong>
          <p>用户名：{created.username}</p>
          <p>显示名：{created.displayName}</p>
          <p>角色：{roleOptions.find((item) => item.value === created.role)?.label || created.role}</p>
          <p>临时密码：{created.password}</p>
          <small>请立即把临时密码私下发给同事。密码不会再次显示。</small>
          <div>
            <button type="button" onClick={() => void copyCredentials()}>复制账号信息</button>
            <button type="button" className="primary-action" onClick={close}>完成</button>
          </div>
        </div>
      ) : (
        <form className="data-form" onSubmit={submit} noValidate>
          <label className="field-row"><span>用户名</span><input autoFocus required maxLength="24" autoComplete="off" value={form.username} onChange={(event) => set('username', event.target.value)} placeholder="例如：小王" /></label>
          <label className="field-row"><span>显示名</span><input maxLength="24" autoComplete="off" value={form.displayName} onChange={(event) => set('displayName', event.target.value)} placeholder="默认与用户名相同" /></label>
          <fieldset className="field-row role-options">
            <legend>角色</legend>
            <div className="role-option-list">
              {roleOptions.map((option) => (
                <label key={option.value} className="role-option">
                  <input type="radio" name="role" value={option.value} checked={form.role === option.value} onChange={(event) => set('role', event.target.value)} />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="field-row"><span>临时密码</span><input required minLength="10" maxLength="128" autoComplete="new-password" value={form.password} onChange={(event) => set('password', event.target.value)} placeholder="至少 10 位" /></label>
          <button type="button" className="secondary-action" onClick={generatePassword} disabled={busy}>生成临时密码</button>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <div className="dialog-footer">
            <button type="button" className="secondary-action" onClick={close} disabled={busy}>取消</button>
            <button type="submit" className="primary-action" disabled={busy}>{busy ? '正在创建…' : '创建账号'}</button>
          </div>
          <small>只有管理员可以创建账号；新账号默认归属当前门店，首次登录必须修改临时密码。</small>
        </form>
      )}
    </AppDialog>
  )
}
