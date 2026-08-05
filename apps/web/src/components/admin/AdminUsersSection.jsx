import { useEffect, useRef, useState } from 'react'
import AppDialog from '../dialogs/AppDialog.jsx'
import ProjectSelect from '../ProjectSelect.jsx'

const roleLabels = { operator: '操作员', manager: '经理', admin: '管理员' }
const roleOptions = [{ value: 'operator', label: '操作员' }, { value: 'manager', label: '经理' }, { value: 'admin', label: '管理员' }]

function formatTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

export default function AdminUsersSection({ shared, stores = [] }) {
  const [query, setQuery] = useState('')
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [confirmToggle, setConfirmToggle] = useState(null)
  const [resetResult, setResetResult] = useState(null)
  const activeRef = useRef(true)

  const load = async (q) => {
    setBusy(true); setError('')
    try {
      const result = await shared.getUsers({ q })
      if (activeRef.current) setData(result)
    } catch (requestError) {
      if (activeRef.current) setError(requestError.message || '无法读取用户列表。')
    } finally {
      if (activeRef.current) setBusy(false)
    }
  }

  useEffect(() => {
    activeRef.current = true
    void load('')
    return () => { activeRef.current = false }
  }, [])

  const submit = (event) => {
    event.preventDefault()
    void load(query.trim())
  }

  const doToggle = async (user) => {
    setConfirmToggle(null)
    const result = await shared.toggleUserStatus(user.id, user.status === 'active' ? 'disabled' : 'active')
    if (result?.error) setError(result.error)
    await load(query.trim())
  }

  const doReset = async (user) => {
    const result = await shared.resetPassword(user.id)
    if (result?.error) setError(result.error)
    else setResetResult({ user, tempPassword: result.tempPassword })
  }

  return (
    <section className="admin-panel">
      <header className="admin-panel-head"><h2>用户与成员</h2><small>USERS · 全平台账号与门店角色</small></header>
      <div className="admin-toolbar" role="search">
        <label><span className="sr-only">搜索用户</span><input type="search" placeholder="搜索姓名或登录名" maxLength="80" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <button type="submit" className="secondary-action" onClick={submit}>搜索</button>
        <button type="button" className="primary-action admin-toolbar-primary" onClick={() => setCreateOpen(true)}>创建账号</button>
        {busy ? <span className="admin-inline-status" role="status">读取中…</span> : null}
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {!data && !error && !busy ? <p className="admin-empty">暂无用户数据。</p> : null}
      {data?.users?.length ? <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th>用户</th><th>登录名</th><th>角色</th><th>门店</th><th>状态</th><th>最近登录</th><th>操作</th></tr></thead>
          <tbody>
            {data.users.map((user) => (
              <tr key={user.id}>
                <td><strong>{user.displayName}</strong>{user.isPlatformAdmin ? <span className="admin-platform-badge">平台管理员</span> : null}</td>
                <td><span className="admin-username">{user.username}</span></td>
                <td>{user.memberships.map((m) => roleLabels[m.role] || m.role).join('、') || '—'}</td>
                <td>{user.memberships.map((m) => `${m.storeCode} ${m.storeName}`).join('、') || '—'}</td>
                <td><span className="admin-status-tag" data-status={user.status}>{user.status === 'active' ? '生效' : '停用'}</span></td>
                <td>{formatTime(user.lastLoginAt)}</td>
                <td className="admin-row-actions">
                  {user.isPlatformAdmin ? <span className="admin-inline-status">受保护</span> : <>
                    <button type="button" className="secondary-action" onClick={() => setConfirmToggle(user)}>{user.status === 'active' ? '禁用' : '恢复'}</button>
                    <button type="button" className="secondary-action" onClick={() => void doReset(user)} disabled={user.status !== 'active'}>重置密码</button>
                  </>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.users.length >= 200 ? <p className="admin-inline-status">结果达到上限，请用搜索缩小范围。</p> : null}
      </div> : null}
      {data?.users && !data.users.length ? <p className="admin-empty">没有匹配的用户。</p> : null}

      {createOpen ? <CreateUserDialog shared={shared} stores={stores} onClose={() => setCreateOpen(false)} onCreated={async () => { setCreateOpen(false); await load(query.trim()) }} /> : null}
      {confirmToggle ? (
        <div className="admin-decision-backdrop" role="dialog" aria-modal="true" aria-label="禁用确认" onPointerDown={(event) => { if (event.target === event.currentTarget) setConfirmToggle(null) }}>
          <div className="admin-decision">
            <header><span>{confirmToggle.status === 'active' ? '禁用账号' : '恢复账号'}</span><small>CONFIRM</small></header>
            <p className="admin-decision-subject"><strong>{confirmToggle.displayName}</strong><span>{confirmToggle.username}</span></p>
            <p className="admin-warning">{confirmToggle.status === 'active' ? '禁用后该账号所有已登录会话将立即失效（踢下线）。' : '恢复后该账号可重新登录，原会话不会自动恢复。'}</p>
            <div className="admin-decision-actions">
              <button type="button" className="secondary-action" onClick={() => setConfirmToggle(null)}>取消</button>
              <button type="button" className="primary-action" data-danger={confirmToggle.status === 'active' ? 'true' : 'false'} onClick={() => void doToggle(confirmToggle)}>{confirmToggle.status === 'active' ? '确认禁用' : '确认恢复'}</button>
            </div>
          </div>
        </div>
      ) : null}
      {resetResult ? (
        <div className="admin-decision-backdrop" role="dialog" aria-modal="true" aria-label="临时密码" onPointerDown={(event) => { if (event.target === event.currentTarget) setResetResult(null) }}>
          <div className="admin-decision">
            <header><span>一次性临时密码</span><small>ONE-TIME · 仅显示一次</small></header>
            <p className="admin-decision-subject"><strong>{resetResult.user.displayName}</strong><span>{resetResult.user.username}</span></p>
            <p className="admin-temp-password">{resetResult.tempPassword}</p>
            <p className="admin-warning">请立即转交对方；对方下次登录将被强制修改密码。此密码不会再次显示。</p>
            <div className="admin-decision-actions"><button type="button" className="primary-action" onClick={() => setResetResult(null)}>我已转交，关闭</button></div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function CreateUserDialog({ shared, stores, onClose, onCreated }) {
  const [form, setForm] = useState({ username: '', displayName: '', storeId: '', role: 'operator', password: '', confirmPassword: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event) => {
    event.preventDefault()
    const username = form.username.trim().toLocaleLowerCase('zh-CN')
    if (!username) return setError('请填写登录名。')
    if (!form.displayName.trim()) return setError('请填写姓名。')
    if (!form.storeId) return setError('请选择门店。')
    if (form.password.length < 10) return setError('密码至少需要 10 个字符。')
    if (form.password !== form.confirmPassword) return setError('两次输入的密码不一致。')
    setBusy(true); setError('')
    try {
      const result = await shared.createUser({ username, displayName: form.displayName.trim(), storeId: form.storeId, role: form.role, password: form.password })
      await onCreated?.(result)
    } catch (requestError) {
      setError(requestError.message || '创建账号失败。')
    } finally {
      setBusy(false)
    }
  }
  return (
    <AppDialog open onClose={onClose} title="创建账号" eyebrow="CREATE USER · 受审计" description="新账号下次登录将被强制修改初始密码。" className="admin-create-user-dialog">
      <form className="data-form" onSubmit={submit} noValidate>
        <label className="field-row"><span>登录名</span><input required autoFocus maxLength="64" autoComplete="off" value={form.username} onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))} placeholder="小写字母/数字" /></label>
        <label className="field-row"><span>姓名</span><input required maxLength="80" value={form.displayName} onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))} /></label>
        <label className="field-row"><span>门店</span><ProjectSelect value={form.storeId} options={stores} onChange={(value) => setForm((current) => ({ ...current, storeId: value }))} ariaLabel="选择门店" placeholder="请选择门店" /></label>
        <label className="field-row"><span>角色</span><ProjectSelect value={form.role} options={roleOptions} onChange={(value) => setForm((current) => ({ ...current, role: value }))} ariaLabel="选择角色" /></label>
        <label className="field-row"><span>初始密码</span><input required type="password" minLength="10" maxLength="128" autoComplete="new-password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} /></label>
        <label className="field-row"><span>确认密码</span><input required type="password" minLength="10" maxLength="128" autoComplete="new-password" value={form.confirmPassword} onChange={(event) => setForm((current) => ({ ...current, confirmPassword: event.target.value }))} /></label>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="admin-decision-actions">
          <button type="button" className="secondary-action" onClick={onClose} disabled={busy}>取消</button>
          <button type="submit" className="primary-action" disabled={busy}>{busy ? '创建中…' : '创建账号'}</button>
        </div>
      </form>
    </AppDialog>
  )
}
