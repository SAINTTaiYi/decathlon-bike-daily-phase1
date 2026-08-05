import { useEffect, useRef, useState } from 'react'

const roleLabels = { operator: '操作员', manager: '经理', admin: '管理员' }

function formatTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

export default function AdminUsersSection({ shared }) {
  const [query, setQuery] = useState('')
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const activeRef = useRef(true)

  const load = async (q) => {
    setBusy(true); setError('')
    try {
      const result = await shared.getUsers(q)
      if (activeRef.current) { setData(result); }
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

  return (
    <section className="admin-panel">
      <header className="admin-panel-head"><h2>用户与成员</h2><small>USERS · 全平台账号与门店角色</small></header>
      <form className="admin-toolbar" onSubmit={submit} role="search">
        <label><span className="sr-only">按姓名或登录名搜索</span><input type="search" placeholder="搜索姓名或登录名" maxLength="80" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <button type="submit" className="secondary-action">搜索</button>
        {busy ? <span className="admin-inline-status" role="status">读取中…</span> : null}
      </form>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {!data && !error && !busy ? <p className="admin-empty">暂无用户数据。</p> : null}
      {data?.users?.length ? <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th>用户</th><th>登录名</th><th>角色</th><th>门店</th><th>状态</th><th>最近登录</th><th>注册</th></tr></thead>
          <tbody>
            {data.users.map((user) => (
              <tr key={user.id}>
                <td><strong>{user.displayName}</strong>{user.isPlatformAdmin ? <span className="admin-platform-badge">平台管理员</span> : null}</td>
                <td><span className="admin-username">{user.username}</span></td>
                <td>{user.memberships.map((m) => roleLabels[m.role] || m.role).join('、') || '—'}</td>
                <td>{user.memberships.map((m) => `${m.storeCode} ${m.storeName}`).join('、') || '—'}</td>
                <td><span className="admin-status-tag" data-status={user.status}>{user.status === 'active' ? '生效' : '停用'}</span></td>
                <td>{formatTime(user.lastLoginAt)}</td>
                <td>{formatTime(user.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.users.length >= 200 ? <p className="admin-inline-status">结果达到上限，请用搜索缩小范围。</p> : null}
      </div> : null}
      {data?.users && !data.users.length ? <p className="admin-empty">没有匹配的用户。</p> : null}
    </section>
  )
}
