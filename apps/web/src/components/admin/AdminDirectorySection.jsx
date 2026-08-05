import { useMemo, useState } from 'react'
import ProjectSelect from '../ProjectSelect.jsx'

const kindLabels = { regions: '区域', cities: '城市', stores: '门店' }

export default function AdminDirectorySection({ governance, shared }) {
  const [form, setForm] = useState({ kind: 'regions', parentId: '', name: '', code: '' })
  const [editing, setEditing] = useState(null)
  if (!governance) return <section className="admin-panel"><h2>门店目录</h2><p className="admin-empty">暂无数据。</p></section>
  const directory = governance.directory || []
  const regionOptions = useMemo(() => directory.map((region) => ({ value: region.id, label: region.name })), [directory])
  const cityOptions = useMemo(() => directory.flatMap((region) => region.cities.map((city) => ({ value: city.id, label: `${region.name} / ${city.name}` }))), [directory])

  const submit = async (event) => {
    event.preventDefault()
    await shared.createDirectory(form.kind, {
      parentId: form.kind === 'regions' ? undefined : form.parentId || undefined,
      name: form.name,
      code: form.kind === 'stores' ? form.code || undefined : undefined,
      status: 'active'
    })
    setForm({ kind: 'regions', parentId: '', name: '', code: '' })
  }
  const saveRename = async (kind, item) => {
    const name = (editing?.name || '').trim()
    if (!name) { setEditing(null); return }
    await shared.updateDirectory(kind, item.id, { name, status: item.status })
    setEditing(null)
  }
  const toggle = (kind, item) => shared.updateDirectory(kind, item.id, { name: item.name, status: item.status === 'active' ? 'disabled' : 'active' })

  return (
    <section className="admin-panel">
      <header className="admin-panel-head"><h2>门店目录</h2><small>DIRECTORY · 全国区域 / 城市 / 门店</small></header>
      <form className="data-form admin-directory-form" onSubmit={submit}>
        <label className="field-row"><span>类型</span><ProjectSelect value={form.kind} options={Object.entries(kindLabels).map(([value, label]) => ({ value, label }))} onChange={(value) => setForm((current) => ({ ...current, kind: value, parentId: '' }))} ariaLabel="选择目录类型" /></label>
        {form.kind === 'cities' ? <label className="field-row"><span>所属区域</span><ProjectSelect value={form.parentId} options={regionOptions} onChange={(value) => setForm((current) => ({ ...current, parentId: value }))} ariaLabel="选择所属区域" placeholder="请选择区域" /></label> : null}
        {form.kind === 'stores' ? <><label className="field-row"><span>所属城市</span><ProjectSelect value={form.parentId} options={cityOptions} onChange={(value) => setForm((current) => ({ ...current, parentId: value }))} ariaLabel="选择所属城市" placeholder="请选择城市" /></label><label className="field-row"><span>门店代码</span><input required maxLength="32" value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} /></label></> : null}
        <label className="field-row"><span>名称</span><input required maxLength="120" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
        <button type="submit" className="primary-action">新增{kindLabels[form.kind]}</button>
      </form>
      <div className="admin-directory-tree">
        {directory.map((region) => (
          <div key={region.id} className="admin-directory-branch">
            <div className="admin-directory-row" data-kind="regions">
              {editing?.id === region.id ? <input className="admin-directory-rename" maxLength="120" value={editing.name} onChange={(event) => setEditing({ id: region.id, name: event.target.value })} onKeyDown={(event) => { if (event.key === 'Enter') void saveRename('regions', region); if (event.key === 'Escape') setEditing(null) }} aria-label="区域名称" /> : <strong>{region.name}</strong>}
              <span className="admin-status-tag" data-status={region.status}>{region.status === 'active' ? '生效' : '停用'}</span>
              <div className="admin-directory-actions">
                <button type="button" onClick={() => setEditing(editing?.id === region.id ? null : { id: region.id, name: region.name })}>{editing?.id === region.id ? '保存' : '重命名'}</button>
                <button type="button" onClick={() => void toggle('regions', region)}>{region.status === 'active' ? '停用' : '启用'}</button>
              </div>
            </div>
            {region.cities.map((city) => (
              <div key={city.id} className="admin-directory-city">
                <div className="admin-directory-row" data-kind="cities">
                  {editing?.id === city.id ? <input className="admin-directory-rename" maxLength="120" value={editing.name} onChange={(event) => setEditing({ id: city.id, name: event.target.value })} onKeyDown={(event) => { if (event.key === 'Enter') void saveRename('cities', city); if (event.key === 'Escape') setEditing(null) }} aria-label="城市名称" /> : <strong>{city.name}</strong>}
                  <span className="admin-status-tag" data-status={city.status}>{city.status === 'active' ? '生效' : '停用'}</span>
                  <div className="admin-directory-actions">
                    <button type="button" onClick={() => setEditing(editing?.id === city.id ? null : { id: city.id, name: city.name })}>{editing?.id === city.id ? '保存' : '重命名'}</button>
                    <button type="button" onClick={() => void toggle('cities', city)}>{city.status === 'active' ? '停用' : '启用'}</button>
                  </div>
                </div>
                {city.stores.map((store) => (
                  <div key={store.id} className="admin-directory-row" data-kind="stores">
                    {editing?.id === store.id ? <input className="admin-directory-rename" maxLength="120" value={editing.name} onChange={(event) => setEditing({ id: store.id, name: event.target.value })} onKeyDown={(event) => { if (event.key === 'Enter') void saveRename('stores', store); if (event.key === 'Escape') setEditing(null) }} aria-label="门店名称" /> : <><span className="admin-store-code">{store.code}</span><strong>{store.name}</strong></>}
                    <span className="admin-status-tag" data-status={store.status}>{store.status === 'active' ? '生效' : '停用'}</span>
                    <div className="admin-directory-actions">
                      <button type="button" onClick={() => setEditing(editing?.id === store.id ? null : { id: store.id, name: store.name })}>{editing?.id === store.id ? '保存' : '重命名'}</button>
                      <button type="button" onClick={() => void toggle('stores', store)}>{store.status === 'active' ? '停用' : '启用'}</button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}
