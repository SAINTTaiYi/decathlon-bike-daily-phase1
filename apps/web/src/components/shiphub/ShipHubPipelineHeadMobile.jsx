import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import IconRefresh from '@iconoir/Refresh.mjs'

/* 待取车整合看板 · 移动端页头。
 *
 * 移动端专属实现（桌面见 ShipHubPipelineHeadDesktop）：竖排紧凑——
 * 标题行 + 同步时间一行、分段切换横向滑动一行。三类计数常驻在分段标签上，
 * 所以合并成一块之后仍然一眼能看出另外两类有没有货。
 */
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false

export default function ShipHubPipelineHeadMobile({
  segments = [],
  activeCategory,
  onSelect,
  syncLabel = '',
  stale = false,
  syncing = false,
  reconnecting = false,
  loading = false,
  onSync
}) {
  const iconRef = useRef(null)
  const spinRef = useRef(null)
  useEffect(() => {
    const icon = iconRef.current
    if (!icon) return undefined
    if ((syncing || loading) && !reducedMotion()) {
      spinRef.current?.kill()
      spinRef.current = gsap.to(icon, { rotation: 360, duration: .9, ease: 'none', repeat: -1 })
    } else {
      spinRef.current?.kill()
      spinRef.current = null
      gsap.set(icon, { clearProps: 'rotation,transform' })
    }
    return () => { spinRef.current?.kill(); spinRef.current = null }
  }, [syncing, loading])

  // 分段指示条跟随当前分类滑动
  const listRef = useRef(null)
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const active = list.querySelector('[data-active="true"]')
    if (!active) return
    if (reducedMotion()) return
    gsap.fromTo(active, { scale: .96 }, { scale: 1, duration: .32, ease: 'back.out(2.2)', clearProps: 'transform' })
  }, [activeCategory])

  return (
    <header className="shiphub-pipeline-head" data-surface="mobile">
      <div className="shiphub-pipeline-titlerow">
        <h2 id="shiphub-pipeline-title" className="shiphub-pipeline-title">待取车</h2>
        <button
          type="button"
          className="shiphub-order-sync"
          onClick={onSync}
          disabled={syncing || reconnecting}
          aria-label={reconnecting ? '正在重连 Shiphub' : (syncing ? '正在同步 Shiphub' : '同步 Shiphub')}
        >
          <span ref={iconRef} className="shiphub-order-sync-icon" aria-hidden="true"><IconRefresh /></span>
          <span>{reconnecting ? '重连中' : (syncing ? '同步中' : '同步')}</span>
        </button>
      </div>
      <p className="shiphub-pipeline-synced" data-stale={stale ? 'true' : 'false'} role="status">
        {syncLabel}{stale ? ' · 数据可能已过期' : ''}
      </p>
      <div ref={listRef} className="shiphub-pipeline-segments" role="tablist" aria-label="待取车分类">
        {segments.map((segment) => (
          <button
            key={segment.category}
            type="button"
            role="tab"
            className="shiphub-pipeline-segment"
            data-active={segment.category === activeCategory ? 'true' : 'false'}
            aria-selected={segment.category === activeCategory}
            onClick={() => onSelect?.(segment.category)}
          >
            <span className="shiphub-pipeline-segment-label">{segment.label}</span>
            <span className="shiphub-pipeline-segment-count" data-empty={segment.count ? 'false' : 'true'}>{segment.count}</span>
          </button>
        ))}
      </div>
    </header>
  )
}
