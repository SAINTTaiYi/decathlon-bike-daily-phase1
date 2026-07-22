import { lookbookScenes } from '../../data/lookbookScenes.js'
import { SIGNAL_ICON_STROKE } from '../../design/signalGrid.js'

export default function ActionDock({ activeScene, onJump, closedAt }) {
  return (
    <nav className="look-dock" aria-label="全部日报模块" data-motion="dock">
      <ul>
        {lookbookScenes.map(({ id, cn, dock, signalModule, NavIcon, ActiveNavIcon }) => {
          const active = id === activeScene
          const DockIcon = active ? ActiveNavIcon : NavIcon
          return (
            <li key={id}>
              <button type="button" data-active={active} data-signal-module={signalModule} onClick={() => onJump(id)} aria-current={active ? 'page' : undefined} aria-label={cn}>
                <DockIcon width={20} height={20} strokeWidth={active ? undefined : SIGNAL_ICON_STROKE} data-signal-icon={active ? 'filled' : 'outline'} aria-hidden="true" />
                <span>{dock}</span>
              </button>
            </li>
          )
        })}
      </ul>
      <span className="dock-status" data-closed={closedAt ? 'true' : 'false'}>{closedAt ? 'CLOSED' : 'OPEN'}</span>
    </nav>
  )
}
