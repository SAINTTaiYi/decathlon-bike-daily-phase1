import { useEffect, useMemo, useState } from 'react'
import ProjectSelect from './ProjectSelect.jsx'
import {
  completeRegistration,
  getRegistrationDirectory,
  requestRegistrationOtp,
  verifyRegistrationOtp
} from '../api/auth.js'

const STEP_LABELS = ['登记门店', '验证邮箱', '设置密码']

function selectionOptions(items = [], makeLabel) {
  return items.map((item) => ({ value: item.id, label: makeLabel(item) }))
}

export default function RegistrationWizard({ onBack, onComplete }) {
  const [directory, setDirectory] = useState([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState('browse') // 'browse' | 'register'
  const [step, setStep] = useState(0)
  const [form, setForm] = useState({ regionId: '', cityId: '', storeId: '', storeCode: '', storeName: '', username: '', displayName: '', email: '', otp: '', password: '', confirmPassword: '' })
  const [challenge, setChallenge] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    getRegistrationDirectory()
      .then((payload) => { if (active) setDirectory(payload.regions || []) })
      .catch((requestError) => { if (active) setError(requestError.message || '无法读取可注册门店。') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const region = useMemo(() => directory.find((item) => item.id === form.regionId) || null, [directory, form.regionId])
  const city = useMemo(() => region?.cities?.find((item) => item.id === form.cityId) || null, [region, form.cityId])
  const store = useMemo(() => city?.stores?.find((item) => item.id === form.storeId) || null, [city, form.storeId])
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const clearFeedback = () => { if (error) setError(''); if (notice) setNotice('') }

  const chooseRegion = (regionId) => { clearFeedback(); setForm((current) => ({ ...current, regionId, cityId: '', storeId: '' })) }
  const chooseCity = (cityId) => { clearFeedback(); setForm((current) => ({ ...current, cityId, storeId: '' })) }

  const startRegister = () => {
    clearFeedback()
    setMode('register')
    setStep(0)
  }

  const sendOtp = async (event) => {
    event.preventDefault()
    if (!form.storeCode.trim() || !form.storeName.trim()) return setError('请填写门店编号和名称。')
    if (!form.username.trim() || !form.email.trim()) return setError('请填写 Profile 和公司邮箱。')
    setBusy(true); clearFeedback()
    try {
      const result = await requestRegistrationOtp({
        username: form.username,
        displayName: form.displayName || form.username,
        email: form.email,
        storeCode: form.storeCode.trim(),
        storeName: form.storeName.trim()
      })
      if (result.challengeId) setChallenge({ id: result.challengeId, completionToken: '' })
      setNotice(result.message || '验证码已发送，请检查公司邮箱。')
      if (result.challengeId) setStep(1)
    } catch (requestError) {
      setError(requestError.message || '验证码暂时无法发送。')
    } finally { setBusy(false) }
  }

  const verifyOtp = async (event) => {
    event.preventDefault()
    if (!challenge?.id || !/^\d{6}$/u.test(form.otp.trim())) return setError('请输入 6 位验证码。')
    setBusy(true); clearFeedback()
    try {
      const result = await verifyRegistrationOtp({ challengeId: challenge.id, otp: form.otp.trim() })
      setChallenge({ id: result.challengeId, completionToken: result.completionToken })
      setNotice(result.message || '邮箱已验证，请设置登录密码。')
      setStep(2)
    } catch (requestError) {
      setError(requestError.message || '验证码无效或已过期。')
    } finally { setBusy(false) }
  }

  const finish = async (event) => {
    event.preventDefault()
    if (!challenge?.completionToken) return setError('验证状态已失效，请重新获取验证码。')
    if (form.password.length < 10) return setError('密码至少需要 10 个字符。')
    if (form.password !== form.confirmPassword) return setError('两次输入的密码不一致。')
    setBusy(true); clearFeedback()
    try {
      const payload = await completeRegistration({ challengeId: challenge.id, completionToken: challenge.completionToken, password: form.password })
      onComplete?.(payload)
    } catch (requestError) {
      setError(requestError.message || '注册未完成，请重新开始。')
    } finally { setBusy(false) }
  }

  return (
    <main className="registration-shell">
      <section className="registration-panel" aria-labelledby="registration-title">
        <header>
          <span>COMPANY ACCESS · 门店自助注册</span>
          <h1 id="registration-title">{mode === 'browse' ? '选择门店' : '登记并开通门店'}</h1>
          <p>{mode === 'browse' ? '请先选择你所在的门店。如果门店不在列表中，可以进行新门店注册。' : '门店无需预先建档。填写门店编码、名称和公司邮箱，首位完成注册的人会成为该门店管理员。'}</p>
        </header>
        
        {mode === 'register' ? (
          <ol className="registration-steps" aria-label="注册进度">
            {STEP_LABELS.map((label, index) => <li key={label} aria-current={index === step ? 'step' : undefined} data-complete={index < step ? 'true' : undefined}><span>{index + 1}</span>{label}</li>)}
          </ol>
        ) : null}

        {loading ? <p role="status" aria-live="polite">正在读取可注册门店…</p> : null}
        
        {!loading && mode === 'browse' ? (
          <div className="data-form">
            <div className="registration-directory-grid">
              <label className="field-row"><span>区域</span><ProjectSelect value={form.regionId} options={selectionOptions(directory, (item) => item.name)} onChange={chooseRegion} ariaLabel="选择区域" placeholder="请选择区域" /></label>
              <label className="field-row"><span>城市</span><ProjectSelect value={form.cityId} options={selectionOptions(region?.cities, (item) => item.name)} onChange={chooseCity} ariaLabel="选择城市" placeholder="请选择城市" disabled={!region} /></label>
              <label className="field-row"><span>门店</span><ProjectSelect value={form.storeId} options={selectionOptions(city?.stores, (item) => `${item.code} ${item.name}`)} onChange={(value) => { clearFeedback(); set('storeId', value) }} ariaLabel="选择门店" placeholder="请选择门店" disabled={!city} /></label>
            </div>
            {store ? (
              <div className="registration-store-preview">
                <p><strong>{store.code}</strong> · {store.name}</p>
                <p className="registration-store-hint">如果这是你的门店，请联系该门店的现有管理员为你创建账号。</p>
              </div>
            ) : null}
            <div className="registration-browse-footer">
              <p className="registration-no-store-hint">找不到你的门店？</p>
              <button type="button" className="primary-action" onClick={startRegister}>注册新门店</button>
              <button type="button" className="secondary-action" onClick={onBack}>返回登录</button>
            </div>
          </div>
        ) : null}

        {!loading && mode === 'register' && step === 0 ? (
          <form className="data-form" onSubmit={sendOtp} noValidate>
            <label className="field-row"><span>门店编号</span><input required autoFocus maxLength="32" value={form.storeCode} onChange={(event) => { clearFeedback(); set('storeCode', event.target.value) }} placeholder="例如 1299" aria-describedby="registration-store-code-help" /></label>
            <label className="field-row"><span>门店名称</span><input required maxLength="120" value={form.storeName} onChange={(event) => { clearFeedback(); set('storeName', event.target.value) }} placeholder="例如 五象店" /></label>
            <small id="registration-store-code-help">门店编号必须是公司内部使用的唯一编号。该编号已存在时，门店与用户注册都会失败。</small>
            <label className="field-row"><span>Profile</span><input required autoComplete="username" maxLength="24" value={form.username} onChange={(event) => { clearFeedback(); set('username', event.target.value) }} placeholder="请输入真实 Profile" aria-describedby="registration-profile-help" /></label>
            <small id="registration-profile-help" className="registration-profile-help">请填写你在公司系统中实际使用的 Profile。昵称或临时名称可能导致后续提权、门店转移等权限流程无法正常处理。</small>
            <label className="field-row"><span>显示名（可选）</span><input autoComplete="name" maxLength="24" value={form.displayName} onChange={(event) => { clearFeedback(); set('displayName', event.target.value) }} placeholder="默认使用 Profile" /></label>
            <label className="field-row"><span>公司邮箱</span><input required type="email" autoComplete="email" inputMode="email" maxLength="320" value={form.email} onChange={(event) => { clearFeedback(); set('email', event.target.value) }} placeholder="name@decathlon.com" aria-describedby="registration-email-help" /></label>
            <small id="registration-email-help">验证码只发送到此公司邮箱，不会进入操作审计。</small>
            <div className="dialog-footer"><button type="button" className="secondary-action" onClick={() => { setMode('browse'); clearFeedback() }} disabled={busy}>返回选择门店</button><button type="submit" className="primary-action" disabled={busy}>{busy ? '正在发送…' : '发送验证码'}</button></div>
          </form>
        ) : null}

        {!loading && mode === 'register' && step === 1 ? (
          <form className="data-form" onSubmit={verifyOtp} noValidate>
            <p className="registration-summary">验证码已发送至 <strong>{form.email}</strong></p>
            <label className="field-row"><span>验证码</span><input autoFocus required type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength="6" autoComplete="one-time-code" value={form.otp} onChange={(event) => { clearFeedback(); set('otp', event.target.value) }} placeholder="6 位数字" /></label>
            <div className="dialog-footer"><button type="submit" className="primary-action" disabled={busy}>{busy ? '正在验证…' : '验证邮箱'}</button></div>
          </form>
        ) : null}

        {!loading && mode === 'register' && step === 2 ? (
          <form className="data-form" onSubmit={finish} noValidate>
            <p className="registration-summary">邮箱验证通过，请设置工作台登录密码。</p>
            <label className="field-row"><span>密码</span><input autoFocus required type="password" minLength="10" maxLength="128" autoComplete="new-password" value={form.password} onChange={(event) => { clearFeedback(); set('password', event.target.value) }} /></label>
            <label className="field-row"><span>确认密码</span><input required type="password" minLength="10" maxLength="128" autoComplete="new-password" value={form.confirmPassword} onChange={(event) => { clearFeedback(); set('confirmPassword', event.target.value) }} /></label>
            <div className="dialog-footer"><button type="submit" className="primary-action" disabled={busy}>{busy ? '正在完成…' : '完成注册'}</button></div>
          </form>
        ) : null}

        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {notice ? <p className="form-notice" role="status">{notice}</p> : null}
      </section>
    </main>
  )
}
