import { useEffect, useMemo, useState } from 'react'
import AppDialog from './AppDialog.jsx'
import ProjectSelect from '../ProjectSelect.jsx'
import {
  createDirectoryEntry,
  createRoleChangeRequest,
  createTransferRequest,
  decideRoleChangeRequest,
  decideTransferRequest,
  getGovernanceOverview,
  updateDirectoryEntry
} from '../../api/auth.js'

const roleLabels = { operator: '操作员', manager: '经理', admin: '管理员' }
const emptyDecision = { approve: true, reason: '已审核', expectedRevision: 0 }

function flattenDirectory(directory = []) {
  return directory.map((store) => ({ ...store }))
}

export default function GovernanceDialog({ open, onClose, currentStoreId, onNotify }) {
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [promotion, setPromotion] = useState({ targetRole: 'manager', reason: '' })
  const [transfer, setTransfer] = useState({ targetStoreId: '', reason: '' })
  const [directoryForm, setDirectoryForm] = useState({ name: '', code: '' })

  const refresh = async () => {
    setBusy(true)
    try { setData(await getGovernanceOverview()); setError('') } catch (requestError) { setError(requestError.message || '无法读取治理数据。') } finally { setBusy(false) }
  }

  useEffect(() => { if (open) void refresh() }, [open])
  const stores = useMemo(() => flattenDirectory(data?.directory), [data])
  const isPlatformAdmin = Boolean(data?.actor?.isPlatformAdmin)
  const isTargetAdmin = data?.actor?.role === 'admin'
  const transferOptions = stores
    .filter((store) => store.id !== currentStoreId && store.status === 'active')
    .map((store) => ({ value: store.id, label: store.code + ' ' + store.name }))
  const set = (area, field, value) => {
    if (area === 'promotion') setPromotion((current) => ({ ...current, [field]: value }))
    if (area === 'transfer') setTransfer((current) => ({ ...current, [field]: value }))
    if (error) setError('')
  }

  const submitPromotion = async (event) => {
    event.preventDefault(); setBusy(true)
    try { const result = await createRoleChangeRequest(promotion); onNotify?.(result.message); setPromotion({ targetRole: 'manager', reason: '' }); await refresh() } catch (requestError) { setError(requestError.message) } finally { setBusy(false) }
  }
  const submitTransfer = async (event) => {
    event.preventDefault(); setBusy(true)
    try { const result = await createTransferRequest(transfer); onNotify?.(result.message); setTransfer({ targetStoreId: '', reason: '' }); await refresh() } catch (requestError) { setError(requestError.message) } finally { setBusy(false) }
  }
  const decideRole = async (item, approve) => {
    setBusy(true)
    try { const result = await decideRoleChangeRequest(item.id, { ...emptyDecision, approve, expectedRevision: item.revision, reason: approve ? 'CHU13 已批准' : 'CHU13 已拒绝' }); onNotify?.(result.message); await refresh() } catch (requestError) { setError(requestError.message) } finally { setBusy(false) }
  }
  const decideTransfer = async (item, approve) => {
    setBusy(true)
    try { const result = await decideTransferRequest(item.id, { ...emptyDecision, approve, expectedRevision: item.revision, reason: approve ? '目标门店管理员已批准' : '目标门店管理员已拒绝' }); onNotify?.(result.message); await refresh() } catch (requestError) { setError(requestError.message) } finally { setBusy(false) }
  }
  const submitDirectory = async (event) => {
    event.preventDefault(); setBusy(true)
    try {
      const result = await createDirectoryEntry('stores', { name: directoryForm.name, code: directoryForm.code, status: 'active' })
      onNotify?.('门店已创建：' + result.id); setDirectoryForm({ name: '', code: '' }); await refresh()
    } catch (requestError) { setError(requestError.message) } finally { setBusy(false) }
  }
  const toggleStatus = async (store) => {
    setBusy(true)
    try { await updateDirectoryEntry('stores', store.id, { name: store.name, code: store.code, status: store.status === 'active' ? 'disabled' : 'active' }); onNotify?.('门店状态已更新'); await refresh() } catch (requestError) { setError(requestError.message) } finally { setBusy(false) }
  }

  return (
    <AppDialog open={open} onClose={onClose} title="门店与权限治理" eyebrow="GOVERNANCE · 受审计审批" description="角色提权由 CHU13 审批；跨店调动只由目标门店的有效管理员审批。门店可以自行注册，首位注册人自动成为管理员。" className="governance-dialog">
      {!data && !error ? <p role="status">正在读取治理数据…</p> : null}
      {data ? <div className="governance-stack">
        <section className="governance-section"><h3>申请角色提权</h3><form className="data-form" onSubmit={submitPromotion}><label className="field-row"><span>目标角色</span><ProjectSelect value={promotion.targetRole} options={[{ value: 'manager', label: '经理' }, { value: 'admin', label: '管理员' }]} onChange={(value) => set('promotion', 'targetRole', value)} ariaLabel="选择目标角色" /></label><label className="field-row"><span>申请理由</span><textarea required minLength="2" maxLength="500" value={promotion.reason} onChange={(event) => set('promotion', 'reason', event.target.value)} /></label><button type="submit" className="primary-action" disabled={busy}>提交给 CHU13</button></form></section>
        <section className="governance-section"><h3>申请跨店调动</h3><form className="data-form" onSubmit={submitTransfer}><label className="field-row"><span>目标门店</span><ProjectSelect value={transfer.targetStoreId} options={transferOptions} onChange={(value) => set('transfer', 'targetStoreId', value)} ariaLabel="选择目标门店" placeholder="请选择目标门店" /></label><label className="field-row"><span>调动说明</span><textarea required minLength="2" maxLength="500" value={transfer.reason} onChange={(event) => set('transfer', 'reason', event.target.value)} /></label><button type="submit" className="primary-action" disabled={busy || !transfer.targetStoreId}>发送给目标门店管理员</button></form></section>
        {(isPlatformAdmin || isTargetAdmin) && data.transferRequests?.length ? <section className="governance-section"><h3>待审批调店</h3><ol className="governance-request-list">{data.transferRequests.map((item) => <li key={item.id}><div><strong>{item.userName || '申请人'}</strong><span>{item.sourceStoreName || item.sourceStoreId} → {item.targetStoreName || item.targetStoreId}</span><small>{item.reason}</small></div><div className="governance-decisions"><button type="button" className="secondary-action" onClick={() => void decideTransfer(item, false)} disabled={busy}>拒绝</button><button type="button" className="primary-action" onClick={() => void decideTransfer(item, true)} disabled={busy}>批准</button></div></li>)}</ol></section> : null}
        {isPlatformAdmin && data.roleRequests?.length ? <section className="governance-section"><h3>待审批提权</h3><ol className="governance-request-list">{data.roleRequests.map((item) => <li key={item.id}><div><strong>{item.userName || '申请人'}</strong><span>{item.storeCode} {item.storeName} · {roleLabels[item.fromRole]} → {roleLabels[item.targetRole]}</span><small>{item.reason}</small></div><div className="governance-decisions"><button type="button" className="secondary-action" onClick={() => void decideRole(item, false)} disabled={busy}>拒绝</button><button type="button" className="primary-action" onClick={() => void decideRole(item, true)} disabled={busy}>批准</button></div></li>)}</ol></section> : null}
        {isPlatformAdmin ? <section className="governance-section governance-directory"><h3>门店列表</h3><form className="data-form" onSubmit={submitDirectory}><label className="field-row"><span>门店编码</span><input required maxLength="32" value={directoryForm.code} onChange={(event) => setDirectoryForm((current) => ({ ...current, code: event.target.value }))} /></label><label className="field-row"><span>门店名称</span><input required maxLength="120" value={directoryForm.name} onChange={(event) => setDirectoryForm((current) => ({ ...current, name: event.target.value }))} /></label><button type="submit" className="primary-action" disabled={busy}>新增门店</button></form><div className="directory-tree">{stores.map((store) => <div key={store.id} className="directory-row"><span><strong>{store.code}</strong> {store.name}</span><button type="button" onClick={() => void toggleStatus(store)} disabled={busy}>{store.status === 'active' ? '停用' : '启用'}</button></div>)}</div></section> : null}
      </div> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </AppDialog>
  )
}
