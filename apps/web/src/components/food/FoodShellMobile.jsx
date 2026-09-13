import { useEffect, useMemo, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { computeFoodDates } from '@bike-ops/domain'
import { upsertFoodShelfLife } from '../../api/food.js'
import useSegmentedPill from '../../hooks/useSegmentedPill.js'
import {
  FOOD_STATUS_LABEL,
  batchStageLabel,
  parseDateInput,
  remainingLabel,
  shortDate,
  urgencyLevel
} from '../../utils/foodPresentation.js'

/**
 * 食品台账 · 移动端（独立实现，不与桌面端共享 DOM）。
 *
 * 信息骨架取自调研结论（2026-09-13）：首屏即红标待办（Grocy 的 due 分类），
 * 登记流「单手三秒」——商品码进、日期出、焦点自动回位支持连续录入，
 * 处理动作在卡片上一步完成（已售罄 / 隔离）。
 */

const VIEWS = [
  { id: 'todo', label: '待办' },
  { id: 'batches', label: '全部' },
  { id: 'entry', label: '登记' },
  { id: 'shelf', label: '清单' }
]

function TodoCard({ batch, today, syncing, onHandle }) {
  const cardRef = useRef(null)
  const stage = batchStageLabel(batch, today)
  const urgency = urgencyLevel(batch.expiresOn, today)

  const act = async (status) => {
    const node = cardRef.current
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (node && !reduced) gsap.to(node, { autoAlpha: 0, x: 26, duration: .3, ease: 'power2.in' })
    const result = await onHandle(batch, status)
    if (!result?.ok && node) {
      gsap.to(node, { autoAlpha: 1, x: 0, duration: .26, ease: 'power2.out' })
    }
    return result
  }

  return (
    <li className="food-m-todo-card" ref={cardRef} data-food-stagger data-stage={stage}>
      <div className="food-m-todo-head">
        <strong className="food-m-todo-name">{batch.itemName}</strong>
        <span className="food-m-todo-days" data-urgency={urgency}>{remainingLabel(batch.expiresOn, today)}</span>
      </div>
      <p className="food-m-todo-meta">
        <span>{batch.itemCode}</span>
        <span>{batch.kind === 'food' ? '食品' : '非食品'}</span>
        <span>{batch.quantity} 件</span>
        <span>收货 {shortDate(batch.receivedDate, today)}</span>
      </p>
      <p className="food-m-todo-dates">
        预警 {shortDate(batch.warnOn, today)} · 到期 {shortDate(batch.expiresOn, today)}
      </p>
      <div className="food-m-todo-actions">
        <button type="button" data-act="sold-out" onClick={() => void act('sold_out')} disabled={syncing}>已售罄</button>
        <button type="button" data-act="isolate" onClick={() => void act('isolated')} disabled={syncing}>隔离</button>
      </div>
    </li>
  )
}

function TodoView({ ledger, today, onNotify }) {
  const { batches, loading, syncing, handle } = ledger
  const onHandle = async (batch, status) => {
    const result = await handle(batch, status)
    onNotify?.(result.ok ? (status === 'sold_out' ? '已标记售罄' : status === 'isolated' ? '已标记隔离' : '已恢复在库') : { message: result.message, tone: 'error' })
    return result
  }
  if (loading && !batches.length) return <p className="food-m-hint">正在读取红标待办…</p>
  if (!batches.length) {
    return (
      <div className="food-m-empty">
        <strong>没有红标待处理</strong>
        <span>预警日已到的批次会出现在这里，每周一按 SOP 清查一遍。</span>
      </div>
    )
  }
  return (
    <ul className="food-m-todo-list">
      {batches.map((batch) => (
        <TodoCard key={batch.id} batch={batch} today={today} syncing={syncing} onHandle={onHandle} />
      ))}
    </ul>
  )
}

function BatchRow({ batch, today, syncing, onHandle }) {
  const urgency = urgencyLevel(batch.expiresOn, today)
  const closed = batch.status !== 'open'
  return (
    <li className="food-m-batch-row" data-food-stagger data-stage={batchStageLabel(batch, today)}>
      <div className="food-m-batch-main">
        <strong>{batch.itemName}</strong>
        <small>{batch.itemCode} · {batch.quantity} 件 · 收货 {shortDate(batch.receivedDate, today)}</small>
      </div>
      <div className="food-m-batch-side">
        <span className="food-m-batch-days" data-urgency={urgency}>{remainingLabel(batch.expiresOn, today)}</span>
        <span className="food-m-batch-status" data-status={batch.status}>{FOOD_STATUS_LABEL[batch.status] || batch.status}</span>
      </div>
      {closed ? (
        <button
          type="button"
          className="food-m-batch-undo"
          disabled={syncing}
          onClick={() => void onHandle(batch, 'open')}
        >
          撤销
        </button>
      ) : null}
    </li>
  )
}

function BatchesView({ ledger, today, onNotify }) {
  const { batches, loading, syncing, hasMore, loadMore, filter, setFilter, kind, setKind, query, setQuery, handle } = ledger
  const onHandle = async (batch, status) => {
    const result = await handle(batch, status)
    onNotify?.(result.ok ? '已恢复在库' : { message: result.message, tone: 'error' })
    return result
  }
  return (
    <div className="food-m-batches">
      <div className="food-m-filter-row">
        <div className="food-m-chips" role="group" aria-label="按状态筛选">
          {[['all', '全部'], ['open', '在库'], ['flagged', '红标']].map(([value, label]) => (
            <button key={value} type="button" data-active={filter === value ? 'true' : 'false'} onClick={() => setFilter(value)}>{label}</button>
          ))}
        </div>
        <div className="food-m-chips" role="group" aria-label="按品类筛选">
          {[['', '全品类'], ['food', '食品'], ['nonfood', '非食品']].map(([value, label]) => (
            <button key={value || 'all'} type="button" data-active={kind === value ? 'true' : 'false'} onClick={() => setKind(value)}>{label}</button>
          ))}
        </div>
      </div>
      <input
        className="food-m-search"
        type="search"
        inputMode="search"
        placeholder="搜商品码或名称"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {loading && !batches.length ? <p className="food-m-hint">正在读取…</p> : null}
      {!loading && !batches.length ? <p className="food-m-hint">没有匹配的批次。</p> : null}
      <ul className="food-m-batch-list">
        {batches.map((batch) => (
          <BatchRow key={batch.id} batch={batch} today={today} syncing={syncing} onHandle={onHandle} />
        ))}
      </ul>
      {hasMore ? (
        <button type="button" className="food-m-more" onClick={() => void loadMore()} disabled={loading}>加载更多</button>
      ) : null}
    </div>
  )
}

function EntryView({ ledger, today, userName, onNotify }) {
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

  const shelfItem = useMemo(
    () => shelfLife.find((item) => item.itemCode === itemCode.trim()) || null,
    [shelfLife, itemCode]
  )
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
    <div className="food-m-entry">
      <label className="food-m-field">
        <span>商品码</span>
        <input
          ref={codeRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="扫码或输入 8 位商品码"
          value={itemCode}
          onChange={(event) => setItemCode(event.target.value.replace(/\D/gu, '').slice(0, 14))}
        />
      </label>

      {itemCode && !shelfItem ? <p className="food-m-entry-miss">清单里没有这个商品码，请先到「清单」中补录保质期。</p> : null}
      {shelfItem ? (
        <p className="food-m-entry-hit">
          <strong>{shelfItem.name}</strong>
          <span>保质期 {shelfItem.shelfLifeMonths} 个月{shelfItem.category ? ` · ${shelfItem.category}` : ''}</span>
        </p>
      ) : null}

      <div className="food-m-field-row">
        <div className="food-m-field-inline" role="group" aria-label="品类">
          <button type="button" data-active={kind === 'food' ? 'true' : 'false'} onClick={() => setKind('food')}>食品</button>
          <button type="button" data-active={kind === 'nonfood' ? 'true' : 'false'} onClick={() => setKind('nonfood')}>非食品</button>
        </div>
        {kind === 'nonfood' ? (
          <div className="food-m-field-inline" role="group" aria-label="日期类型">
            <button type="button" data-active={dateType === 'production' ? 'true' : 'false'} onClick={() => setDateType('production')}>生产日期</button>
            <button type="button" data-active={dateType === 'restricted' ? 'true' : 'false'} onClick={() => setDateType('restricted')}>限制使用</button>
          </div>
        ) : null}
      </div>

      <label className="food-m-field">
        <span>{useRestricted ? '限制使用日期' : '生产日期'}</span>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="如 20260814"
          value={dateRaw}
          onChange={(event) => setDateRaw(event.target.value.slice(0, 12))}
        />
      </label>

      <div className="food-m-field-grid">
        <label className="food-m-field">
          <span>数量</span>
          <input
            type="text"
            inputMode="numeric"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value.replace(/[^\d.]/gu, '').slice(0, 8))}
          />
        </label>
        <label className="food-m-field">
          <span>收货人</span>
          <input type="text" value={receiver} onChange={(event) => setReceiver(event.target.value.slice(0, 24))} />
        </label>
      </div>

      {preview ? (
        <div className="food-m-entry-preview">
          <span>预警 {shortDate(preview.warnOn, today)}</span>
          <span>到期 {shortDate(preview.expiresOn, today)}</span>
          <span data-tone="muted">收货 {shortDate(today, today)}</span>
        </div>
      ) : (
        <div className="food-m-entry-preview" data-empty="true"><span>填入商品码与日期后自动计算预警日 / 到期日</span></div>
      )}

      <button type="button" className="food-m-entry-submit" onClick={() => void submit()} disabled={!canSubmit}>
        {busy ? '登记中…' : '登记入库'}
      </button>
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
    <li className="food-m-shelf-row" data-food-stagger data-open={open ? 'true' : 'false'}>
      <div className="food-m-shelf-main">
        <strong>{item.name}</strong>
        <small>{item.itemCode}{item.category ? ` · ${item.category}` : ''}</small>
      </div>
      <span className="food-m-shelf-months">{item.shelfLifeMonths} 个月</span>
      {canEdit ? (
        <button type="button" className="food-m-shelf-edit" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
          {open ? '取消' : '修改'}
        </button>
      ) : null}
      {open ? (
        <div className="food-m-shelf-form">
          <label className="food-m-field"><span>商品名称</span>
            <input type="text" value={name} onChange={(event) => setName(event.target.value.slice(0, 120))} />
          </label>
          <div className="food-m-field-grid">
            <label className="food-m-field"><span>保质期（月）</span>
              <input type="text" inputMode="decimal" value={months} onChange={(event) => setMonths(event.target.value.replace(/[^\d.]/gu, '').slice(0, 6))} />
            </label>
            <label className="food-m-field"><span>类别</span>
              <input type="text" value={category} onChange={(event) => setCategory(event.target.value.slice(0, 24))} />
            </label>
          </div>
          <button type="button" className="food-m-shelf-save" onClick={() => void save()} disabled={busy}>{busy ? '保存中…' : '保存'}</button>
        </div>
      ) : null}
    </li>
  )
}

function ShelfView({ ledger, today, canEdit, onNotify }) {
  const [query, setQuery] = useState('')
  const { shelfLife, loadShelfLife, applyShelfItem } = ledger
  useEffect(() => { void loadShelfLife() }, [loadShelfLife])
  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return shelfLife
    return shelfLife.filter((item) => item.itemCode.includes(keyword) || item.name.toLowerCase().includes(keyword))
  }, [shelfLife, query])
  return (
    <div className="food-m-shelf">
      <input
        className="food-m-search"
        type="search"
        placeholder="搜商品码或名称"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {!shelfLife.length ? <p className="food-m-hint">正在读取清单…</p> : null}
      {shelfLife.length && !filtered.length ? <p className="food-m-hint">没有匹配的商品。</p> : null}
      <ul className="food-m-shelf-list">
        {filtered.map((item) => (
          <ShelfRow key={item.itemCode} item={item} canEdit={canEdit} onSaved={applyShelfItem} onNotify={onNotify} />
        ))}
      </ul>
    </div>
  )
}

export default function FoodShellMobile({ ledger, view, onViewChange, userName, storeName, role, onExit, onNotify }) {
  const { trackRef, pillRef } = useSegmentedPill(view)
  const bodyRef = useRef(null)
  const counts = ledger.counts
  const today = ledger.today
  const canEdit = role === 'manager' || role === 'admin'

  useEffect(() => {
    const root = bodyRef.current
    if (!root) return undefined
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined
    const context = gsap.context(() => {
      gsap.from('[data-food-stagger]', {
        y: 14,
        autoAlpha: 0,
        duration: .34,
        stagger: .035,
        ease: 'expo.out',
        clearProps: 'transform,opacity,visibility'
      })
    }, root)
    return () => context.revert()
  }, [view])

  return (
    <div className="food-m-root">
      <header className="food-m-header">
        <div className="food-m-top">
          <button type="button" className="food-m-exit" onClick={onExit} aria-label="返回应用选择">←</button>
          <h1 className="food-m-title">食品台账</h1>
          <span className="food-m-store">{storeName || ''}</span>
        </div>
        <p className="food-m-stats">
          <span data-tone="alert">红标 <b>{counts ? counts.flagged : '—'}</b></span>
          <span>临期 <b>{counts ? counts.soon : '—'}</b></span>
          <span>在库 <b>{counts ? counts.open : '—'}</b></span>
          <span>累计 <b>{counts ? counts.total : '—'}</b></span>
        </p>
      </header>
      <nav className="food-m-segments" ref={trackRef} role="tablist" aria-label="食品台账视图">
        <span className="food-m-segment-pill" ref={pillRef} aria-hidden="true" />
        {VIEWS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            data-active={view === entry.id ? 'true' : 'false'}
            aria-selected={view === entry.id}
            onClick={() => onViewChange(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </nav>
      {ledger.error ? <p className="food-m-alert" role="status">{ledger.error}</p> : null}
      <main className="food-m-body" ref={bodyRef}>
        {view === 'todo' ? <TodoView ledger={ledger} today={today} onNotify={onNotify} /> : null}
        {view === 'batches' ? <BatchesView ledger={ledger} today={today} onNotify={onNotify} /> : null}
        {view === 'entry' ? <EntryView ledger={ledger} today={today} userName={userName} onNotify={onNotify} /> : null}
        {view === 'shelf' ? <ShelfView ledger={ledger} today={today} canEdit={canEdit} onNotify={onNotify} /> : null}
      </main>
    </div>
  )
}
