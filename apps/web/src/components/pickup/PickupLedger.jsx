import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import IconArchive from '@iconoir/Archive.mjs'
import IconBell from '@iconoir/Bell.mjs'
import IconBicycle from '@iconoir/Bicycle.mjs'
import IconBox from '@iconoir/Box.mjs'
import IconCalendar from '@iconoir/Calendar.mjs'
import IconCheck from '@iconoir/Check.mjs'
import IconEdit from '@iconoir/EditPencil.mjs'
import IconFilter from '@iconoir/Filter.mjs'
import IconJournal from '@iconoir/Journal.mjs'
import IconList from '@iconoir/List.mjs'
import IconNavArrowDown from '@iconoir/NavArrowDown.mjs'
import IconPhone from '@iconoir/Phone.mjs'
import IconPlus from '@iconoir/Plus.mjs'
import IconSearch from '@iconoir/Search.mjs'
import IconSort from '@iconoir/Sort.mjs'
import IconTrash from '@iconoir/Trash.mjs'
import IconViewColumns from '@iconoir/ViewColumns2.mjs'
import IconWrench from '@iconoir/Wrench.mjs'
import { decodePickupContact, inferPickupNotificationStatus, inferPickupSource, pickupResultLabel, pickupSourceLabel, selfPickupPlatformLabel } from '../../data/pickupRecord.js'
import { displayContactValue, formatScanDate, formatTicketNumber, joinMaintenanceLine } from '../../data/recordPresentation.js'

const sourceOptions = [['self-pickup', '自提订单'], ['repair', '维修待取'], ['customer-storage', '顾客暂存'], ['used-car', '二手车']]
const sourceIcons = { 'self-pickup': IconBox, repair: IconWrench, 'customer-storage': IconArchive, 'used-car': IconBicycle }
const sortOptions = [['default', '默认顺序'], ['pickup-asc', '取车时间较早'], ['pickup-desc', '取车时间较晚'], ['title-asc', '车型名称 A–Z']]

function normalizedSearch(record) {
  const contact = decodePickupContact(record)
  return [record.title, record.status, record.detail, record.repairProject, record.meta, record.ticketNo, record.pickupDate, contact.contactValue, pickupSourceLabel(record), selfPickupPlatformLabel(record)].filter(Boolean).join(' ').toLocaleLowerCase('zh-CN')
}

function sortRecords(records, sort) {
  const next = [...records]
  if (sort === 'pickup-asc') return next.sort((a, b) => String(a.pickupDate || '9999-99-99').localeCompare(String(b.pickupDate || '9999-99-99')))
  if (sort === 'pickup-desc') return next.sort((a, b) => String(b.pickupDate || '').localeCompare(String(a.pickupDate || '')))
  if (sort === 'title-asc') return next.sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'zh-CN'))
  return next
}

function Highlight({ children, query }) {
  const text = String(children || '')
  if (!query) return text
  const index = text.toLocaleLowerCase('zh-CN').indexOf(query.toLocaleLowerCase('zh-CN'))
  if (index < 0) return text
  return <>{text.slice(0, index)}<mark>{text.slice(index, index + query.length)}</mark>{text.slice(index + query.length)}</>
}

function hiddenMatchReason(record, query, source, contactValue, detailLine) {
  if (!query) return ''
  const term = query.toLocaleLowerCase('zh-CN')
  const visible = [record.title, pickupSourceLabel(record), selfPickupPlatformLabel(record), contactValue, source === 'customer-storage' ? detailLine : ''].join(' ').toLocaleLowerCase('zh-CN')
  if (visible.includes(term)) return ''
  if (String(record.repairProject || record.detail || '').toLocaleLowerCase('zh-CN').includes(term)) return source === 'repair' ? '匹配维修内容' : '匹配完整备注'
  if (String(record.ticketNo || record.id || '').toLocaleLowerCase('zh-CN').includes(term)) return '匹配业务编号'
  if (String(record.meta || '').toLocaleLowerCase('zh-CN').includes(term)) return '匹配隐藏业务信息'
  return '匹配完整记录'
}

function PickupFilterSheet({ open, initialTab, appliedSources, appliedSort, onClose, onApply }) {
  const [tab, setTab] = useState(initialTab)
  const [sources, setSources] = useState(appliedSources)
  const [sort, setSort] = useState(appliedSort)
  const panelRef = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    setTab(initialTab); setSources(appliedSources); setSort(appliedSort)
    const previous = document.activeElement
    const timer = window.setTimeout(() => panelRef.current?.focus(), 0)
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => { window.clearTimeout(timer); document.removeEventListener('keydown', onKeyDown); previous?.focus?.() }
  }, [appliedSort, appliedSources, initialTab, onClose, open])
  if (!open) return null
  const toggleSource = (value) => setSources((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value])
  return <div className="pickup-sheet-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section ref={panelRef} className="pickup-filter-sheet" role="dialog" aria-modal="true" aria-labelledby="pickup-filter-title" tabIndex={-1}>
      <div className="pickup-sheet-handle" aria-hidden="true" />
      <header><div><span>LIST CONTROL</span><h3 id="pickup-filter-title">整理待取车辆</h3></div><button type="button" onClick={onClose}>关闭</button></header>
      <div className="pickup-sheet-tabs" role="tablist" aria-label="筛选和排序">
        <button type="button" role="tab" aria-selected={tab === 'filter'} onClick={() => setTab('filter')}><IconFilter width={17} height={17} aria-hidden="true" />筛选 FILTER</button>
        <button type="button" role="tab" aria-selected={tab === 'sort'} onClick={() => setTab('sort')}><IconSort width={17} height={17} aria-hidden="true" />排序 SORT</button>
      </div>
      {tab === 'filter' ? <fieldset className="pickup-sheet-options"><legend>来源 SOURCE</legend>{sourceOptions.map(([value, label]) => <label key={value}><input type="checkbox" checked={sources.includes(value)} onChange={() => toggleSource(value)} /><span>{label}</span></label>)}</fieldset> : <fieldset className="pickup-sheet-options"><legend>快速排序 QUICK SORT</legend>{sortOptions.map(([value, label]) => <label key={value}><input type="radio" name="pickup-sort" checked={sort === value} onChange={() => setSort(value)} /><span>{label}</span></label>)}</fieldset>}
      <footer><button type="button" className="pickup-sheet-reset" onClick={() => { setSources([]); setSort('default') }}>重置</button><button type="button" className="pickup-sheet-apply" onClick={() => onApply({ sources, sort })}>应用规则</button></footer>
    </section>
  </div>
}

function PickupCard({ record, index, expanded, density, query, closedAt, pickupError, primaryProcessing, primaryActionBusy, pickupPixelFill, onToggle, onEdit, onRemove, onHistory, onPickup, onNotificationChange, onPickupPixelFillComplete }) {
  const [deleteOpen, setDeleteOpen] = useState(false)
  const startXRef = useRef(null)
  const pickedUp = Boolean(record.pickedUpToday)
  const source = inferPickupSource(record)
  const SourceIcon = sourceIcons[source] || IconArchive
  const repairPickup = source === 'repair'
  const contact = repairPickup ? { contactType: record.contactType === 'member' ? 'member' : 'phone', contactValue: String(record.contactValue || '').trim() } : decodePickupContact(record)
  const contactValue = String(contact.contactValue || '').trim()
  const detailLine = joinMaintenanceLine(String(record.repairProject || record.detail || '').trim())
  const platform = selfPickupPlatformLabel(record)
  const notificationStatus = inferPickupNotificationStatus(record)
  const resultLabel = pickupResultLabel(record)
  const ticketNumber = formatTicketNumber(record.ticketNo, record.id)
  const matchReason = hiddenMatchReason(record, query, source, contactValue, detailLine)
  const locked = Boolean(closedAt) || primaryActionBusy

  useEffect(() => {
    if (!pickupPixelFill) return undefined
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const timer = window.setTimeout(() => onPickupPixelFillComplete?.(record.id), reduced ? 0 : 460)
    return () => window.clearTimeout(timer)
  }, [onPickupPixelFillComplete, pickupPixelFill, record.id])

  const onPointerDown = (event) => { if (!pickedUp && !closedAt && event.pointerType !== 'mouse') startXRef.current = event.clientX }
  const onPointerUp = (event) => {
    if (startXRef.current == null) return
    const delta = event.clientX - startXRef.current
    startXRef.current = null
    if (delta < -42) setDeleteOpen(true)
    if (delta > 28) setDeleteOpen(false)
  }

  return <div className="pickup-card-frame" data-delete-open={deleteOpen ? 'true' : undefined} data-expanded={expanded ? 'true' : undefined}>
    {!pickedUp ? <button type="button" className="pickup-delete-reveal" onClick={() => onRemove(record)} disabled={Boolean(closedAt) || primaryProcessing}><IconTrash width={18} height={18} aria-hidden="true" />删除</button> : null}
    <article className="pickup-card" data-density={density} data-expanded={expanded ? 'true' : undefined} data-error={pickupError ? 'true' : undefined} data-processing={pickupPixelFill ? 'true' : undefined} onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => { startXRef.current = null }}>
      {pickupPixelFill ? <span className="pickup-complete-wash" aria-hidden="true" /> : null}
      <button type="button" className="pickup-card-summary" onClick={() => onToggle(record.id)} aria-expanded={expanded} aria-controls={`pickup-detail-${record.id}`}>
        <span className="pickup-card-index" aria-label={`列表序号 ${index + 1}`}><small>NO.</small>{String(index + 1).padStart(2, '0')}</span>
        <span className="pickup-card-core"><strong><Highlight query={query}>{record.title}</Highlight></strong><span className="pickup-source-line"><SourceIcon width={15} height={15} aria-hidden="true" />{pickupSourceLabel(record)}{platform ? <small>{platform}</small> : null}</span>{source === 'customer-storage' && detailLine ? <span className="pickup-storage-summary"><Highlight query={query}>{detailLine}</Highlight></span> : null}{matchReason ? <span className="pickup-hidden-match">{matchReason}</span> : null}</span>
        <span className="pickup-card-status"><b data-repair={repairPickup ? 'true' : undefined}>{resultLabel}</b><IconNavArrowDown width={18} height={18} aria-hidden="true" /></span>
        <span className="pickup-card-scan"><span><IconPhone width={14} height={14} aria-hidden="true" />{contactValue ? displayContactValue(contactValue) : '无联系方式'}</span>{record.pickupDate ? <span><IconCalendar width={14} height={14} aria-hidden="true" /><time dateTime={record.pickupDate}>{formatScanDate(record.pickupDate)}</time></span> : null}</span>
      </button>
      {expanded ? <div className="pickup-card-detail" id={`pickup-detail-${record.id}`}>
        <section><h4>CUSTOMER <span>/ 顾客</span></h4><dl><div><dt>车辆标识</dt><dd>{record.title}</dd></div><div><dt>{contact.contactType === 'member' ? '会员号' : '手机号'}</dt><dd>{contactValue || '无'}</dd></div><div><dt>取车日期</dt><dd>{record.pickupDate ? formatScanDate(record.pickupDate) : '未指定'}</dd></div><div><dt>业务编号</dt><dd>{ticketNumber}</dd></div></dl></section>
        <section><h4>ORIGIN <span>/ 来源</span></h4><dl><div><dt>待取来源</dt><dd>{pickupSourceLabel(record)}{platform ? ` · ${platform}` : ''}</dd></div><div><dt>业务结果</dt><dd>{resultLabel}</dd></div></dl></section>
        {detailLine ? <section className="pickup-detail-wide"><h4>{repairPickup ? 'SERVICE / 维修' : 'NOTE / 备注'}</h4><p>{detailLine}</p></section> : null}
        {!pickedUp ? <section className="pickup-detail-wide pickup-notification-control"><h4>NOTICE <span>/ 通知</span></h4><div className="pickup-notification-buttons" aria-label={`${record.title}通知状态`}><button type="button" data-active={notificationStatus === 'pending'} onClick={() => onNotificationChange(record, 'pending')} disabled={Boolean(closedAt)}>等待通知</button><button type="button" data-active={notificationStatus === 'notified'} onClick={() => onNotificationChange(record, 'notified')} disabled={Boolean(closedAt)}><IconBell width={15} height={15} aria-hidden="true" />已通知</button></div></section> : null}
        {pickupError ? <p className="pickup-card-error" role="alert">{pickupError}</p> : null}
        {pickedUp ? <p className="pickup-card-resolved">本条今日保留，下一业务日自动移除。</p> : null}
        <footer className="pickup-card-actions">{!pickedUp ? <button type="button" className="pickup-secondary-action" onClick={() => onEdit(record)} disabled={Boolean(closedAt) || primaryProcessing}><IconEdit width={16} height={16} aria-hidden="true" />编辑记录</button> : null}<button type="button" className="pickup-history-action" onClick={() => onHistory(record)}><IconJournal width={16} height={16} aria-hidden="true" />操作记录</button>{!pickedUp ? <details className="pickup-card-more"><summary>更多</summary><button type="button" onClick={() => onRemove(record)} disabled={Boolean(closedAt) || primaryProcessing}><IconTrash width={15} height={15} aria-hidden="true" />删除记录</button></details> : null}{!pickedUp ? <button type="button" className="pickup-primary-action" onClick={() => onPickup(record)} disabled={locked} aria-busy={primaryProcessing || undefined}><IconCheck width={17} height={17} aria-hidden="true" />{primaryProcessing ? '确认中…' : '确认取车'}</button> : null}</footer>
      </div> : null}
    </article>
  </div>
}

export default function PickupLedger({ records = [], closedAt, onAdd, onEdit, onRemove, onHistory, onPickup, onPickupNotificationChange, pickupErrors = {}, primaryProcessingId = '', primaryActionBusy = false, pickupPixelFillId = '', onPickupPixelFillComplete }) {
  const [query, setQuery] = useState('')
  const [expandedId, setExpandedId] = useState('')
  const [density, setDensity] = useState(() => window.localStorage?.getItem('pickup-ledger-density') || 'balanced')
  const [sources, setSources] = useState([])
  const [sort, setSort] = useState(() => window.localStorage?.getItem('pickup-ledger-sort') || 'default')
  const [sheet, setSheet] = useState(null)
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [toolsVisible, setToolsVisible] = useState(true)
  const ledgerRef = useRef(null)
  const lastScrollYRef = useRef(0)
  const waitingRecords = records.filter((record) => !record.pickedUpToday)
  const pickedRecords = records.filter((record) => record.pickedUpToday)
  const autoDensity = waitingRecords.length > 12 ? 'compact' : density

  useEffect(() => { window.localStorage?.setItem('pickup-ledger-density', density) }, [density])
  useEffect(() => { window.localStorage?.setItem('pickup-ledger-sort', sort) }, [sort])
  useEffect(() => { const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250); return () => window.clearTimeout(timer) }, [query])
  useEffect(() => {
    const onScroll = () => {
      const current = window.scrollY
      const delta = current - lastScrollYRef.current
      lastScrollYRef.current = current
      if (!ledgerRef.current || ledgerRef.current.getBoundingClientRect().top > 96 || sheet || query) return setToolsVisible(true)
      if (delta > 14) setToolsVisible(false)
      else if (delta < -8) setToolsVisible(true)
    }
    lastScrollYRef.current = window.scrollY
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [query, sheet])
  const visible = useMemo(() => {
    const term = debouncedQuery.toLocaleLowerCase('zh-CN')
    return sortRecords(waitingRecords.filter((record) => (!sources.length || sources.includes(inferPickupSource(record))) && (!term || normalizedSearch(record).includes(term))), sort)
  }, [debouncedQuery, records, sort, sources])
  const appliedLabels = [...sources.map((value) => sourceOptions.find(([key]) => key === value)?.[1]).filter(Boolean), sort === 'default' ? null : sortOptions.find(([value]) => value === sort)?.[1]].filter(Boolean)
  const closeSheet = useCallback(() => setSheet(null), [])
  const applySheet = useCallback(({ sources: nextSources, sort: nextSort }) => { setSources(nextSources); setSort(nextSort); setSheet(null) }, [])

  return <div ref={ledgerRef} className="pickup-ledger" data-density={autoDensity} data-tools-visible={toolsVisible ? 'true' : undefined} aria-label={`待取车辆台账，共 ${records.length} 条`}>
    <div className="pickup-sticky-shell">
      <header className="pickup-module-header"><div className="pickup-module-code"><span>02</span><small>PICKUP</small></div><div><small>WORKSHOP QUEUE</small><h2 id="pickup-title">待取车辆</h2></div><div className="pickup-module-count"><span><b>{String(waitingRecords.length).padStart(2, '0')}</b>待取</span><span><b>{String(pickedRecords.length).padStart(2, '0')}</b>今日已取</span></div><button type="button" className="pickup-header-search" onClick={() => { setToolsVisible(true); window.setTimeout(() => document.getElementById('pickup-search')?.focus(), 0) }} aria-label="搜索待取车辆"><IconSearch width={19} height={19} aria-hidden="true" /></button></header>
      <div className="pickup-tools-area"><div className="pickup-tool-row"><label className="pickup-search-field" htmlFor="pickup-search"><IconSearch width={17} height={17} aria-hidden="true" /><input id="pickup-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索车型、电话、编号…" /></label><button type="button" onClick={() => setSheet('filter')} data-active={sources.length ? 'true' : undefined}><IconFilter width={17} height={17} aria-hidden="true" /><span>筛选</span>{sources.length ? <b>{sources.length}</b> : null}</button><button type="button" onClick={() => setSheet('sort')} data-active={sort !== 'default' ? 'true' : undefined}><IconSort width={17} height={17} aria-hidden="true" /><span>排序</span></button><button type="button" onClick={() => setDensity((current) => current === 'balanced' ? 'compact' : 'balanced')} aria-label={`切换为${density === 'balanced' ? '紧凑' : '平衡'}密度`}>{density === 'balanced' ? <IconList width={17} height={17} aria-hidden="true" /> : <IconViewColumns width={17} height={17} aria-hidden="true" />}<span>密度</span></button><button type="button" className="pickup-collapse-all" onClick={() => setExpandedId('')} disabled={!expandedId} aria-label="全部收起"><IconNavArrowDown width={17} height={17} aria-hidden="true" /><span>收起</span></button></div>
      {appliedLabels.length ? <div className="pickup-applied-filters" aria-label="已应用规则">{appliedLabels.map((label) => <span key={label}>{label}</span>)}<button type="button" onClick={() => { setSources([]); setSort('default') }}>清除</button></div> : null}</div>
    </div>
    <div className="pickup-ledger-intro"><div><span>ACTIVE PICKUP</span><strong>{visible.length ? `当前显示 ${visible.length} 台，按列表顺序核对并交付。` : '当前规则下没有待取车辆。'}</strong></div><div className="pickup-ledger-global-actions"><button type="button" onClick={() => onHistory()}><IconJournal width={17} height={17} aria-hidden="true" />操作记录</button><button type="button" onClick={onAdd} disabled={Boolean(closedAt)}><IconPlus width={17} height={17} aria-hidden="true" />增加待取</button></div></div>
    {visible.length ? <div className="pickup-card-grid">{visible.map((record, index) => <PickupCard key={record.id} record={record} index={index} expanded={expandedId === record.id} density={autoDensity} query={debouncedQuery} closedAt={closedAt} pickupError={pickupErrors[record.id] || ''} primaryProcessing={primaryProcessingId === record.id} primaryActionBusy={primaryActionBusy} pickupPixelFill={pickupPixelFillId === record.id} onToggle={(id) => setExpandedId((current) => current === id ? '' : id)} onEdit={onEdit} onRemove={onRemove} onHistory={onHistory} onPickup={onPickup} onNotificationChange={onPickupNotificationChange} onPickupPixelFillComplete={onPickupPixelFillComplete} />)}</div> : <section className="pickup-empty-state"><IconBicycle width={34} height={34} aria-hidden="true" /><span>{waitingRecords.length ? 'NO MATCH' : 'QUEUE CLEAR'}</span><h3>{waitingRecords.length ? '没有符合条件的车辆' : '当前没有待取车辆'}</h3><p>{waitingRecords.length ? '清除搜索或筛选条件，恢复完整待取列表。' : '新增顾客暂存、自提订单或二手车待取记录。'}</p>{waitingRecords.length ? <button type="button" onClick={() => { setQuery(''); setSources([]); setSort('default') }}>恢复全部车辆</button> : <button type="button" onClick={onAdd} disabled={Boolean(closedAt)}><IconPlus width={17} height={17} aria-hidden="true" />增加待取车辆</button>}</section>}
    {pickedRecords.length ? <details className="pickup-completed-today"><summary><span><IconCheck width={17} height={17} aria-hidden="true" />今日已取</span><b>{String(pickedRecords.length).padStart(2, '0')}</b></summary><div>{pickedRecords.map((record) => <button type="button" key={record.id} onClick={() => onHistory(record)}><span>{record.title}</span><small>{pickupSourceLabel(record)} · 查看操作记录</small></button>)}</div></details> : null}
    <PickupFilterSheet open={Boolean(sheet)} initialTab={sheet || 'filter'} appliedSources={sources} appliedSort={sort} onClose={closeSheet} onApply={applySheet} />
  </div>
}
