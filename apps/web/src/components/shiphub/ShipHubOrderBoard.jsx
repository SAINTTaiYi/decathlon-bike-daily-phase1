import { useEffect, Fragment } from 'react'
import IconCheck from '@iconoir/Check.mjs'
import IconRefresh from '@iconoir/Refresh.mjs'
import IconBox from '@iconoir/Box.mjs'

const locatorInstalled = typeof window !== 'undefined' && Boolean(window.__shiphubLocatorInstalled)
const hasUserscriptManager = typeof window !== 'undefined' && Boolean(window.Tampermonkey || window.Violentmonkey || window.Greasemonkey)

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
  useEffect(() => { void onLoad?.(category) }, [category, onLoad])
  const sync = async () => { await onSync?.(); await onLoad?.(category) }
  return (
    <section className="shiphub-order-board" data-category={category} aria-labelledby={`shiphub-${category}-title`}>
      <header><div><span>{meta.en}</span><strong id={`shiphub-${category}-title`}>{meta.cn}</strong></div><div className="shiphub-order-board-meta">{stale ? <em>数据可能已过期</em> : <small>读取本站缓存</small>}<button type="button" onClick={() => void sync()} disabled={loading}><IconRefresh width={15} height={15} aria-hidden="true" />同步</button></div></header>
      {category === 'hand' && !locatorInstalled ? (
        hasUserscriptManager ? (
          <div className="shiphub-locator-guide" role="status">
            <strong>Shiphub 定位脚本未安装</strong>
            <span>安装后，「Shiphub 核销」会自动定位并展开对应订单卡片，仅需人工输入取件码。</span>
            <a href="/shiphub-pickup-locator.user.js" download="shiphub-pickup-locator.user.js">一键下载脚本</a>
            <small>Tampermonkey 检测到脚本文件会自动弹出安装确认，点「安装」即可</small>
          </div>
        ) : (
          <div className="shiphub-locator-guide" role="status">
            <strong>未检测到 Tampermonkey（油猴）</strong>
            <span>请在店内电脑 Chrome 安装油猴扩展，之后才能安装定位脚本。安装一次即可。</span>
            <a href="https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo" target="_blank" rel="noreferrer">去 Chrome 应用商店安装</a>
            <small>商店无法访问时，可在 Tampermonkey 官网 tampermonkey.net 下载</small>
          </div>
        )
      ) : null}
      {error ? <p className="shiphub-order-error" role="status">{error}</p> : null}
      {loading ? <p className="shiphub-order-placeholder" role="status">正在读取缓存…</p> : orders.length ? <div className="shiphub-order-grid">{orders.map((order) => <OrderCard key={order.id} order={order} category={category} closedAt={closedAt} onAction={onAction} />)}</div> : <p className="shiphub-order-placeholder">当前没有 {meta.cn}。</p>}
    </section>
  )
}
