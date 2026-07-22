import IconClock from '@iconoir/Clock.mjs'
import IconFlash from '@iconoir-solid/Flash.mjs'
import IconDatabase from '@iconoir/Database.mjs'
import IconCheck from '@iconoir-solid/CheckCircle.mjs'
import IconWarning from '@iconoir-solid/WarningTriangle.mjs'

const icons = {
  pending: IconClock,
  active: IconFlash,
  complete: IconCheck,
  danger: IconWarning,
  neutral: IconDatabase
}

export default function SignalStateMark({ tone = 'neutral', children, compact = false }) {
  const Icon = icons[tone] || icons.neutral
  return (
    <span className="signal-state-mark" data-tone={tone} data-compact={compact ? 'true' : undefined}>
      <Icon width={compact ? 12 : 14} height={compact ? 12 : 14} data-signal-icon={['active', 'complete', 'danger'].includes(tone) ? 'filled' : 'outline'} aria-hidden="true" />
      <span>{children}</span>
    </span>
  )
}

export function SignalModuleMetrics({ items = [], ariaLabel = '模块实时指标' }) {
  const visible = items.filter((item) => item && item.value !== undefined && item.value !== null)
  if (!visible.length) return null
  return (
    <dl className="signal-module-metrics" aria-label={ariaLabel}>
      {visible.map(({ label, value, meta }) => {
        const displayValue = typeof value === 'number' ? String(value).padStart(2, '0') : value
        return (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{displayValue}</dd>
            {meta ? <small>{meta}</small> : null}
          </div>
        )
      })}
    </dl>
  )
}
