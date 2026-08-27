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
      // 立即关闭：退出动画（scale 缩小 + 延迟 close）实测会被感知为
      // “先突然缩小、再关掉”的卡顿，且与 workshop-system.css 原有入场动画打架，回退为直关
      dialog.close()
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
