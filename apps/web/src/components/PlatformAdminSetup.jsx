import { useEffect, useState } from 'react'
import ProjectSelect from './ProjectSelect.jsx'
import { getRegistrationDirectory, setupPlatformAdmin } from '../api/auth.js'

export default function PlatformAdminSetup({ token, onComplete }) {
  const [directory, setDirectory] = useState([])
  const [storeId, setStoreId] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getRegistrationDirectory().then((payload) => {
      const regions = payload.regions || []
      setDirectory(regions)
      const first = regions[0]?.cities?.[0]?.stores?.[0]
      if (first) setStoreId(first.id)
    }).catch((requestError) => setError(requestError.message || '无法读取目录。'))
  }, [])

  const options = directory.flatMap((region) => region.cities.flatMap((city) => city.stores.map((store) => ({ value: store.id, label: `${region.name} / ${city.name} / ${store.code} ${store.name}` }))))
  const submit = async (event) => {
    event.preventDefault()
    if (!storeId) return setError('请选择所属门店。')
    if (password.length < 10) return setError('密码至少需要 10 个字符。')
    if (password !== confirmPassword) return setError('两次输入的密码不一致。')
    setBusy(true); setError('')
    try {
      await setupPlatformAdmin({ token, password, storeId })
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
      onComplete?.()
    } catch (requestError) { setError(requestError.message || '平台管理员初始化失败。') } finally { setBusy(false) }
  }

  return (
    <main className="registration-shell" data-ark-theme="endfield" data-ark-depth="maximal">
      <form className="registration-panel" onSubmit={submit} noValidate>
        <header><span>ONE-TIME PLATFORM SETUP</span><h1>初始化 CHU13</h1><p>CHU13 是全国目录和角色提权的唯一平台管理员。此链接只能成功执行一次。</p></header>
        <label className="field-row"><span>Profile</span><input value="CHU13" readOnly aria-readonly="true" /></label>
        <label className="field-row"><span>所属门店</span><ProjectSelect value={storeId} options={options} onChange={setStoreId} ariaLabel="选择 CHU13 所属门店" placeholder="请选择门店" disabled={!options.length} /></label>
        <label className="field-row"><span>设置密码</span><input required autoFocus type="password" minLength="10" maxLength="128" autoComplete="new-password" value={password} onChange={(event) => { setError(''); setPassword(event.target.value) }} /></label>
        <label className="field-row"><span>确认密码</span><input required type="password" minLength="10" maxLength="128" autoComplete="new-password" value={confirmPassword} onChange={(event) => { setError(''); setConfirmPassword(event.target.value) }} /></label>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button type="submit" className="primary-action" disabled={busy || !options.length}>{busy ? '正在初始化…' : '创建 CHU13 并锁定初始化'}</button>
        <small>初始化完成后，平台权限只能通过受审计的数据库记录判定，不能由前端 Profile 文本绕过。</small>
      </form>
    </main>
  )
}
