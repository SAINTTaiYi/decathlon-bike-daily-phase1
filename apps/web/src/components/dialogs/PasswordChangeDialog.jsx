import { useEffect, useRef, useState } from 'react'
import { idempotencyKey } from '../../api/client.js'
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, validatePasswordChangeForm } from '../../data/passwordChange.js'
import AppDialog from './AppDialog.jsx'

const EMPTY_FORM = { currentPassword: '', nextPassword: '', confirmPassword: '' }

export default function PasswordChangeDialog({ open, userName, onClose, onChangePassword, onComplete }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const requestKeyRef = useRef('')

  useEffect(() => {
    if (open) return
    requestKeyRef.current = ''
    setForm(EMPTY_FORM)
    setError('')
    setBusy(false)
  }, [open])

  const set = (field, value) => {
    requestKeyRef.current = ''
    setError('')
    setForm((current) => ({ ...current, [field]: value }))
  }

  const close = () => {
    if (!busy) onClose?.()
  }

  const submit = async (event) => {
    event.preventDefault()
    const validationError = validatePasswordChangeForm(form)
    if (validationError) return setError(validationError)

    if (!requestKeyRef.current) requestKeyRef.current = idempotencyKey()
    setBusy(true)
    setError('')
    const result = await onChangePassword(form.currentPassword, form.nextPassword, requestKeyRef.current)
    if (!result.ok) {
      setBusy(false)
      return setError(result.error)
    }
    onComplete?.()
  }

  return (
    <AppDialog
      open={open}
      onClose={close}
      dismissible={!busy}
      className="password-change-dialog"
      title="修改密码"
      eyebrow="ACCOUNT SECURITY · 账号安全"
      description={`更新 ${userName || '当前账号'} 的登录密码。提交成功后，本设备继续登录，其它设备上的会话会被撤销。`}
    >
      <form className="data-form password-change-form" onSubmit={submit} noValidate>
        <label className="field-row">
          <span>当前密码</span>
          <input
            data-autofocus
            required
            type="password"
            maxLength={PASSWORD_MAX_LENGTH}
            autoComplete="current-password"
            disabled={busy}
            value={form.currentPassword}
            onChange={(event) => set('currentPassword', event.target.value)}
          />
        </label>
        <label className="field-row">
          <span>新密码</span>
          <input
            required
            type="password"
            minLength={PASSWORD_MIN_LENGTH}
            maxLength={PASSWORD_MAX_LENGTH}
            autoComplete="new-password"
            disabled={busy}
            value={form.nextPassword}
            onChange={(event) => set('nextPassword', event.target.value)}
          />
        </label>
        <label className="field-row">
          <span>确认新密码</span>
          <input
            required
            type="password"
            minLength={PASSWORD_MIN_LENGTH}
            maxLength={PASSWORD_MAX_LENGTH}
            autoComplete="new-password"
            disabled={busy}
            value={form.confirmPassword}
            onChange={(event) => set('confirmPassword', event.target.value)}
          />
        </label>
        <p className="conditional-field-note">
          <strong>至少 10 个字符</strong>
          <span>新密码不能与当前密码相同。系统只保存单向密码哈希，不会记录或展示密码明文。</span>
        </p>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="dialog-footer">
          <button type="button" className="secondary-action" onClick={close} disabled={busy}>取消</button>
          <button type="submit" className="primary-action" disabled={busy}>{busy ? '正在更新…' : '确认修改'}</button>
        </div>
      </form>
    </AppDialog>
  )
}
