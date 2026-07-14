import { lookbookScenes } from '../../data/lookbookScenes.js'

export default function ActionDock({ activeScene, onJump, closedAt }) {
  return (
    <nav className="look-dock" aria-label="全部日报模块" data-motion="dock">
      <ul>
        {lookbookScenes.map(({ id, no, cn, NavIcon }) => (
          <li key={id}>
            <button type="button" data-active={id === activeScene} onClick={() => onJump(id)} aria-current={id === activeScene ? 'page' : undefined} aria-label={`LOOK ${no} ${cn}`}>
              <NavIcon width={22} height={22} strokeWidth={1.65} aria-hidden="true" /><small>{no}</small>
            </button>
          </li>
        ))}
      </ul>
      <span className="dock-status" data-closed={closedAt ? 'true' : 'false'}>{closedAt ? 'CLOSED' : 'OPEN'}</span>
    </nav>
  )
}
