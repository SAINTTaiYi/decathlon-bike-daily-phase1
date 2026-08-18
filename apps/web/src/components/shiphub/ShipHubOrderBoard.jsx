import { useEffect, Fragment } from 'react'
import IconCheck from '@iconoir/Check.mjs'
import IconRefresh from '@iconoir/Refresh.mjs'
import IconBox from '@iconoir/Box.mjs'

const labels = {
  hand: { en: 'SHIPHUB PICKUP', cn: 'Shiphub 自提', action: '确认取车', actionType: 'pickup' },
  receive: { en: 'SHIPHUB RECEIVE', cn: '待收货', action: '确认收货', actionType: 'receive' },
  ship: { en: 'SHIPHUB SHIP', cn: '待发货', action: '确认发货', actionType: 'ship' }
}

function OrderCard({ order, category, closedAt, onAction }) {
  const meta = labels[category]
  const completed = order.localActionState === 'completed'
  const busy = order.localActionState === 'pending'
  return (
    <article className="shiphub-order-card" data-local-state={order.localActionState || 'pending'}>
            <div className="shiphub-order-card-head">
        <span><IconBox width={16} height={16} aria-hidden="true" />{order.source_label || meta.cn}</span>
        {order.order_number && <small style={{ color: 'var(--ops-muted, #6a6a6a)' }}>{order.order_number}</small>}
        <strong>{order.order_number || order.display_label || order.id}</strong>
        {order.vehicle_info && <small style={{ color: 'var(--ops-muted, #6a6a6a)' }}>{order.vehicle_info}</small>}
        {order.customer_phone && <small style={{ color: 'var(--ops-muted, #6a6a6a)' }}>📞 {order.customer_phone}</small>}
        {!order.order_number && <small>{order.order_status || '待处理'}</small>}
      </div>
      {order.items?.length ? <ul className="shiphub-order-items">{order.items.map((item, idx) => (
          <Fragment key={`${order.id}-item-${idx}`}>
            <li><span>{item.vehicle_info || item.productLabel || item.sku || '商品'}</span><b>×{item.quantity}</b></li>
            {item.sku && <li style={{ fontSize: '11px', color: 'var(--ops-muted, #6a6a6a)', gridColumn: '1 / -1' }}><span>SKU: {item.sku}</span></li>}
            {item.serial_number_masked && <li style={{ fontSize: '11px', color: 'var(--ops-muted, #6a6a6a)' }}><span>序列号</span><span>{item.serial_number_masked}</span></li>}
          </Fragment>
        ))}</ul> : <p className="shiphub-order-empty-detail">暂无商品明细</p>}
      <footer><span>{completed ? '本地已处理 · 等待上游对齐' : order.scheduled_at ? new Date(order.scheduled_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '无预约时间'}</span><button type="button" onClick={() => void onAction(category, order.id, completed ? 'revoked' : 'completed')} disabled={Boolean(closedAt) || busy}>{completed ? '撤销本地确认' : <><IconCheck width={15} height={15} aria-hidden="true" />{meta.action}</>}</button></footer>
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
      {error ? <p className="shiphub-order-error" role="status">{error}</p> : null}
      {loading ? <p className="shiphub-order-placeholder" role="status">正在读取缓存…</p> : orders.length ? <div className="shiphub-order-grid">{orders.map((order) => <OrderCard key={order.id} order={order} category={category} closedAt={closedAt} onAction={onAction} />)}</div> : <p className="shiphub-order-placeholder">当前没有 {meta.cn}。</p>}
    </section>
  )
}
