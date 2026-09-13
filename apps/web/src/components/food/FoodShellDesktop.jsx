import { useEffect, useMemo, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { computeFoodDates, isFoodBatchFlagged } from '@bike-ops/domain'
import { upsertFoodShelfLife } from '../../api/food.js'
import {
  FOOD_STATUS_LABEL,
  batchStageLabel,
  parseDateInput,
  remainingLabel,
  shortDate,
  urgencyLevel
} from '../../utils/foodPresentation.js'

/**
 * 食品台账 · 桌面端（独立实现，不与移动端共享 DOM）。
 *
 * 信息架构与移动端一致（2026-09-14 重排）：左栏是状态与主操作，右栏是内容。
 *   左栏 = 三个状态数字（点击即筛选）+「登记入库」主按钮 + 视图导航
 *   右栏 = 标题 / 筛选与排序工具栏 / 表格
 *
 * 排序默认「最新登记」；切到「红标」自动改「预警最近」（清查场景最紧急在前）。
 */

const VIEWS = [
  { id: 'batches', label: '批次', desc: '全部在库与已处理批次，可按状态与品类筛选' },
  { id: 'shelf', label: '保质期清单', desc: '全局商品字典，任何门店新增一次全体共享' }
]

const FILTERS = [
  { id: 'open', label: '在库' },
  { id: 'flagged', label: '红标' },
  { id: 'soon', label: '临期' },
  { id: 'all', label: '全部' }
]

const KINDS = [
  { id: '', label: '全品类' },
  { id: 'food', label: '食品' },
  { id: 'nonfood', label: '非食品' }
]

const SORTS = [
  { id: 'received_desc', label: '最新登记' },
  { id: 'received_asc', label: '最早登记' },
  { id: 'warn_asc', label: '预警最近' },
  { id: 'warn_desc', label: '预警最远' }
]

function SortMenu({ sort, onChange }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const current = SORTS.find((entry) => entry.id === sort) || SORTS[0]

  useEffect(() => {
    if (!open) return undefined
    const closeFromOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeFromOutside)
    return () => document.removeEventListener('pointerdown', closeFromOutside)
  }, [open])

  return (
    <div className="food-d-sort" ref={rootRef}>
      <button type="button" className="food-d-sort-trigger" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        排序：{current.label} <span aria-hidden="true">▾</span>
      </button>
      {open ? (
        <div className="food-d-sort-menu" role="listbox" aria-label="排序方式">
          {SORTS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="option"
              aria-selected={entry.id === sort}
              data-active={entry.id === sort ? 'true' : 'false'}
              onClick={() => { onChange(entry.id); setOpen(false) }}
            >
              {entry.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function BatchesTable({ ledger, today, onNotify }) {
  const { batches, loading, syncing, hasMore, loadMore, handle } = ledger
  const act = async (batch, status) => {
    const result = await handle(batch, status)
    onNotify?.(result.ok
      ? (status === 'sold_out' ? '已标记售罄' : status === 'isolated' ? '已标记隔离' : '已恢复在库')
      : { message: result.message, tone: 'error' })
    return result
  }
  if (loading && !batches.length) return <p className="food-d-hint">正在读取…</p>
  if (!batches.length) {
    return (
      <div className="food-d-empty">
        <strong>这里还没有批次</strong>
        <span>换一个筛选条件，或点左侧「登记入库」新增。</span>
      </div>
    )
  }
  return (
    <div className="food-d-batches">
      <ul className="food-d-table" data-kind="batches">
        <li className="food-d-row food-d-row-head" aria-hidden="true">
          <span>商品</span><span>商品码</span><span>数量</span><span>收货</span><span>到期</span><span>剩余</span><span>状态</span><span>操作</span>
        </li>
        {batches.map((batch) => {
          const needsAction = isFoodBatchFlagged(batch, today)
          return (
            <li key={batch.id} className="food-d-row" data-food-stagger data-stage={batchStageLabel(batch, today)}>
              <span className="food-d-name">{batch.itemName}</span>
              <span className="food-d-code">{batch.itemCode}</span>
              <span>{batch.quantity}</span>
              <span>{shortDate(batch.receivedDate, today)}</span>
              <span>{shortDate(batch.expiresOn, today)}</span>
              <span className="food-d-days" data-urgency={urgencyLevel(batch.expiresOn, today)}>{remainingLabel(batch.expiresOn, today)}</span>
              <span className="food-d-status" data-status={batch.status === 'open' && needsAction ? 'flagged' : batch.status}>
                {batch.status === 'open' ? (needsAction ? '待处理' : '在库') : (FOOD_STATUS_LABEL[batch.status] || batch.status)}
              </span>
              <span className="food-d-actions">
                {batch.status === 'open' ? (
                  <>
                    <button type="button" data-act="sold-out" disabled={syncing} onClick={() => void act(batch, 'sold_out')}>已售罄</button>
                    <button type="button" data-act="isolate" disabled={syncing} onClick={() => void act(batch, 'isolated')}>隔离</button>
                  </>
                ) : (
                  <button type="button" data-act="reopen" disabled={syncing} onClick={() => void act(batch, 'open')}>撤销</button>
                )}
              </span>
            </li>
          )
        })}
      </ul>
      {hasMore ? <button type="button" className="food-d-more" onClick={() => void loadMore()} disabled={loading}>加载更多</button> : null}
    </div>
  )
}

function EntryView({ ledger, today, userName, onNotify, onBack }) {
  const [itemCode, setItemCode] = useState('')
  const [kind, setKind] = useState('food')
  const [dateType, setDateType] = useState('production')
  const [dateRaw, setDateRaw] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [receiver, setReceiver] = useState(userName || '')
  const [busy, setBusy] = useState(false)
  const codeRef = useRef(null)
  const { shelfLife, loadShelfLife, register } = ledger

  useEffect(() => { void loadShelfLife() }, [loadShelfLife])
  useEffect(() => { if (!userName) return; setReceiver((current) => current || userName) }, [userName])

  const shelfItem = useMemo(() => shelfLife.find((item) => item.itemCode === itemCode.trim()) || null, [shelfLife, itemCode])
  const productionDate = parseDateInput(dateRaw, today)
  const useRestricted = kind === 'nonfood' && dateType === 'restricted'
  const preview = useMemo(() => {
    if (!shelfItem) return null
    const result = computeFoodDates({
      kind,
      dateType,
      productionDate: useRestricted ? undefined : productionDate,
      restrictedDate: useRestricted ? productionDate : undefined,
      shelfLifeMonths: shelfItem.shelfLifeMonths
    })
    return result.ok ? result : null
  }, [shelfItem, kind, dateType, productionDate, useRestricted])
  const canSubmit = Boolean(shelfItem && preview && Number(quantity) > 0 && !busy)

  const submit = async () => {
    if (!canSubmit) return
    setBusy(true)
    const result = await register({
      itemCode: shelfItem.itemCode,
      kind,
      dateType,
      productionDate: useRestricted ? undefined : productionDate,
      restrictedDate: useRestricted ? productionDate : undefined,
      receivedDate: today,
      quantity: Number(quantity),
      receiver: receiver.trim()
    })
    setBusy(false)
    if (!result.ok) { onNotify?.({ message: result.message, tone: 'error' }); return }
    const warning = result.receiptWarningDays
    onNotify?.(warning !== null && warning !== undefined
      ? `已登记 · 距到期仅 ${warning} 天，记得在部门群沟通`
      : '已登记')
    setItemCode('')
    setDateRaw('')
    setQuantity('1')
    codeRef.current?.focus()
  }

  return (
    <div className="food-d-entry">
      <div className="food-d-entry-form">
        <button type="button" className="food-d-entry-back" onClick={onBack}>← 返回批次列表</button>
        <label className="food-d-field">
          <span>商品码</span>
          <input
            ref={codeRef}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="扫码枪或键盘输入商品码"
            value={itemCode}
            onChange={(event) => setItemCode(event.target.value.replace(/\D/gu, '').slice(0, 14))}
          />
        </label>
        {itemCode && !shelfItem ? <p className="food-d-entry-miss">清单里没有这个商品码，请先到「保质期清单」补录。</p> : null}
        <div className="food-d-field-row">
          <div className="food-d-chips" role="group" aria-label="品类">
            <button type="button" data-active={kind === 'food' ? 'true' : 'false'} onClick={() => setKind('food')}>食品</button>
            <button type="button" data-active={kind === 'nonfood' ? 'true' : 'false'} onClick={() => setKind('nonfood')}>非食品</button>
          </div>
          {kind === 'nonfood' ? (
            <div className="food-d-chips" role="group" aria-label="日期类型">
              <button type="button" data-active={dateType === 'production' ? 'true' : 'false'} onClick={() => setDateType('production')}>生产日期</button>
              <button type="button" data-active={dateType === 'restricted' ? 'true' : 'false'} onClick={() => setDateType('restricted')}>限制使用日期</button>
            </div>
          ) : null}
        </div>
        <label className="food-d-field">
          <span>{useRestricted ? '限制使用日期' : '生产日期'}</span>
          <input type="text" inputMode="numeric" autoComplete="off" placeholder="如 20260814" value={dateRaw} onChange={(event) => setDateRaw(event.target.value.slice(0, 12))} />
        </label>
        <div className="food-d-field-grid">
          <label className="food-d-field">
            <span>数量</span>
            <input type="text" inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value.replace(/[^\d.]/gu, '').slice(0, 8))} />
          </label>
          <label className="food-d-field">
            <span>收货人</span>
            <input type="text" value={receiver} onChange={(event) => setReceiver(event.target.value.slice(0, 24))} />
          </label>
        </div>
        <button type="button" className="food-d-entry-submit" onClick={() => void submit()} disabled={!canSubmit}>
          {busy ? '登记中…' : '登记入库'}
        </button>
      </div>
      <aside className="food-d-entry-side">
        <h3>{shelfItem ? shelfItem.name : '待选择商品'}</h3>
        <dl>
          <div><dt>商品码</dt><dd>{shelfItem ? shelfItem.itemCode : '—'}</dd></div>
          <div><dt>保质期</dt><dd>{shelfItem ? `${shelfItem.shelfLifeMonths} 个月` : '—'}</dd></div>
          <div><dt>预警日</dt><dd>{preview ? preview.warnOn : '—'}</dd></div>
          <div><dt>到期日</dt><dd>{preview ? preview.expiresOn : '—'}</dd></div>
          <div><dt>收货日</dt><dd>{today || '—'}</dd></div>
        </dl>
        <p className="food-d-entry-note">口径与门店 Excel 台账一致：预警日 = 日期 +（保质期月数 − 1）。登记完成后商品码会清空，可以连续录入。</p>
      </aside>
    </div>
  )
}

function ShelfRow({ item, canEdit, onSaved, onNotify }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(item.name)
  const [months, setMonths] = useState(String(item.shelfLifeMonths))
  const [category, setCategory] = useState(item.category || '')
  const [busy, setBusy] = useState(false)

  const save = async () => {
    const parsed = Number(months)
    if (!name.trim() || !Number.isFinite(parsed) || parsed <= 0) {
      onNotify?.({ message: '请填写商品名与正数保质期月数。', tone: 'error' })
      return
    }
    setBusy(true)
    try {
      const payload = await upsertFoodShelfLife({ itemCode: item.itemCode, name: name.trim(), shelfLifeMonths: parsed, category: category.trim() })
      onSaved?.(payload.item)
      onNotify?.('清单已更新')
      setOpen(false)
    } catch (cause) {
      onNotify?.({ message: cause?.message || '保存失败。', tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="food-d-shelf-row" data-food-stagger data-open={open ? 'true' : 'false'}>
      <span className="food-d-name">{item.name}</span>
      <span className="food-d-code">{item.itemCode}</span>
      <span className="food-d-cat">{item.category || '—'}</span>
      <span className="food-d-months">{item.shelfLifeMonths} 个月</span>
      <span className="food-d-actions">
        {canEdit ? (
          <button type="button" disabled={busy} onClick={() => setOpen((value) => !value)}>{open ? '取消' : '修改'}</button>
        ) : null}
      </span>
      {open ? (
        <div className="food-d-shelf-form">
          <label className="food-d-field"><span>商品名称</span><input type="text" value={name} onChange={(event) => setName(event.target.value.slice(0, 120))} /></label>
          <label className="food-d-field"><span>保质期（月）</span><input type="text" inputMode="decimal" value={months} onChange={(event) => setMonths(event.target.value.replace(/[^\d.]/gu, '').slice(0, 6))} /></label>
          <label className="food-d-field"><span>类别</span><input type="text" value={category} onChange={(event) => setCategory(event.target.value.slice(0, 24))} /></label>
          <button type="button" className="food-d-shelf-save" onClick={() => void save()} disabled={busy}>{busy ? '保存中…' : '保存'}</button>
        </div>
      ) : null}
    </li>
  )
}

function ShelfView({ ledger, canEdit, onNotify }) {
  const [query, setQuery] = useState('')
  const { shelfLife, loadShelfLife, applyShelfItem } = ledger
  useEffect(() => { void loadShelfLife() }, [loadShelfLife])
  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return shelfLife
    return shelfLife.filter((item) => item.itemCode.includes(keyword) || item.name.toLowerCase().includes(keyword))
  }, [shelfLife, query])
  return (
    <div className="food-d-shelf">
      <div className="food-d-toolbar">
        <input className="food-d-search" type="search" placeholder="搜商品码或名称" value={query} onChange={(event) => setQuery(event.target.value)} />
        <span className="food-d-shelf-count">{filtered.length} / {shelfLife.length} 个商品</span>
      </div>
      {!shelfLife.length ? <p className="food-d-hint">正在读取清单…</p> : null}
      <ul className="food-d-table" data-kind="shelf">
        <li className="food-d-row food-d-row-head" aria-hidden="true">
          <span>商品名称</span><span>商品码</span><span>类别</span><span>保质期</span><span>操作</span>
        </li>
        {filtered.map((item) => (
          <ShelfRow key={item.itemCode} item={item} canEdit={canEdit} onSaved={applyShelfItem} onNotify={onNotify} />
        ))}
      </ul>
    </div>
  )
}

export default function FoodShellDesktop({ ledger, view, onViewChange, userName, storeName, role, onExit, exitLabel = '返回应用选择', onNotify }) {
  const inEntry = view === 'entry'
  const tab = inEntry ? 'batches' : view
  const bodyRef = useRef(null)
  const counts = ledger.counts
  const today = ledger.today
  const canEdit = role === 'manager' || role === 'admin'
  const current = VIEWS.find((entry) => entry.id === tab) || VIEWS[0]

  useEffect(() => {
    const root = bodyRef.current
    if (!root) return undefined
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined
    const context = gsap.context(() => {
      gsap.from('[data-food-stagger]', {
        y: 12,
        autoAlpha: 0,
        duration: .32,
        stagger: .025,
        ease: 'expo.out',
        clearProps: 'transform,opacity,visibility'
      })
    }, root)
    return () => context.revert()
  }, [view])

  return (
    <div className="food-d-root">
      <aside className="food-d-rail">
        <div className="food-d-rail-head">
          <strong>食品台账</strong>
          <small>{storeName || ''}</small>
        </div>

        <div className="food-d-rail-stats" role="group" aria-label="库存状态">
          <button type="button" className="food-d-stat" data-tone="alert" data-active={ledger.filter === 'flagged' && !inEntry ? 'true' : 'false'} onClick={() => { ledger.focusFilter('flagged'); onViewChange('batches') }}>
            <b>{counts ? counts.flagged : '—'}</b><span>红标</span>
          </button>
          <button type="button" className="food-d-stat" data-tone="soon" data-active={ledger.filter === 'soon' && !inEntry ? 'true' : 'false'} onClick={() => { ledger.focusFilter('soon'); onViewChange('batches') }}>
            <b>{counts ? counts.soon : '—'}</b><span>临期</span>
          </button>
          <button type="button" className="food-d-stat" data-active={ledger.filter === 'open' && !inEntry ? 'true' : 'false'} onClick={() => { ledger.focusFilter('open'); onViewChange('batches') }}>
            <b>{counts ? counts.open : '—'}</b><span>在库</span>
          </button>
        </div>

        <button type="button" className="food-d-register" onClick={() => onViewChange('entry')}>＋ 登记入库</button>

        <nav className="food-d-nav" aria-label="食品台账视图">
          {VIEWS.map((entry) => (
            <button key={entry.id} type="button" data-active={!inEntry && tab === entry.id ? 'true' : 'false'} onClick={() => onViewChange(entry.id)}>
              <span>{entry.label}</span>
            </button>
          ))}
        </nav>

        <div className="food-d-rail-foot">
          <button type="button" className="food-d-exit" onClick={onExit}>← {exitLabel}</button>
        </div>
      </aside>

      <main className="food-d-main">
        <header className="food-d-head">
          <h2>{inEntry ? '登记入库' : current.label}</h2>
          <p>{inEntry ? '输入商品码带出保质期，系统按 Excel 同款口径计算预警日与到期日' : current.desc}</p>
        </header>

        {ledger.error ? <p className="food-d-alert" role="status">{ledger.error}</p> : null}

        {!inEntry && tab === 'batches' ? (
          <div className="food-d-toolbar">
            <div className="food-d-chips" role="group" aria-label="按状态筛选">
              {FILTERS.map((entry) => (
                <button key={entry.id} type="button" data-active={ledger.filter === entry.id ? 'true' : 'false'} onClick={() => ledger.focusFilter(entry.id)}>{entry.label}</button>
              ))}
            </div>
            <div className="food-d-chips" role="group" aria-label="按品类筛选">
              {KINDS.map((entry) => (
                <button key={entry.id || 'all'} type="button" data-active={ledger.kind === entry.id ? 'true' : 'false'} onClick={() => ledger.setKind(entry.id)}>{entry.label}</button>
              ))}
            </div>
            <SortMenu sort={ledger.sort} onChange={ledger.setSort} />
            <input className="food-d-search" type="search" placeholder="搜商品码或名称" value={ledger.query} onChange={(event) => ledger.setQuery(event.target.value)} />
          </div>
        ) : null}

        <div className="food-d-body" ref={bodyRef}>
          {inEntry ? <EntryView ledger={ledger} today={today} userName={userName} onNotify={onNotify} onBack={() => onViewChange('batches')} /> : null}
          {!inEntry && tab === 'batches' ? <BatchesTable ledger={ledger} today={today} onNotify={onNotify} /> : null}
          {!inEntry && tab === 'shelf' ? <ShelfView ledger={ledger} canEdit={canEdit} onNotify={onNotify} /> : null}
        </div>
      </main>
    </div>
  )
}
