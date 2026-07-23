import { lookbookScenes } from '../../data/lookbookScenes.js'

export default function ActionDock({ activeScene, onJump, closedAt }) {
  return (
    <nav className="look-dock signal-module-navigation signal-type-navigation" aria-label="全部日报模块" data-motion="dock">
      <div className="signal-module-navigation-head" aria-hidden="true"><span>MODULE ROUTE</span><strong>06</strong></div>
      <ul>
        {lookbookScenes.map(({ id, no, label, cn, dock, signalModule }) => {
          const active = id === activeScene
          return (
            <li key={id}>
              <button type="button" data-active={active} data-signal-module={signalModule} onClick={() => onJump(id)} aria-current={active ? 'page' : undefined} aria-label={cn}>
                <small>{no}</small>
                <b>{label}</b>
                <span>{dock}</span>
                <i aria-hidden="true" />
              </button>
            </li>
          )
        })}
      </ul>
      <span className="dock-status" data-closed={closedAt ? 'true' : 'false'}>{closedAt ? 'CLOSED' : 'OPEN'}</span>
    </nav>
  )
}
