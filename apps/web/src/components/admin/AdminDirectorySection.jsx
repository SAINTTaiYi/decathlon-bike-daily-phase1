import { useMemo, useState } from 'react'
import ProjectSelect from '../ProjectSelect.jsx'

const kindLabels = { regions: '区域', cities: '城市', stores: '门店' }
const statusLabels = { active: '生效', pending: '待审核', disabled: '停用' }

export default function AdminDirectorySection({ governance, shared, onViewStore }) {
  const [form, setForm] = useState({ kind: 'regions', parentId: '', name: '', code: '' })
  const [editing, setEditing] = useState(null)
  const [busyKey, setBusyKey] = useState('')
  const directory = governance?.directory || []
  const regionOptions = useMemo(() => directory.map((region) => ({ value: region.id, label: region.name })), [directory])
  const cityOptions = useMemo(() => directory.flatMap((region) => region.cities.map((city) => ({ value: city.id, label: `${region.name} / ${city.name}` }))), [directory])
  if (!governance) return <section className="admin-panel"><h2>门店目录</h2><p className="admin-empty">暂无数据。</p></section>

  const submit = async (event) => {
    event.preventDefault(); setBusyKey('create')
    try {
      await shared.createDirectory(form.kind, { parentId: form.kind === 'regions' ? undefined : form.parentId || undefined, name: form.name, code: form.kind === 'stores' ? form.code || undefined : undefined, status: 'active' })
      setForm({ kind: 'regions', parentId: '', name: '', code: '' })
    } catch { /* parent console owns the visible error */ } finally { setBusyKey('') }
  }
  const saveRename = async (kind, item) => {
    const name = (editing?.name || '').trim()
    if (!name) return
    setBusyKey(`rename:${item.id}`)
    try { await shared.updateDirectory(kind, item.id, { name, status: item.status }); setEditing(null) } catch { /* keep editor open */ } finally { setBusyKey('') }
  }
  const toggle = async (kind, item) => {
    if (item.status === 'pending') return
    setBusyKey(`toggle:${item.id}`)
    try { await shared.updateDirectory(kind, item.id, { name: item.name, status: item.status === 'active' ? 'disabled' : 'active' }) } catch { /* parent error */ } finally { setBusyKey('') }
  }
  const actionButtons = (kind, item) => <div className="admin-directory-actions">
    {kind === 'stores' ? <button type="button" onClick={() => onViewStore(item.id)}>查看</button> : null}
    {editing?.id === item.id ? <><button type="button" disabled={busyKey === `rename:${item.id}`} onClick={() => void saveRename(kind, item)}>{busyKey === `rename:${item.id}` ? '保存中…' : '保存'}</button><button type="button" onClick={() => setEditing(null)}>取消</button></> : <button type="button" onClick={() => setEditing({ id: item.id, name: item.name })}>重命名</button>}
    {item.status !== 'pending' ? <button type="button" disabled={busyKey === `toggle:${item.id}`} onClick={() => void toggle(kind, item)}>{busyKey === `toggle:${item.id}` ? '处理中…' : item.status === 'active' ? '停用' : '启用'}</button> : null}
  </div>
  const nameEditor = (kind, item) => editing?.id === item.id
    ? <input className="admin-directory-rename" autoFocus maxLength="120" value={editing.name} onChange={(event) => setEditing({ id: item.id, name: event.target.value })} onKeyDown={(event) => { if (event.key === 'Enter') void saveRename(kind, item); if (event.key === 'Escape') setEditing(null) }} aria-label={`${kindLabels[kind]}名称`} />
    : <strong>{item.name}</strong>

  return <section className="admin-panel">
    <header className="admin-panel-head"><h2>门店目录</h2><small>DIRECTORY · 全国区域 / 城市 / 门店</small></header>
    <form className="data-form admin-directory-form" onSubmit={submit}>
      <label className="field-row"><span>类型</span><ProjectSelect value={form.kind} options={Object.entries(kindLabels).map(([value, label]) => ({ value, label }))} onChange={(value) => setForm((current) => ({ ...current, kind: value, parentId: '', code: '' }))} ariaLabel="选择目录类型" /></label>
      {form.kind === 'cities' ? <label className="field-row"><span>所属区域</span><ProjectSelect value={form.parentId} options={regionOptions} onChange={(value) => setForm((current) => ({ ...current, parentId: value }))} ariaLabel="选择所属区域" placeholder="请选择区域" /></label> : null}
      {form.kind === 'stores' ? <><label className="field-row"><span>所属城市</span><ProjectSelect value={form.parentId} options={cityOptions} onChange={(value) => setForm((current) => ({ ...current, parentId: value }))} ariaLabel="选择所属城市" placeholder="请选择城市" /></label><label className="field-row"><span>门店代码</span><input required maxLength="32" pattern="[A-Za-z0-9_-]+" value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} /></label></> : null}
      <label className="field-row"><span>名称</span><input required maxLength="120" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
      <button type="submit" className="primary-action" disabled={busyKey === 'create'}>{busyKey === 'create' ? '创建中…' : `新增${kindLabels[form.kind]}`}</button>
    </form>
    {form.kind === 'stores' ? <p className="admin-inline-status admin-directory-hint">门店创建后为「待审核」，需在审批分区批准后生效。</p> : null}
    <div className="admin-directory-tree">{directory.map((region) => <div key={region.id} className="admin-directory-branch">
      <div className="admin-directory-row" data-kind="regions">{nameEditor('regions', region)}<span className="admin-status-tag" data-status={region.status}>{statusLabels[region.status] || region.status}</span>{actionButtons('regions', region)}</div>
      {region.cities.map((city) => <div key={city.id} className="admin-directory-city"><div className="admin-directory-row" data-kind="cities">{nameEditor('cities', city)}<span className="admin-status-tag" data-status={city.status}>{statusLabels[city.status] || city.status}</span>{actionButtons('cities', city)}</div>
        {city.stores.map((store) => <div key={store.id} className="admin-directory-row" data-kind="stores">{editing?.id === store.id ? nameEditor('stores', store) : <span className="admin-directory-store-name"><span className="admin-store-code">{store.code}</span><strong>{store.name}</strong></span>}<span className="admin-status-tag" data-status={store.status}>{statusLabels[store.status] || store.status}</span>{actionButtons('stores', store)}</div>)}
      </div>)}
    </div>)}</div>
  </section>
}
