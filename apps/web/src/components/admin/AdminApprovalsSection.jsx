import { useEffect, useMemo, useRef, useState } from 'react'
import AppDialog from '../dialogs/AppDialog.jsx'
import { appendUniqueById, requestGate, selectedBatchTargets } from './admin-state.js'

const tabs = [{ id: 'role', label: '角色提权', en: 'ROLE REQUESTS' }, { id: 'transfer', label: '调店申请', en: 'TRANSFER REQUESTS' }, { id: 'store', label: '门店审核', en: 'STORE REVIEW' }]
const groups = [{ id: 'pending', label: '待审批', en: 'PENDING' }, { id: 'expired', label: '已过期', en: 'EXPIRED' }, { id: 'decided', label: '已处理', en: 'DECIDED' }]
function formatTime(value) { if (!value) return '—'; const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date) }

export default function AdminApprovalsSection({ shared, directory = [] }) {
  const [tab, setTab] = useState('role'); const [group, setGroup] = useState('pending'); const [data, setData] = useState({ requests: [] }); const [nextCursor, setNextCursor] = useState(null)
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [selected, setSelected] = useState({}); const [decision, setDecision] = useState(null)
  const gateRef = useRef(requestGate())
  const pendingStores = useMemo(() => directory.flatMap((region) => (region.subregions || []).flatMap((subregion) => subregion.cities.flatMap((city) => city.stores.filter((store) => store.status === 'pending').map((store) => ({ ...store, regionName: region.name, subregionName: subregion.name, cityName: city.name }))))), [directory])
  const currentItems = tab === 'store' ? pendingStores : data.requests
  const selectedIds = useMemo(() => new Set(Object.entries(selected).filter(([, on]) => on).map(([id]) => id)), [selected])

  const load = async (filters, append = false) => {
    const request = gateRef.current.next(); setBusy(true); setError('')
    try {
      const result = await shared.getApprovals(filters, request.signal)
      if (!gateRef.current.isLatest(request.id)) return
      setData((current) => ({ requests: append ? appendUniqueById(current.requests, result.requests) : result.requests }))
      setNextCursor(result.nextCursor)
    } catch (requestError) {
      if (requestError.name !== 'AbortError' && gateRef.current.isLatest(request.id)) setError(requestError.message || '无法读取审批列表。')
    } finally { if (gateRef.current.isLatest(request.id)) setBusy(false) }
  }
  useEffect(() => { setSelected({}); setError(''); if (tab === 'store') { gateRef.current.cancel(); setData({ requests: [] }); setNextCursor(null); setBusy(false); return undefined } void load({ type: tab, group }); return () => gateRef.current.cancel() }, [tab, group])

  const decide = async (item, approve, reason, kind = tab) => {
    if (kind === 'store') return shared.reviewStore(item, { approve, reason: reason || undefined })
    return kind === 'role' ? shared.decideRole(item, approve, reason) : shared.decideTransfer(item, approve, reason)
  }
  const reloadAfterMutation = async () => {
    if (tab !== 'store') await load({ type: tab, group })
    await shared.refreshSummary()
  }
  const submitDecision = async (approve, reason) => {
    if (!decision) return
    setBusy(true); setError('')
    try {
      const result = await decide(decision.item, approve, reason, decision.kind)
      shared.notify?.(result?.message || '审批已完成')
      setDecision(null); setSelected({})
      await reloadAfterMutation()
    } catch (requestError) { setError(requestError.message || '审批失败，请重试。'); throw requestError } finally { setBusy(false) }
  }
  const runBatch = async (allCurrentPage = false) => {
    const targets = selectedBatchTargets(currentItems, selectedIds, allCurrentPage)
    if (!targets.length) return
    setBusy(true); setError(''); const failures = []; let succeeded = 0
    for (const item of targets) {
      try { await decide(item, true, 'CHU13 批量批准', tab); succeeded += 1 } catch (requestError) { failures.push(`${item.userName || item.name || item.id}：${requestError.message || '失败'}`) }
    }
    setSelected({}); await reloadAfterMutation(); setBusy(false)
    shared.notify?.(`批量审批完成：成功 ${succeeded} 项，失败 ${failures.length} 项`)
    if (failures.length) setError(`部分操作未完成：${failures.join('；')}`)
  }
  const toggleSelect = (id) => setSelected((current) => ({ ...current, [id]: !current[id] }))
  const selectAll = (items) => setSelected(Object.fromEntries(items.map((item) => [item.id, true])))

  return <section className="admin-panel"><header className="admin-panel-head"><h2>审批</h2><small>APPROVALS · 受审计决策</small></header>
    <div className="admin-tabs" role="tablist" aria-label="审批类型">{tabs.map(({ id, label, en }) => <button key={id} id={`admin-tab-${id}`} type="button" role="tab" aria-selected={tab === id} aria-controls="admin-approval-panel" data-active={tab === id ? 'true' : 'false'} onClick={() => setTab(id)}><span>{label}</span><small>{en}</small></button>)}</div>
    {tab !== 'store' ? <div className="admin-tabs admin-tabs-secondary" role="tablist" aria-label="审批分组">{groups.map(({ id, label, en }) => <button key={id} type="button" role="tab" aria-selected={group === id} data-active={group === id ? 'true' : 'false'} onClick={() => setGroup(id)}><span>{label}</span><small>{en}</small></button>)}</div> : null}
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    <div id="admin-approval-panel" role="tabpanel" aria-labelledby={`admin-tab-${tab}`} className="admin-approval-list">
      <div className="admin-batch-bar"><label className="admin-batch-select-all"><input type="checkbox" checked={Boolean(currentItems.length && selectedIds.size === currentItems.length)} onChange={(event) => event.target.checked ? selectAll(currentItems) : setSelected({})} aria-label="全选当前列表" /><span>全选</span></label><span className="admin-inline-status">已选 {selectedIds.size} 项</span>{group === 'pending' || tab === 'store' ? <><button type="button" className="secondary-action" disabled={busy || !selectedIds.size} onClick={() => void runBatch(false)}>批量批准</button><button type="button" className="secondary-action" disabled={busy || !currentItems.length} onClick={() => void runBatch(true)}>全部批准</button></> : null}{busy ? <span className="admin-inline-status" role="status">处理中…</span> : null}</div>
      {!currentItems.length && !busy ? <p className="admin-empty">{tab === 'store' ? '没有待审核的门店。' : `没有${groups.find((item) => item.id === group)?.label}的${tab === 'role' ? '角色提权' : '调店'}申请。`}</p> : null}
      {currentItems.map((item) => { const isStore = tab === 'store'; const isRole = tab === 'role'; return <article key={item.id} className="admin-approval-row"><label className="admin-approval-check"><input type="checkbox" checked={Boolean(selected[item.id])} onChange={() => toggleSelect(item.id)} aria-label={`选择 ${item.userName || item.name || item.id}`} /></label><div className="admin-approval-identity"><strong>{isStore ? `${item.code} ${item.name}` : item.userName || '申请人'}</strong><span>{isStore ? `${item.regionName} / ${item.cityName}` : isRole ? `${item.storeCode} ${item.storeName}` : `${item.sourceStoreCode} ${item.sourceStoreName} → ${item.targetStoreCode} ${item.targetStoreName}`}</span>{isRole ? <span>{shared.roleLabels[item.fromRole] || item.fromRole} → {shared.roleLabels[item.targetRole] || item.targetRole}</span> : null}{isStore ? <span className="admin-status-tag" data-status="pending">待审核</span> : null}</div><div className="admin-approval-detail"><p>{isStore ? '新门店申请，批准后门店生效并开放注册。' : item.reason}</p><small>{isStore ? `创建时间 ${formatTime(item.createdAt)}` : `${formatTime(item.createdAt)} · 修订 ${item.revision}${item.expiresAt ? ` · 截止 ${formatTime(item.expiresAt)}` : ''}${item.decisionReason ? ` · ${item.decisionReason}` : ''}`}</small></div>{(group === 'pending' || isStore) ? <div className="admin-approval-actions"><button type="button" className="secondary-action" disabled={busy} onClick={() => setDecision({ item, kind: tab, approve: false })}>拒绝</button><button type="button" className="primary-action" disabled={busy} onClick={() => setDecision({ item, kind: tab, approve: true })}>批准</button></div> : null}</article> })}
      {tab !== 'store' && nextCursor ? <button type="button" className="secondary-action admin-load-more" disabled={busy} onClick={() => void load({ type: tab, group, cursor: nextCursor }, true)}>加载更多</button> : null}
    </div>
    {decision ? <DecisionDialog decision={decision} busy={busy} onClose={() => setDecision(null)} onSubmit={submitDecision} roleLabels={shared.roleLabels} /> : null}
  </section>
}
function DecisionDialog({ decision, busy, onClose, onSubmit, roleLabels }) {
  const [reason, setReason] = useState(''); const [localError, setLocalError] = useState(''); const approve = decision.approve; const item = decision.item
  const submit = async (event) => { event.preventDefault(); if (!approve && reason.trim().length < 2) return setLocalError('拒绝时请填写至少 2 个字符的理由。'); setLocalError(''); try { await onSubmit(approve, reason.trim()) } catch { /* parent alert stays visible */ } }
  const subject = decision.kind === 'store' ? `${item.code} ${item.name}` : item.userName || '申请人'
  const detail = decision.kind === 'role' ? `${roleLabels[item.fromRole] || item.fromRole} → ${roleLabels[item.targetRole] || item.targetRole}` : decision.kind === 'store' ? '批准后门店将开放注册；拒绝后转为停用。' : `${item.sourceStoreCode} → ${item.targetStoreCode}`
  return <AppDialog open onClose={onClose} dismissible={!busy} title={approve ? '确认批准' : '确认拒绝'} eyebrow="DECISION · 受审计" description={`${subject} · ${detail}`} className="admin-decision-dialog"><form onSubmit={submit}><label className="field-row"><span>理由{approve ? '（可选）' : '（拒绝必填）'}</span><textarea data-autofocus required={!approve} minLength={!approve ? 2 : 0} maxLength="500" value={reason} onChange={(event) => setReason(event.target.value)} placeholder={approve ? '可填写审批备注' : '请说明拒绝理由'} /></label>{localError ? <p className="form-error" role="alert">{localError}</p> : null}<div className="admin-decision-actions"><button type="button" className="secondary-action" onClick={onClose} disabled={busy}>取消</button><button type="submit" className="primary-action" data-danger={!approve ? 'true' : undefined} disabled={busy || (!approve && reason.trim().length < 2)}>{busy ? '提交中…' : approve ? '确认批准' : '确认拒绝'}</button></div></form></AppDialog>
}
