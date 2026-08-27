import { useEffect, useId, useRef } from 'react'
import IconClose from '@iconoir/Xmark.mjs'

export default function AppDialog({ open, onClose, title, eyebrow, description, children, className = '', dismissible = true }) {
  const dialogRef = useRef(null)
  const closeRef = useRef(null)
  const restoreFocusRef = useRef(null)
  const reactId = useId()
  const titleId = `dialog-${reactId.replace(/[^a-z0-9]/giu, '')}`

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return undefined
    if (open && !dialog.open) {
      restoreFocusRef.current = document.activeElement
      document.body.classList.add('dialog-open')
      dialog.showModal()
      window.requestAnimationFrame(() => (dialog.querySelector('[data-autofocus]') || closeRef.current || dialog.querySelector('button, input, textarea'))?.focus())
    } else if (!open && dialog.open) {
      // Amicro 风格退场：先播面板出场动画，再真正关闭原生 dialog
      const panel = dialog.querySelector('[data-dialog-panel]')
      if (panel) panel.dataset.closing = 'true'
      dialog.dataset.closing = 'true'
      const closeTimer = window.setTimeout(() => {
        if (panel) delete panel.dataset.closing
        delete dialog.dataset.closing
        dialog.close()
      }, 210)
      return () => {
        window.clearTimeout(closeTimer)
        if (panel) delete panel.dataset.closing
        delete dialog.dataset.closing
        document.body.classList.remove('dialog-open')
      }
    }
    return () => document.body.classList.remove('dialog-open')
  }, [open])

  const handleClose = () => { if (dismissible) onClose?.() }

  return (
    <dialog
      ref={dialogRef}
      className={`app-dialog ${className}`.trim()}
      aria-labelledby={titleId}
      aria-describedby={description ? `${titleId}-description` : undefined}
      onCancel={(event) => { event.preventDefault(); handleClose() }}
      onClose={() => {
        window.requestAnimationFrame(() => restoreFocusRef.current?.focus?.())
        if (open && dismissible) onClose?.()
      }}
      onClick={(event) => { if (event.target === dialogRef.current) handleClose() }}
    >
      <div className="dialog-panel" data-dialog-panel>
        <header className="dialog-header">
          <div>{eyebrow ? <p>{eyebrow}</p> : null}<h2 id={titleId}>{title}</h2></div>
          {dismissible ? <button ref={closeRef} type="button" className="icon-button" onClick={handleClose} aria-label="关闭对话框"><IconClose width={22} height={22} aria-hidden="true" /></button> : null}
        </header>
        {description ? <p id={`${titleId}-description`} className="dialog-description">{description}</p> : null}
        <div className="dialog-content">{children}</div>
      </div>
    </dialog>
  )
}
