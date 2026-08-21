import { useLayoutEffect, useRef } from 'react'
import { lookbookScenes } from '../../data/lookbookScenes.js'
import { APP_VERSION, currentRelease } from '../../data/releaseNotes.js'

const navEnglish = { pulse: 'OVERVIEW', pickup: 'PENDING', poster: 'OTHER', repair: 'REPAIR', resale: 'USED', sales: 'SALES' }
const desktopLabels = { pulse: '总览', pickup: '待取车辆', poster: '其它交接', repair: '维修交接', resale: '二手台账', sales: '销售数据' }

export default function ActionDock({ activeScene, onJump, closedAt, desktopLayout = false }) {
  const visibleScenes = desktopLayout ? lookbookScenes : lookbookScenes.filter(({ id }) => id !== 'resale')
  const activeIndex = Math.max(0, visibleScenes.findIndex(({ id }) => id === activeScene))
  const dockRef = useRef(null)

  useLayoutEffect(() => {
    if (!desktopLayout) return undefined
    const dock = dockRef.current
    if (!dock) return undefined
    const viewport = window.visualViewport
    let frame = 0

    const apply = () => {
      frame = 0
      const firstButton = dock.querySelector('button')
      if (!firstButton) return
      const viewportBottom = (viewport?.offsetTop || 0) + (viewport?.height || window.innerHeight)
      const dockTop = dock.getBoundingClientRect().top
      const scale = Math.max(0.1, firstButton.getBoundingClientRect().height / 72)
      const availableHeight = Math.max(1, Math.floor((viewportBottom - dockTop - 12) / scale))
      const releaseBottom = dockTop + (764 + 116) * scale
      dock.style.setProperty('--dock-available-height', `${availableHeight}px`)
      dock.dataset.shortViewport = releaseBottom > viewportBottom - 12 ? 'true' : 'false'
    }
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(apply)
    }

    apply()
    window.addEventListener('resize', schedule, { passive: true })
    viewport?.addEventListener('resize', schedule, { passive: true })
    viewport?.addEventListener('scroll', schedule, { passive: true })
    return () => {
      window.removeEventListener('resize', schedule)
      viewport?.removeEventListener('resize', schedule)
      viewport?.removeEventListener('scroll', schedule)
      if (frame) window.cancelAnimationFrame(frame)
      dock.style.removeProperty('--dock-available-height')
      dock.removeAttribute('data-short-viewport')
    }
  }, [desktopLayout])

  return (
    <nav ref={dockRef} className="look-dock" aria-label="全部日报模块" data-motion={desktopLayout ? 'dock' : undefined} style={{ '--dock-active-index': activeIndex }}>
      <span className="dock-active-indicator" aria-hidden="true" />
      <div className="dock-scroll-region">
        <ul>
          {visibleScenes.map(({ id, cn, dock, NavIcon }) => (
            <li key={id}>
              <button type="button" data-active={id === activeScene} onClick={() => onJump(id)} aria-current={id === activeScene ? 'page' : undefined} aria-label={cn}>
                <NavIcon width={20} height={20} strokeWidth={1.65} aria-hidden="true" />
                <span>{desktopLayout ? desktopLabels[id] : dock}</span>
                <small>{navEnglish[id]}</small>
              </button>
            </li>
          ))}
        </ul>
        <details className="dock-release-card">
          <summary aria-label={`查看 V${APP_VERSION} 更新公告`}><strong>V{APP_VERSION}</strong><span>{currentRelease.title}</span><time>{currentRelease.date}</time><b aria-hidden="true">＋</b></summary>
          <div className="dock-release-details"><strong>更新公告</strong><p>{currentRelease.summary}</p><ul>{currentRelease.changes.map((change) => <li key={change}>{change}</li>)}</ul></div>
        </details>
      </div>
      <span className="dock-status" data-closed={closedAt ? 'true' : 'false'}>{closedAt ? 'CLOSED' : 'OPEN'}</span>
    </nav>
  )
}
