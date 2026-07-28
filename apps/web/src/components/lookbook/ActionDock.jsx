import { lookbookScenes } from '../../data/lookbookScenes.js'

const navEnglish = { pulse: 'OVERVIEW', pickup: 'PENDING', poster: 'OTHER', repair: 'REPAIR', resale: 'USED', sales: 'SALES' }

export default function ActionDock({ activeScene, onJump, closedAt }) {
  return (
    <nav className="look-dock" aria-label="全部日报模块" data-motion="dock">
      <ul>
        {lookbookScenes.map(({ id, cn, dock, NavIcon }) => (
          <li key={id}>
            <button type="button" data-active={id === activeScene} onClick={() => onJump(id)} aria-current={id === activeScene ? 'page' : undefined} aria-label={cn}>
              <NavIcon width={20} height={20} strokeWidth={1.65} aria-hidden="true" />
              <span>{dock}</span>
              <small>{navEnglish[id]}</small>
            </button>
          </li>
        ))}
      </ul>
      <span className="dock-status" data-closed={closedAt ? 'true' : 'false'}>{closedAt ? 'CLOSED' : 'OPEN'}</span>
    </nav>
  )
}
