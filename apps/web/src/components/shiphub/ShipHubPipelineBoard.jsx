import { useEffect, useMemo, useState } from 'react'
import useViewportKind from '../../hooks/useViewportKind.js'
import { describeSyncState } from '../../utils/shiphubSyncTime.js'
import ShipHubConnectionSimulator from './ShipHubConnectionSimulator.jsx'
import ShipHubLocatorGuide from './ShipHubLocatorGuide.jsx'
import ShipHubPipelineMobile from './ShipHubPipelineMobile.jsx'
import ShipHubPipelineDesktop from './ShipHubPipelineDesktop.jsx'
import { labels, PICKUP_VARIANT_TITLES } from './ShipHubOrderBoard.jsx'

/* 待取车管线看板 · 数据层。
 *
 * 取代原先「hand / pick / receive 各渲染一整块 section」的堆叠布局。
 * 本组件只负责数据（预取、计数、同步态、连接态），呈现全部交给双端实现：
 *
 * - 移动端 ShipHubPipelineMobile：分段切换，一次看一类，页面不被拉长。
 * - 桌面端 ShipHubPipelineDesktop：三类各占一列同时铺开（用户 2026-08-29 指定），
 *   空列显示「无」而不是隐藏，列宽不跳。
 *
 * 项目规则 memory 23：双端两套独立 DOM + 独立 CSS，运行时由 useViewportKind 择一挂载。
 * 与端无关的 chrome（preview 模拟器、未连接提示、定位脚本引导）在这里组装一次，
 * 以 children 传进去，避免两套实现各写一遍导致行为分叉。
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

  const titleOf = (category) => (PICKUP_VARIANT_TITLES[category] || labels[category]).cn
  // 计数优先用服务端 summary 的总数，回退到已加载列表长度，
  // 避免尚未拉取的分类显示 0 而误导「这类没有货」。
  const countOf = (category) => {
    const counted = countsByCategory[category]
    return Number.isFinite(counted) ? counted : (ordersByCategory[category] || []).length
  }

  const segments = useMemo(() => PIPELINE_CATEGORIES.map((category) => ({
    category,
    label: titleOf(category),
    count: countOf(category)
  })), [countsByCategory, ordersByCategory])

  const columns = useMemo(() => PIPELINE_CATEGORIES.map((category) => ({
    category,
    label: titleOf(category),
    count: countOf(category),
    orders: ordersByCategory[category] || [],
    loading: Boolean(loadingByCategory[category]),
    error: errorByCategory[category] || ''
  })), [ordersByCategory, countsByCategory, loadingByCategory, errorByCategory])

  const { label: syncLabel } = useMemo(
    () => describeSyncState(summaryCategories),
    [summaryCategories]
  )

  // 进入看板时把三类都预取一次：桌面三列同时呈现需要全部数据，
  // 移动端也靠这次预取让未选中分段的计数有真实来源。
  useEffect(() => {
    PIPELINE_CATEGORIES.forEach((category) => { void onLoad?.(category) })
  }, [onLoad])
  // 移动端切换分段时补拉当前类（桌面无分段，三列已在上面预取）
  useEffect(() => {
    if (viewport !== 'mobile') return
    void onLoad?.(activeCategory)
  }, [activeCategory, onLoad, viewport])

  const sync = async () => {
    if (syncing || reconnecting) return
    await onSync?.()
  }

  // 与端无关的 chrome：模拟器（仅 preview）、未连接提示、定位脚本引导。
  // 定位脚本只在自提链路用得上：移动端仅自提分段显示，桌面三列常驻故一直显示。
  const locatorVisible = viewport === 'mobile' ? activeCategory === 'hand' : true
  const chrome = (
    <>
      <ShipHubConnectionSimulator available={simulationAvailable} active={simulatedStatus} onSimulate={onSimulateStatus} />
      {connectionStatus !== 'connected' && connectionStatus !== 'fixture' ? (
        <div className="shiphub-connection-notice" role="status" data-status={connectionStatus}>
          <strong>{connectionStatus === 'degraded' ? 'Shiphub 同步异常' : 'Shiphub 当前未连接'}</strong>
          <span>{connectionStatus === 'degraded'
            ? '上一轮同步失败了（连接状态显示正常但实际取数出错）。点「同步」查看具体错误；若提示授权失效，请手动重新授权。'
            : connectionStatus === 'reauth_required'
            ? '上游授权已失效（常见原因：有人手动登录过官方 Shiphub）。点「同步」会先尝试自动重连；若仍失败，请手动重新授权。'
            : '本门店尚未完成 Shiphub 授权，下方列表仅为本地缓存。请先完成连接。'}</span>
          {onOpenConnection ? <button type="button" className="shiphub-connection-open" onClick={() => onOpenConnection()}>去手动重连</button> : null}
        </div>
      ) : null}
      <ShipHubLocatorGuide visible={locatorVisible} />
    </>
  )

  if (viewport === 'mobile') {
    return (
      <ShipHubPipelineMobile
        segments={segments}
        activeCategory={activeCategory}
        onSelect={setActiveCategory}
        syncLabel={syncLabel}
        stale={stale}
        syncing={syncing}
        reconnecting={reconnecting}
        loading={Boolean(loadingByCategory[activeCategory])}
        error={errorByCategory[activeCategory] || ''}
        orders={ordersByCategory[activeCategory] || []}
        activeTitle={titleOf(activeCategory)}
        closedAt={closedAt}
        onAction={onAction}
        onSync={sync}
      >
        {chrome}
      </ShipHubPipelineMobile>
    )
  }

  return (
    <ShipHubPipelineDesktop
      columns={columns}
      syncLabel={syncLabel}
      stale={stale}
      syncing={syncing}
      reconnecting={reconnecting}
      loading={PIPELINE_CATEGORIES.some((category) => Boolean(loadingByCategory[category]))}
      closedAt={closedAt}
      onAction={onAction}
      onSync={sync}
    >
      {chrome}
    </ShipHubPipelineDesktop>
  )
}
