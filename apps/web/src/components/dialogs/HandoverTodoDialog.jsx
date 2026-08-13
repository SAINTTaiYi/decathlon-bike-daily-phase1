import { useEffect, useRef } from 'react'
import IconBell from '@iconoir/Bell.mjs'
import IconNavArrowRight from '@iconoir/NavArrowRight.mjs'
import AppDialog from './AppDialog.jsx'

export default function HandoverTodoDialog({ open, items = [], onJump, onClose }) {
  const listRef = useRef(null)
  useEffect(() => {
    if (open) listRef.current?.focus({ preventScroll: true })
  }, [open])
  return (
    <AppDialog open={open} onClose={onClose} title="交接待办" eyebrow="HANDOVER TODO" description="同事在闭店时把以下事项 @ 给了你，处理后完成交接。" className="handover-todo-dialog">
      <div className="handover-todo-content">
        <ul ref={listRef} className="handover-todo-list" tabIndex={-1} aria-label="分配给我的待办事项">
          {items.map((item) => (
            <li key={item.id}>
              <button type="button" onClick={() => onJump(item)}>
                <span className="handover-todo-scene">{item.sceneLabel}</span>
                <strong>{item.title}</strong>
                {item.assignerName ? <small>由 {item.assignerName} 指定</small> : null}
                <IconNavArrowRight width={18} height={18} aria-hidden="true" />
              </button>
            </li>
          ))}
          {!items.length ? <li className="handover-todo-empty">没有待办事项。</li> : null}
        </ul>
        <footer className="handover-todo-foot">
          <button type="button" className="handover-todo-later" onClick={onClose}>稍后再说</button>
        </footer>
      </div>
    </AppDialog>
  )
}
