import { useLayoutEffect } from 'react'

const EASE = 'cubic-bezier(0.22, 0.61, 0.36, 1)'
const REVEAL_SELECTOR = '[data-editorial-logo], [data-editorial-lines], [data-editorial-description]'

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false
const nestedReveal = (element) => Boolean(element.parentElement?.closest(REVEAL_SELECTOR))

function targetsFor(container) {
  return container.hasAttribute('data-editorial-lines')
    ? [...container.querySelectorAll('.visual-line-text__content')]
    : [container]
}

function profileFor(container) {
  if (container.hasAttribute('data-editorial-logo')) return { y: 12, duration: 450, stagger: 0 }
  if (container.hasAttribute('data-editorial-lines')) return { y: 12, duration: 500, stagger: 50 }
  return { y: 8, duration: 550, stagger: 0 }
}

function reset(container, animations) {
  const { y } = profileFor(container)
  targetsFor(container).forEach((target) => {
    animations.get(target)?.cancel()
    animations.delete(target)
    target.style.opacity = '0'
    target.style.transform = `translateY(${y}px)`
    target.style.willChange = 'opacity, transform'
  })
}

function settle(container, animations) {
  targetsFor(container).forEach((target) => {
    animations.get(target)?.cancel()
    animations.delete(target)
    target.style.opacity = '1'
    target.style.transform = 'translateY(0)'
    target.style.removeProperty('will-change')
  })
}

function reveal(container, animations, delay = 0) {
  const { y, duration, stagger } = profileFor(container)
  targetsFor(container).forEach((target, index) => {
    animations.get(target)?.cancel()
    const animation = target.animate([
      { opacity: 0, transform: `translateY(${y}px)` },
      { opacity: 1, transform: 'translateY(0)' }
    ], { duration, delay: delay + index * stagger, easing: EASE, fill: 'both' })
    animations.set(target, animation)
    animation.onfinish = () => {
      if (animations.get(target) !== animation) return
      animations.delete(target)
      target.style.opacity = '1'
      target.style.transform = 'translateY(0)'
      target.style.removeProperty('will-change')
    }
  })
}

export default function useMotionSystem({ enabled, rootRef, onInitialComplete, scope = 'default' }) {
  useLayoutEffect(() => {
    if (!enabled || typeof window === 'undefined' || typeof document === 'undefined') return undefined
    const root = rootRef?.current || document.querySelector('[data-editorial-page]')
    if (!root) return undefined

    const animations = new Map()
    const exited = new WeakSet()
    const initial = new Set()
    let all = []
    let observer = null
    let mounted = true
    let setupFrame = 0
    let startTimer = 0
    let finishTimer = 0

    const finishImmediately = () => {
      delete root.dataset.editorialPending
      all.forEach((container) => settle(container, animations))
      onInitialComplete?.()
    }

    if (reducedMotion() || !('IntersectionObserver' in window)) {
      all = [...root.querySelectorAll(REVEAL_SELECTOR)].filter((element) => !nestedReveal(element))
      finishImmediately()
      return undefined
    }

    root.dataset.editorialPending = 'true'
    setupFrame = window.requestAnimationFrame(() => {
      if (!mounted) return
      // VisualLineText measures wrapping in a layout effect first, so every target is a complete visual line.
      all = [...root.querySelectorAll(REVEAL_SELECTOR)].filter((element) => !nestedReveal(element))
      if (!all.length) return finishImmediately()
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight
      all.forEach((container) => {
        const box = container.getBoundingClientRect()
        if (box.top < viewportHeight && box.bottom > 0) initial.add(container)
        reset(container, animations)
      })
      observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          const container = entry.target
          if (!entry.isIntersecting) {
            exited.add(container)
            reset(container, animations)
          } else if (!initial.has(container) || exited.has(container)) {
            reveal(container, animations)
          }
        })
      }, { threshold: 0.08, rootMargin: '0px 0px -10% 0px' })
      all.forEach((container) => observer.observe(container))
      startTimer = window.setTimeout(() => {
        if (!mounted) return
        delete root.dataset.editorialPending
        all.filter((container) => initial.has(container) && container.hasAttribute('data-editorial-logo')).forEach((container) => reveal(container, animations, 0))
        all.filter((container) => initial.has(container) && container.hasAttribute('data-editorial-lines')).forEach((container) => reveal(container, animations, 50))
        all.filter((container) => initial.has(container) && container.hasAttribute('data-editorial-description')).forEach((container) => reveal(container, animations, 700))
      }, 120)
      finishTimer = window.setTimeout(() => { if (mounted) onInitialComplete?.() }, 1370)
    })

    return () => {
      mounted = false
      window.cancelAnimationFrame(setupFrame)
      window.clearTimeout(startTimer)
      window.clearTimeout(finishTimer)
      observer?.disconnect()
      delete root.dataset.editorialPending
      all.forEach((container) => settle(container, animations))
    }
  }, [enabled, onInitialComplete, rootRef, scope])
}
