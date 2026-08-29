import { useState } from 'react'

/* Shiphub 定位脚本引导（安装 / 更新提示）。
 *
 * 从 ShipHubOrderBoard 抽出，供原看板与整合看板（ShipHubPipelineBoard）共用一份实现。
 * 这里的平台分支是踩坑积累的结果，不要按「看起来能简化」去合并：
 * - window.Tampermonkey 页面全局不存在，油猴通信走 window.external.Tampermonkey，
 *   且 Chrome 上 TM 5.3.2+ 还需开发者模式才暴露 —— 绝不能用扩展全局判「未安装」。
 * - 可靠检测只有用户脚本自己注入的标记：window.__shiphubLocatorInstalled
 *   或 <html data-shiphub-locator>（脚本 v0.2.1 起双标记）。
 * - 桌面走油猴官方一键安装中间页（Chrome 138+ 不再对 .user.js 直链弹安装框）；
 *   手机直开 .user.js（Edge 安卓上中间页不弹框，Tampermonkey issue #2805）。
 */

const readLocatorInstalled = () => typeof window !== 'undefined' && (
  Boolean(window.__shiphubLocatorInstalled) ||
  Boolean(document.documentElement && document.documentElement.getAttribute('data-shiphub-locator'))
)
const readLocatorVersion = () => {
  if (typeof window === 'undefined') return null
  const marker = window.__shiphubLocatorInstalled
  if (marker && marker.version) return String(marker.version)
  const attr = document.documentElement && document.documentElement.getAttribute('data-shiphub-locator')
  return attr || null
}
const readLocatorOutdated = () => {
  if (typeof window === 'undefined') return null
  const marker = window.__shiphubLocatorInstalled
  if (marker && marker.outdated) return String(marker.outdated)
  const attr = document.documentElement && document.documentElement.getAttribute('data-shiphub-locator-outdated')
  return attr || null
}
const readManagerHint = () => typeof window !== 'undefined' && Boolean(
  (window.external && window.external.Tampermonkey) ||
  window.Tampermonkey ||
  window.Violentmonkey ||
  window.Greasemonkey
)

const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || ''
const isMobileUA = /Android|iPhone|iPad|Mobile/i.test(ua)
const isEdgeAndroid = /Android/i.test(ua) && /EdgA\//.test(ua)
const isEdgeDesktop = !isMobileUA && /Edg\//.test(ua)
const EDGE_ADDONS_TM_URL = 'https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd'
const FIREFOX_ADDONS_TM_URL = 'https://addons.mozilla.org/android/addon/tampermonkey/'
const CHROME_STORE_TM_URL = 'https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo'
const locatorScriptUrl = ((typeof window !== 'undefined' && window.location.origin) || 'https://workshop.skin') + '/shiphub-pickup-locator.user.js'

export default function ShipHubLocatorGuide({ visible = true }) {
  const [locatorInstalled, setLocatorInstalled] = useState(readLocatorInstalled)
  const [managerHint, setManagerHint] = useState(readManagerHint)
  const [locatorVersion, setLocatorVersion] = useState(readLocatorVersion)
  const [locatorOutdated, setLocatorOutdated] = useState(readLocatorOutdated)

  const openLocatorInstall = () => {
    if (isMobileUA) { window.open(locatorScriptUrl, '_blank', 'noopener'); return }
    window.open('https://www.tampermonkey.net/script_installation.php#url=' + encodeURIComponent(locatorScriptUrl), '_blank', 'noopener')
  }
  const recheckLocator = () => {
    setLocatorInstalled(readLocatorInstalled())
    setManagerHint(readManagerHint())
    setLocatorVersion(readLocatorVersion())
    setLocatorOutdated(readLocatorOutdated())
  }

  if (!visible) return null

  return (
    <>
    {locatorInstalled && locatorOutdated ? (
      <div className="shiphub-locator-guide" role="status" data-outdated="true">
        <strong>Shiphub 定位脚本有新版本 v{locatorOutdated}</strong>
        <span>当前安装 v{locatorVersion || '?'}。更新后定位支持待拣货/待收货页面，旧版本跳转拣货或收货不会自动定位。</span>
        <button type="button" className="shiphub-locator-install" onClick={openLocatorInstall}>去更新脚本</button>
        <small>更新安装完成后回到本页点「重新检测」或刷新。</small>
        <button type="button" className="shiphub-locator-recheck" onClick={recheckLocator}>重新检测</button>
      </div>
    ) : null}
    {!locatorInstalled ? (
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
    </>
  )
}
