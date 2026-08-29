import { useEffect, Fragment, useRef, useState } from 'react'
import ShipHubConnectionSimulator from './ShipHubConnectionSimulator.jsx'
import ShipHubLocatorGuide from './ShipHubLocatorGuide.jsx'
import { gsap } from 'gsap'
import IconCheck from '@iconoir/Check.mjs'

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false
import IconRefresh from '@iconoir/Refresh.mjs'
import IconBox from '@iconoir/Box.mjs'


const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || ''
// ① Edge 安卓只能从内置「扩展」商店安装油猴（Chrome 网上应用店在手机 Edge 打不开）；
// ② tampermonkey.net 一键安装中间页在 Edge 安卓上不会弹出安装框（Tampermonkey issue #2805），
//    手机端直开 .user.js 链接即可触发油猴的安装确认；
const isMobileUA = /Android|iPhone|iPad|Mobile/i.test(ua)

export const labels = {
  hand: { en: 'SHIPHUB PICKUP', cn: 'Shiphub 自提', action: '确认取车', actionType: 'pickup' },
  pick: { en: 'SHIPHUB PICKING', cn: '待门店拣货', action: '去 Shiphub 拣货', actionType: 'pick' },
  receive: { en: 'SHIPHUB RECEIVE', cn: '待收货', action: '去 Shiphub 收货', actionType: 'receive' },
  ship: { en: 'SHIPHUB SHIP', cn: '待发货', action: '确认发货', actionType: 'ship' }
}
// 待取车模块（variant='pickup'）的展示口径：待门店收货在取车视角下标注为「在途车辆」。
// 其它交接（variant='handover'）保持原有 待收货/待发货 标题。存储的 sourceLabel 不变。
export const PICKUP_VARIANT_TITLES = {
  hand: { en: 'SHIPHUB PICKUP', cn: 'Shiphub 自提' },
  pick: { en: 'SHIPHUB PICKING', cn: '待门店拣货' },
  receive: { en: 'SHIPHUB IN-TRANSIT', cn: '在途车辆' }
}

export function OrderCard({ order, category, closedAt, onAction, variant = 'handover' }) {
  const cardRef = useRef(null)
  const stateRef = useRef(order.localActionState)
  useEffect(() => {
    // 本地确认 / 撤销：轻 y-pop 反馈（小卡片，安全）
    if (stateRef.current === order.localActionState) return
    stateRef.current = order.localActionState
    const card = cardRef.current
    if (!card || reducedMotion()) return
    gsap.fromTo(card, { y: -4 }, { y: 0, duration: .38, ease: 'back.out(2.2)', clearProps: 'transform' })
  }, [order.localActionState])
  const meta = labels[category]
  const variantTitle = variant === 'pickup' ? PICKUP_VARIANT_TITLES[category] : null
  const headLabel = variantTitle ? variantTitle.cn : (order.sourceLabel || meta.cn)
  const completed = order.localActionState === 'completed'
  const busy = order.localActionState === 'pending'
  // hand → 待交接页核销；pick → 待门店拣货页；receive → 待门店收货页。hash 键决定定位脚本的落点。
  const SHIPHUB_JUMP = {
    hand: { path: '/to_handover', hashKey: 'pickup', title: '复制订单号并在官方 Shiphub 待交接页定位该订单，人工输入取件码核销' },
    pick: { path: '/to_pick', hashKey: 'pickup', title: '复制订单号并在官方 Shiphub 待门店拣货页定位该订单，完成拣货 Validate' },
    receive: { path: '/to_receive', hashKey: 'pickup', title: '复制订单号并在官方 Shiphub 待门店收货页定位该订单，完成收货上架' }
  }
  const openShiphubVerify = () => {
    const target = SHIPHUB_JUMP[category] || SHIPHUB_JUMP.hand
    const orderId = order.orderNumber || order.id
    if (!orderId) return
    try { void navigator.clipboard?.writeText(orderId) } catch (e) { /* 复制失败不阻塞跳转 */ }
    window.open(`https://shiphub-asia-cn.decathlon.com.cn${target.path}#${target.hashKey}=${encodeURIComponent(orderId)}`, '_blank', 'noopener')
  }
  const title = order.displayLabel || order.items?.[0]?.productLabel || order.id
  const items = order.items || []
  const multi = items.length > 1
  return (
    <article ref={cardRef} className="shiphub-order-card" data-local-state={order.localActionState || 'pending'}>
      <div className="shiphub-order-card-head">
        <span><IconBox width={16} height={16} aria-hidden="true" />{headLabel}{order.channel ? ' · ' + order.channel : ''}</span>
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
      <footer><span>{completed ? '本地已处理 · 等待上游对齐' : order.scheduledAt ? `下单时间：${new Date(order.scheduledAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}` : '无预约时间'}</span><span className="shiphub-order-card-actions">{['hand', 'pick', 'receive'].includes(category) && (order.orderNumber || order.id) ? <button type="button" className="shiphub-order-verify" title={(SHIPHUB_JUMP[category] || SHIPHUB_JUMP.hand).title} onClick={openShiphubVerify}>{category === 'hand' ? 'Shiphub 核销 ↗' : '定位 ↗'}</button> : null}{category === 'hand' || category === 'ship' ? <button type="button" onClick={() => void onAction(category, order.id, completed ? 'revoked' : 'completed')} disabled={Boolean(closedAt) || busy}>{completed ? '撤销本地确认' : <><IconCheck width={15} height={15} aria-hidden="true" />{meta.action}</>}</button> : <>{completed ? <button type="button" onClick={() => void onAction(category, order.id, 'revoked')} disabled={Boolean(closedAt)}>撤销本地确认</button> : null}<button type="button" onClick={openShiphubVerify} disabled={Boolean(closedAt)}><IconBox width={15} height={15} aria-hidden="true" />{meta.action} ↗</button></>}</span></footer>
    </article>
  )
}

export default function ShipHubOrderBoard({ category, orders = [], loading = false, syncing = false, reconnecting = false, connectionStatus = 'connected', stale = false, error = '', closedAt, onLoad, onAction, onSync, onOpenConnection, variant = 'handover', simulationAvailable = false, simulatedStatus = '', onSimulateStatus }) {
  const meta = labels[category]
  const variantTitle = variant === 'pickup' ? PICKUP_VARIANT_TITLES[category] : null
  const boardTitle = variantTitle || meta
  useEffect(() => { void onLoad?.(category) }, [category, onLoad])
  // 同步按钮：loading 期间刷新图标持续旋转（小图标，安全）
  const syncIconRef = useRef(null)
  const spinRef = useRef(null)
  useEffect(() => {
    const icon = syncIconRef.current
    if (!icon) return undefined
    if ((syncing || loading) && !reducedMotion()) {
      spinRef.current?.kill()
      spinRef.current = gsap.to(icon, { rotation: 360, duration: .9, ease: 'none', repeat: -1 })
    } else {
      spinRef.current?.kill()
      spinRef.current = null
      gsap.set(icon, { clearProps: 'transform' })
    }
    return () => { spinRef.current?.kill(); spinRef.current = null; gsap.set(icon, { clearProps: 'transform' }) }
  }, [syncing, loading])
  // 订单集合变化（同步完成/清空）时整组 stagger 入场；同一批 id 不重播
  const gridRef = useRef(null)
  const batchRef = useRef('')
  useEffect(() => {
    const grid = gridRef.current
    if (!grid) return
    const batch = orders.map((order) => order.id).join(',')
    if (batch === batchRef.current) return
    batchRef.current = batch
    if (!orders.length || reducedMotion()) return
    const cards = grid.querySelectorAll('.shiphub-order-card')
    if (!cards.length) return
    gsap.fromTo(cards,
      { autoAlpha: .01, y: 16 },
      { autoAlpha: 1, y: 0, duration: .5, stagger: .045, ease: 'expo.out', clearProps: 'transform,opacity,visibility' }
    )
  }, [orders])
  // 状态行（过期提示 / 错误 / 占位）出现时淡入
  const statusRef = useRef(null)
  useEffect(() => {
    const el = statusRef.current
    if (!el || reducedMotion()) return
    gsap.fromTo(el, { autoAlpha: .01, y: 8 }, { autoAlpha: 1, y: 0, duration: .4, ease: 'expo.out', clearProps: 'transform,opacity,visibility' })
  }, [stale, error, loading, syncing, connectionStatus])
  const sync = async () => {
    if (syncing || reconnecting) return
    await onSync?.()
  }
  return (
    <section className="shiphub-order-board" data-category={category} aria-labelledby={`shiphub-${category}-title`}>
      <header data-variant={variant}><div><span>{boardTitle.en}</span><strong id={`shiphub-${category}-title`}>{boardTitle.cn}</strong></div><div className="shiphub-order-board-meta">{stale ? <em>数据可能已过期</em> : <small>读取本站缓存</small>}<button type="button" className="shiphub-sync-button" onClick={() => void sync()} disabled={syncing || reconnecting || loading} aria-busy={syncing || reconnecting ? 'true' : 'false'}><span ref={syncIconRef} className="shiphub-sync-icon" aria-hidden="true"><IconRefresh width={15} height={15} /></span>{reconnecting ? '重连中…' : syncing ? '同步中…' : '同步'}</button></div></header>
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
      <ShipHubLocatorGuide visible={category === 'hand'} />
      <div ref={statusRef}>{error ? <p className="shiphub-order-error" role="status">{error}</p> : null}{loading ? <p className="shiphub-order-placeholder" role="status">正在读取缓存…</p> : null}</div>
      {orders.length ? <div ref={gridRef} className="shiphub-order-grid">{orders.map((order) => <OrderCard key={order.id} order={order} category={category} closedAt={closedAt} onAction={onAction} variant={variant} />)}</div> : <p className="shiphub-order-placeholder">当前没有 {meta.cn}。</p>}
    </section>
  )
}
