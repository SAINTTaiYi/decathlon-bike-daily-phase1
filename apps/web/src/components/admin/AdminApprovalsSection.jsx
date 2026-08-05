import { useEffect, useRef, useState } from 'react'

const tabs = [
  { id: 'role', label: '角色提权', en: 'ROLE REQUESTS' },
  { id: 'transfer', label: '调店申请', en: 'TRANSFER REQUESTS' },
  { id: 'store', label: '门店审核', en: 'STORE REVIEW' }
]
const groups = [
  { id: 'pending', label: '待审批', en: 'PENDING' },
  { id: 'expired', label: '已过期', en: 'EXPIRED' },
  { id: 'decided', label: '已处理', en: 'DECIDED' }
]

function formatTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date)
}

export default function AdminApprovalsSection({ shared, directory = [] }) {
  const [tab, setTab] = useState('role')
  const [group, setGroup] = useState('pending')
  const [data, setData] = useState(null)
  const [nextCursor, setNextCursor] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState({})
  const [decision, setDecision] = useState(null)
  const activeRef = useRef(true)

  const load = async (filters, append = false) => {
    setBusy(true); setError('')
    try {
      const result = await shared.getApprovals(filters)
      if (!activeRef.current) return
      setData((current) => append && current ? { requests: [...current.requests, ...result.requests] } : result)
      setNextCursor(result.nextCursor)
    } catch (requestError) {
      if (activeRef.current) setError(requestError.message || '无法读取审批列表。')
    } finally {
      if (activeRef.current) setBusy(false)
    }
  }

  useEffect(() => {
    activeRef.current = true
    return () => { activeRef.current = false }
  }, [])

  useEffect(() => {
    setSelected({})
    if (tab === 'store') { setData(null); return }
    void load({ type: tab, group })
  }, [tab, group])

  const pendingStores = (directory || []).flatMap((region) => region.cities.flatMap((city) => city.stores.filter((store) => store.status === 'pending').map((store) => ({ ...store, regionName: region.name, cityName: city.name }))))

  const toggleSelect = (id) => setSelected((current) => ({ ...current, [id]: !current[id] }))
  const selectAll = (items) => setSelected(Object.fromEntries(items.map((item) => [item.id, true])))
  const selectedIds = new Set(Object.entries(selected).filter(([, on]) => on).map(([id]) => id))

  const runBatch = async (items, approve) => {
    const targets = items.filter((item) => !selectedIds.size || selectedIds.has(item.id))
    if (!targets.length) return
    setBusy(true); setError('')
    const failures = []
    for (const item of targets) {
      const result = tab === 'role'
        ? await shared.decideRole(item, approve, approve ? 'CHU13 批量批准' : 'CHU13 拒绝')
        : await shared.decideTransfer(item, approve, approve ? 'CHU13 批量批准' : 'CHU13 拒绝')
      if (result?.error) failures.push(`${item.userName || item.id}：${result.error}`)
    }
    setBusy(false)
    if (failures.length) setError(`部分操作未完成：${failures.join('；')}`)
    setSelected({})
  }

  const requestDecision = (item) => setDecision({ item, approve: null })
  const submitDecision = async (approve, reason) => {
    if (!decision) return
    const { item } = decision
    setDecision(null)
    await (tab === 'role' ? shared.decideRole(item, approve, reason) : shared.decideTransfer(item, approve, reason))
  }

  const storeDecide = async (store, approve, reason) => {
    const result = await shared.reviewStore(store.id, { approve, reason: reason || undefined })
    if (result?.error) setError(result.error)
  }

  return (
    <section className="admin-panel">
      <header className="admin-panel-head"><h2>审批</h2><small>APPROVALS · 受审计决策</small></header>
      <div className="admin-tabs" role="tablist" aria-label="审批类型">
        {tabs.map(({ id, label, en }) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id ? 'true' : 'false'} data-active={tab === id ? 'true' : 'false'} onClick={() => { setTab(id); setSelected({}) }}><span>{label}</span><small>{en}</small></button>
        ))}
      </div>
      {tab !== 'store' ? <div className="admin-tabs admin-tabs-secondary" role="group" aria-label="审批分组">
        {groups.map(({ id, label, en }) => (
          <button key={id} type="button" role="tab" aria-selected={group === id ? 'true' : 'false'} data-active={group === id ? 'true' : 'false'} onClick={() => { setGroup(id); setSelected({}) }}><span>{label}</span><small>{en}</small></button>
        ))}
      </div> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}

      {tab === 'store' ? (
        <div className="admin-approval-list">
          <h3 className="admin-group-title">待审核门店 · {pendingStores.length}</h3>
          {!pendingStores.length ? <p className="admin-empty">没有待审核的门店。</p> : null}
          {pendingStores.map((store) => (
            <article key={store.id} className="admin-approval-row">
              <div className="admin-approval-identity">
                <strong>{store.code} {store.name}</strong>
                <span>{store.regionName} / {store.cityName}</span>
                <span className="admin-status-tag" data-status="pending">待审核</span>
              </div>
              <div className="admin-approval-detail">
                <p>新门店申请，批准后门店生效并开放注册。</p>
                <small>创建时间 {formatTime(store.createdAt)}</small>
              </div>
              <div className="admin-approval-actions">
                <button type="button" className="secondary-action" onClick={() => void storeDecide(store, false)}>拒绝</button>
                <button type="button" className="primary-action" onClick={() => void storeDecide(store, true)}>批准</button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="admin-approval-list">
          <div className="admin-batch-bar">
            <label className="admin-batch-select-all"><input type="checkbox" checked={Boolean(data?.requests?.length && selectedIds.size === data.requests.length)} onChange={(event) => { if (event.target.checked) selectAll(data?.requests || []); else setSelected({}) }} aria-label="全选当前列表" /><span>全选</span></label>
            <span className="admin-inline-status">已选 {selectedIds.size} 项</span>
            {group === 'pending' ? <>
              <button type="button" className="secondary-action" disabled={busy || !selectedIds.size} onClick={() => void runBatch(data?.requests || [], true)}>批量批准</button>
              <button type="button" className="secondary-action" disabled={busy || !data?.requests?.length} onClick={() => { selectAll(data?.requests || []); void runBatch(data?.requests || [], true) }}>全部批准</button>
            </> : null}
            {busy ? <span className="admin-inline-status" role="status">处理中…</span> : null}
          </div>
          {!data?.requests?.length && !busy ? <p className="admin-empty">没有{groups.find((g) => g.id === group)?.label}的{tab === 'role' ? '角色提权' : '调店'}申请。</p> : null}
          {data?.requests?.map((item) => {
            const key = item.id
            const isRole = tab === 'role'
            return (
              <article key={key} className="admin-approval-row">
                <label className="admin-approval-check"><input type="checkbox" checked={Boolean(selected[key])} onChange={() => toggleSelect(key)} aria-label={`选择 ${item.userName || key}`} /></label>
                <div className="admin-approval-identity">
                  <strong>{item.userName || '申请人'}</strong>
                  {isRole ? <span>{item.storeCode} {item.storeName}</span> : <span>{item.sourceStoreCode} {item.sourceStoreName} → {item.targetStoreCode} {item.targetStoreName}</span>}
                  {isRole ? <span>{shared.roleLabels[item.fromRole] || item.fromRole} → {shared.roleLabels[item.targetRole] || item.targetRole}</span> : null}
                </div>
                <div className="admin-approval-detail">
                  <p>{item.reason}</p>
                  <small>{formatTime(item.createdAt)} · 修订 {item.revision}{item.expiresAt ? ` · 截止 ${formatTime(item.expiresAt)}` : ''}{item.decisionReason ? ` · ${item.decisionReason}` : ''}</small>
                </div>
                {group === 'pending' ? <div className="admin-approval-actions">
                  <button type="button" className="secondary-action" onClick={() => requestDecision(item)}>拒绝</button>
                  <button type="button" className="primary-action" onClick={() => requestDecision(item)}>批准</button>
                </div> : null}
              </article>
            )
          })}
          {nextCursor ? <button type="button" className="secondary-action admin-load-more" disabled={busy} onClick={() => void load({ type: tab, group, cursor: nextCursor }, true)}>加载更多</button> : null}
        </div>
      )}

      {decision ? (
        <DecisionDialog
          item={decision.item}
          roleLabel={tab === 'role' ? `${shared.roleLabels[decision.item.fromRole] || decision.item.fromRole} → ${shared.roleLabels[decision.item.targetRole] || decision.item.targetRole}` : ''}
          onClose={() => setDecision(null)}
          onSubmit={(approve, reason) => void submitDecision(approve, reason)}
        />
      ) : null}
    </section>
  )
}

function DecisionDialog({ item, roleLabel, onClose, onSubmit }) {
  const [approve, setApprove] = useState(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const confirm = async () => {
    if (approve === null) return
    if (approve === false && !reason.trim()) return
    setBusy(true)
    try { await onSubmit(approve, reason.trim()) } finally { setBusy(false) }
  }
  return (
    <div className="admin-decision-backdrop" role="dialog" aria-modal="true" aria-label="审批决定" onPointerDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
      <form className="admin-decision" onSubmit={(event) => { event.preventDefault(); void confirm() }}>
        <header><span>审批决定</span><small>DECISION · 受审计</small></header>
        <p className="admin-decision-subject"><strong>{item.userName}</strong>{roleLabel ? <span>{roleLabel}</span> : null}</p>
        <div className="admin-decision-choice" role="group" aria-label="决定">
          <button type="button" data-active={approve === true ? 'true' : 'false'} onClick={() => setApprove(true)}>批准</button>
          <button type="button" data-active={approve === false ? 'true' : 'false'} onClick={() => setApprove(false)}>拒绝</button>
        </div>
        <label className="field-row"><span>理由{approve === false ? '（拒绝必填）' : '（可选）'}</span><textarea required={approve === false} minLength={approve === false ? 2 : 0} maxLength="500" value={reason} onChange={(event) => setReason(event.target.value)} placeholder={approve === false ? '请说明拒绝理由' : '可填写审批备注'} /></label>
        <div className="admin-decision-actions">
          <button type="button" className="secondary-action" onClick={onClose} disabled={busy}>取消</button>
          <button type="submit" className="primary-action" disabled={busy || approve === null || (approve === false && !reason.trim())}>{busy ? '提交中…' : '确认'}</button>
        </div>
      </form>
    </div>
  )
}
