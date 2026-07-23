import { useEffect } from 'react'

export default function useGlitchPrototypeMotion({ enabled, rootRef }) {
  useEffect(() => {
    if (!enabled || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined
    const root = rootRef.current || document
    const targets = [...root.querySelectorAll('[data-glitch-motion]')]
    if (!targets.length || !('IntersectionObserver' in window)) return undefined
    const running = new Set()
    const play = (target) => {
      const fragments = [target, ...target.querySelectorAll('[data-glitch-scan]')]
      fragments.forEach((fragment, index) => {
        fragment.getAnimations?.().forEach((animation) => animation.cancel())
        const direction = index % 2 ? -1 : 1
        const animation = fragment.animate([
          { transform: `translate3d(${direction * 13}px, 0, 0)`, clipPath: 'inset(0 68% 0 0)' },
          { transform: `translate3d(${direction * -5}px, 0, 0)`, clipPath: 'inset(0 14% 0 0)', offset: .44 },
          { transform: 'translate3d(0, 0, 0)', clipPath: 'inset(0 0 0 0)' }
        ], {
          duration: 210 + Math.min(index, 8) * 24,
          delay: Math.min(index, 8) * 18,
          easing: 'cubic-bezier(.16, 1, .3, 1)'
        })
        running.add(animation)
        animation.finished.then(() => running.delete(animation), () => running.delete(animation))
      })
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && !entry.target.dataset.glitchVisible) {
          entry.target.dataset.glitchVisible = 'true'
          play(entry.target)
        } else if (!entry.isIntersecting) {
          delete entry.target.dataset.glitchVisible
        }
      })
    }, { threshold: .18, rootMargin: '-4% 0px -18% 0px' })
    targets.forEach((target) => observer.observe(target))
    return () => {
      observer.disconnect()
      targets.forEach((target) => delete target.dataset.glitchVisible)
      running.forEach((animation) => animation.cancel())
    }
  }, [enabled, rootRef])
}
