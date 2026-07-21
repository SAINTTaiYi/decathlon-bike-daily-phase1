import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import IconCalendar from '@iconoir/Calendar.mjs'
import IconCheck from '@iconoir/Check.mjs'
import IconEdit from '@iconoir/EditPencil.mjs'
import IconJournal from '@iconoir/Journal.mjs'
import IconPhone from '@iconoir/Phone.mjs'
import IconPlus from '@iconoir/Plus.mjs'
import IconTrash from '@iconoir/Trash.mjs'
import ProjectSelect from '../ProjectSelect.jsx'
import {
  decodePickupContact,
  inferPickupNotificationStatus,
  inferPickupSource,
  PICKUP_NOTIFICATION_STATUSES,
  pickupContactLabel,
  pickupSourceLabel,
  selfPickupPlatformLabel
} from '../../data/pickupRecord.js'
import {
  formatScanDate,
  formatTicketNumber,
  joinMaintenanceLine,
  displayContactValue
} from '../../data/recordPresentation.js'

const swipeActionWidth = 92
const interactiveSelector = 'button, input, textarea, select, [contenteditable="true"], [role="combobox"]'
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

function Badge({ children }) {
  if (!children) return null
  return <span className="record-badge">{children}</span>
}

function usePixelGrid(overlayRef, density = 'fine') {
  const [grid, setGrid] = useState(null)

  useLayoutEffect(() => {
    const overlay = overlayRef.current
    if (!overlay) return undefined
    const measure = () => {
      const rect = overlay.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      const size = density === 'micro'
        ? (rect.width < 520 ? 15 : 19)
        : density === 'coarse'
          ? (rect.width < 520 ? 22 : 28)
          : (rect.width < 520 ? 17 : 21)
      const columns = Math.ceil(rect.width / size)
      const rows = Math.ceil(rect.height / size)
      setGrid((current) => current?.columns === columns && current?.rows === rows && current?.size === size
        ? current
        : { columns, rows, size })
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(overlay)
    return () => observer?.disconnect()
  }, [density, overlayRef])

  return grid
}

function PickupPixelFill({ recordId, onComplete }) {
  const overlayRef = useRef(null)
  const completedRef = useRef(false)
  const grid = usePixelGrid(overlayRef)

  useLayoutEffect(() => {
    const overlay = overlayRef.current
    if (!overlay || !grid || completedRef.current) return undefined
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const pixels = [...overlay.querySelectorAll('[data-pickup-pixel]')]
    if (reduced) {
      completedRef.current = true
      window.queueMicrotask(() => onComplete(recordId))
      return undefined
    }
    const timeline = gsap.timeline({
      defaults: { overwrite: 'auto' },
      onComplete: () => {
        completedRef.current = true
        onComplete(recordId)
      }
    })
    timeline
      .set(pixels, { autoAlpha: 0, scale: .72, transformOrigin: '50% 50%' })
      .to(pixels, {
        autoAlpha: 1,
        scale: 1,
        duration: .1,
        ease: 'steps(1)',
        stagger: { grid: [grid.rows, grid.columns], from: 'start', amount: .58 }
      })
    return () => timeline.kill()
  }, [grid, onComplete, recordId])

  const cells = grid ? Array.from({ length: grid.columns * grid.rows }) : []
  return (
    <div
      ref={overlayRef}
      className="pickup-pixel-fill"
      data-pickup-pixel-fill="true"
      aria-hidden="true"
      style={grid ? { '--pickup-pixel-size': `${grid.size}px`, '--pickup-pixel-columns': grid.columns } : undefined}
    >
      {cells.map((_, index) => <i key={index} data-pickup-pixel />)}
    </div>
  )
}

function RepairPixelDissolve({ recordId, onComplete }) {
  const overlayRef = useRef(null)
  const completedRef = useRef(false)
  const grid = usePixelGrid(overlayRef, 'micro')

  useLayoutEffect(() => {
    const overlay = overlayRef.current
    if (!overlay || !grid || completedRef.current) return undefined
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const pixels = [...overlay.querySelectorAll('[data-repair-pixel]')]
    if (reduced) {
      completedRef.current = true
      window.queueMicrotask(() => onComplete(recordId))
      return undefined
    }
    const seeded = (value) => {
      const sample = Math.sin(value * 12.9898) * 43758.5453
      return sample - Math.floor(sample)
    }
    // A slow, strict right-to-left arcade sweep: each black cell is switched transparent, with only a small random offset inside its column band.
    const sweepDuration = 3.15
    const columnJitter = .16
    const departure = pixels.map((pixel, index) => {
      const column = index % grid.columns
      const rightToLeft = (grid.columns - 1 - column) / Math.max(1, grid.columns - 1)
      const at = (rightToLeft * sweepDuration) + (seeded(index + 71) * columnJitter)
      return { pixel, at }
    }).sort((a, b) => a.at - b.at)
    const timeline = gsap.timeline({
      defaults: { overwrite: 'auto' },
      onComplete: () => {
        completedRef.current = true
        onComplete(recordId)
      }
    })
    timeline.set(pixels, { autoAlpha: 1 })
    departure.forEach(({ pixel, at }) => timeline.set(pixel, { autoAlpha: 0 }, at))
    return () => timeline.kill()
  }, [grid, onComplete, recordId])

  const cells = grid ? Array.from({ length: grid.columns * grid.rows }) : []
  return (
    <div
      ref={overlayRef}
      className="repair-pixel-dissolve"
      data-repair-pixel-dissolve="true"
      aria-hidden="true"
      style={grid ? { '--repair-pixel-size': `${grid.size}px`, '--repair-pixel-columns': grid.columns } : undefined}
    >
      {cells.map((_, index) => <i key={index} data-repair-pixel />)}
    </div>
  )
}

function SwipeDeleteRecord({ record, disabled, onRemove, children }) {
  const frameRef = useRef(null)
  const surfaceRef = useRef(null)
  const actionRef = useRef(null)
  const gestureRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const moveSurface = (offset, duration = 0) => {
    const surface = surfaceRef.current
    if (!surface) return
    gsap.killTweensOf(surface, '--swipe-offset')
    if (duration) {
      gsap.to(surface, { '--swipe-offset': offset, duration, ease: 'power3.out', overwrite: 'auto' })
    } else {
      gsap.set(surface, { '--swipe-offset': offset })
    }
  }

  const settle = (nextOpen, duration = .22) => {
    setOpen(nextOpen)
    moveSurface(nextOpen ? -swipeActionWidth : 0, duration)
  }

  useEffect(() => () => {
    gsap.killTweensOf([frameRef.current, surfaceRef.current])
  }, [])

  useEffect(() => {
    if (disabled) settle(false, .16)
  }, [disabled])

  const onPointerDown = (event) => {
    if (disabled || deleting) return
    if (event.target.closest(interactiveSelector)) return
    gestureRef.current = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      baseOffset: open ? -swipeActionWidth : 0,
      offset: open ? -swipeActionWidth : 0,
      axis: null
    }
  }

  const onPointerMove = (event) => {
    const gesture = gestureRef.current
    if (!gesture || gesture.id !== event.pointerId || deleting) return
    const deltaX = event.clientX - gesture.startX
    const deltaY = event.clientY - gesture.startY
    if (!gesture.axis) {
      if (Math.hypot(deltaX, deltaY) < 7) return
      if (Math.abs(deltaY) >= Math.abs(deltaX)) {
        gesture.axis = 'vertical'
        return
      }
      gesture.axis = 'horizontal'
      event.currentTarget.setPointerCapture?.(event.pointerId)
    }
    if (gesture.axis !== 'horizontal') return
    if (event.cancelable) event.preventDefault()
    gesture.offset = clamp(gesture.baseOffset + deltaX, -swipeActionWidth, 0)
    moveSurface(gesture.offset)
  }

  const endGesture = (event, cancelled = false) => {
    const gesture = gestureRef.current
    if (!gesture || gesture.id !== event.pointerId) return
    gestureRef.current = null
    if (gesture.axis !== 'horizontal') return
    settle(cancelled ? open : gesture.offset <= -(swipeActionWidth * .46))
  }

  const onKeyDown = (event) => {
    if (disabled || deleting) return
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      settle(true)
      window.requestAnimationFrame(() => actionRef.current?.focus())
    }
    if (event.key === 'Escape' || event.key === 'ArrowRight') {
      event.preventDefault()
      settle(false)
    }
  }

  const restoreAfterFailure = () => {
    const frame = frameRef.current
    if (!frame) return
    gsap.killTweensOf(frame)
    gsap.set(frame, {
      autoAlpha: 1,
      scaleY: 1,
      y: 0,
      filter: 'none',
      pointerEvents: 'auto',
      '--swipe-glitch': 0
    })
    gsap.fromTo(frame,
      { autoAlpha: .36, y: -5 },
      {
        autoAlpha: 1,
        y: 0,
        duration: .26,
        ease: 'power3.out',
        clearProps: 'transform,opacity,visibility,filter,willChange'
      }
    )
  }

  const playDeleteExit = () => {
    const frame = frameRef.current
    if (!frame) return Promise.resolve()
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduced) return Promise.resolve()
    return new Promise((resolve) => {
      const timeline = gsap.timeline({ onComplete: resolve })
      timeline
        .set(frame, { pointerEvents: 'none', willChange: 'transform, opacity, filter' })
        .to(frame, { '--swipe-glitch': 1, duration: .02 }, 0)
        .to(frame, { autoAlpha: .38, duration: .05 }, .02)
        .to(frame, { autoAlpha: .92, duration: .04 }, .07)
        .to(frame, { autoAlpha: .16, duration: .055 }, .115)
        .to(frame, { autoAlpha: .96, duration: .045 }, .17)
        .to(frame, { filter: 'contrast(1.22) brightness(1.12)', duration: .05 }, .215)
        .to(frame, { autoAlpha: 0, scaleY: .83, y: -8, duration: .32, ease: 'expo.in' }, .27)
    })
  }

  const deleteRecord = async () => {
    if (disabled || deleting) return
    setDeleting(true)
    await playDeleteExit()
    const result = await Promise.resolve(onRemove(record)).catch(() => ({ ok: false }))
    if (result?.ok) return
    restoreAfterFailure()
    setDeleting(false)
    settle(false, .18)
  }

  return (
    <div
      ref={frameRef}
      className="record-swipe-frame"
      data-swipe-delete="true"
      data-open={open ? 'true' : undefined}
      data-deleting={deleting ? 'true' : undefined}
      tabIndex={0}
      role="group"
      aria-label={`${record.title}，左滑或按左方向键显示删除操作`}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endGesture}
      onPointerCancel={(event) => endGesture(event, true)}
    >
      <button
        ref={actionRef}
        type="button"
        className="record-swipe-delete-action"
        onClick={() => void deleteRecord()}
        disabled={disabled || deleting}
        tabIndex={open ? 0 : -1}
        aria-hidden={!open}
        aria-label={`删除：${record.title}`}
      >
        <IconTrash width={18} height={18} aria-hidden="true" />
        <span>删除</span>
      </button>
      <div ref={surfaceRef} className="record-swipe-surface">
        {children}
      </div>
    </div>
  )
}

export default function RecordLedger({
  records = [], config, closedAt, onAdd, onEdit, onRemove, onHistory,
  onHandoverComplete, onPickup, onResaleListing, onResaleSold,
  onRepairComplete, onPickupNotificationChange, pickupErrors = {},
  primaryProcessingId = '', primaryActionBusy = false, pickupPixelFillId = '', onPickupPixelFillComplete,
  repairPixelDissolveId = '', onRepairPixelDissolveComplete,
  heading = 'ACTIVE LEDGER / 在册台账', dark = false, showAdd = true
}) {
  const hasSwipeDelete = !closedAt && records.some((record) => !record.pickedUpToday && !record.completedToday)

  return (
    <div className="record-ledger" data-dark={dark ? 'true' : undefined} aria-label={`${config.singular}台账，共 ${records.length} 条`}>
      <div className="record-ledger-head">
        <div>
          <span>{heading}</span>
          <small>WORKSHOP LEDGER</small>
          {hasSwipeDelete ? <p className="ledger-swipe-hint">左滑记录，点按删除</p> : null}
        </div>
        <strong>{String(records.length).padStart(2, '0')}</strong>
        <div className="ledger-head-actions" data-single={!showAdd ? 'true' : undefined}>
          <button type="button" className="ledger-history" onClick={() => onHistory()}><IconJournal width={17} height={17} aria-hidden="true" />操作记录</button>
          {showAdd ? <button type="button" className="ledger-add" onClick={onAdd} disabled={Boolean(closedAt)}><IconPlus width={17} height={17} aria-hidden="true" />{config.addLabel}</button> : null}
        </div>
      </div>
      {records.length ? records.map((record) => {
        const pickedUp = Boolean(record.pickedUpToday)
        const completedToday = Boolean(record.completedToday)
        const resolved = pickedUp || completedToday
        const deletable = !resolved && !closedAt
        const pickupError = pickupErrors[record.id] || ''
        const pickupRecord = record.scene === 'pickup'
        const primaryProcessing = primaryProcessingId === record.id
        const primaryActionLocked = Boolean(closedAt) || primaryActionBusy
        const pickupPixelFill = pickupPixelFillId === record.id
        const repairPixelDissolve = repairPixelDissolveId === record.id
        const repairRecord = record.scene === 'repair'
        const pickupSource = pickupRecord ? inferPickupSource(record) : ''
        const repairPickup = pickupSource === 'repair'
        const serviceTicket = pickupRecord || repairRecord
        const pickupNotificationStatus = pickupRecord ? inferPickupNotificationStatus(record) : null
        const manualContact = pickupRecord && !repairPickup ? decodePickupContact(record) : null
        const contactType = repairPickup || repairRecord
          ? (record.contactType === 'member' ? 'member' : 'phone')
          : (manualContact?.contactType || 'phone')
        const contactValue = String(
          repairPickup || repairRecord
            ? (record.contactValue ?? '')
            : (manualContact?.contactValue ?? '')
        ).trim()
        const contactLabel = pickupContactLabel(contactType)
        const contactDisplay = contactValue || '无'
        const showContact = repairRecord || pickupRecord
        const detail = String(record.repairProject || record.detail || '').trim()
        const detailLine = joinMaintenanceLine(detail)
        const ticketNumber = formatTicketNumber(record.ticketNo, record.id)
        const sourceLabel = pickupRecord
          ? `${pickupSourceLabel(record)}${selfPickupPlatformLabel(record) ? ` / ${selfPickupPlatformLabel(record)}` : ''}`
          : repairRecord ? '维修登记' : ''
        const stateLabel = pickedUp ? '已取车' : completedToday ? '已完成' : record.status
        const paymentOrType = repairRecord || repairPickup ? record.repairType : ''
        const rowDark = dark || resolved
        const englishState = pickedUp ? 'PICKED UP' : completedToday ? 'COMPLETED' : record.scene === 'resale' && record.resaleStage === 'pending' ? 'PENDING' : 'ACTIVE'
        const primaryButton = (label, onClick) => (
          <button
            type="button"
            className="record-primary-action"
            onClick={onClick}
            disabled={primaryActionLocked}
            data-processing={primaryProcessing ? 'true' : undefined}
            aria-busy={primaryProcessing || undefined}
            aria-label={primaryProcessing ? `${label}，确认中` : label}
          >
            <IconCheck width={15} height={15} aria-hidden="true" />
            <span aria-live="polite">{primaryProcessing ? '确认中…' : label}</span>
          </button>
        )
        const primaryAction = record.scene === 'resale' && record.resaleStage === 'pending'
          ? primaryButton('维修完毕', () => onResaleListing(record))
          : record.scene === 'resale' && record.resaleStage === 'listed'
            ? primaryButton('已售出', () => onResaleSold(record))
            : record.scene === 'repair' && !record.completedOn
              ? primaryButton('维修完毕', () => onRepairComplete(record))
              : record.scene === 'poster' && !record.completedOn
                ? primaryButton('完成', () => onHandoverComplete(record))
                : record.scene === 'pickup' && !pickedUp
                  ? primaryButton('确认取车', () => onPickup(record))
                  : null
        const actionButtons = (
          <>
            {!resolved ? <button type="button" className="record-edit-action" onClick={() => onEdit(record)} disabled={Boolean(closedAt) || primaryProcessing} aria-label={`编辑：${record.title}`}><IconEdit width={15} height={15} aria-hidden="true" />编辑</button> : null}
            {primaryAction}
          </>
        )

        const row = (
          <article className="record-row" data-record-id={record.id} data-service-ticket={serviceTicket ? 'true' : undefined} data-row-dark={rowDark ? 'true' : undefined} data-resolved={resolved ? 'true' : undefined} data-pickup-pixel-filling={pickupPixelFill ? 'true' : undefined} data-repair-pixel-dissolving={repairPixelDissolve ? 'true' : undefined} data-error={pickupError ? 'true' : undefined}>
            {pickupPixelFill ? <PickupPixelFill recordId={record.id} onComplete={onPickupPixelFillComplete} /> : null}
            {repairPixelDissolve ? <RepairPixelDissolve recordId={record.id} onComplete={onRepairPixelDissolveComplete} /> : null}
            <header className="record-row-head">
              <button type="button" className="record-history-mark" onClick={() => onHistory(record)} aria-label={`查看“${record.title}”的操作记录`}><IconJournal width={16} height={16} aria-hidden="true" /></button>
              <div className="record-model-block">
                <strong>{record.title}</strong>
                <span>{ticketNumber}</span>
                {pickupRecord && !pickedUp ? (
                  <div className="record-notify-line">
                    <ProjectSelect value={pickupNotificationStatus} options={PICKUP_NOTIFICATION_STATUSES} onChange={(value) => onPickupNotificationChange(record, value)} disabled={Boolean(closedAt)} ariaLabel={`${record.title}的通知状态`} compact />
                  </div>
                ) : null}
              </div>
              <div className="record-head-meta" aria-label="来源、支付与状态">
                <span className="record-state">{englishState}</span>
                <div className="record-badge-row">
                  <Badge>{sourceLabel}</Badge>
                  <Badge>{paymentOrType}</Badge>
                  <Badge>{stateLabel}</Badge>
                  {!serviceTicket && record.meta ? <Badge>{record.meta}</Badge> : null}
                </div>
              </div>
            </header>

            <div className="record-body">
              {detailLine ? (
                <p className="record-detail-line" aria-label={`维修内容：${detail}`}>
                  {detailLine}
                </p>
              ) : null}

              <div className="record-scan-line">
                {showContact ? (
                  <span className="record-scan-item" title={`${contactLabel} ${contactDisplay}`}>
                    <IconPhone width={14} height={14} aria-hidden="true" />
                    <span>{contactValue ? displayContactValue(contactValue) : '无'}</span>
                  </span>
                ) : null}
                {record.pickupDate ? (
                  <span className="record-scan-item" title={`取车日期 ${record.pickupDate}`}>
                    <IconCalendar width={14} height={14} aria-hidden="true" />
                    <time dateTime={record.pickupDate}>{formatScanDate(record.pickupDate)}</time>
                  </span>
                ) : null}
              </div>

              {pickupError ? <p className="record-inline-error" role="alert">{pickupError}</p> : null}
              {resolved ? <p className="record-resolution-note">{pickedUp ? '本条今日保留，下一业务日自动移除。' : '本条今日保留，下一业务日自动清除。'}</p> : null}
              <footer className="record-actions" data-has-primary={primaryAction ? 'true' : undefined}>{actionButtons}</footer>
            </div>
          </article>
        )

        return deletable
          ? <SwipeDeleteRecord key={record.id} record={record} disabled={Boolean(closedAt) || primaryProcessing} onRemove={onRemove}>{row}</SwipeDeleteRecord>
          : <div key={record.id}>{row}</div>
      }) : <p className="empty-inline">当前没有记录。{showAdd ? `使用“${config.addLabel}”开始录入。` : ''}</p>}
    </div>
  )
}
