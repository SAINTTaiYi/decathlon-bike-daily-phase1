import { useEffect, useMemo, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { computeFoodDates, isFoodBatchFlagged } from '@bike-ops/domain'
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
 * 信息架构（2026-09-14 按用户反馈重排）：
 *   顶部 = 三个状态大数字（红标 / 临期 / 在库，点一下即按该状态筛选）
 *        + 一个「登记入库」主按钮（最常用的动作，永远在最显眼的位置）
 *   中部 = 两个内容页签（批次 / 清单）—— 登记不再是页签，它是动作不是内容
 *   列表 = 状态 / 品类筛选 + 排序 + 搜索，行内点开才出现处理按钮
 *
 * 排序默认「最新登记」：门店补货时第一眼要看的是刚登记了什么，而不是最早的。
 * 切到「红标」时自动改成「预警最近」——清查场景要的是最紧急的排最前。
 */

const VIEWS = [
  { id: 'batches', label: '批次' },
  { id: 'shelf', label: '清单' }
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
    <div className="food-m-sort" ref={rootRef}>
      <button type="button" className="food-m-sort-trigger" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        排序：{current.label}
        <span aria-hidden="true">▾</span>
      </button>
      {open ? (
        <div className="food-m-sort-menu" role="listbox" aria-label="排序方式">
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

function RowActions({ batch, syncing, onHandle }) {
  const ref = useRef(null)
  useEffect(() => {
    const node = ref.current
    if (!node) return undefined
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined
    // 小面积展开，位移 + 透明度即可（大表面才禁的就是 scale/blur，这里本就没用）。
    const tween = gsap.fromTo(node, { autoAlpha: 0, y: -6 }, { autoAlpha: 1, y: 0, duration: .22, ease: 'expo.out', clearProps: 'transform,opacity,visibility' })
    return () => tween.kill()
  }, [])
  return (
    <div className="food-m-batch-actions" ref={ref}>
      {batch.status === 'open' ? (
        <>
          <button type="button" data-act="sold-out" disabled={syncing} onClick={() => void onHandle(batch, 'sold_out')}>已售罄</button>
          <button type="button" data-act="isolate" disabled={syncing} onClick={() => void onHandle(batch, 'isolated')}>隔离</button>
        </>
      ) : (
        <button type="button" data-act="reopen" disabled={syncing} onClick={() => void onHandle(batch, 'open')}>撤销处理，恢复在库</button>
      )}
    </div>
  )
}

function BatchRow({ batch, today, syncing, expanded, onToggle, onHandle }) {
  const urgency = urgencyLevel(batch.expiresOn, today)
  const needsAction = isFoodBatchFlagged(batch, today)
  const closed = batch.status !== 'open'
  return (
    <li className="food-m-batch-row" data-food-stagger data-stage={batchStageLabel(batch, today)} data-expanded={expanded ? 'true' : 'false'}>
      <button type="button" className="food-m-batch-tap" aria-expanded={expanded} onClick={onToggle}>
        <span className="food-m-batch-main">
          <strong>{batch.itemName}</strong>
          <span className="food-m-batch-meta">{batch.itemCode} · {batch.quantity} 件</span>
          <span className="food-m-batch-meta" data-tone="dates">收货 {shortDate(batch.receivedDate, today)} · 到期 {shortDate(batch.expiresOn, today)}</span>
        </span>
        <span className="food-m-batch-side">
          <span className="food-m-batch-days" data-urgency={urgency}>{remainingLabel(batch.expiresOn, today)}</span>
          {closed ? <span className="food-m-batch-status" data-status={batch.status}>{FOOD_STATUS_LABEL[batch.status] || batch.status}</span>
            : needsAction ? <span className="food-m-batch-status" data-status="flagged">待处理</span> : null}
        </span>
      </button>
      {expanded ? <RowActions batch={batch} syncing={syncing} onHandle={onHandle} /> : null}
    </li>
  )
}

function BatchesView({ ledger, today, onNotify }) {
  const { batches, loading, syncing, hasMore, loadMore, filter, focusFilter, sort, setSort, kind, setKind, query, setQuery, handle } = ledger
  const [expandedId, setExpandedId] = useState('')

  const onHandle = async (batch, status) => {
    const result = await handle(batch, status)
    if (result.ok) setExpandedId('')
    onNotify?.(result.ok
      ? (status === 'sold_out' ? '已标记售罄' : status === 'isolated' ? '已标记隔离' : '已恢复在库')
      : { message: result.message, tone: 'error' })
    return result
  }

  return (
    <div className="food-m-batches">
      <div className="food-m-toolbar">
        <div className="food-m-chips" role="group" aria-label="按状态筛选">
          {FILTERS.map((entry) => (
            <button key={entry.id} type="button" data-active={filter === entry.id ? 'true' : 'false'} onClick={() => focusFilter(entry.id)}>{entry.label}</button>
          ))}
        </div>
      </div>
      <div className="food-m-toolbar">
        <div className="food-m-chips" role="group" aria-label="按品类筛选">
          {KINDS.map((entry) => (
            <button key={entry.id || 'all'} type="button" data-active={kind === entry.id ? 'true' : 'false'} onClick={() => setKind(entry.id)}>{entry.label}</button>
          ))}
        </div>
        <SortMenu sort={sort} onChange={setSort} />
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
      {!loading && !batches.length ? (
        <div className="food-m-empty">
          <strong>这里还没有批次</strong>
          <span>{filter === 'flagged' ? '没有红标待处理，按 SOP 每周一清查一遍即可。' : '换一个筛选条件，或点上方「登记入库」新增。'}</span>
        </div>
      ) : null}
      <ul className="food-m-batch-list">
        {batches.map((batch) => (
          <BatchRow
            key={batch.id}
            batch={batch}
            today={today}
            syncing={syncing}
            expanded={expandedId === batch.id}
            onToggle={() => setExpandedId((current) => (current === batch.id ? '' : batch.id))}
            onHandle={onHandle}
          />
        ))}
      </ul>
      {hasMore ? (
        <button type="button" className="food-m-more" onClick={() => void loadMore()} disabled={loading}>加载更多</button>
      ) : null}
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
    // 连续录入：清空商品码与日期，数量回到 1，焦点回商品码
    setItemCode('')
    setDateRaw('')
    setQuantity('1')
    codeRef.current?.focus()
  }

  return (
    <div className="food-m-entry">
      <button type="button" className="food-m-entry-back" onClick={onBack}>← 返回批次列表</button>

      <label className="food-m-field">
        <span>商品码</span>
        <input
          ref={codeRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="扫码或输入商品码"
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
      <p className="food-m-entry-tip">登记完成后商品码会清空并回到输入框，可以接着扫下一件。</p>
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

export default function FoodShellMobile({ ledger, view, onViewChange, userName, storeName, role, onExit, exitLabel = '返回应用选择', onNotify }) {
  const inEntry = view === 'entry'
  const tab = inEntry ? 'batches' : view
  const { trackRef, pillRef } = useSegmentedPill(tab)
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
          <button
            type="button"
            className="food-m-exit"
            onClick={inEntry ? () => onViewChange('batches') : onExit}
            aria-label={inEntry ? '返回批次列表' : exitLabel}
          >←</button>
          <h1 className="food-m-title">{inEntry ? '登记入库' : '食品台账'}</h1>
          <span className="food-m-store">{storeName || ''}</span>
        </div>

        {inEntry ? null : (
          <>
            <div className="food-m-stats" role="group" aria-label="库存状态">
              <button type="button" className="food-m-stat" data-tone="alert" data-active={ledger.filter === 'flagged' ? 'true' : 'false'} onClick={() => ledger.focusFilter('flagged')}>
                <b>{counts ? counts.flagged : '—'}</b><span>红标</span>
              </button>
              <button type="button" className="food-m-stat" data-tone="soon" data-active={ledger.filter === 'soon' ? 'true' : 'false'} onClick={() => ledger.focusFilter('soon')}>
                <b>{counts ? counts.soon : '—'}</b><span>临期</span>
              </button>
              <button type="button" className="food-m-stat" data-active={ledger.filter === 'open' ? 'true' : 'false'} onClick={() => ledger.focusFilter('open')}>
                <b>{counts ? counts.open : '—'}</b><span>在库</span>
              </button>
            </div>
            <button type="button" className="food-m-register" onClick={() => onViewChange('entry')}>＋ 登记入库</button>
            <nav className="food-m-segments" ref={trackRef} role="tablist" aria-label="食品台账视图">
              <span className="food-m-segment-pill" ref={pillRef} aria-hidden="true" />
              {VIEWS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  role="tab"
                  data-active={tab === entry.id ? 'true' : 'false'}
                  aria-selected={tab === entry.id}
                  onClick={() => onViewChange(entry.id)}
                >
                  {entry.label}
                </button>
              ))}
            </nav>
          </>
        )}
      </header>

      {ledger.error ? <p className="food-m-alert" role="status">{ledger.error}</p> : null}

      <main className="food-m-body" ref={bodyRef}>
        {inEntry ? <EntryView ledger={ledger} today={today} userName={userName} onNotify={onNotify} onBack={() => onViewChange('batches')} /> : null}
        {!inEntry && tab === 'batches' ? <BatchesView ledger={ledger} today={today} onNotify={onNotify} /> : null}
        {!inEntry && tab === 'shelf' ? <ShelfView ledger={ledger} canEdit={canEdit} onNotify={onNotify} /> : null}
      </main>
    </div>
  )
}
