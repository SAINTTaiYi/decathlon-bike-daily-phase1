import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import IconUser from '@iconoir/User.mjs'
import IconErase from '@iconoir/Erase.mjs'

const ROLE_LABELS = { operator: '店员', manager: '主管', admin: '店长' }

export default function MemberSelectSheet({ open, members = [], currentId = '', title = '', onClose, onPick, onClear }) {
  const panelRef = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const previous = document.activeElement
    const scrollY = window.scrollY
    const bodyStyle = document.body.style.cssText
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.width = '100%'
    document.body.style.overflow = 'hidden'
    const timer = window.setTimeout(() => panelRef.current?.focus({ preventScroll: true }), 0)
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.cssText = bodyStyle
      window.scrollTo({ top: scrollY, behavior: 'instant' })
      previous?.focus?.({ preventScroll: true })
    }
  }, [onClose, open])
  if (!open) return null
  return createPortal(
    <div className="member-select-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section ref={panelRef} className="member-select-sheet" role="dialog" aria-modal="true" aria-labelledby="member-select-title" tabIndex={-1}>
        <div className="member-select-handle" aria-hidden="true" />
        <header className="member-select-head">
          <div><span>HANDOVER TO</span><h3 id="member-select-title">选择交接人</h3>{title ? <p>{title}</p> : null}</div>
          <button type="button" onClick={onClose}>关闭</button>
        </header>
        <ul className="member-select-list">
          {members.map((member) => (
            <li key={member.id}>
              <button type="button" data-active={member.id === currentId ? 'true' : undefined} onClick={() => { onPick(member.id); onClose() }}>
                <IconUser width={17} height={17} aria-hidden="true" />
                <span className="member-select-name">{member.displayName}</span>
                <small>{ROLE_LABELS[member.role] || member.role}</small>
                {member.id === currentId ? <em>当前</em> : null}
              </button>
            </li>
          ))}
          {!members.length ? <li className="member-select-empty">本店暂无其他在职成员。</li> : null}
        </ul>
        {currentId ? (
          <footer className="member-select-clear">
            <button type="button" onClick={() => { onClear(); onClose() }}><IconErase width={16} height={16} aria-hidden="true" />清除交接人</button>
          </footer>
        ) : null}
      </section>
    </div>,
    document.body
  )
}
