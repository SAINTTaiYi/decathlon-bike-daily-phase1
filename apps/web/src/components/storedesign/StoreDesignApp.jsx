import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'

/**
 * 门店设计渲染 · 宿主外壳（2026-09-15）。
 *
 * 工具本体是本地工具 `~/web/store-3d` 的原样发布副本，放在 `public/store-design/`
 * （静态页 + engine.js + app.js），这里只做三件事：
 *   1. 整屏 iframe 承载它（工具自带完整页面、样式与交互，不能塞进 React 树里）；
 *   2. 用 `?embed=1&exit=ops|back` 告诉工具「显示退出按钮、目的地是哪」；
 *   3. 接住工具发出的 `store-design:exit` 消息（同源校验后）交回父级决定去向。
 *
 * 为什么不分移动/桌面两套实现：这一层没有自己的布局 —— 整屏 iframe 撑满视口，
 * 响应式布局全部在工具内部（它自带桌面两栏 / 窄屏单列的断点），外层没有任何
 * 需要按视口分叉的 DOM，硬拆两套只会造出两份完全相同的代码。
 */

/** 工具页发来的退出消息类型（与 public/store-design/embed.js 约定）。 */
const EXIT_MESSAGE = 'store-design:exit'

export default function StoreDesignApp({ exitMode = 'ops', onExit }) {
  const [frameLoaded, setFrameLoaded] = useState(false)
  const overlayRef = useRef(null)
  // 退出回调放进 ref：message 监听只挂一次，不因父级重渲染（每次渲染都是新函数）
  // 反复解绑重绑，也不会因为闭包过期而调用旧的 onExit。
  const exitRef = useRef(onExit)
  exitRef.current = onExit

  useEffect(() => {
    const handleMessage = (event) => {
      // 只认同源消息：iframe 与宿主同源，别处伪造的消息直接丢弃（iframe 沙箱在
      // 跨站场景下也不该触发退出）。
      if (event.origin !== window.location.origin) return
      const payload = event.data
      if (!payload || payload.type !== EXIT_MESSAGE) return
      exitRef.current?.()
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  // 加载遮罩：iframe 首帧就绪后淡出，随后彻底移除（display:none，不占点击区域）。
  useEffect(() => {
    if (!frameLoaded) return undefined
    const node = overlayRef.current
    if (!node) return undefined
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      node.style.display = 'none'
      return undefined
    }
    const tween = gsap.to(node, {
      autoAlpha: 0,
      duration: 0.26,
      ease: 'power1.out',
      onComplete: () => { node.style.display = 'none' }
    })
    return () => { tween.kill() }
  }, [frameLoaded])

  const frameSrc = `/store-design/index.html?embed=1&exit=${exitMode === 'back' ? 'back' : 'ops'}`

  return (
    <div className="store-design-app" data-store-design-app={exitMode}>
      <iframe
        className="store-design-frame"
        src={frameSrc}
        title="门店设计渲染"
        onLoad={() => setFrameLoaded(true)}
      />
      <div className="store-design-loading" ref={overlayRef} role="status" aria-live="polite">
        <strong>STORE DESIGN</strong>
        <span>正在载入布局渲染…</span>
      </div>
    </div>
  )
}
