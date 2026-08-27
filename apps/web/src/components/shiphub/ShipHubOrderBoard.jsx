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

const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || ''
// 手机端（含 Edge 安卓）安装链路与桌面不同：
// ① Edge 安卓只能从内置「扩展」商店安装油猴（Chrome 网上应用店在手机 Edge 打不开）；
// ② tampermonkey.net 一键安装中间页在 Edge 安卓上不会弹出安装框（Tampermonkey issue #2805），
//    手机端直开 .user.js 链接即可触发油猴的安装确认；
// ③ 油猴 5.3+ 在 Edge 安卓同样需要「允许用户脚本」授权（edge://extensions 打不开，走油猴设置页）。
const isMobileUA = /Android|iPhone|iPad|Mobile/i.test(ua)
const isEdgeAndroid = /Android/i.test(ua) && /EdgA\//.test(ua)
const isEdgeDesktop = !isMobileUA && /Edg\//.test(ua)
const EDGE_ADDONS_TM_URL = 'https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd'
const FIREFOX_ADDONS_TM_URL = 'https://addons.mozilla.org/android/addon/tampermonkey/'
const CHROME_STORE_TM_URL = 'https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo'
const locatorScriptUrl = ((typeof window !== 'undefined' && window.location.origin) || 'https://workshop.skin') + '/shiphub-pickup-locator.user.js'

const labels = {
  hand: { en: 'SHIPHUB PICKUP', cn: 'Shiphub 自提', action: '确认取车', actionType: 'pickup' },
  pick: { en: 'SHIPHUB PICKING', cn: '待门店拣货', action: '确认拣货', actionType: 'pick' },
  receive: { en: 'SHIPHUB RECEIVE', cn: '待收货', action: '确认收货', actionType: 'receive' },
  ship: { en: 'SHIPHUB SHIP', cn: '待发货', action: '确认发货', actionType: 'ship' }
}
// 待取车模块（variant='pickup'）的展示口径：待门店收货在取车视角下标注为「在途车辆」。
// 其它交接（variant='handover'）保持原有 待收货/待发货 标题。存储的 sourceLabel 不变。
const PICKUP_VARIANT_TITLES = {
  hand: { en: 'SHIPHUB PICKUP', cn: 'Shiphub 自提' },
  pick: { en: 'SHIPHUB PICKING', cn: '待门店拣货' },
  receive: { en: 'SHIPHUB IN-TRANSIT', cn: '在途车辆' }
}

function OrderCard({ order, category, closedAt, onAction, variant = 'handover' }) {
  const meta = labels[category]
  const variantTitle = variant === 'pickup' ? PICKUP_VARIANT_TITLES[category] : null
  const headLabel = variantTitle ? variantTitle.cn : (order.sourceLabel || meta.cn)
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
      <footer><span>{completed ? '本地已处理 · 等待上游对齐' : order.scheduledAt ? `下单时间：${new Date(order.scheduledAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}` : '无预约时间'}</span><span className="shiphub-order-card-actions">{category === 'hand' && (order.orderNumber || order.id) ? <button type="button" className="shiphub-order-verify" title="复制订单号并在官方 Shiphub 待交接页定位该订单，人工输入取件码核销" onClick={openShiphubVerify}>Shiphub 核销 ↗</button> : null}<button type="button" onClick={() => void onAction(category, order.id, completed ? 'revoked' : 'completed')} disabled={Boolean(closedAt) || busy}>{completed ? '撤销本地确认' : <><IconCheck width={15} height={15} aria-hidden="true" />{meta.action}</>}</button></span></footer>
    </article>
  )
}

export default function ShipHubOrderBoard({ category, orders = [], loading = false, stale = false, error = '', closedAt, onLoad, onAction, onSync, variant = 'handover' }) {
  const meta = labels[category]
  const variantTitle = variant === 'pickup' ? PICKUP_VARIANT_TITLES[category] : null
  const boardTitle = variantTitle || meta
  const [locatorInstalled, setLocatorInstalled] = useState(readLocatorInstalled)
  const [managerHint, setManagerHint] = useState(readManagerHint)
  // 桌面：油猴官方一键安装中间页（Chrome 138+ 不再对 .user.js 直链弹安装框）。
  // 手机：直开 .user.js（Edge 安卓上中间页不弹安装框，Tampermonkey issue #2805）。
  const openLocatorInstall = () => {
    if (isMobileUA) { window.open(locatorScriptUrl, '_blank', 'noopener'); return }
    window.open('https://www.tampermonkey.net/script_installation.php#url=' + encodeURIComponent(locatorScriptUrl), '_blank', 'noopener')
  }
  useEffect(() => { void onLoad?.(category) }, [category, onLoad])
  const sync = async () => { await onSync?.(); await onLoad?.(category) }
  const recheckLocator = () => { setLocatorInstalled(readLocatorInstalled()); setManagerHint(readManagerHint()) }
  return (
    <section className="shiphub-order-board" data-category={category} aria-labelledby={`shiphub-${category}-title`}>
      <header data-variant={variant}><div><span>{boardTitle.en}</span><strong id={`shiphub-${category}-title`}>{boardTitle.cn}</strong></div><div className="shiphub-order-board-meta">{stale ? <em>数据可能已过期</em> : <small>读取本站缓存</small>}<button type="button" onClick={() => void sync()} disabled={loading}><IconRefresh width={15} height={15} aria-hidden="true" />同步</button></div></header>
      {category === 'hand' && !locatorInstalled ? (
        <div className="shiphub-locator-guide" role="status" data-platform={isMobileUA ? 'mobile' : 'desktop'}>
          {isMobileUA ? (
            <>
              <strong>安装 Shiphub 定位脚本（手机）</strong>
              <span>装好后，手机上点「Shiphub 核销 ↗」同样会自动定位并展开订单卡片，人工输入取件码即可核销。</span>
              <ol className="shiphub-locator-guide-steps">
                <li>① 安装油猴{isEdgeAndroid ? '（Edge 手机：底部菜单 ≡ → 扩展 → 搜索 Tampermonkey → 获取）' : '（手机浏览器需支持扩展，如 Edge / Firefox）'}<a href={EDGE_ADDONS_TM_URL} target="_blank" rel="noreferrer">Edge 扩展商店</a>{isEdgeAndroid ? null : <> · <a href={FIREFOX_ADDONS_TM_URL} target="_blank" rel="noreferrer">Firefox 商店</a></>}<small>已装可跳过本步。</small></li>
                <li>② 开启「允许用户脚本」<small>油猴 5.3+ 必须开启。Edge 手机：菜单 ≡ → 扩展 → Tampermonkey 进入设置开启「Allow User Scripts」；若入口打不开，可在地址栏访问 chrome-extension://iikmkjmpaadaobahmlepeloendndfphd/options.html 后在「设置」中开启。</small></li>
                <li>③ 安装定位脚本<button type="button" className="shiphub-locator-install" onClick={openLocatorInstall}>打开脚本安装</button><small>点开后油猴会弹出安装确认框，点「安装」即可；若无反应，长按<a href={locatorScriptUrl} target="_blank" rel="noreferrer">这个脚本链接</a>选「在新标签页中打开」。</small></li>
              </ol>
              <small>装完后刷新本页（下拉刷新）即可自动识别；未识别再点「重新检测」。</small>
            </>
          ) : managerHint ? (
            <>
              <strong>Shiphub 定位脚本未安装</strong>
              <span>安装后，「Shiphub 核销」会自动定位并展开对应订单卡片，仅需人工输入取件码。</span>
              <button type="button" className="shiphub-locator-install" onClick={openLocatorInstall}>一键去油猴安装</button>
              <small>点击后油猴会弹出安装确认框，点「安装」即可；装完点「重新检测」。若无反应，请先在油猴扩展详情开启「允许用户脚本」或 Chrome 开发者模式。</small>
            </>
          ) : (
            <>
              <strong>安装 Shiphub 定位脚本（两步）</strong>
              <span>完成两步后点「重新检测」或刷新本页，Workshop 会自动识别。</span>
              <ol className="shiphub-locator-guide-steps">
                <li>① 安装油猴扩展（工具栏已有油猴图标可跳过）{isEdgeDesktop ? <a href={EDGE_ADDONS_TM_URL} target="_blank" rel="noreferrer">去 Edge 扩展商店安装</a> : <a href={CHROME_STORE_TM_URL} target="_blank" rel="noreferrer">去 Chrome 应用商店安装</a>}</li>
                <li>② 安装定位脚本<button type="button" className="shiphub-locator-install" onClick={openLocatorInstall}>一键去油猴安装</button><small>点击后油猴弹出安装确认框，点「安装」即可。若无反应，请先开启开发者模式或「允许用户脚本」。</small></li>
              </ol>
              <small>{isEdgeDesktop ? 'Edge 需在 edge://extensions 的油猴扩展详情开启「允许用户脚本」（或右上角开发者模式），否则 Tampermonkey 5.3+ 不会运行任何脚本。' : 'Chrome 需在 chrome://extensions 开启「开发者模式」（Chrome 138+ 可在油猴扩展详情开启「允许用户脚本」替代），否则 Tampermonkey 5.3+ 不会运行任何脚本。'}</small>
            </>
          )}
          <button type="button" className="shiphub-locator-recheck" onClick={recheckLocator}>重新检测</button>
        </div>
      ) : null}
      {error ? <p className="shiphub-order-error" role="status">{error}</p> : null}
      {loading ? <p className="shiphub-order-placeholder" role="status">正在读取缓存…</p> : orders.length ? <div className="shiphub-order-grid">{orders.map((order) => <OrderCard key={order.id} order={order} category={category} closedAt={closedAt} onAction={onAction} variant={variant} />)}</div> : <p className="shiphub-order-placeholder">当前没有 {meta.cn}。</p>}
    </section>
  )
}
