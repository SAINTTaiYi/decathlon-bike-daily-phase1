import { lookbookScenes } from '../../data/lookbookScenes.js'
import { APP_VERSION, currentRelease } from '../../data/releaseNotes.js'

const navEnglish = { pulse: 'OVERVIEW', pickup: 'PENDING', poster: 'OTHER', repair: 'REPAIR', resale: 'USED', sales: 'SALES' }

export default function ActionDock({ activeScene, onJump, closedAt, desktopLayout = false }) {
  const visibleScenes = desktopLayout ? lookbookScenes : lookbookScenes.filter(({ id }) => id !== 'resale')
  const activeIndex = Math.max(0, visibleScenes.findIndex(({ id }) => id === activeScene))
  return (
    <nav className="look-dock" aria-label="全部日报模块" data-motion="dock" style={{ '--dock-active-index': activeIndex }}>
      <span className="dock-active-indicator" aria-hidden="true" />
      <ul>
        {visibleScenes.map(({ id, cn, dock, NavIcon }) => (
          <li key={id}>
            <button type="button" data-active={id === activeScene} onClick={() => onJump(id)} aria-current={id === activeScene ? 'page' : undefined} aria-label={cn}>
              <NavIcon width={20} height={20} strokeWidth={1.65} aria-hidden="true" />
              <span>{dock}</span>
              <small>{navEnglish[id]}</small>
            </button>
          </li>
        ))}
      </ul>
      <details className="dock-release-card">
        <summary aria-label={`查看 V${APP_VERSION} 更新公告`}><strong>V{APP_VERSION}</strong><span>{currentRelease.title}</span><time>{currentRelease.date}</time><b aria-hidden="true">＋</b></summary>
        <div className="dock-release-details"><strong>更新公告</strong><p>{currentRelease.summary}</p><ul>{currentRelease.changes.map((change) => <li key={change}>{change}</li>)}</ul></div>
      </details>
      <span className="dock-status" data-closed={closedAt ? 'true' : 'false'}>{closedAt ? 'CLOSED' : 'OPEN'}</span>
    </nav>
  )
}
