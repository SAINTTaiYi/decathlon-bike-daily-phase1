import IconJournal from '@iconoir/Journal.mjs'
import IconRefresh from '@iconoir/Refresh.mjs'
import IconCheck from '@iconoir-solid/CheckCircle.mjs'
import IconWarning from '@iconoir-solid/WarningTriangle.mjs'

const toneMeta = {
  empty: { Icon: IconJournal, defaultCode: 'NO MATCH / 00', role: 'status' },
  loading: { Icon: IconRefresh, defaultCode: 'SYNC / ACTIVE', role: 'status' },
  error: { Icon: IconWarning, defaultCode: 'FAULT / CHECK', role: 'alert' },
  success: { Icon: IconCheck, defaultCode: 'DONE / VERIFIED', role: 'status' }
}

export default function SignalTaskState({
  tone = 'empty',
  code,
  title,
  description,
  compact = false,
  children
}) {
  const meta = toneMeta[tone] || toneMeta.empty
  const Icon = meta.Icon

  return (
    <div
      className="signal-task-state"
      data-tone={tone}
      data-compact={compact ? 'true' : undefined}
      role={meta.role}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
    >
      <span className="signal-task-state-mark" aria-hidden="true"><Icon width={22} height={22} /></span>
      <span className="signal-task-state-copy">
        <small>{code || meta.defaultCode}</small>
        <strong>{title}</strong>
        {description ? <p>{description}</p> : null}
      </span>
      {children ? <span className="signal-task-state-action">{children}</span> : null}
    </div>
  )
}
