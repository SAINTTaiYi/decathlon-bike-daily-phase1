import { useEffect, Fragment, useState } from 'react'
import IconCheck from '@iconoir/Check.mjs'
import IconRefresh from '@iconoir/Refresh.mjs'
import IconBox from '@iconoir/Box.mjs'

const readLocatorInstalled = () => typeof window !== 'undefined' && (
  Boolean(window.__shiphubLocatorInstalled) ||
  Boolean(document.documentElement && document.documentElement.getAttribute('data-shiphub-locator'))
)
// 仅作文案优化：油猴与页面通信走 window.external.Tampermonkey（Chrome 上还需开发者模式），
// 普通页面全局不可靠，绝不能作为「未安装」的硬判定依据。
const readManagerHint = () => typeof window !== 'undefined' && Boolean(
  (window.external && window.external.Tampermonkey) ||
  window.Tampermonkey ||
  window.Violentmonkey ||
  window.Greasemonkey
)

const labels = {
  hand: { en: 'SHIPHUB PICKUP', cn: 'Shiphub 自提', action: '确认取车', actionType: 'pickup' },
  receive: { en: 'SHIPHUB RECEIVE', cn: '待收货', action: '确认收货', actionType: 'receive' },
  ship: { en: 'SHIPHUB SHIP', cn: '待发货', action: '确认发货', actionType: 'ship' }
}

function OrderCard({ order, category, closedAt, onAction }) {
  const meta = labels[category]
  const completed = order.localActionState === 'completed'
  const busy = order.localActionState === 'pending'
  const openShiphubVerify = () => {
    const orderId = order.orderNumber || order.id
    if (!orderId) return
    try { void navigator.clipboard?.writeText(orderId) } catch (e) { /* 复制失败不阻塞跳转 */ }
    window.open(`https://shiphub-asia-cn.decathlon.com.cn/to_handover#pickup=${encodeURIComponent(orderId)}`, '_blank', 'noopener')
  }
  const title = order.displayLabel || order.items?.[0]?.productLabel || order.id
  const items = order.items || []
  const multi = items.length > 1
  return (
    <article className="shiphub-order-card" data-local-state={order.localActionState || 'pending'}>
      <div className="shiphub-order-card-head">
        <span><IconBox width={16} height={16} aria-hidden="true" />{order.sourceLabel || meta.cn}{order.channel ? ' · ' + order.channel : ''}</span>
        <strong>{title}</strong>
        {!multi && order.vehicleInfo && <small style={{ color: 'var(--ops-muted, #6a6a6a)' }}>{order.vehicleInfo}</small>}
        <div className="shiphub-order-card-meta">
          {order.orderNumber && <small style={{ color: 'var(--ops-muted, #6a6a6a)' }}>订单号：{order.orderNumber}</small>}
          {order.customerPhone && <small style={{ color: 'var(--ops-muted, #6a6a6a)' }}>📞 {order.customerPhone}{order.isEncryptedOrder ? <em className="shiphub-order-virtual-tag">虚拟号 · 转接</em> : null}</small>}
        </div>
      </div>
      {multi ? (
        <ul className="shiphub-order-items">{items.map((item, idx) => (
          <li key={`${order.id}-item-${idx}`}><span>{item.productLabel || item.sku || '商品'}</span><b>×{item.quantity}</b></li>
        ))}</ul>
      ) : items.length === 1 ? (
        items[0].sku ? <ul className="shiphub-order-items"><li><span>SKU: {items[0].sku}</span></li></ul> : null
      ) : (
        <p className="shiphub-order-empty-detail">暂无商品明细</p>
      )}
      <footer><span>{completed ? '本地已处理 · 等待上游对齐' : order.scheduledAt ? `下单时间：${new Date(order.scheduledAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}` : '无预约时间'}</span><span className="shiphub-order-card-actions">{category === 'hand' && (order.orderNumber || order.id) ? <button type="button" className="shiphub-order-verify" title="复制订单号并在官方 Shiphub 待交接页定位该订单，人工输入取件码核销" onClick={openShiphubVerify}>Shiphub 核销 ↗</button> : null}<button type="button" onClick={() => void onAction(category, order.id, completed ? 'revoked' : 'completed')} disabled={Boolean(closedAt) || busy}>{completed ? '撤销本地确认' : <><IconCheck width={15} height={15} aria-hidden="true" />{meta.action}</>}</button></span></footer>
    </article>
  )
}

export default function ShipHubOrderBoard({ category, orders = [], loading = false, stale = false, error = '', closedAt, onLoad, onAction, onSync }) {
  const meta = labels[category]
  const [locatorInstalled, setLocatorInstalled] = useState(readLocatorInstalled)
  const [managerHint, setManagerHint] = useState(readManagerHint)
  useEffect(() => { void onLoad?.(category) }, [category, onLoad])
  const sync = async () => { await onSync?.(); await onLoad?.(category) }
  const recheckLocator = () => { setLocatorInstalled(readLocatorInstalled()); setManagerHint(readManagerHint()) }
  return (
    <section className="shiphub-order-board" data-category={category} aria-labelledby={`shiphub-${category}-title`}>
      <header><div><span>{meta.en}</span><strong id={`shiphub-${category}-title`}>{meta.cn}</strong></div><div className="shiphub-order-board-meta">{stale ? <em>数据可能已过期</em> : <small>读取本站缓存</small>}<button type="button" onClick={() => void sync()} disabled={loading}><IconRefresh width={15} height={15} aria-hidden="true" />同步</button></div></header>
      {category === 'hand' && !locatorInstalled ? (
        <div className="shiphub-locator-guide" role="status">
          {managerHint ? (
            <>
              <strong>Shiphub 定位脚本未安装</strong>
              <span>安装后，「Shiphub 核销」会自动定位并展开对应订单卡片，仅需人工输入取件码。</span>
              <a href="/shiphub-pickup-locator.user.js" download="shiphub-pickup-locator.user.js">一键下载脚本</a>
              <small>Tampermonkey 检测到脚本文件会自动弹出安装确认，点「安装」即可；装完点「重新检测」。</small>
            </>
          ) : (
            <>
              <strong>安装 Shiphub 定位脚本（两步）</strong>
              <span>完成两步后点「重新检测」或刷新本页，Workshop 会自动识别。</span>
              <ol className="shiphub-locator-guide-steps">
                <li>① 安装油猴扩展（工具栏已有油猴图标可跳过）<a href="https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo" target="_blank" rel="noreferrer">去 Chrome 应用商店安装</a></li>
                <li>② 下载定位脚本<a href="/shiphub-pickup-locator.user.js" download="shiphub-pickup-locator.user.js">一键下载脚本</a><small>Tampermonkey 检测到脚本文件会自动弹出安装确认，点「安装」即可</small></li>
              </ol>
              <small>Chrome 还需在 chrome://extensions 开启「开发者模式」，否则 Tampermonkey 5.3+ 不会运行任何脚本。</small>
            </>
          )}
          <button type="button" className="shiphub-locator-recheck" onClick={recheckLocator}>重新检测</button>
        </div>
      ) : null}
      {error ? <p className="shiphub-order-error" role="status">{error}</p> : null}
      {loading ? <p className="shiphub-order-placeholder" role="status">正在读取缓存…</p> : orders.length ? <div className="shiphub-order-grid">{orders.map((order) => <OrderCard key={order.id} order={order} category={category} closedAt={closedAt} onAction={onAction} />)}</div> : <p className="shiphub-order-placeholder">当前没有 {meta.cn}。</p>}
    </section>
  )
}
