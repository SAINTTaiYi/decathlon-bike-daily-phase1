import { useEffect, useMemo, useRef, useState } from 'react'
import { gsap } from 'gsap'
import useViewportKind from '../../hooks/useViewportKind.js'
import { describeSyncState } from '../../utils/shiphubSyncTime.js'
import ShipHubConnectionSimulator from './ShipHubConnectionSimulator.jsx'
import ShipHubPipelineHeadMobile from './ShipHubPipelineHeadMobile.jsx'
import ShipHubPipelineHeadDesktop from './ShipHubPipelineHeadDesktop.jsx'
import ShipHubLocatorGuide from './ShipHubLocatorGuide.jsx'
import { OrderCard, labels, PICKUP_VARIANT_TITLES } from './ShipHubOrderBoard.jsx'

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false

/* 待取车管线整合看板。
 *
 * 取代原先「hand / pick / receive 各渲染一整块 section」的堆叠布局：
 * 三类合并成一块看板，共用一个页头、一个同步按钮（同步本就刷新全部分类），
 * 分段切换带各类计数，内容区只渲染选中分类。移动端高度约降到原来的三分之一，
 * 且计数常驻，不会因为折叠而丢掉「另外两类有没有货」的信息。
 *
 * 双端按项目规则拆两套页头实现（ShipHubPipelineHeadMobile / …Desktop），
 * 由 useViewportKind 在运行时择一挂载；卡片、定位引导、连接提示等与端无关的
 * 部分保持单一实现，避免双端行为分叉。
 */
const PIPELINE_CATEGORIES = ['hand', 'pick', 'receive']

export default function ShipHubPipelineBoard({
  ordersByCategory = {},
  countsByCategory = {},
  summaryCategories = [],
  loadingByCategory = {},
  errorByCategory = {},
  syncing = false,
  reconnecting = false,
  connectionStatus = 'connected',
  stale = false,
  closedAt,
  onLoad,
  onAction,
  onSync,
  onOpenConnection,
  simulationAvailable = false,
  simulatedStatus = '',
  onSimulateStatus
}) {
  const viewport = useViewportKind()
  const [activeCategory, setActiveCategory] = useState('hand')
  const orders = ordersByCategory[activeCategory] || []
  const loading = Boolean(loadingByCategory[activeCategory])
  const error = errorByCategory[activeCategory] || ''

  // 计数优先用服务端 summary 的总数，回退到已加载列表长度，
  // 避免尚未拉取的分类显示 0 而误导「这类没有货」。
  const segments = useMemo(() => PIPELINE_CATEGORIES.map((category) => {
    const title = PICKUP_VARIANT_TITLES[category] || labels[category]
    const counted = countsByCategory[category]
    const count = Number.isFinite(counted) ? counted : (ordersByCategory[category] || []).length
    return { category, label: title.cn, count }
  }), [countsByCategory, ordersByCategory])

  const { label: syncLabel } = useMemo(
    () => describeSyncState(summaryCategories),
    [summaryCategories]
  )

  // 进入看板时把三类都预取一次，计数才有真实来源；切换分类时补拉当前类。
  useEffect(() => {
    PIPELINE_CATEGORIES.forEach((category) => { void onLoad?.(category) })
  }, [onLoad])
  useEffect(() => { void onLoad?.(activeCategory) }, [activeCategory, onLoad])

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

  const statusRef = useRef(null)
  useEffect(() => {
    const el = statusRef.current
    if (!el || reducedMotion()) return
    gsap.fromTo(el, { autoAlpha: .01, y: 8 }, { autoAlpha: 1, y: 0, duration: .4, ease: 'expo.out', clearProps: 'transform,opacity,visibility' })
  }, [stale, error, loading, syncing, connectionStatus, activeCategory])

  const sync = async () => {
    if (syncing || reconnecting) return
    await onSync?.()
  }

  const Head = viewport === 'mobile' ? ShipHubPipelineHeadMobile : ShipHubPipelineHeadDesktop
  const activeTitle = PICKUP_VARIANT_TITLES[activeCategory] || labels[activeCategory]

  return (
    <section
      className="shiphub-order-board shiphub-pipeline-board"
      data-category={activeCategory}
      data-surface={viewport}
      aria-labelledby="shiphub-pipeline-title"
    >
      <Head
        segments={segments}
        activeCategory={activeCategory}
        onSelect={setActiveCategory}
        syncLabel={syncLabel}
        stale={stale}
        syncing={syncing}
        reconnecting={reconnecting}
        loading={loading}
        onSync={sync}
      />
      <ShipHubConnectionSimulator available={simulationAvailable} active={simulatedStatus} onSimulate={onSimulateStatus} />
      {connectionStatus !== 'connected' && connectionStatus !== 'fixture' ? (
        <div className="shiphub-connection-notice" role="status" data-status={connectionStatus}>
          <strong>Shiphub 当前未连接</strong>
          <span>{connectionStatus === 'reauth_required'
            ? '上游授权已失效（常见原因：有人手动登录过官方 Shiphub）。点「同步」会先尝试自动重连；若仍失败，请手动重新授权。'
            : '本门店尚未完成 Shiphub 授权，下方列表仅为本地缓存。请先完成连接。'}</span>
          {onOpenConnection ? <button type="button" className="shiphub-connection-open" onClick={() => onOpenConnection()}>去手动重连</button> : null}
        </div>
      ) : null}
      <ShipHubLocatorGuide visible={activeCategory === 'hand'} />
      <div ref={statusRef}>
        {error ? <p className="shiphub-order-error" role="status">{error}</p> : null}
        {loading ? <p className="shiphub-order-placeholder" role="status">正在读取缓存…</p> : null}
      </div>
      {orders.length ? (
        <div ref={gridRef} className="shiphub-order-grid">
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} category={activeCategory} closedAt={closedAt} onAction={onAction} variant="pickup" />
          ))}
        </div>
      ) : <p className="shiphub-order-placeholder">当前没有 {activeTitle.cn}。</p>}
    </section>
  )
}
