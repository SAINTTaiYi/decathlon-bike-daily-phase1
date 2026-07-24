import EventAuditMeta from '../EventAuditMeta.jsx'
import AppDialog from './AppDialog.jsx'

export default function LogDialog({ open, onClose, events }) {
  const time = (value) => new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value))
  return (
    <AppDialog open={open} onClose={onClose} title="当日日志" eyebrow="LOG · 数据库审计" description="记录当前门店今天的销售数据、台账操作、真实登录账号、撤回和闭店事件；多设备共享。">
      {events.length ? <ol className="event-log">{events.map((event) => <li key={event.id}><time dateTime={event.at}>{time(event.at)}</time><span><EventAuditMeta event={event} /><strong>{event.label}</strong><small>{event.message}</small></span></li>)}</ol> : <div className="dialog-empty"><strong>还没有操作记录</strong><p>保存销售数据或修改业务台账后，记录会显示在这里。</p></div>}
    </AppDialog>
  )
}
