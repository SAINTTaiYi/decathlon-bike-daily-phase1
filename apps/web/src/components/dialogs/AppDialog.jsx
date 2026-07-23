import { useEffect, useId, useRef } from 'react'
import IconClose from '@iconoir/Xmark.mjs'

export default function AppDialog({ open, onClose, title, eyebrow, description, children, className = '', signalModule = 'other', registration = 'TASK LAYER / ACTIVE' }) {
  const dialogRef = useRef(null)
  const closeRef = useRef(null)
  const restoreFocusRef = useRef(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return undefined

    if (open && !dialog.open) {
      restoreFocusRef.current = document.activeElement
      document.body.classList.add('dialog-open')
      dialog.showModal()
      window.requestAnimationFrame(() => (dialog.querySelector('[data-autofocus]') || closeRef.current)?.focus())
    } else if (!open && dialog.open) {
      dialog.close()
    }

    return () => document.body.classList.remove('dialog-open')
  }, [open])

  const handleClose = () => {
    onClose?.()
  }

  return (
    <dialog
      ref={dialogRef}
      className={`app-dialog ${className}`.trim()}
      data-signal-module={signalModule}
      aria-labelledby={titleId}
      aria-describedby={description ? `${titleId}-description` : undefined}
      onCancel={(event) => { event.preventDefault(); handleClose() }}
      onClose={() => {
        window.requestAnimationFrame(() => restoreFocusRef.current?.focus?.())
        if (open) onClose?.()
      }}
      onClick={(event) => { if (event.target === dialogRef.current) handleClose() }}
    >
      <div className="dialog-panel" data-dialog-panel>
        <header className="dialog-header">
          <div className="dialog-title-block"><div className="dialog-registration"><span>{registration}</span>{eyebrow ? <p>{eyebrow}</p> : null}</div><h2 id={titleId}>{title}</h2></div>
          <button ref={closeRef} type="button" className="icon-button" onClick={handleClose} aria-label="关闭对话框"><IconClose width={22} height={22} aria-hidden="true" /></button>
        </header>
        {description ? <p id={`${titleId}-description`} className="dialog-description">{description}</p> : null}
        <div className="dialog-content">{children}</div>
      </div>
    </dialog>
  )
}
