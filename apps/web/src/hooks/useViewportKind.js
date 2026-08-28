import { useEffect, useState } from 'react'

/**
 * 运行时视口类型判定。
 *
 * 项目规则（2026-08-28）：桌面端与移动端 UI 必须是两套独立实现，
 * 不允许单套 DOM 靠 @media 断点硬凑双端。本 hook 是那个「自动识别」的开关：
 * 组件层据此决定挂载 Mobile 还是 Desktop 实现，两套 DOM 互不相见。
 *
 * 断点与历史 CSS 保持一致（860px），避免与既有布局产生跳变。
 */
export const VIEWPORT_MOBILE_QUERY = '(max-width: 860px)'

function readViewportKind() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'desktop'
  return window.matchMedia(VIEWPORT_MOBILE_QUERY).matches ? 'mobile' : 'desktop'
}

export function useViewportKind() {
  const [kind, setKind] = useState(readViewportKind)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined

    const mql = window.matchMedia(VIEWPORT_MOBILE_QUERY)
    const sync = (event) => setKind(event.matches ? 'mobile' : 'desktop')

    // 首帧兜底：SSR/首次读取与真实视口不一致时立刻纠正
    setKind(mql.matches ? 'mobile' : 'desktop')

    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', sync)
      return () => mql.removeEventListener('change', sync)
    }

    // 老 Safari / WebView 回退路径
    mql.addListener(sync)
    return () => mql.removeListener(sync)
  }, [])

  return kind
}

export default useViewportKind
