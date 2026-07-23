import IconUndo from '@iconoir/UndoAction.mjs'
import EventAuditMeta from '../EventAuditMeta.jsx'
import SignalTaskState from '../SignalTaskState.jsx'
import AppDialog from './AppDialog.jsx'

function formatTime(value) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))
}

export default function OperationHistoryDialog({ open, onClose, title, events = [], canUndo, onUndo, onNotify, signalModule = 'other' }) {
  const undo = async (event) => {
    const result = await onUndo(event)
    if (!result?.ok) return onNotify?.({ message: result?.error || '撤回失败。', tone: 'error' })
    onNotify?.(`已撤回：${event.label}`)
  }

  return (
    <AppDialog open={open} onClose={onClose} title={title || '操作记录'} eyebrow="HISTORY · 操作记录" description="按时间查看操作用户、具体动作和状态变化。只有当前仍可安全恢复的最近操作会显示撤回按钮。" signalModule={signalModule} registration="HISTORY / TRACE">
      {events.length ? (
        <ol className="event-log operation-history">
          {events.map((event) => (
            <li key={event.id} data-undone={event.undoneAt ? 'true' : undefined}>
              <time dateTime={event.at}>{formatTime(event.at)}</time>
              <span><EventAuditMeta event={event} /><strong>{event.label}</strong><small>{event.undoneAt ? '该操作已撤回' : event.message}</small></span>
              {canUndo(event) ? <button type="button" className="history-undo" onClick={() => void undo(event)}><IconUndo width={18} height={18} aria-hidden="true" />撤回</button> : null}
            </li>
          ))}
        </ol>
      ) : (
        <SignalTaskState title="还没有操作记录" description="新增、编辑、删除、维修完毕、上架、售出或取车后，记录会显示在这里。" />
      )}
    </AppDialog>
  )
}
