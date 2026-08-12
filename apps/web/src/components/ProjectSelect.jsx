import { useEffect, useId, useRef, useState } from 'react'
import IconNavArrowDown from '@iconoir/NavArrowDown.mjs'

export default function ProjectSelect({
  value,
  options,
  onChange,
  placeholder = '请选择',
  ariaLabel,
  disabled = false,
  compact = false
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const optionRefs = useRef([])
  const listboxId = useId()
  const selectedIndex = options.findIndex((option) => option.value === value)
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null

  useEffect(() => {
    if (disabled) setOpen(false)
  }, [disabled])

  useEffect(() => {
    if (!open) return undefined
    const closeFromOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeFromOutside)
    return () => document.removeEventListener('pointerdown', closeFromOutside)
  }, [open])

  useEffect(() => {
    if (!open) return
    const index = selectedIndex >= 0 ? selectedIndex : 0
    optionRefs.current[index]?.focus()
  }, [open, selectedIndex])

  const choose = (nextValue) => {
    onChange(nextValue)
    setOpen(false)
    window.requestAnimationFrame(() => triggerRef.current?.focus())
  }

  const onTriggerKeyDown = (event) => {
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      setOpen(false)
      return
    }
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault()
      if (!open) setOpen(true)
    }
  }

  const onOptionKeyDown = (event, index) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      triggerRef.current?.focus()
      return
    }
    if (event.key === 'Tab') {
      setOpen(false)
      return
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? options.length - 1
        : event.key === 'ArrowDown'
          ? (index + 1) % options.length
          : (index - 1 + options.length) % options.length
    optionRefs.current[nextIndex]?.focus()
  }

  return (
    <div
      ref={rootRef}
      className="project-select"
      data-open={open ? 'true' : undefined}
      data-value={value || undefined}
      data-compact={compact ? 'true' : undefined}
    >
      <button
        ref={triggerRef}
        type="button"
        className="project-select-trigger"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={onTriggerKeyDown}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
      >
        <span data-placeholder={!selected ? 'true' : undefined}>{selected?.label || placeholder}</span>
        <IconNavArrowDown width={18} height={18} aria-hidden="true" />
      </button>
      {open ? (
        <div className="project-select-menu" id={listboxId} role="listbox" aria-label={ariaLabel}>
          {options.map((option, index) => (
            <button
              key={option.value}
              ref={(node) => { optionRefs.current[index] = node }}
              type="button"
              className="project-select-option"
              role="option"
              data-value={option.value}
              aria-selected={option.value === value}
              data-selected={option.value === value ? 'true' : undefined}
              onClick={() => choose(option.value)}
              onKeyDown={(event) => onOptionKeyDown(event, index)}
            >
              <span>{option.label}</span>
              <strong aria-hidden="true">{option.value === value ? '已选' : String(index + 1).padStart(2, '0')}</strong>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
