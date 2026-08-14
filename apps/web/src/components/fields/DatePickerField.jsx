import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import IconCalendar from '@iconoir/Calendar.mjs'

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']
const MONTH_NAMES = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

function toKey(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function parseKey(value) {
  if (!value) return null
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/u)
  if (!match) return null
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate()
}

function firstWeekday(year, month) {
  // Week starts on Monday (getDay(): 0=Sun … 6=Sat)
  const weekday = new Date(year, month - 1, 1).getDay()
  return weekday === 0 ? 6 : weekday - 1
}

function buildGrid(year, month) {
  const offset = firstWeekday(year, month)
  const total = daysInMonth(year, month)
  const cells = []
  for (let index = 0; index < offset; index += 1) cells.push(null)
  for (let day = 1; day <= total; day += 1) cells.push({ day, key: toKey(year, month, day) })
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

function displayValue(value) {
  const parsed = parseKey(value)
  if (!parsed) return ''
  return `${parsed.year}.${String(parsed.month).padStart(2, '0')}.${String(parsed.day).padStart(2, '0')}`
}

/**
 * Brand-styled date picker replacing the native <input type="date">.
 * Desktop: a small anchored popover. Mobile: a bottom sheet.
 *
 * 实现要点：不使用嵌套模态对话框——嵌套模态在 iOS Safari 与 Android
 * Chrome 上会在打开瞬间触发关闭（面板闪现即消失）。改为与 MemberSelectSheet
 * 一致的 portal 浮层：portal 进最近的 dialog（盖住编辑弹窗的内容）或 body，
 * 关闭只由三个明确动作触发：点背景、Escape、选中日期。
 */
export default function DatePickerField({ value = '', onChange, placeholder = '选择日期', min = '', max = '', clearable = false, required = false, disabled = false, ariaLabel = '选择日期', id }) {
  const triggerRef = useRef(null)
  const panelRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState(null)
  const today = useMemo(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate(), key: toKey(now.getFullYear(), now.getMonth() + 1, now.getDate()) }
  }, [])
  const initial = parseKey(value) || today
  const [view, setView] = useState({ year: initial.year, month: initial.month })

  const openPanel = () => {
    if (disabled) return
    setView(parseKey(value) || today)
    const rect = triggerRef.current?.getBoundingClientRect()
    const coarse = window.matchMedia('(max-width: 640px)').matches
    if (rect && !coarse) {
      const width = Math.max(296, Math.min(rect.width, window.innerWidth - 16))
      setAnchor({ left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), top: rect.bottom + 8, width })
    } else {
      setAnchor(null)
    }
    setOpen(true)
  }
  const closePanel = () => setOpen(false)

  useEffect(() => {
    if (!open) return undefined
    const previous = document.activeElement
    const timer = window.setTimeout(() => panelRef.current?.focus({ preventScroll: true }), 0)
    const onKeyDown = (event) => {
      if (event.key === 'Escape') closePanel()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('keydown', onKeyDown)
      previous?.focus?.({ preventScroll: true })
    }
  }, [open])

  const grid = buildGrid(view.year, view.month)
  const inRange = (key) => (!min || key >= min) && (!max || key <= max)
  const shift = (delta) => {
    setView((current) => {
      const date = new Date(current.year, current.month - 1 + delta, 1)
      return { year: date.getFullYear(), month: date.getMonth() + 1 }
    })
  }
  const select = (key) => {
    if (!inRange(key)) return
    onChange?.(key)
    closePanel()
  }
  const triggerText = value ? displayValue(value) : placeholder

  // 在编辑弹窗等 <dialog> 内使用时，浮层要渲染进 dialog 自身才能盖住顶层内容。
  const portalTarget = typeof document === 'undefined' ? null : (triggerRef.current?.closest('dialog') || document.body)

  return (
    <span className="date-picker-field" data-open={open ? 'true' : undefined} data-disabled={disabled ? 'true' : undefined}>
      <button type="button" ref={triggerRef} className="date-picker-trigger" id={id} aria-haspopup="dialog" aria-expanded={open} aria-label={ariaLabel} disabled={disabled} onClick={openPanel}>
        <IconCalendar width={16} height={16} aria-hidden="true" />
        <span data-empty={!value ? 'true' : undefined}>{triggerText}</span>
        {required ? <em className="date-picker-required" aria-hidden="true">*</em> : null}
      </button>
      {open && portalTarget ? createPortal(
        <div className="date-picker-layer">
          <div className="date-picker-backdrop" aria-hidden="true" onClick={closePanel} />
          <section
            ref={panelRef}
            className="date-picker-panel"
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            tabIndex={-1}
            style={anchor ? { position: 'fixed', left: `${anchor.left}px`, top: `${anchor.top}px`, width: `${anchor.width}px` } : undefined}
          >
            <header className="date-picker-head">
              <button type="button" className="date-picker-nav" onClick={() => shift(-1)} aria-label="上一个月">‹</button>
              <strong>{view.year} 年 {MONTH_NAMES[view.month - 1]}</strong>
              <button type="button" className="date-picker-nav" onClick={() => shift(1)} aria-label="下一个月">›</button>
            </header>
            <div className="date-picker-weekdays" aria-hidden="true">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>
            <div className="date-picker-grid">
              {grid.map((cell, index) => (cell ? (
                <button
                  type="button"
                  key={cell.key}
                  className="date-picker-day"
                  data-today={cell.key === today.key ? 'true' : undefined}
                  data-selected={cell.key === value ? 'true' : undefined}
                  data-disabled={!inRange(cell.key) ? 'true' : undefined}
                  disabled={!inRange(cell.key)}
                  onClick={() => select(cell.key)}
                  aria-label={`${view.year}年${view.month}月${cell.day}日`}
                  aria-pressed={cell.key === value}
                >
                  {cell.day}
                </button>
              ) : <span key={`blank-${index}`} className="date-picker-blank" aria-hidden="true" />))}
            </div>
            <footer className="date-picker-foot">
              <button type="button" className="date-picker-today" onClick={() => select(today.key)} disabled={!inRange(today.key)}>今天</button>
              {clearable ? <button type="button" className="date-picker-clear" onClick={() => { onChange?.(''); closePanel() }}>清除</button> : null}
            </footer>
          </section>
        </div>,
        portalTarget
      ) : null}
    </span>
  )
}
