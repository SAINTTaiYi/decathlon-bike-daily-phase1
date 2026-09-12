import { formatEmergencyStamp } from '../../utils/emergencyHandover.js'

// 顶部应急横幅（桌面/移动共用同一「固定槽位」形态，与 .workshop-global-alert 同语义）。
// notice.kind：
//   write  → D1 写额度用尽（数据仍可看；可生成应急交接单）
//   read   → D1 读额度用尽（已退回本机快照）
//   offline→ 网络不可用 / 首次加载失败时的快照提示
const LABELS = {
  write: { title: '数据库写入受限', hint: '· 额度用尽' },
  read: { title: '数据库读取受限', hint: '· 额度用尽' },
  offline: { title: '离线快照', hint: '' }
}

export default function EmergencyStatusBanner({ notice, onOpenEmergency, onDismiss }) {
  if (!notice) return null
  const kind = LABELS[notice.kind] ? notice.kind : 'write'
  const label = LABELS[kind]
  const detail = kind === 'offline'
    ? `当前显示本机最近一次成功加载的数据（${notice.snapshotAt ? formatEmergencyStamp(notice.snapshotAt) : '时间未知'}）。可先生成应急交接单。`
    : (notice.message || '数据库暂时不可用；数据仍可查看，可先生成应急交接单。')
  return (
    <section className="emergency-banner" data-kind={kind} role="status" aria-live="polite">
      <span className="emergency-banner-spark" aria-hidden="true" />
      <div className="emergency-banner-text">
        <strong>{label.title}{label.hint ? ` ${label.hint}` : ''}</strong>
        <small>{detail}</small>
      </div>
      <div className="emergency-banner-actions">
        <button type="button" className="emergency-banner-open" onClick={onOpenEmergency}>应急交接</button>
        {onDismiss ? <button type="button" className="emergency-banner-close" onClick={onDismiss} aria-label="关闭提示">✕</button> : null}
      </div>
    </section>
  )
}
