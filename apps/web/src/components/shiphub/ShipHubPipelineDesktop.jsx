import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import IconRefresh from '@iconoir/Refresh.mjs'
import { OrderCard } from './ShipHubOrderBoard.jsx'

/* 待取车整合看板 · 桌面端整面实现（移动端见 ShipHubPipelineMobile）。
 *
 * 项目规则 memory 23：双端两套独立 DOM。
 *
 * 排版取向（2026-08-29 用户指定）：桌面横向空间富余，三类各占一列同时铺开 ——
 * 自提 / 待门店拣货 / 在途车辆，一眼看全整条取车管线，不用点分段来回切。
 * 空列不隐藏，显示「无」，保持三列骨架稳定（列消失会让另外两列宽度跳动）。
 *
 * 列内卡片保留完整信息（订单号、车型、电话、SKU、下单时间、操作按钮），
 * 纵向排列；列头常驻计数。
 *
 * 注意：外层 section 不挂 .shiphub-order-board —— 老看板的
 * `.shiphub-order-board > header` (0,1,1) 会压过本组件样式。
 */
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false

export default function ShipHubPipelineDesktop({
  columns = [],
  syncLabel = '',
  stale = false,
  syncing = false,
  reconnecting = false,
  loading = false,
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

  // 三列一起 stagger 入场：批次键含三列全部 id，任一列内容变化才重播
  const gridRef = useRef(null)
  const batchRef = useRef('')
  const batch = columns.map((column) => column.category + ':' + column.orders.map((order) => order.id).join(',')).join('|')
  useEffect(() => {
    const grid = gridRef.current
    if (!grid) return
    if (batch === batchRef.current) return
    batchRef.current = batch
    if (reducedMotion()) return
    const cards = grid.querySelectorAll('.shiphub-order-card')
    if (!cards.length) return
    gsap.fromTo(cards,
      { autoAlpha: .01, y: 14 },
      { autoAlpha: 1, y: 0, duration: .48, stagger: .04, ease: 'expo.out', clearProps: 'transform,opacity,visibility' }
    )
  }, [batch])

  return (
    <section className="shiphub-pipeline shiphub-pipeline-desktop" aria-labelledby="shiphub-pipeline-title">
      <div className="shiphub-pipeline-head">
        <h2 id="shiphub-pipeline-title" className="shiphub-pipeline-title">
          <span className="shiphub-pipeline-title-kicker">SHIPHUB PIPELINE</span>
          <span className="shiphub-pipeline-title-text">待取车</span>
        </h2>
        <div className="shiphub-pipeline-headtail">
          <p className="shiphub-pipeline-synced" data-stale={stale ? 'true' : 'false'} role="status">
            {syncLabel}{stale ? ' · 数据可能已过期' : ''}
          </p>
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
      </div>
      {children}
      <div ref={gridRef} className="shiphub-pipeline-columns">
        {columns.map((column) => (
          <section
            key={column.category}
            className="shiphub-pipeline-column"
            data-category={column.category}
            data-empty={column.orders.length ? 'false' : 'true'}
            aria-labelledby={`shiphub-pipeline-col-${column.category}`}
          >
            <header className="shiphub-pipeline-column-head">
              <h3 id={`shiphub-pipeline-col-${column.category}`} className="shiphub-pipeline-column-title">{column.label}</h3>
              <span className="shiphub-pipeline-column-count" data-empty={column.count ? 'false' : 'true'}>{column.count}</span>
            </header>
            {column.error ? <p className="shiphub-pipeline-error" role="status">{column.error}</p> : null}
            {column.loading && !column.orders.length ? (
              <p className="shiphub-pipeline-empty" role="status">正在读取缓存…</p>
            ) : column.orders.length ? (
              <div className="shiphub-pipeline-column-list">
                {column.orders.map((order) => (
                  <OrderCard key={order.id} order={order} category={column.category} closedAt={closedAt} onAction={onAction} variant="pickup" />
                ))}
              </div>
            ) : <p className="shiphub-pipeline-empty" data-placeholder="none">无</p>}
          </section>
        ))}
      </div>
    </section>
  )
}
