import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import IconRefresh from '@iconoir/Refresh.mjs'
import { OrderCard } from './ShipHubOrderBoard.jsx'
import useSegmentedPill from '../../hooks/useSegmentedPill.js'

/* 待取车整合看板 · 移动端整面实现（桌面见 ShipHubPipelineDesktop）。
 *
 * 项目规则 memory 23：双端两套独立 DOM，不靠 @media 硬凑。这里承担移动端
 * 全部结构 —— 页头、分段、列表。
 *
 * 排版取向（2026-08-29 用户反馈「都挤在一起」后重做）：
 * 竖向分层，每层职责单一，一层一行不抢空间：
 *   ① 标题行：标题 + 同步按钮（右对齐，图标+文字，有实体底色）
 *   ② 同步时间行：灰字，陈旧转琥珀
 *   ③ 分段行：三段等宽，各带计数；选中段实心主色
 * 旧版把这三层塞进一个 flex 行，中文只能竖排换行，就是「挤在一起」的来源。
 *
 * 注意：外层 section 不再挂 .shiphub-order-board。老看板的
 * `.shiphub-order-board > header` (0,1,1) 会压过 .shiphub-pipeline-* (0,1,0)
 * 把页头强制成单行 flex，并把分段标签打成 10px 散字距。结构上断开继承
 * 比反复加特异性可靠。
 */
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false

export default function ShipHubPipelineMobile({
  segments = [],
  activeCategory,
  onSelect,
  syncLabel = '',
  stale = false,
  syncing = false,
  reconnecting = false,
  loading = false,
  error = '',
  orders = [],
  activeTitle = '',
  closedAt,
  onAction,
  onSync,
  children
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

  /* 分段选中态：黄块滑过去，不是原地换色。
   * 旧实现是 CSS transition 换 background-color + 选中段 scale pop，
   * 段间没有位移连续性（观感「跳」），且 scale 会让中文糊一下
   * （memory 22：大面积表面禁 scale）。改为轨道内独立滑块 tween x/width。 */
  const { trackRef, pillRef } = useSegmentedPill(activeCategory)

  // 选中段的文字轻微落位，给切换一个落点，不动整块表面
  const labelRef = useRef(null)
  useEffect(() => {
    const track = trackRef.current
    if (!track || reducedMotion()) return
    const active = track.querySelector('[data-active="true"] .shiphub-pipeline-segment-label')
    const count = track.querySelector('[data-active="true"] .shiphub-pipeline-segment-count')
    const targets = [active, count].filter(Boolean)
    if (!targets.length) return
    labelRef.current?.kill()
    labelRef.current = gsap.fromTo(targets,
      { y: 4, autoAlpha: .55 },
      { y: 0, autoAlpha: 1, duration: .34, stagger: .04, ease: 'expo.out', clearProps: 'transform,opacity,visibility' }
    )
  }, [activeCategory, trackRef])
  useEffect(() => () => { labelRef.current?.kill(); labelRef.current = null }, [])

  // 切换分类 / 同步完成后卡片 stagger 入场；同一批 id 不重播
  const gridRef = useRef(null)
  const batchRef = useRef('')
  useEffect(() => {
    const grid = gridRef.current
    if (!grid) return
    const batch = activeCategory + ':' + orders.map((order) => order.id).join(',')
    if (batch === batchRef.current) return
    batchRef.current = batch
    if (!orders.length || reducedMotion()) return
    const cards = grid.querySelectorAll('.shiphub-order-card')
    if (!cards.length) return
    gsap.fromTo(cards,
      { autoAlpha: .01, y: 16 },
      { autoAlpha: 1, y: 0, duration: .5, stagger: .045, ease: 'expo.out', clearProps: 'transform,opacity,visibility' }
    )
  }, [orders, activeCategory])

  return (
    <section
      className="shiphub-pipeline shiphub-pipeline-mobile"
      data-category={activeCategory}
      aria-labelledby="shiphub-pipeline-title"
    >
      <div className="shiphub-pipeline-head">
        <div className="shiphub-pipeline-titlerow">
          <h2 id="shiphub-pipeline-title" className="shiphub-pipeline-title">
            <span className="shiphub-pipeline-title-kicker">SHIPHUB PIPELINE</span>
            <span className="shiphub-pipeline-title-text">待取车</span>
          </h2>
          <button
            type="button"
            className="shiphub-pipeline-sync"
            onClick={onSync}
            disabled={syncing || reconnecting}
            aria-label={reconnecting ? '正在重连 Shiphub' : (syncing ? '正在同步 Shiphub' : '同步 Shiphub')}
          >
            <span ref={iconRef} className="shiphub-pipeline-sync-icon" aria-hidden="true"><IconRefresh width={15} height={15} /></span>
            <span>{reconnecting ? '重连中' : (syncing ? '同步中' : '同步')}</span>
          </button>
        </div>
        <p className="shiphub-pipeline-synced" data-stale={stale ? 'true' : 'false'} role="status">
          {syncLabel}{stale ? ' · 数据可能已过期' : ''}
        </p>
        <div ref={trackRef} className="shiphub-pipeline-segments" role="tablist" aria-label="待取车分类">
          <span ref={pillRef} className="shiphub-pipeline-segment-pill" aria-hidden="true" />
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
      </div>
      {children}
      {error ? <p className="shiphub-pipeline-error" role="status">{error}</p> : null}
      {loading ? <p className="shiphub-pipeline-empty" role="status">正在读取缓存…</p> : null}
      {orders.length ? (
        <div ref={gridRef} className="shiphub-pipeline-list">
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} category={activeCategory} closedAt={closedAt} onAction={onAction} variant="pickup" />
          ))}
        </div>
      ) : <p className="shiphub-pipeline-empty">当前没有 {activeTitle}。</p>}
    </section>
  )
}
