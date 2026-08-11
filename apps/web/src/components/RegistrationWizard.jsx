import { useEffect, useMemo, useState } from 'react'
import ProjectSelect from './ProjectSelect.jsx'
import {
  completeRegistration,
  getRegistrationDirectory,
  requestRegistrationOtp,
  verifyRegistrationOtp
} from '../api/auth.js'

const STEP_LABELS = ['选择门店', '验证邮箱', '设置密码']

function selectionOptions(items = [], makeLabel) {
  return items.map((item) => ({ value: item.id, label: makeLabel(item) }))
}

export default function RegistrationWizard({ onBack, onComplete }) {
  const [directory, setDirectory] = useState([])
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState(0)
  const [form, setForm] = useState({ regionId: '', cityId: '', storeId: '', username: '', displayName: '', email: '', otp: '', password: '', confirmPassword: '' })
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

  const sendOtp = async (event) => {
    event.preventDefault()
    if (!store) return setError('请依次选择区域、城市和门店。')
    if (!form.username.trim() || !form.email.trim()) return setError('请填写 Profile 和公司邮箱。')
    setBusy(true); clearFeedback()
    try {
      const result = await requestRegistrationOtp({
        username: form.username,
        displayName: form.displayName || form.username,
        email: form.email,
        storeId: store.id
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
          <h1 id="registration-title">创建工作台账号</h1>
          <p>仅限已登记门店的 <strong>@decathlon.com</strong> 邮箱。验证完成前不会创建账号或门店成员关系。</p>
        </header>
        <ol className="registration-steps" aria-label="注册进度">
          {STEP_LABELS.map((label, index) => <li key={label} aria-current={index === step ? 'step' : undefined} data-complete={index < step ? 'true' : undefined}><span>{index + 1}</span>{label}</li>)}
        </ol>
        {loading ? <p role="status" aria-live="polite">正在读取可注册门店…</p> : null}
        {!loading && step === 0 ? (
          <form className="data-form" onSubmit={sendOtp} noValidate>
            <div className="registration-directory-grid">
              <label className="field-row"><span>区域</span><ProjectSelect value={form.regionId} options={selectionOptions(directory, (item) => item.name)} onChange={chooseRegion} ariaLabel="选择区域" placeholder="请选择区域" /></label>
              <label className="field-row"><span>城市</span><ProjectSelect value={form.cityId} options={selectionOptions(region?.cities, (item) => item.name)} onChange={chooseCity} ariaLabel="选择城市" placeholder="请选择城市" disabled={!region} /></label>
              <label className="field-row"><span>门店</span><ProjectSelect value={form.storeId} options={selectionOptions(city?.stores, (item) => `${item.code} ${item.name}`)} onChange={(value) => { clearFeedback(); set('storeId', value) }} ariaLabel="选择门店" placeholder="请选择门店" disabled={!city} /></label>
            </div>
            <label className="field-row"><span>Profile</span><input required autoComplete="username" maxLength="24" value={form.username} onChange={(event) => { clearFeedback(); set('username', event.target.value) }} placeholder="请输入真实 Profile" aria-describedby="registration-profile-help" /></label>
            <small id="registration-profile-help" className="registration-profile-help">请填写你在公司系统中实际使用的 Profile。昵称或临时名称可能导致后续提权、门店转移等权限流程无法正常处理。</small>
            <label className="field-row"><span>显示名（可选）</span><input autoComplete="name" maxLength="24" value={form.displayName} onChange={(event) => { clearFeedback(); set('displayName', event.target.value) }} placeholder="默认使用 Profile" /></label>
            <label className="field-row"><span>公司邮箱</span><input required type="email" autoComplete="email" inputMode="email" maxLength="320" value={form.email} onChange={(event) => { clearFeedback(); set('email', event.target.value) }} placeholder="name@decathlon.com" aria-describedby="registration-email-help" /></label>
            <small id="registration-email-help">验证码只发送到此公司邮箱，不会进入操作审计。</small>
            <div className="dialog-footer"><button type="button" className="secondary-action" onClick={onBack} disabled={busy}>返回登录</button><button type="submit" className="primary-action" disabled={busy || !store}>{busy ? '正在发送…' : '发送验证码'}</button></div>
          </form>
        ) : null}
        {!loading && step === 1 ? (
          <form className="data-form" onSubmit={verifyOtp} noValidate>
            <p className="registration-summary">验证码已发送至 <strong>{form.email}</strong>。门店：<strong>{store ? `${store.code} ${store.name}` : '未选择'}</strong>。</p>
            <label className="field-row"><span>6 位验证码</span><input required autoFocus inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength="6" value={form.otp} onChange={(event) => { clearFeedback(); set('otp', event.target.value.replace(/\D/gu, '')) }} placeholder="000000" /></label>
            <div className="dialog-footer"><button type="button" className="secondary-action" onClick={() => { clearFeedback(); setStep(0) }} disabled={busy}>修改信息</button><button type="submit" className="primary-action" disabled={busy}>{busy ? '正在验证…' : '验证邮箱'}</button></div>
          </form>
        ) : null}
        {!loading && step === 2 ? (
          <form className="data-form" onSubmit={finish} noValidate>
            <p className="registration-summary" role="status">邮箱已验证。完成后会以 <strong>操作员</strong> 身份加入 {store ? `${store.code} ${store.name}` : '所选门店'}。</p>
            <label className="field-row"><span>设置密码</span><input required autoFocus type="password" minLength="10" maxLength="128" autoComplete="new-password" value={form.password} onChange={(event) => { clearFeedback(); set('password', event.target.value) }} /></label>
            <label className="field-row"><span>确认密码</span><input required type="password" minLength="10" maxLength="128" autoComplete="new-password" value={form.confirmPassword} onChange={(event) => { clearFeedback(); set('confirmPassword', event.target.value) }} /></label>
            <div className="dialog-footer"><button type="button" className="secondary-action" onClick={() => { clearFeedback(); setStep(1) }} disabled={busy}>返回验证码</button><button type="submit" className="primary-action" disabled={busy}>{busy ? '正在创建…' : '完成注册并进入'}</button></div>
          </form>
        ) : null}
        {notice ? <p className="registration-notice" role="status" aria-live="polite">{notice}</p> : null}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
      </section>
    </main>
  )
}
