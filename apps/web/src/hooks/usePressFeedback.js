import { useEffect } from 'react'
import { animate } from 'animejs/animation'

export default function usePressFeedback({ enabled, rootRef }) {
  useEffect(() => {
    if (!enabled || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined
    const root = rootRef.current
    if (!root) return undefined
    const running = new Set()
    let pressed = null
    const run = (target, values, duration) => {
      const instance = animate(target, { ...values, duration, ease: 'out(4)', composition: 'replace' })
      running.add(instance)
      instance.then(() => running.delete(instance))
    }
    const down = (event) => {
      pressed = event.target.closest('button:not(:disabled)')
      if (!pressed || !root.contains(pressed)) return
      pressed.dataset.pressed = 'true'
      run(pressed, { scale: .98, opacity: .92 }, 90)
    }
    const up = () => {
      if (!pressed) return
      const target = pressed
      target.dataset.pressed = 'false'
      run(target, { scale: 1, opacity: 1 }, 180)
      pressed = null
    }
    root.addEventListener('pointerdown', down)
    root.addEventListener('pointerup', up)
    root.addEventListener('pointercancel', up)
    root.addEventListener('pointerleave', up)
    window.addEventListener('blur', up)
    return () => {
      root.removeEventListener('pointerdown', down)
      root.removeEventListener('pointerup', up)
      root.removeEventListener('pointercancel', up)
      root.removeEventListener('pointerleave', up)
      window.removeEventListener('blur', up)
      running.forEach((instance) => instance.revert())
    }
  }, [enabled, rootRef])
}
