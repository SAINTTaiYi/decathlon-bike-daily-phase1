import { useEffect, useId, useRef } from 'react'
import { gsap } from 'gsap'
import IconClose from '@iconoir/Xmark.mjs'

// 全站对话框基座：进/出场均为 GSAP 时间线（无 CSS keyframes）。
// - 入场：面板 fade-up（18px 位移，expo.out）+ backdrop 由 CSS 变量
//   --dialog-backdrop-o 驱动淡入（::backdrop 伪元素无法直接 tween，
//   GSAP 对挂载元素 tween CSS 变量、伪元素继承即可）。
// - 退场：面板 fade-down + backdrop 淡出，完成后才真正 dialog.close()。
// - 退场途中重开：打断退场时间线（close 不再触发），直接重播入场。
// - reduced-motion：直开直关，不播 tween。
// 文字安全：面板只动位移与透明度，不用 scale/rotateX（分数缩放会让
// 文字重栅格化，动画结束移除 transform 时“跳回清晰”即抽搐）。
export default function AppDialog({ open, onClose, title, eyebrow, description, children, className = '', dismissible = true }) {
  const dialogRef = useRef(null)
  const closeRef = useRef(null)
  const restoreFocusRef = useRef(null)
  const timelineRef = useRef(null)
  const reactId = useId()
  const titleId = `dialog-${reactId.replace(/[^a-z0-9]/giu, '')}`

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return undefined
    const panel = dialog.querySelector('[data-dialog-panel]')
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    if (open) {
      if (!dialog.open) {
        restoreFocusRef.current = document.activeElement
        dialog.showModal()
      } else {
        // 退场被重开打断：kill 后 close 回调不再触发，dialog 保持打开
        timelineRef.current?.kill()
      }
      document.body.classList.add('dialog-open')
      window.requestAnimationFrame(() => (dialog.querySelector('[data-autofocus]') || closeRef.current || dialog.querySelector('button, input, textarea'))?.focus())
      if (reduced || !panel) {
        timelineRef.current?.kill()
        gsap.set(dialog, { '--dialog-backdrop-o': 1 })
        if (panel) gsap.set(panel, { clearProps: 'transform,opacity,visibility' })
      } else {
        const timeline = gsap.timeline()
          .fromTo(panel,
            { autoAlpha: 0, y: 18 },
            { autoAlpha: 1, y: 0, duration: .34, ease: 'expo.out', clearProps: 'transform,opacity,visibility' },
            0
          )
          .fromTo(dialog,
            { '--dialog-backdrop-o': 0 },
            { '--dialog-backdrop-o': 1, duration: .3, ease: 'power2.out' },
            0
          )
        timelineRef.current = timeline
      }
      return () => {
        timelineRef.current?.kill()
        document.body.classList.remove('dialog-open')
      }
    }

    if (dialog.open) {
      if (reduced || !panel) {
        dialog.close()
        return undefined
      }
      timelineRef.current?.kill()
      const timeline = gsap.timeline({ onComplete: () => dialog.close() })
        .to(panel, { autoAlpha: 0, y: 14, duration: .2, ease: 'power2.in' }, 0)
        .to(dialog, { '--dialog-backdrop-o': 0, duration: .22, ease: 'power2.in' }, 0)
      timelineRef.current = timeline
      return () => timeline.kill()
    }
    return undefined
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
