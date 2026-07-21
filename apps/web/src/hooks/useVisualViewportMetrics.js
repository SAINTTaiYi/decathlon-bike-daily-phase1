import { useEffect } from 'react'

export default function useVisualViewportMetrics() {
  useEffect(() => {
    const root = document.documentElement
    const viewport = window.visualViewport
    let frame = 0

    const apply = () => {
      frame = 0
      const height = Math.max(1, Math.round(viewport?.height || window.innerHeight || root.clientHeight || 1))
      const offsetTop = Math.max(0, Math.round(viewport?.offsetTop || 0))
      const bottom = Math.max(0, Math.round((window.innerHeight || height) - height - offsetTop))
      root.style.setProperty('--visual-viewport-height', `${height}px`)
      root.style.setProperty('--visual-viewport-top', `${offsetTop}px`)
      root.style.setProperty('--visual-viewport-bottom', `${bottom}px`)
    }
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(apply)
    }

    apply()
    window.addEventListener('resize', schedule, { passive: true })
    viewport?.addEventListener('resize', schedule, { passive: true })
    viewport?.addEventListener('scroll', schedule, { passive: true })
    return () => {
      window.removeEventListener('resize', schedule)
      viewport?.removeEventListener('resize', schedule)
      viewport?.removeEventListener('scroll', schedule)
      if (frame) window.cancelAnimationFrame(frame)
      root.style.removeProperty('--visual-viewport-height')
      root.style.removeProperty('--visual-viewport-top')
      root.style.removeProperty('--visual-viewport-bottom')
    }
  }, [])
}
