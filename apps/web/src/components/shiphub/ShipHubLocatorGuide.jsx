import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'

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
 * - 卡片可收起为单行提示条：收起状态记 sessionStorage（切分类/刷新不回弹，
 *   新开会话重新出现），「未安装」与「待更新」两种卡片分开记忆。
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

const COLLAPSE_KEY_PREFIX = 'shiphubLocatorGuideCollapsed:'
const readCollapsedFlag = (kind) => {
  if (typeof window === 'undefined') return false
  try { return window.sessionStorage.getItem(COLLAPSE_KEY_PREFIX + kind) === '1' } catch { return false }
}
const writeCollapsedFlag = (kind, collapsed) => {
  if (typeof window === 'undefined') return
  try { window.sessionStorage.setItem(COLLAPSE_KEY_PREFIX + kind, collapsed ? '1' : '0') } catch { /* 隐私模式等场景写入失败可忽略 */ }
}
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false

export default function ShipHubLocatorGuide({ visible = true }) {
  const [locatorInstalled, setLocatorInstalled] = useState(readLocatorInstalled)
  const [managerHint, setManagerHint] = useState(readManagerHint)
  const [locatorVersion, setLocatorVersion] = useState(readLocatorVersion)
  const [locatorOutdated, setLocatorOutdated] = useState(readLocatorOutdated)

  // 当前卡片种类：待更新优先于未安装；两种卡片分别记忆收起状态
  const guideKind = locatorOutdated ? 'outdated' : 'install'
  const [collapsed, setCollapsed] = useState(() => readCollapsedFlag(guideKind))
  // phase：DOM 里当前是完整卡（card）还是单行条（bar）。收起先播退场再换 DOM。
  const [phase, setPhase] = useState(() => (collapsed ? 'bar' : 'card'))
  const cardRef = useRef(null)
  const barRef = useRef(null)
  const enterBarRef = useRef(false)
  const expandFromBarRef = useRef(false)

  // 重新检测可能让卡片在「未安装 / 待更新」间切换，按新种类重读收起状态
  useEffect(() => {
    const next = readCollapsedFlag(guideKind)
    setCollapsed(next)
    setPhase(next ? 'bar' : 'card')
  }, [guideKind])

  // 收起：卡片 GSAP 退场（淡出+轻上移）后换成单行条
  useEffect(() => {
    if (!visible || !collapsed || phase !== 'card') return undefined
    const card = cardRef.current
    if (!card || reducedMotion()) {
      enterBarRef.current = true
      setPhase('bar')
      return undefined
    }
    const tween = gsap.to(card, {
      autoAlpha: 0, y: -6, duration: .2, ease: 'power2.in',
      onComplete: () => { enterBarRef.current = true; setPhase('bar') },
    })
    return () => tween.kill()
  }, [collapsed, phase, visible])

  // 提示条进场（仅由卡片收起而来时播放；页面加载直出不动画）
  useEffect(() => {
    if (phase !== 'bar' || !collapsed || !enterBarRef.current) return undefined
    enterBarRef.current = false
    const bar = barRef.current
    if (!bar || reducedMotion()) return undefined
    const tween = gsap.fromTo(bar,
      { autoAlpha: 0, y: 6 },
      { autoAlpha: 1, y: 0, duration: .26, ease: 'expo.out', clearProps: 'transform,opacity,visibility' },
    )
    return () => tween.kill()
  }, [phase, collapsed])

  // 展开：切回完整卡并 GSAP 进场
  useEffect(() => {
    if (phase !== 'card' || collapsed || !expandFromBarRef.current) return undefined
    expandFromBarRef.current = false
    const card = cardRef.current
    if (!card || reducedMotion()) return undefined
    const tween = gsap.fromTo(card,
      { autoAlpha: 0, y: 8 },
      { autoAlpha: 1, y: 0, duration: .3, ease: 'expo.out', clearProps: 'transform,opacity,visibility' },
    )
    return () => tween.kill()
  }, [phase, collapsed])

  const collapseGuide = () => {
    writeCollapsedFlag(guideKind, true)
    setCollapsed(true)
  }
  const expandGuide = () => {
    writeCollapsedFlag(guideKind, false)
    expandFromBarRef.current = true
    setCollapsed(false)
    setPhase('card')
  }

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

  if (phase === 'bar') {
    return (
      <div className="shiphub-locator-mini" data-kind={guideKind}>
        <button type="button" className="shiphub-locator-mini-expand" onClick={expandGuide}>
          {guideKind === 'outdated' ? <>定位脚本有新版本 v{locatorOutdated} · 点击展开</> : <>定位脚本未安装 · 点击展开</>}
        </button>
      </div>
    )
  }

  return (
    <>
    {locatorInstalled && locatorOutdated ? (
      <div ref={cardRef} className="shiphub-locator-guide" role="status" data-outdated="true">
        <button type="button" className="shiphub-locator-close" aria-label="收起定位脚本提示" onClick={collapseGuide}>✕</button>
        <strong>Shiphub 定位脚本有新版本 v{locatorOutdated}</strong>
        <span>当前安装 v{locatorVersion || '?'}。更新后定位支持待拣货/待收货页面，旧版本跳转拣货或收货不会自动定位。</span>
        <button type="button" className="shiphub-locator-install" onClick={openLocatorInstall}>去更新脚本</button>
        <small>更新安装完成后回到本页点「重新检测」或刷新。</small>
        <button type="button" className="shiphub-locator-recheck" onClick={recheckLocator}>重新检测</button>
      </div>
    ) : null}
    {!locatorInstalled ? (
      <div ref={cardRef} className="shiphub-locator-guide" role="status" data-platform={isMobileUA ? 'mobile' : 'desktop'}>
        <button type="button" className="shiphub-locator-close" aria-label="收起定位脚本提示" onClick={collapseGuide}>✕</button>
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
